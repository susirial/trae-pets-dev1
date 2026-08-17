import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureDir } from './logger';
import type { CliContext } from './config';

export interface RendererStatus {
  pid: number | null;
  running: boolean;
}

function appRoot(): string {
  // Bundle lives at dist/cli.cjs in dev -> repo root holds out/main + package.json.
  return path.resolve(__dirname, '..');
}

function electronBinary(): string | null {
  try {
    const electronPath: unknown = require('electron');
    return typeof electronPath === 'string' ? electronPath : null;
  } catch {
    return null;
  }
}

function isPidRunning(pid: number): boolean {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(pidFile: string): number {
  try {
    return Number(fs.readFileSync(pidFile, 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

export function rendererStatus(ctx: CliContext): RendererStatus {
  const pid = readPid(ctx.user.rendererPidFile);
  return { pid: pid || null, running: isPidRunning(pid) };
}

export function startRenderer(ctx: CliContext): { started: boolean; pid?: number; reason?: string } {
  const existing = readPid(ctx.user.rendererPidFile);
  if (isPidRunning(existing)) {
    return { started: false, pid: existing, reason: 'already-running' };
  }

  const env = {
    ...process.env,
    TRAE_PET_DATA_DIR: ctx.user.baseDir,
    TRAE_PET_RESOURCES: ctx.resources.resourcesDir,
  };

  let command: string;
  let args: string[];
  const launcher = process.env.TRAE_PET_APP;
  if (launcher) {
    command = launcher;
    args = [];
  } else {
    const electron = electronBinary();
    if (!electron) {
      return { started: false, reason: 'electron-not-found (open the installed app instead)' };
    }
    command = electron;
    args = [appRoot()];
  }

  ensureDir(path.dirname(ctx.user.rendererPidFile));
  const child = spawn(command, args, {
    cwd: appRoot(),
    detached: true,
    stdio: 'ignore',
    env,
    shell: false,
  });
  child.unref();
  if (child.pid) {
    fs.writeFileSync(ctx.user.rendererPidFile, String(child.pid), 'utf8');
  }
  return { started: true, pid: child.pid };
}

export function stopRenderer(ctx: CliContext): { stopped: boolean; pid?: number; reason?: string } {
  const pid = readPid(ctx.user.rendererPidFile);
  if (!isPidRunning(pid)) {
    return { stopped: false, reason: 'not-running' };
  }
  try {
    process.kill(pid);
  } catch {
    return { stopped: false, reason: 'kill-failed' };
  }
  return { stopped: true, pid };
}
