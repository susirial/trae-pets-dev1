import os from 'node:os';
import path from 'node:path';

/**
 * Folder name used both by Electron's `app.getPath('userData')` and by the
 * standalone CLI. They MUST agree so the hook and the GUI read/write the same
 * runtime state, config and uploaded assets.
 */
export const APP_NAME = 'trae-pet';

/**
 * Resolves the per-user writable directory without depending on Electron, so
 * the lightweight hook CLI and the Electron app compute the same location.
 */
export function userDataDir(): string {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(base, APP_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(base, APP_NAME);
}

export interface UserPaths {
  baseDir: string;
  configFile: string;
  stateFile: string;
  historyFile: string;
  lockFile: string;
  rendererPidFile: string;
  logsDir: string;
  petsDir: string;
  soundsDir: string;
}

export function userPaths(baseDir: string = userDataDir()): UserPaths {
  return {
    baseDir,
    configFile: path.join(baseDir, 'config.json'),
    stateFile: path.join(baseDir, 'state.json'),
    historyFile: path.join(baseDir, 'history.jsonl'),
    lockFile: path.join(baseDir, 'state.lock'),
    rendererPidFile: path.join(baseDir, 'renderer.pid'),
    logsDir: path.join(baseDir, 'logs'),
    petsDir: path.join(baseDir, 'pets'),
    soundsDir: path.join(baseDir, 'sounds'),
  };
}

export interface ResourcePaths {
  resourcesDir: string;
  defaultConfigFile: string;
  petsDir: string;
  soundsDir: string;
}

/**
 * Bundled, read-only defaults. `resourcesDir` differs by context:
 *  - dev / CLI from repo: `<repoRoot>/resources`
 *  - packaged Electron:   `<process.resourcesPath>/resources`
 */
export function resourcePaths(resourcesDir: string): ResourcePaths {
  return {
    resourcesDir,
    defaultConfigFile: path.join(resourcesDir, 'default-config.json'),
    petsDir: path.join(resourcesDir, 'pets'),
    soundsDir: path.join(resourcesDir, 'sounds'),
  };
}
