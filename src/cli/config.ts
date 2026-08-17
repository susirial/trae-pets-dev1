import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type PetConfig,
} from '@shared/pet-config';
import {
  resourcePaths,
  userPaths,
  type ResourcePaths,
  type UserPaths,
} from '@shared/paths';

export interface CliContext {
  config: PetConfig;
  user: UserPaths;
  resources: ResourcePaths;
}

function readJsonIfExists(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return undefined;
  }
}

/**
 * Bundled resources directory. Overridable via TRAE_PET_RESOURCES (used by the
 * packaged Electron app to point at process.resourcesPath/resources).
 * Falls back to `<bundle dir>/../resources`, which resolves correctly both for
 * the repo build (dist/cli.cjs) and the packaged layout (cli/cli.cjs).
 */
export function resolveResourcesDir(): string {
  if (process.env.TRAE_PET_RESOURCES) {
    return process.env.TRAE_PET_RESOURCES;
  }
  return path.resolve(__dirname, '..', 'resources');
}

export function loadContext(): CliContext {
  const user = userPaths(process.env.TRAE_PET_DATA_DIR || undefined);
  const resources = resourcePaths(resolveResourcesDir());

  const bundledDefaults = readJsonIfExists(resources.defaultConfigFile);
  const base = mergeConfig(DEFAULT_CONFIG, bundledDefaults);
  const userConfig = readJsonIfExists(user.configFile);
  const config = mergeConfig(base, userConfig);

  return { config, user, resources };
}
