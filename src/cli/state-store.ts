import fs from 'node:fs';
import path from 'node:path';
import { resolveState, type PetConfig, type PetStateConfig } from '@shared/pet-config';
import { RUNTIME_SCHEMA, type PetHint, type PetInfo, type PetRuntimeState } from '@shared/state-schema';
import { ensureDir } from './logger';
import type { CliContext } from './config';
import type { ActionSelection } from './action-mapper';

export function readState(filePath: string): PetRuntimeState | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) as PetRuntimeState;
  } catch {
    return null;
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function priorityFor(config: PetConfig, id: string): number {
  return resolveState(config, id).priority;
}

function appendHistory(ctx: CliContext, state: PetRuntimeState): void {
  if (!ctx.config.privacy.historyEnabled) {
    return;
  }
  ensureDir(path.dirname(ctx.user.historyFile));
  const maxBytes = 2_097_152;
  try {
    if (fs.existsSync(ctx.user.historyFile) && fs.statSync(ctx.user.historyFile).size > maxBytes) {
      fs.renameSync(ctx.user.historyFile, `${ctx.user.historyFile}.${Date.now()}.old`);
    }
    fs.appendFileSync(ctx.user.historyFile, `${JSON.stringify(state)}\n`, 'utf8');
  } catch {
    // History is best-effort.
  }
}

function withLock<T>(lockFile: string, fn: () => T): T {
  ensureDir(path.dirname(lockFile));
  const deadline = Date.now() + 300;
  let fd: number | null = null;

  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      break;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }

  if (fd === null) {
    return fn();
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // A stale/missing lock should not break hook execution.
    }
  }
}

function shouldPreserveCurrent(
  current: PetRuntimeState | null,
  nextAction: string,
  config: PetConfig,
  nowMs: number,
): boolean {
  if (!current?.action || !current.holdUntilMs) {
    return false;
  }
  if (nowMs >= Number(current.holdUntilMs)) {
    return false;
  }
  return priorityFor(config, current.action) > priorityFor(config, nextAction);
}

export interface BuildStateArgs {
  event: { hook_event_name?: string; tool_name?: string; session_id?: string };
  actionSelection: ActionSelection;
  state: PetStateConfig;
  pet: PetInfo;
  hint: PetHint;
}

function buildState(args: BuildStateArgs): PetRuntimeState {
  const { event, actionSelection, state, pet, hint } = args;
  const now = Date.now();

  return {
    schema: RUNTIME_SCHEMA,
    version: now,
    updatedAt: new Date(now).toISOString(),
    updatedAtMs: now,
    holdUntilMs: state.holdMs > 0 ? now + state.holdMs : 0,
    source: {
      event: event.hook_event_name || 'Manual',
      toolName: event.tool_name || null,
      sessionId: event.session_id || null,
    },
    event: event.hook_event_name || 'Manual',
    toolName: event.tool_name || null,
    action: state.id,
    reason: actionSelection.reason,
    fps: state.fps,
    loopKind: state.loopKind,
    oneShot: state.oneShot,
    fallbackAction: state.fallback,
    priority: state.priority,
    pet,
    hint,
  };
}

export interface WriteResult {
  state: PetRuntimeState;
  preserved: boolean;
}

export function writeState(ctx: CliContext, args: BuildStateArgs): WriteResult {
  return withLock(ctx.user.lockFile, () => {
    const next = buildState(args);
    const current = readState(ctx.user.stateFile);

    if (shouldPreserveCurrent(current, next.action, ctx.config, next.updatedAtMs)) {
      return { state: current as PetRuntimeState, preserved: true };
    }

    atomicWriteJson(ctx.user.stateFile, next);
    appendHistory(ctx, next);
    return { state: next, preserved: false };
  });
}
