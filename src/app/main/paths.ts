import path from 'node:path';
import { app } from 'electron';
import { resourcePaths, userPaths, type ResourcePaths, type UserPaths } from '@shared/paths';

export function getUserPaths(): UserPaths {
  return userPaths(app.getPath('userData'));
}

export function getResourcesDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources');
  }
  return path.join(app.getAppPath(), 'resources');
}

export function getResourcePaths(): ResourcePaths {
  return resourcePaths(getResourcesDir());
}
