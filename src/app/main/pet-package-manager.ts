import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import {
  PET_MANIFEST_SCHEMA,
  REQUIRED_PET_STATES,
  type PetManifestV2,
  type RequiredPetState,
} from '../../shared/pet-manifest.ts';
import type {
  PetPackageImportMode,
  PetPackageInspection,
  PetPackageIssue,
  PetQuickCreateInput,
} from '../../shared/ipc.ts';
import {
  listPetPackages,
  readPetManifest,
  type PetPackageRoots,
} from './pet-packages.ts';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  '.json', '.webp', '.png', '.gif', '.apng',
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
]);
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export interface PetPackageOperationResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface PetPackageDiagnostic {
  folder: string;
  id?: string;
  valid: boolean;
  errors: string[];
}

interface StagedPetPackage {
  sessionId: string;
  mode: PetPackageImportMode;
  stagingParent: string;
  packageRoot: string;
  createdAt: number;
  availableVisuals: string[];
}

const SESSION_TTL_MS = 15 * 60 * 1000;
const stagedPackages = new Map<string, StagedPetPackage>();

function issue(
  code: string,
  severity: PetPackageIssue['severity'],
  message: string,
  pathValue?: string,
  hint?: string,
): PetPackageIssue {
  return { code, severity, message, path: pathValue, hint };
}

function previewUrl(sessionId: string, file: string): string {
  return `trae-pet://pet-staging/${encodeURIComponent(sessionId)}/${encodeURIComponent(file)}`;
}

function safeRelativePath(value: string): string | null {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\/+/, '');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join(path.sep);
}

function assertAllowedFile(file: string, size: number): void {
  if (size > MAX_FILE_BYTES) throw new Error(`单文件超过 20 MiB：${file}`);
  if (!ALLOWED_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    throw new Error(`不允许的文件扩展名：${file}`);
  }
}

function shouldIgnoreSource(relative: string): boolean {
  const normalized = relative.replaceAll('\\', '/');
  return normalized === '.DS_Store'
    || normalized.startsWith('__MACOSX/')
    || normalized.split('/').some((part) => part === '.DS_Store');
}

function isZipSymlink(attr: number): boolean {
  const unixMode = (attr >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

function commonPackageRoot(root: string): string {
  if (fs.existsSync(path.join(root, 'manifest.json'))) return root;
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.name !== '__MACOSX');
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nested = path.join(root, entries[0].name);
    if (fs.existsSync(path.join(nested, 'manifest.json'))) return nested;
  }
  return root;
}

function extractZip(source: string, destination: string): void {
  const zip = new AdmZip(source);
  let total = 0;
  for (const entry of zip.getEntries()) {
    if (shouldIgnoreSource(entry.entryName)) continue;
    const relative = safeRelativePath(entry.entryName.replace(/\/$/, ''));
    if (!relative && !entry.isDirectory) throw new Error(`ZIP 路径不安全：${entry.entryName}`);
    if (isZipSymlink(entry.attr)) throw new Error(`ZIP 不允许符号链接：${entry.entryName}`);
    if (entry.isDirectory) continue;
    const size = entry.header.size;
    assertAllowedFile(relative!, size);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error('包解压后总大小超过 100 MiB');
    const target = path.join(destination, relative!);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData(), { flag: 'wx' });
  }
}

function copyFolder(source: string, destination: string): void {
  let total = 0;
  const visit = (from: string, to: string): void => {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`文件夹不允许符号链接：${from}`);
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) visit(path.join(from, name), path.join(to, name));
      return;
    }
    if (!stat.isFile()) throw new Error(`不支持的文件类型：${from}`);
    const relative = path.relative(source, from);
    if (shouldIgnoreSource(relative)) return;
    assertAllowedFile(relative, stat.size);
    total += stat.size;
    if (total > MAX_TOTAL_BYTES) throw new Error('包总大小超过 100 MiB');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  };
  visit(source, destination);
}

function declaredFiles(manifest: PetManifestV2): string[] {
  return [
    ...Object.values(manifest.visuals).map((asset) => asset.file),
    ...Object.values(manifest.sounds).map((asset) => asset.file),
  ];
}

function allFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}

function visualFiles(root: string): string[] {
  const extensions = new Set(['.webp', '.png', '.gif', '.apng']);
  return allFiles(root).filter((file) => extensions.has(path.extname(file).toLowerCase()));
}

function signatureLooksValid(file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  const bytes = fs.readFileSync(file).subarray(0, 12);
  if (ext === '.png' || ext === '.apng') {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (ext === '.gif') return bytes.subarray(0, 6).toString('ascii') === 'GIF87a'
    || bytes.subarray(0, 6).toString('ascii') === 'GIF89a';
  if (ext === '.webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return true;
}

function validatePetPackageIssues(dir: string): {
  manifest: PetManifestV2 | null;
  issues: PetPackageIssue[];
} {
  const issues: PetPackageIssue[] = [];
  const manifest = readPetManifest(path.join(dir, 'manifest.json'));
  if (!manifest) {
    return {
      manifest: null,
      issues: [issue(
        'INVALID_MANIFEST',
        'error',
        'manifest.json 无效或缺少 identity',
        'manifest.json',
        '使用 Manifest v2，或通过“快速制作”由应用自动生成。',
      )],
    };
  }
  const id = manifest.identity.id;
  if (!ID_PATTERN.test(id)) {
    issues.push(issue(
      'INVALID_ID',
      'error',
      'pet id 必须为 1-64 位小写字母、数字、点、下划线或连字符',
      'identity.id',
    ));
  }

  for (const state of REQUIRED_PET_STATES) {
    if (!manifest.visuals[state]) {
      issues.push(issue(
        'MISSING_STATE',
        'error',
        `缺少必需视觉状态：${state}`,
        `visuals.${state}`,
      ));
    }
  }
  for (const [actionId, action] of Object.entries(manifest.actions)) {
    if (!manifest.visuals[action.state]) {
      issues.push(issue(
        'INVALID_ACTION_STATE',
        'error',
        `动作 ${actionId} 引用了不存在的视觉状态：${action.state}`,
        `actions.${actionId}.state`,
      ));
    }
  }
  const clickActionId = manifest.interaction.clickAction;
  if (clickActionId) {
    const clickAction = manifest.actions[clickActionId];
    const clickVisualId = clickAction?.state ?? clickActionId;
    const clickVisual = manifest.visuals[clickVisualId];
    if (!clickVisual) {
      issues.push(issue(
        'INVALID_CLICK_ACTION',
        'error',
        `点击动作引用了不存在的视觉状态：${clickActionId}`,
        'interaction.clickAction',
      ));
    } else if (clickAction?.durationMs === undefined && clickVisual.durationMs === undefined) {
      issues.push(issue(
        'MISSING_CLICK_DURATION',
        'warning',
        `点击动作 ${clickActionId} 未声明 durationMs，将使用 2000ms`,
        'interaction.clickAction',
        '在 actions.<id>.durationMs 或 visuals.<id>.durationMs 中声明单轮时长。',
      ));
    }
  }
  for (const [stateId, soundId] of Object.entries(manifest.stateSounds)) {
    if (!manifest.sounds[soundId]) {
      issues.push(issue(
        'INVALID_STATE_SOUND',
        'error',
        `状态 ${stateId} 引用了不存在的声音：${soundId}`,
        `stateSounds.${stateId}`,
      ));
    }
  }

  const referenced = new Set(['manifest.json']);
  for (const file of declaredFiles(manifest)) {
    referenced.add(file.replaceAll('\\', '/'));
    const relative = safeRelativePath(file);
    if (!relative) {
      issues.push(issue('UNSAFE_PATH', 'error', `资源路径不安全：${file}`, file));
      continue;
    }
    if (!ALLOWED_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      issues.push(issue('UNSUPPORTED_EXTENSION', 'error', `资源扩展名不允许：${file}`, file));
      continue;
    }
    const absolute = path.resolve(dir, relative);
    if (!absolute.startsWith(`${path.resolve(dir)}${path.sep}`) || !fs.existsSync(absolute)) {
      issues.push(issue('MISSING_RESOURCE', 'error', `资源不存在：${file}`, file));
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      issues.push(issue('INVALID_RESOURCE_TYPE', 'error', `资源不是普通文件：${file}`, file));
    } else if (stat.size > MAX_FILE_BYTES) {
      issues.push(issue('FILE_TOO_LARGE', 'error', `单文件超过 20 MiB：${file}`, file));
    } else if (!signatureLooksValid(absolute)) {
      issues.push(issue(
        'SIGNATURE_MISMATCH',
        'warning',
        `文件内容与扩展名可能不一致：${file}`,
        file,
        '请确认它是可正常解码的图片文件。',
      ));
    }
  }
  for (const file of allFiles(dir)) {
    if (!referenced.has(file) && file !== '.DS_Store') {
      issues.push(issue('UNREFERENCED_FILE', 'warning', `包内文件未被 Manifest 引用：${file}`, file));
    }
  }
  return { manifest, issues };
}

export function validatePetPackageDirectory(dir: string): PetPackageDiagnostic {
  const { manifest, issues } = validatePetPackageIssues(dir);
  const id = manifest?.identity.id;
  const errors = issues.filter((entry) => entry.severity === 'error').map((entry) => entry.message);
  return { folder: path.basename(dir), id, valid: errors.length === 0, errors };
}

function removeSession(sessionId: string): void {
  const session = stagedPackages.get(sessionId);
  if (!session) return;
  stagedPackages.delete(sessionId);
  fs.rmSync(session.stagingParent, { recursive: true, force: true });
}

export function cleanupExpiredPetPackageInspections(now = Date.now()): void {
  for (const session of stagedPackages.values()) {
    if (now - session.createdAt > SESSION_TTL_MS) removeSession(session.sessionId);
  }
}

function autoStateFiles(files: string[]): Partial<Record<RequiredPetState, string>> {
  const result: Partial<Record<RequiredPetState, string>> = {};
  for (const state of REQUIRED_PET_STATES) {
    const matches = files.filter((file) => (
      path.basename(file, path.extname(file)).toLowerCase() === state
    ));
    if (matches.length === 1) result[state] = matches[0];
  }
  return result;
}

export function inspectPetPackage(
  source: string,
  roots: PetPackageRoots,
  mode: PetPackageImportMode,
): PetPackageInspection {
  cleanupExpiredPetPackageInspections();
  if (!roots.userDir) {
    return {
      ok: false,
      error: '用户 pets 目录未配置',
      issues: [],
      stateFiles: {},
      statePreviewUrls: {},
      availableVisuals: [],
    };
  }
  const sessionId = crypto.randomUUID();
  const stagingParent = path.join(roots.userDir, `.staging-${sessionId}`);
  try {
    fs.mkdirSync(roots.userDir, { recursive: true });
    fs.mkdirSync(stagingParent);
    const unpacked = path.join(stagingParent, 'package');
    const sourceStat = fs.statSync(source);
    if (sourceStat.isDirectory()) copyFolder(source, unpacked);
    else if (mode === 'package' && path.extname(source).toLowerCase() === '.zip') extractZip(source, unpacked);
    else throw new Error(mode === 'quick' ? '快速制作仅支持文件夹' : '仅支持 ZIP 文件或文件夹');

    const packageRoot = mode === 'package' ? commonPackageRoot(unpacked) : unpacked;
    const availableVisuals = visualFiles(packageRoot);
    let stateFiles: Partial<Record<RequiredPetState, string>> = {};
    let id: string | undefined;
    let name: string | undefined;
    let description: string | undefined;
    let author: string | undefined;
    let license: string | undefined;
    let issues: PetPackageIssue[] = [];

    if (mode === 'package') {
      const validation = validatePetPackageIssues(packageRoot);
      issues = validation.issues;
      const manifest = validation.manifest;
      if (manifest) {
        id = manifest.identity.id;
        name = manifest.identity.name;
        description = manifest.identity.description;
        author = manifest.author.name;
        license = manifest.license.name;
        stateFiles = Object.fromEntries(REQUIRED_PET_STATES.flatMap((state) => (
          manifest.visuals[state]?.file ? [[state, manifest.visuals[state].file]] : []
        )));
        if (listPetPackages(roots).some((pkg) => pkg.id === id)) {
          issues.push(issue(
            'DUPLICATE_ID',
            'error',
            `pet id 已存在：${id}`,
            'identity.id',
            '请修改宠物包中的 identity.id 后重新导入。',
          ));
        }
      }
    } else {
      stateFiles = autoStateFiles(availableVisuals);
      const folderName = path.basename(source).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      id = ID_PATTERN.test(folderName) ? folderName : undefined;
      name = path.basename(source);
      for (const state of REQUIRED_PET_STATES) {
        if (!stateFiles[state]) {
          issues.push(issue(
            'MISSING_STATE_MAPPING',
            'error',
            `尚未匹配必需状态：${state}`,
            `visuals.${state}`,
            '请在预览向导中为该状态选择图片。',
          ));
        }
      }
      for (const file of availableVisuals) {
        const absolute = path.join(packageRoot, file.split('/').join(path.sep));
        if (!signatureLooksValid(absolute)) {
          issues.push(issue('SIGNATURE_MISMATCH', 'warning', `文件内容与扩展名可能不一致：${file}`, file));
        }
      }
      if (availableVisuals.length === 0) {
        issues.push(issue('NO_VISUALS', 'error', '所选文件夹中没有可用图片'));
      }
    }

    const session: StagedPetPackage = {
      sessionId,
      mode,
      stagingParent,
      packageRoot,
      createdAt: Date.now(),
      availableVisuals,
    };
    stagedPackages.set(sessionId, session);
    return {
      ok: !issues.some((entry) => entry.severity === 'error'),
      sessionId,
      mode,
      id,
      name,
      description,
      author,
      license,
      issues,
      stateFiles,
      statePreviewUrls: Object.fromEntries(Object.entries(stateFiles).map(([state, file]) => (
        [state, previewUrl(sessionId, file)]
      ))),
      availableVisuals: availableVisuals.map((file) => ({
        file,
        url: previewUrl(sessionId, file),
      })),
    };
  } catch (error) {
    fs.rmSync(stagingParent, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
      issues: [issue('INSPECTION_FAILED', 'error', message)],
      stateFiles: {},
      statePreviewUrls: {},
      availableVisuals: [],
    };
  }
}

function writeQuickManifest(session: StagedPetPackage, input: PetQuickCreateInput): void {
  if (!ID_PATTERN.test(input.id)) throw new Error('pet id 必须为 1-64 位小写字母、数字、点、下划线或连字符');
  if (!input.name.trim()) throw new Error('宠物名称不能为空');
  const allowed = new Set(session.availableVisuals);
  const stateFiles = new Set<string>();
  for (const state of REQUIRED_PET_STATES) {
    const file = input.stateFiles[state];
    if (!allowed.has(file)) throw new Error(`状态 ${state} 的图片不属于当前导入会话`);
    stateFiles.add(file);
  }

  const extraActions = (input.extraActions ?? []).filter((action) => action.enabled);
  const actionIds = new Set<string>();
  const actionFiles = new Set<string>();
  for (const action of extraActions) {
    if (!ID_PATTERN.test(action.id)) {
      throw new Error(`特殊动作 ID 无效：${action.id || '(空)'}`);
    }
    if (REQUIRED_PET_STATES.includes(action.id as RequiredPetState)) {
      throw new Error(`特殊动作 ID 不能占用标准状态：${action.id}`);
    }
    if (actionIds.has(action.id)) throw new Error(`特殊动作 ID 重复：${action.id}`);
    if (!allowed.has(action.file)) throw new Error(`特殊动作图片不属于当前导入会话：${action.file}`);
    if (stateFiles.has(action.file)) throw new Error(`特殊动作图片已用于标准状态：${action.file}`);
    if (actionFiles.has(action.file)) throw new Error(`特殊动作图片重复：${action.file}`);
    if (!Number.isInteger(action.durationMs) || action.durationMs < 250 || action.durationMs > 30_000) {
      throw new Error(`特殊动作 ${action.id} 的时长必须是 250–30000ms 的整数`);
    }
    actionIds.add(action.id);
    actionFiles.add(action.file);
  }

  const clickAction = input.clickAction ?? extraActions[0]?.id ?? 'waving';
  if (clickAction !== 'waving' && !actionIds.has(clickAction)) {
    throw new Error(`默认点击动作不可用：${clickAction}`);
  }

  const visuals: PetManifestV2['visuals'] = Object.fromEntries([
    ...REQUIRED_PET_STATES.map((state) => [
      state,
      {
        file: input.stateFiles[state],
        fps: state === 'jumping' || state === 'happy' ? 12 : state === 'idle' ? 10 : 8,
        loopKind: state === 'idle' || state === 'waiting' || state === 'review'
          || state === 'running-left' || state === 'running-right'
          ? 'seamless-loop' as const
          : 'one-shot-then-idle' as const,
      },
    ] as const),
    ...extraActions.map((action) => [
      action.id,
      {
        file: action.file,
        fps: 10,
        loopKind: 'one-shot-then-idle' as const,
        durationMs: action.durationMs,
      },
    ] as const),
  ]);
  const manifest: PetManifestV2 = {
    schema: PET_MANIFEST_SCHEMA,
    schemaVersion: 2,
    identity: {
      id: input.id.trim(),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      version: '1.0.0',
    },
    visuals,
    actions: Object.fromEntries(extraActions.map((action) => [
      action.id,
      {
        state: action.id,
        fallback: 'idle',
        durationMs: action.durationMs,
      },
    ])),
    sounds: {},
    stateSounds: {},
    interaction: { clickAction },
    presentation: { scale: 1, anchor: 'bottom-center' },
    theme: {},
    author: { name: input.author?.trim() || 'User created' },
    license: { name: input.license?.trim() || 'Unspecified' },
  };
  fs.writeFileSync(
    path.join(session.packageRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
}

export function installInspectedPetPackage(
  sessionId: string,
  roots: PetPackageRoots,
  input?: PetQuickCreateInput,
): PetPackageOperationResult {
  cleanupExpiredPetPackageInspections();
  const session = stagedPackages.get(sessionId);
  if (!session) return { ok: false, error: '导入会话不存在或已过期' };
  try {
    if (!roots.userDir) throw new Error('用户 pets 目录未配置');
    if (session.mode === 'quick') {
      if (!input) throw new Error('快速制作缺少宠物信息');
      writeQuickManifest(session, input);
    }
    const diagnostic = validatePetPackageDirectory(session.packageRoot);
    if (!diagnostic.valid || !diagnostic.id) throw new Error(diagnostic.errors.join('；'));
    const id = diagnostic.id;
    if (listPetPackages(roots).some((pkg) => pkg.id === id)) throw new Error(`pet id 已存在：${id}`);
    const target = path.join(roots.userDir, id);
    if (fs.existsSync(target)) throw new Error(`目标目录已存在：${id}`);
    fs.renameSync(session.packageRoot, target);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    removeSession(sessionId);
  }
}

export function cancelPetPackageInspection(sessionId: string): PetPackageOperationResult {
  removeSession(sessionId);
  return { ok: true };
}

export function resolveStagedPetVisual(sessionId: string, requestedFile: string): string | null {
  cleanupExpiredPetPackageInspections();
  const session = stagedPackages.get(sessionId);
  if (!session || !session.availableVisuals.includes(requestedFile)) return null;
  const relative = safeRelativePath(requestedFile);
  if (!relative) return null;
  const absolute = path.resolve(session.packageRoot, relative);
  return absolute.startsWith(`${path.resolve(session.packageRoot)}${path.sep}`)
    && fs.existsSync(absolute)
    ? absolute
    : null;
}

export function cleanupPetPackageInspections(): void {
  for (const sessionId of [...stagedPackages.keys()]) removeSession(sessionId);
}

export function importPetPackage(
  source: string,
  roots: PetPackageRoots,
): PetPackageOperationResult {
  const inspection = inspectPetPackage(source, roots, 'package');
  if (!inspection.sessionId || !inspection.ok) {
    if (inspection.sessionId) cancelPetPackageInspection(inspection.sessionId);
    return { ok: false, error: inspection.error ?? inspection.issues.map((entry) => entry.message).join('；') };
  }
  return installInspectedPetPackage(inspection.sessionId, roots);
}

export function deleteUserPetPackage(
  id: string,
  roots: PetPackageRoots,
): PetPackageOperationResult {
  if (!roots.userDir || !ID_PATTERN.test(id)) return { ok: false, error: '无效的 pet id' };
  const builtIn = listPetPackages({ builtInDir: roots.builtInDir }).some((pkg) => pkg.id === id);
  if (builtIn) return { ok: false, error: '内置 pet 包不能删除' };
  const target = path.join(roots.userDir, id);
  if (!fs.existsSync(target)) return { ok: false, error: `用户 pet 包不存在：${id}` };
  fs.rmSync(target, { recursive: true });
  return { ok: true, id };
}

export function diagnoseUserPetPackages(
  userDir: string,
  builtInDir?: string,
): PetPackageDiagnostic[] {
  try {
    const builtInIds = new Set(builtInDir
      ? listPetPackages({ builtInDir }).map((pkg) => pkg.id)
      : []);
    return fs.readdirSync(userDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.staging-'))
      .map((entry) => {
        const result = validatePetPackageDirectory(path.join(userDir, entry.name));
        if (result.id && builtInIds.has(result.id)) {
          result.valid = false;
          result.errors.push(`与内置 pet id 冲突：${result.id}`);
        }
        return result;
      });
  } catch {
    return [];
  }
}
