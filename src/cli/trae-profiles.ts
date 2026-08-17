import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * TRAE ships several parallel builds (international `~/.trae`, China `~/.trae-cn`,
 * `~/.trae-beta`, ...). Each build keeps its own `hooks.json`, so the pet has to
 * be wired into every profile the user actually has.
 */
export interface TraeProfile {
  id: string;
  dir: string;
  hooksFile: string;
  recordFile: string;
}

export type TraeProfileSource =
  | 'TRAE_HOOKS_DIR'
  | 'explicit-dir'
  | 'explicit-profile'
  | 'discovery';

export interface SkippedTraeProfile {
  dir: string;
  reason: string;
}

export interface TraeProfileSelection {
  profiles: TraeProfile[];
  source: TraeProfileSource;
  skipped: SkippedTraeProfile[];
}

export interface ProfileResolveOptions {
  home?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

const PROFILE_DIR_PATTERN = /^\.trae(?:-[a-z0-9]+)*$/;

/**
 * A directory only counts as a TRAE profile when it carries at least one file
 * the IDE itself writes. Without this check a stray `~/.trae-notes` folder would
 * receive a hooks.json it never asked for.
 */
const PROFILE_MARKERS = [
  'argv.json',
  'hooks.json',
  'installed-plugins.json',
  'skill-config.json',
  'extensions',
  'builtin',
];

export function traeProfileFromDir(dir: string): TraeProfile {
  const normalized = path.normalize(dir);
  const base = path.basename(normalized);
  return {
    id: base.startsWith('.') ? base.slice(1) : base,
    dir: normalized,
    hooksFile: path.join(normalized, 'hooks.json'),
    recordFile: path.join(normalized, 'trae-pet.install.json'),
  };
}

function isRealDirectory(dir: string): boolean {
  try {
    return fs.lstatSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function hasProfileMarker(dir: string): boolean {
  return PROFILE_MARKERS.some((marker) => fs.existsSync(path.join(dir, marker)));
}

function withinHome(home: string, dir: string): boolean {
  const resolvedHome = path.resolve(home);
  const resolvedDir = path.resolve(dir);
  return resolvedDir.startsWith(`${resolvedHome}${path.sep}`);
}

/**
 * Scans the home directory for TRAE profiles. Symlinks are rejected on purpose:
 * the installer writes into every match, so a planted link must not be able to
 * redirect that write outside the home directory.
 */
export function discoverTraeProfiles(home = os.homedir()): TraeProfileSelection {
  const profiles: TraeProfile[] = [];
  const skipped: SkippedTraeProfile[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(home, { withFileTypes: true });
  } catch {
    return { profiles, source: 'discovery', skipped };
  }
  for (const entry of entries) {
    if (!PROFILE_DIR_PATTERN.test(entry.name)) continue;
    const dir = path.join(home, entry.name);
    if (entry.isSymbolicLink() || !entry.isDirectory() || !isRealDirectory(dir)) {
      skipped.push({ dir, reason: '不是真实目录（可能是符号链接）' });
      continue;
    }
    if (!withinHome(home, dir)) {
      skipped.push({ dir, reason: '路径超出用户主目录' });
      continue;
    }
    if (!hasProfileMarker(dir)) {
      skipped.push({ dir, reason: '缺少 TRAE 配置标志文件' });
      continue;
    }
    profiles.push(traeProfileFromDir(dir));
  }
  profiles.sort((left, right) => left.id.localeCompare(right.id));
  return { profiles, source: 'discovery', skipped };
}

function collectArgValues(args: string[], flag: string): string[] {
  const prefix = `${flag}=`;
  return args
    .filter((arg) => arg.startsWith(prefix))
    .flatMap((arg) => arg.slice(prefix.length).split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function explicitDirSelection(
  dirs: string[],
  source: TraeProfileSource,
): TraeProfileSelection {
  const profiles: TraeProfile[] = [];
  const skipped: SkippedTraeProfile[] = [];
  for (const dir of dirs) {
    if (!path.isAbsolute(dir)) {
      skipped.push({ dir, reason: '必须是绝对路径' });
      continue;
    }
    if (!isRealDirectory(dir)) {
      skipped.push({ dir, reason: '不是真实目录（可能是符号链接）' });
      continue;
    }
    profiles.push(traeProfileFromDir(dir));
  }
  return { profiles, source, skipped };
}

/**
 * Resolution order, most specific first:
 *   1. `TRAE_HOOKS_DIR` — legacy single-directory escape hatch.
 *   2. `--dir=<absolute path>` — repeatable / comma separated.
 *   3. `--profile=trae-cn,trae` — named profiles under the home directory.
 *   4. Automatic discovery of every real `~/.trae*` profile.
 */
export function resolveTraeProfiles(options: ProfileResolveOptions = {}): TraeProfileSelection {
  const env = options.env ?? process.env;
  const args = options.args ?? [];
  const home = options.home ?? env.TRAE_PET_HOME ?? os.homedir();

  if (env.TRAE_HOOKS_DIR) {
    return explicitDirSelection([env.TRAE_HOOKS_DIR], 'TRAE_HOOKS_DIR');
  }

  const explicitDirs = collectArgValues(args, '--dir');
  if (explicitDirs.length > 0) {
    return explicitDirSelection(explicitDirs, 'explicit-dir');
  }

  const requestedIds = collectArgValues(args, '--profile');
  if (requestedIds.length > 0) {
    const dirs = requestedIds.map((id) => (
      path.join(home, id.startsWith('.') ? id : `.${id}`)
    ));
    return explicitDirSelection(dirs, 'explicit-profile');
  }

  return discoverTraeProfiles(home);
}
