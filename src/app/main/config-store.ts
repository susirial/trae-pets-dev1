import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, mergeConfig, type PetConfig } from '@shared/pet-config';
import { getResourcePaths, getUserPaths } from './paths';

let cached: PetConfig | null = null;

function readJson(file: string): unknown {
  try {
    if (!fs.existsSync(file)) {
      return undefined;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return undefined;
  }
}

/** Defaults = built-in constants merged with the bundled default-config.json. */
export function getDefaultConfig(): PetConfig {
  const res = getResourcePaths();
  return mergeConfig(DEFAULT_CONFIG, readJson(res.defaultConfigFile));
}

export function loadConfig(): PetConfig {
  const base = getDefaultConfig();
  const user = readJson(getUserPaths().configFile);
  cached = mergeConfig(base, user);
  return cached;
}

export function getConfig(): PetConfig {
  return cached ?? loadConfig();
}

export function saveConfig(next: PetConfig): PetConfig {
  const user = getUserPaths();
  fs.mkdirSync(user.baseDir, { recursive: true });
  const merged = mergeConfig(getDefaultConfig(), next);
  const tmp = `${user.configFile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, user.configFile);
  cached = merged;
  return merged;
}
