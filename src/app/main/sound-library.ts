import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PetConfig } from '../../shared/pet-config.ts';
import type {
  SoundLibraryAsset,
  SoundLibraryOperationResult,
  SoundLibrarySource,
} from '../../shared/ipc.ts';

const MAX_SOUND_BYTES = 20 * 1024 * 1024;
const SOUND_ID_PATTERN = /^(builtin|user):(.+\.mp3)$/i;

export interface SoundLibraryRoots {
  builtInDir: string;
  userDir: string;
}

function sourcePrefix(source: SoundLibrarySource): 'builtin' | 'user' {
  return source === 'built-in' ? 'builtin' : 'user';
}

function soundId(source: SoundLibrarySource, file: string): string {
  return `${sourcePrefix(source)}:${file}`;
}

export function soundLibraryUrl(id: string): string {
  return `trae-pet://sound-library/${encodeURIComponent(id)}`;
}

function hasMp3Signature(file: string): boolean {
  const fd = fs.openSync(file, 'r');
  try {
    const bytes = Buffer.alloc(3);
    const read = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (read < 2) return false;
    if (read >= 3 && bytes.toString('ascii', 0, 3) === 'ID3') return true;
    return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  } finally {
    fs.closeSync(fd);
  }
}

function assertValidMp3(file: string): fs.Stats {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('音效必须是普通文件，不能使用符号链接');
  }
  if (path.extname(file).toLowerCase() !== '.mp3') {
    throw new Error('当前仅支持 MP3 音效');
  }
  if (stat.size <= 0) throw new Error('音效文件不能为空');
  if (stat.size > MAX_SOUND_BYTES) throw new Error('音效文件不能超过 20 MiB');
  if (!hasMp3Signature(file)) throw new Error('文件内容不是有效的 MP3');
  return stat;
}

function safeLibraryFileName(value: string): string | null {
  if (!value || value !== path.basename(value) || path.extname(value).toLowerCase() !== '.mp3') {
    return null;
  }
  if (/[\0-\x1f\x7f/\\]/.test(value) || value === '.' || value === '..') return null;
  return value;
}

function isContained(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function scanRoot(root: string, source: SoundLibrarySource): SoundLibraryAsset[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => (
      entry.isFile()
      && !entry.isSymbolicLink()
      && !entry.name.startsWith('.import-')
      && safeLibraryFileName(entry.name)
    ))
    .flatMap((entry) => {
      const filePath = path.join(root, entry.name);
      try {
        const stat = assertValidMp3(filePath);
        const id = soundId(source, entry.name);
        return [{
          id,
          name: path.basename(entry.name, path.extname(entry.name)),
          file: entry.name,
          source,
          size: stat.size,
          url: soundLibraryUrl(id),
        }];
      } catch {
        return [];
      }
    });
}

export function listSoundLibrary(roots: SoundLibraryRoots): SoundLibraryAsset[] {
  return [
    ...scanRoot(roots.builtInDir, 'built-in'),
    ...scanRoot(roots.userDir, 'user'),
  ].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'built-in' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export function resolveSoundLibraryAsset(
  roots: SoundLibraryRoots,
  id: string,
): string | null {
  const match = SOUND_ID_PATTERN.exec(id);
  if (!match) return null;
  const source: SoundLibrarySource = match[1].toLowerCase() === 'builtin' ? 'built-in' : 'user';
  const fileName = safeLibraryFileName(match[2]);
  if (!fileName) return null;
  const root = source === 'built-in' ? roots.builtInDir : roots.userDir;
  const candidate = path.resolve(root, fileName);
  if (!isContained(path.resolve(root), candidate)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(candidate);
    if (!isContained(realRoot, realFile)) return null;
    assertValidMp3(realFile);
    return realFile;
  } catch {
    return null;
  }
}

function sanitizedImportName(source: string): string {
  const original = path.basename(source, path.extname(source))
    .normalize('NFC')
    .replace(/[\0-\x1f\x7f/\\:]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
  return `${original || 'sound'}.mp3`;
}

function availableTarget(dir: string, requestedName: string): string {
  const stem = path.basename(requestedName, '.mp3');
  let candidate = path.join(dir, requestedName);
  for (let suffix = 2; fs.existsSync(candidate); suffix += 1) {
    candidate = path.join(dir, `${stem}-${suffix}.mp3`);
  }
  return candidate;
}

export function importSoundToLibrary(
  source: string,
  roots: SoundLibraryRoots,
): SoundLibraryOperationResult {
  let temporary: string | null = null;
  try {
    assertValidMp3(source);
    fs.mkdirSync(roots.userDir, { recursive: true });
    const target = availableTarget(roots.userDir, sanitizedImportName(source));
    temporary = path.join(roots.userDir, `.import-${crypto.randomUUID()}.mp3`);
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    assertValidMp3(temporary);
    fs.renameSync(temporary, target);
    temporary = null;
    return { ok: true, id: soundId('user', path.basename(target)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
  }
}

export function soundLibraryReferences(config: PetConfig, id: string): string[] {
  const references: string[] = [];
  for (const [petId, override] of Object.entries(config.petOverrides)) {
    if (override.click?.sound?.mode === 'library' && override.click.sound.soundId === id) {
      references.push(`${petId}/click`);
    }
    for (const [stateId, selection] of Object.entries(override.soundSelections ?? {})) {
      if (selection.mode === 'library' && selection.soundId === id) {
        references.push(`${petId}/${stateId}`);
      }
    }
  }
  return references;
}

export function deleteSoundFromLibrary(
  id: string,
  roots: SoundLibraryRoots,
  config: PetConfig,
): SoundLibraryOperationResult {
  if (!id.startsWith('user:')) return { ok: false, error: '内置音效不能删除' };
  const referencedBy = soundLibraryReferences(config, id);
  if (referencedBy.length > 0) {
    return { ok: false, error: '该音效仍被动作引用，请先更换动作音效', referencedBy };
  }
  const file = resolveSoundLibraryAsset(roots, id);
  if (!file) return { ok: false, error: '用户音效不存在或无效' };
  try {
    fs.unlinkSync(file);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
