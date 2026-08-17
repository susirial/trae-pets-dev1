import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import { userPaths } from '../shared/paths.ts';
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import {
  discoverNode,
  nodePathFile,
  readPinnedNode,
  SUPPORTED_NODE,
  writeNodePathRecord,
  type NodeInfo,
  type NodeRequirements,
} from './node-runtime.ts';
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import {
  resolveTraeProfiles,
  type SkippedTraeProfile,
  type TraeProfile,
  type TraeProfileSource,
} from './trae-profiles.ts';

declare const __TRAE_PET_SECURE_BUILD__: boolean;

export const TRAE_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'StopFailure',
  'PreCompact',
] as const;

export const HOOK_RESULT_SCHEMA = 'trae.pet.hook-install.v2';

const LOCK_STALE_MS = 30_000;

const moduleDir = typeof __dirname === 'string'
  ? __dirname
  : path.resolve(process.cwd(), 'src', 'cli');

interface HookCommand {
  type?: unknown;
  command?: unknown;
  timeout?: unknown;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: unknown;
  hooks?: HookCommand[];
  [key: string]: unknown;
}

interface HooksDocument {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

interface InstallRecord {
  schema: 'trae.pet.hook-install.v1';
  version: string;
  installedAt: string;
  hookCommand: string;
  hooksFile: string;
  backupFile: string | null;
  events: readonly string[];
  nodePath: string;
  nodeVersion: string;
  arch: string;
}

export interface HookProfileResult {
  id: string;
  dir: string;
  hooksFile: string;
  ok: boolean;
  changed?: boolean;
  hookCommand?: string;
  backupFile?: string | null;
  error?: string;
}

export interface HookOperationResult {
  ok: boolean;
  schema: typeof HOOK_RESULT_SCHEMA;
  changed?: boolean;
  profiles: HookProfileResult[];
  profileSource: TraeProfileSource;
  skippedProfiles: SkippedTraeProfile[];
  /** Primary profile, kept for backwards-compatible acceptance checks. */
  hooksFile: string;
  hookCommand?: string;
  backupFile?: string | null;
  events?: readonly string[];
  nodePath?: string;
  nodeVersion?: string;
  arch?: string;
  node?: NodeInfo;
  migratedBundledRuntime?: boolean;
  error?: string;
}

export interface HookInstallOptions {
  requirements?: NodeRequirements;
  /**
   * Root that contains `bin/` and `cli/cli.cjs`. The CLI derives it from its own
   * location; the packaged Electron main process must pass `process.resourcesPath`.
   */
  packagedRoot?: string;
  profiles?: TraeProfile[];
  args?: string[];
}

function defaultProfileSelection(options: HookInstallOptions) {
  if (options.profiles) {
    return {
      profiles: options.profiles,
      source: 'explicit-dir' as TraeProfileSource,
      skipped: [] as SkippedTraeProfile[],
    };
  }
  return resolveTraeProfiles({ args: options.args ?? [] });
}

function fallbackHooksFile(): string {
  return path.join(process.env.TRAE_HOOKS_DIR || path.join(os.homedir(), '.trae'), 'hooks.json');
}

export function hooksFilePath(): string {
  const { profiles } = resolveTraeProfiles();
  return profiles[0]?.hooksFile ?? fallbackHooksFile();
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function readInstallRecord(recordFile: string): InstallRecord | null {
  try {
    const parsed = readJson(recordFile) as Partial<InstallRecord>;
    return parsed.schema === 'trae.pet.hook-install.v1' ? parsed as InstallRecord : null;
  } catch {
    return null;
  }
}

function readHooks(file: string): HooksDocument {
  if (!fs.existsSync(file)) return { hooks: {} };
  const parsed = readJson(file);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('hooks.json 顶层必须是 JSON 对象');
  }
  const doc = parsed as HooksDocument;
  if (doc.hooks !== undefined && (
    !doc.hooks || typeof doc.hooks !== 'object' || Array.isArray(doc.hooks)
  )) {
    throw new Error('hooks.json 的 hooks 字段必须是对象');
  }
  return doc;
}

function writeAtomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

/**
 * Advisory lock so the auto-install triggered by app launch cannot interleave
 * with a manual `install-hooks` run against the same profile.
 */
function withHooksLock<T>(hooksFile: string, action: () => T): T {
  const lockFile = `${hooksFile}.lock`;
  fs.mkdirSync(path.dirname(hooksFile), { recursive: true });
  let handle: number | null = null;
  try {
    handle = fs.openSync(lockFile, 'wx');
  } catch {
    let stale = true;
    try {
      stale = Date.now() - fs.statSync(lockFile).mtimeMs > LOCK_STALE_MS;
    } catch {
      stale = true;
    }
    if (!stale) throw new Error(`另一个 TRAE Pet 安装进程正在写入 ${hooksFile}`);
    fs.rmSync(lockFile, { force: true });
    handle = fs.openSync(lockFile, 'wx');
  }
  try {
    return action();
  } finally {
    if (handle !== null) fs.closeSync(handle);
    fs.rmSync(lockFile, { force: true });
  }
}

function isTraePetCommand(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /trae-pet\.(?:sh|cmd|js)["']?\s+hook(?:\s|$)/i.test(value);
}

function removeManagedCommands(doc: HooksDocument): number {
  let removed = 0;
  const hooks = doc.hooks ?? {};
  for (const [event, rawGroups] of Object.entries(hooks)) {
    if (!Array.isArray(rawGroups)) continue;
    hooks[event] = rawGroups.flatMap((group) => {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) return [group];
      const next = group.hooks.filter((hook) => {
        const managed = hook?.type === 'command' && isTraePetCommand(hook.command);
        if (managed) removed += 1;
        return !managed;
      });
      return next.length > 0 ? [{ ...group, hooks: next }] : [];
    });
  }
  doc.hooks = hooks;
  return removed;
}

function packagedRootCandidates(packagedRoot?: string): string[] {
  return [
    ...(packagedRoot ? [packagedRoot] : []),
    path.resolve(moduleDir, '..'),
    path.resolve(moduleDir, '..', '..'),
    path.resolve(moduleDir, '..', '..', '..'),
  ];
}

function launcherCandidates(packagedRoot?: string): string[] {
  const name = process.platform === 'win32' ? 'trae-pet.cmd' : 'trae-pet.sh';
  const data = userPaths(process.env.TRAE_PET_DATA_DIR || undefined);
  return [
    path.join(data.baseDir, 'hook-runtime', 'bin', name),
    ...packagedRootCandidates(packagedRoot).map((root) => path.join(root, 'bin', name)),
  ];
}

function copyFileAtomic(source: string, destination: string, mode?: number): void {
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.copyFileSync(source, temporary);
    if (mode !== undefined) fs.chmodSync(temporary, mode);
    // Renaming instead of overwriting keeps a concurrently running hook from
    // reading a half-written file, and avoids EBUSY on Windows.
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function installStableHookCli(packagedRoot?: string): string | null {
  const root = packagedRootCandidates(packagedRoot).find((candidate) => (
    fs.existsSync(path.join(candidate, 'cli', 'cli.cjs'))
    && fs.existsSync(path.join(candidate, 'bin', 'trae-pet.js'))
  ));
  if (!root) return null;

  const data = userPaths(process.env.TRAE_PET_DATA_DIR || undefined);
  const targetRoot = path.join(data.baseDir, 'hook-runtime');
  const targetBin = path.join(targetRoot, 'bin');
  const targetCli = path.join(targetRoot, 'cli');
  const packagedSecureCore = path.join(root, 'secure-core', 'trae-pet-secure-core');
  const targetSecureCore = path.join(targetRoot, 'secure-core');
  const secureBuild = typeof __TRAE_PET_SECURE_BUILD__ !== 'undefined'
    && __TRAE_PET_SECURE_BUILD__;
  if (process.platform === 'darwin' && secureBuild && !fs.existsSync(packagedSecureCore)) {
    throw new Error('安全版 Hook CLI 缺少 secure-core helper');
  }
  fs.mkdirSync(targetBin, { recursive: true });
  fs.mkdirSync(targetCli, { recursive: true });
  for (const file of ['trae-pet.js', 'trae-pet.sh', 'trae-pet.cmd']) {
    const executable = process.platform !== 'win32' && file === 'trae-pet.sh';
    copyFileAtomic(
      path.join(root, 'bin', file),
      path.join(targetBin, file),
      executable ? 0o755 : undefined,
    );
  }
  copyFileAtomic(path.join(root, 'cli', 'cli.cjs'), path.join(targetCli, 'cli.cjs'));
  if (process.platform === 'darwin' && fs.existsSync(packagedSecureCore)) {
    copyFileAtomic(packagedSecureCore, targetSecureCore, 0o755);
  }
  return path.join(targetBin, process.platform === 'win32' ? 'trae-pet.cmd' : 'trae-pet.sh');
}

export function resolveHookLauncher(packagedRoot?: string): string | null {
  const explicit = process.env.TRAE_PET_HOOK_LAUNCHER;
  if (explicit) return fs.existsSync(explicit) ? path.resolve(explicit) : null;
  return launcherCandidates(packagedRoot).find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function hookCommandFor(launcher: string): string {
  return `"${launcher}" hook`;
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isManagedLegacyRuntime(directory: string): boolean {
  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    return entries.length > 0 && entries.every((entry) => (
      entry.isFile() && (entry.name === 'node' || entry.name === 'node.exe')
    ));
  } catch {
    return false;
  }
}

function installIntoProfile(
  profile: TraeProfile,
  command: string,
  version: string,
  node: NodeInfo,
): HookProfileResult {
  try {
    return withHooksLock(profile.hooksFile, () => {
      const doc = readHooks(profile.hooksFile);
      const before = JSON.stringify(doc);
      removeManagedCommands(doc);
      const hooks = doc.hooks ?? {};
      for (const event of TRAE_HOOK_EVENTS) {
        const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
        hooks[event] = [
          ...groups,
          {
            matcher: '*',
            hooks: [{ type: 'command', command, timeout: 10 }],
          },
        ];
      }
      doc.hooks = hooks;
      const changed = JSON.stringify(doc) !== before;
      const existingRecord = readInstallRecord(profile.recordFile);
      let backupFile: string | null = existingRecord?.backupFile ?? null;
      if (changed && !backupFile && fs.existsSync(profile.hooksFile)) {
        backupFile = `${profile.hooksFile}.bak.${timestampForFile()}`;
        fs.copyFileSync(profile.hooksFile, backupFile, fs.constants.COPYFILE_EXCL);
      }
      if (changed) writeAtomicJson(profile.hooksFile, doc);
      const record: InstallRecord = {
        schema: 'trae.pet.hook-install.v1',
        version,
        installedAt: new Date().toISOString(),
        hookCommand: command,
        hooksFile: profile.hooksFile,
        backupFile,
        events: TRAE_HOOK_EVENTS,
        nodePath: node.execPath!,
        nodeVersion: node.version!,
        arch: node.arch!,
      };
      writeAtomicJson(profile.recordFile, record);
      return {
        id: profile.id,
        dir: profile.dir,
        hooksFile: profile.hooksFile,
        ok: true,
        changed,
        hookCommand: command,
        backupFile,
      };
    });
  } catch (error) {
    return {
      id: profile.id,
      dir: profile.dir,
      hooksFile: profile.hooksFile,
      ok: false,
      changed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(
  profiles: HookProfileResult[],
  selection: { source: TraeProfileSource; skipped: SkippedTraeProfile[] },
): Pick<
  HookOperationResult,
  'profiles' | 'profileSource' | 'skippedProfiles' | 'hooksFile' | 'backupFile' | 'changed'
> {
  const primary = profiles[0];
  return {
    profiles,
    profileSource: selection.source,
    skippedProfiles: selection.skipped,
    hooksFile: primary?.hooksFile ?? fallbackHooksFile(),
    backupFile: primary?.backupFile ?? null,
    changed: profiles.some((entry) => entry.changed),
  };
}

const NO_PROFILE_ERROR = '未检测到 TRAE 配置目录（例如 ~/.trae 或 ~/.trae-cn）；'
  + '请先安装并启动一次 TRAE，然后重新接入';

export function installTraeHooks(
  version: string,
  options: HookInstallOptions = {},
): HookOperationResult {
  const selection = defaultProfileSelection(options);
  const requirements = options.requirements ?? SUPPORTED_NODE;
  const nodeRecordFile = nodePathFile();
  const node = discoverNode(requirements, nodeRecordFile);
  const base = summarize([], selection);
  if (!node.ok) {
    return {
      ...base,
      ok: false,
      schema: HOOK_RESULT_SCHEMA,
      node,
      error: node.error ?? '找不到受支持的 Node 运行时',
    };
  }
  if (selection.profiles.length === 0) {
    return {
      ...base,
      ok: false,
      schema: HOOK_RESULT_SCHEMA,
      node,
      error: NO_PROFILE_ERROR,
    };
  }
  try {
    const launcher = installStableHookCli(options.packagedRoot)
      ?? resolveHookLauncher(options.packagedRoot);
    if (!launcher) throw new Error('找不到 TRAE Pet Hook 启动器');
    if (process.platform !== 'win32') {
      fs.chmodSync(launcher, 0o755);
    }
    const command = hookCommandFor(launcher);
    writeNodePathRecord(node, nodeRecordFile);
    const results = selection.profiles.map((profile) => (
      installIntoProfile(profile, command, version, node)
    ));
    const legacyRuntime = path.join(
      userPaths(process.env.TRAE_PET_DATA_DIR || undefined).baseDir,
      'hook-runtime',
      'runtime',
    );
    const migratedBundledRuntime = isManagedLegacyRuntime(legacyRuntime);
    if (migratedBundledRuntime) {
      fs.rmSync(legacyRuntime, { recursive: true, force: true });
    }
    const failed = results.filter((entry) => !entry.ok);
    return {
      ...summarize(results, selection),
      ok: failed.length === 0,
      schema: HOOK_RESULT_SCHEMA,
      hookCommand: command,
      events: TRAE_HOOK_EVENTS,
      nodePath: node.execPath!,
      nodeVersion: node.version!,
      arch: node.arch!,
      node,
      migratedBundledRuntime,
      ...(failed.length > 0
        ? { error: failed.map((entry) => `${entry.id}: ${entry.error}`).join('; ') }
        : {}),
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      schema: HOOK_RESULT_SCHEMA,
      node,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function verifyTraeHooks(options: HookInstallOptions = {}): HookOperationResult {
  const selection = defaultProfileSelection(options);
  const requirements = options.requirements ?? SUPPORTED_NODE;
  const node = readPinnedNode(requirements);
  const base = summarize([], selection);
  try {
    if (!node.ok) throw new Error(node.error ?? '固化的 Node 运行时无效');
    if (selection.profiles.length === 0) throw new Error(NO_PROFILE_ERROR);
    const launcher = resolveHookLauncher(options.packagedRoot);
    if (!launcher) throw new Error('找不到 TRAE Pet Hook 启动器');
    const expected = hookCommandFor(launcher);
    const results = selection.profiles.map<HookProfileResult>((profile) => {
      try {
        const doc = readHooks(profile.hooksFile);
        const missing = TRAE_HOOK_EVENTS.filter((event) => {
          const groups = doc.hooks?.[event];
          return !Array.isArray(groups) || !groups.some((group) => (
            Array.isArray(group.hooks)
            && group.hooks.some((hook) => hook.type === 'command' && hook.command === expected)
          ));
        });
        if (missing.length > 0) throw new Error(`以下 Hook 尚未正确安装：${missing.join(', ')}`);
        return {
          id: profile.id,
          dir: profile.dir,
          hooksFile: profile.hooksFile,
          ok: true,
          hookCommand: expected,
        };
      } catch (error) {
        return {
          id: profile.id,
          dir: profile.dir,
          hooksFile: profile.hooksFile,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    const failed = results.filter((entry) => !entry.ok);
    return {
      ...summarize(results, selection),
      ok: failed.length === 0,
      schema: HOOK_RESULT_SCHEMA,
      hookCommand: expected,
      events: TRAE_HOOK_EVENTS,
      nodePath: node.execPath!,
      nodeVersion: node.version!,
      arch: node.arch!,
      node,
      ...(failed.length > 0
        ? { error: failed.map((entry) => `${entry.id}: ${entry.error}`).join('; ') }
        : {}),
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      schema: HOOK_RESULT_SCHEMA,
      node,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function uninstallTraeHooks(
  restoreBackup = false,
  options: HookInstallOptions = {},
): HookOperationResult {
  const selection = defaultProfileSelection(options);
  const results = selection.profiles.map<HookProfileResult>((profile) => {
    try {
      return withHooksLock(profile.hooksFile, () => {
        const record = readInstallRecord(profile.recordFile);
        if (restoreBackup) {
          if (!record?.backupFile || !fs.existsSync(record.backupFile)) {
            throw new Error('没有可恢复的 Hook 配置备份');
          }
          fs.copyFileSync(record.backupFile, profile.hooksFile);
        } else if (fs.existsSync(profile.hooksFile)) {
          const doc = readHooks(profile.hooksFile);
          const removed = removeManagedCommands(doc);
          if (removed > 0) writeAtomicJson(profile.hooksFile, doc);
        }
        fs.rmSync(profile.recordFile, { force: true });
        return {
          id: profile.id,
          dir: profile.dir,
          hooksFile: profile.hooksFile,
          ok: true,
          changed: true,
          backupFile: record?.backupFile ?? null,
        };
      });
    } catch (error) {
      return {
        id: profile.id,
        dir: profile.dir,
        hooksFile: profile.hooksFile,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const failed = results.filter((entry) => !entry.ok);
  return {
    ...summarize(results, selection),
    ok: failed.length === 0,
    schema: HOOK_RESULT_SCHEMA,
    ...(failed.length > 0
      ? { error: failed.map((entry) => `${entry.id}: ${entry.error}`).join('; ') }
      : {}),
  };
}
