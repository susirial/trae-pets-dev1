import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import {
  normalizePetManifest,
  REQUIRED_PET_STATES,
  type PetManifestV2,
} from '../../shared/pet-manifest.ts';
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import type { PetSoundSelection } from '../../shared/pet-config.ts';
// @ts-ignore -- explicit .ts import keeps this module runnable in node strip-types tests
import {
  resolveSoundLibraryAsset,
  soundLibraryUrl,
  type SoundLibraryRoots,
} from './sound-library.ts';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'] as const;
export const DEFAULT_CLICK_DURATION_MS = 2_000;

export interface PetPackageMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  dir: string;
  source: 'built-in' | 'user';
  manifest: PetManifestV2;
}

export interface ResolvedPetAsset {
  file: string | null;
  filePath: string | null;
  url: string | null;
  error: string | null;
  soundId?: string | null;
  volume?: number;
}

export interface PetPackageRoots {
  builtInDir: string;
  userDir?: string;
}

export interface PetActionOption {
  id: string;
  stateId: string;
  file: string;
  durationMs: number;
}

export function readPetManifest(file: string): PetManifestV2 | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return normalizePetManifest(raw);
  } catch {
    return null;
  }
}

function isContainedFile(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveDeclaredFile(dir: string, file: string): string | null {
  if (!file || path.isAbsolute(file) || file.includes('\0')) return null;
  const resolved = path.resolve(dir, file);
  return isContainedFile(dir, resolved) ? resolved : null;
}

export function readPetPackage(
  dir: string,
  source: PetPackageMeta['source'] = 'built-in',
): PetPackageMeta | null {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = readPetManifest(manifestPath);
  if (!manifest) return null;
  const complete = REQUIRED_PET_STATES.every((stateId) => {
    const visual = manifest.visuals[stateId];
    const file = visual && resolveDeclaredFile(dir, visual.file);
    return Boolean(file && fs.existsSync(file) && fs.statSync(file).isFile());
  });
  if (!complete) {
    return null;
  }

  return {
    id: manifest.identity.id,
    name: manifest.identity.name,
    description: manifest.identity.description,
    version: manifest.identity.version,
    dir,
    source,
    manifest,
  };
}

function scanDirectory(petsDir: string, source: PetPackageMeta['source']): PetPackageMeta[] {
  try {
    return fs.readdirSync(petsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readPetPackage(path.join(petsDir, entry.name), source))
      .filter((pkg): pkg is PetPackageMeta => Boolean(pkg))
  } catch {
    return [];
  }
}

function normalizeRoots(roots: string | PetPackageRoots): PetPackageRoots {
  return typeof roots === 'string' ? { builtInDir: roots } : roots;
}

/** Built-ins are inserted first, so a user package can never shadow the same id. */
export function listPetPackages(roots: string | PetPackageRoots): PetPackageMeta[] {
  const { builtInDir, userDir } = normalizeRoots(roots);
  const byId = new Map<string, PetPackageMeta>();
  for (const pkg of scanDirectory(builtInDir, 'built-in')) byId.set(pkg.id, pkg);
  if (userDir) {
    for (const pkg of scanDirectory(userDir, 'user')) {
      if (!byId.has(pkg.id)) byId.set(pkg.id, pkg);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function findPetPackage(
  roots: string | PetPackageRoots,
  selectedId: string,
): PetPackageMeta | null {
  return listPetPackages(roots).find((pkg) => pkg.id === selectedId) ?? null;
}

export function resolvePetAction(
  roots: string | PetPackageRoots,
  selectedId: string,
  actionId: string,
): string {
  const pkg = findPetPackage(roots, selectedId);
  return pkg?.manifest.actions[actionId]?.state ?? actionId;
}

export function listPetActionOptions(pkg: PetPackageMeta): PetActionOption[] {
  const ids = new Set([
    ...Object.keys(pkg.manifest.visuals),
    ...Object.keys(pkg.manifest.actions),
  ]);
  return [...ids].flatMap((id) => {
    const action = pkg.manifest.actions[id];
    const stateId = action?.state ?? id;
    const visual = pkg.manifest.visuals[stateId];
    if (!visual) return [];
    const filePath = resolveDeclaredFile(pkg.dir, visual.file);
    if (!filePath || !fs.existsSync(filePath)) return [];
    return [{
      id,
      stateId,
      file: visual.file,
      durationMs: action?.durationMs ?? visual.durationMs ?? DEFAULT_CLICK_DURATION_MS,
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function assetUrl(pkg: PetPackageMeta, kind: 'visual' | 'audio', file: string): string {
  return `trae-pet://pet-asset/${encodeURIComponent(pkg.id)}/${kind}/${encodeURIComponent(file)}`;
}

export function resolvePetVisual(
  roots: string | PetPackageRoots,
  selectedId: string,
  stateId: string,
): ResolvedPetAsset {
  const pkg = findPetPackage(roots, selectedId);
  if (!pkg) {
    return { file: null, filePath: null, url: null, error: `Pet package not found: ${selectedId}` };
  }

  const visual = pkg.manifest.visuals[stateId];
  const file = visual?.file ?? null;
  const filePath = file ? resolveDeclaredFile(pkg.dir, file) : null;
  if (!file || !filePath || !fs.existsSync(filePath)) {
    return { file, filePath: null, url: null, error: `Visual not found: ${pkg.id}/${file}` };
  }

  return {
    file,
    filePath,
    url: assetUrl(pkg, 'visual', file),
    error: null,
  };
}

export function resolvePetAudio(
  roots: string | PetPackageRoots,
  selectedId: string,
  stateId: string,
  selection?: PetSoundSelection,
  libraryRoots?: SoundLibraryRoots,
): ResolvedPetAsset {
  const pkg = findPetPackage(roots, selectedId);
  if (!pkg) {
    return { file: null, filePath: null, url: null, error: null };
  }

  if (selection?.mode === 'none') {
    return { file: null, filePath: null, url: null, error: null, soundId: null, volume: 1 };
  }

  if (selection?.mode === 'library') {
    const filePath = libraryRoots
      ? resolveSoundLibraryAsset(libraryRoots, selection.soundId)
      : null;
    return filePath
      ? {
          file: path.basename(filePath),
          filePath,
          url: soundLibraryUrl(selection.soundId),
          error: null,
          soundId: selection.soundId,
          volume: 1,
        }
      : {
          file: null,
          filePath: null,
          url: null,
          error: `Library sound not found: ${selection.soundId}`,
          soundId: selection.soundId,
          volume: 1,
        };
  }

  const soundId = selection?.mode === 'sound'
    ? selection.soundId
    : pkg.manifest.stateSounds[stateId];
  if (soundId) {
    const sound = pkg.manifest.sounds[soundId];
    if (!sound) {
      return {
        file: null,
        filePath: null,
        url: null,
        error: `Sound not found: ${pkg.id}/${soundId}`,
        soundId,
        volume: 1,
      };
    }
    const filePath = resolveDeclaredFile(pkg.dir, sound.file);
    if (filePath && fs.existsSync(filePath)) {
      return {
        file: sound.file,
        filePath,
        url: assetUrl(pkg, 'audio', sound.file),
        error: null,
        soundId,
        volume: sound.volume ?? 1,
      };
    }
    return {
      file: sound.file,
      filePath: null,
      url: null,
      error: `Audio not found: ${pkg.id}/${sound.file}`,
      soundId,
      volume: sound.volume ?? 1,
    };
  }

  // Legacy packages discover audio by normalized state name.
  for (const ext of AUDIO_EXTENSIONS) {
    const file = `${stateId}${ext}`;
    const filePath = path.join(pkg.dir, 'audio', file);
    if (fs.existsSync(filePath)) {
      return {
        file,
        filePath,
        url: assetUrl(pkg, 'audio', file),
        error: null,
        soundId: null,
        volume: 1,
      };
    }
  }

  return { file: null, filePath: null, url: null, error: null };
}

/** Resolves only files that the package scanner itself exposes through asset URLs. */
export function resolvePackageAssetRequest(
  roots: string | PetPackageRoots,
  selectedId: string,
  kind: 'visual' | 'audio',
  requestedFile: string,
): string | null {
  const pkg = findPetPackage(roots, selectedId);
  if (!pkg) return null;
  if (kind === 'visual') {
    const declared = Object.values(pkg.manifest.visuals).find((asset) => asset.file === requestedFile);
    return declared ? resolveDeclaredFile(pkg.dir, declared.file) : null;
  }
  const declared = Object.values(pkg.manifest.sounds).find((asset) => asset.file === requestedFile);
  if (declared) return resolveDeclaredFile(pkg.dir, declared.file);
  if (path.basename(requestedFile) !== requestedFile) return null;
  const ext = path.extname(requestedFile).toLowerCase();
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return null;
  const legacy = path.join(pkg.dir, 'audio', requestedFile);
  return isContainedFile(pkg.dir, legacy) ? legacy : null;
}
