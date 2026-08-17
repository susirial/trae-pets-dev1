import fs from 'node:fs';
import path from 'node:path';
import { interpolate, resolveState } from '@shared/pet-config';
import {
  RUNTIME_SCHEMA,
  type PetRuntimeState,
  type RendererStatePayload,
} from '@shared/state-schema';
import { buildRendererStatePayload } from './pet-state-payload';
import { getConfig } from './config-store';
import { getResourcePaths, getUserPaths } from './paths';

function atomicWrite(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** Writes a state directly (used by tray / context-menu manual triggers). */
export function writeManualState(actionId: string): PetRuntimeState {
  const config = getConfig();
  const state = resolveState(config, actionId);
  const now = Date.now();
  const vars: Record<string, string> = {
    petName: config.pet.displayName,
    tool: '',
    summary: state.label,
    result: state.label,
    event: 'ManualAction',
    reason: `手动触发：${state.label}`,
  };

  const runtime: PetRuntimeState = {
    schema: RUNTIME_SCHEMA,
    version: now,
    updatedAt: new Date(now).toISOString(),
    updatedAtMs: now,
    holdUntilMs: state.holdMs > 0 ? now + state.holdMs : 0,
    source: { event: 'ManualAction', toolName: null, sessionId: null },
    event: 'ManualAction',
    toolName: null,
    action: state.id,
    reason: vars.reason,
    fps: state.fps,
    loopKind: state.loopKind,
    oneShot: state.oneShot,
    fallbackAction: state.fallback,
    priority: state.priority,
    pet: {
      found: true,
      id: config.pet.selectedId,
      displayName: config.pet.displayName,
      description: config.pet.description,
    },
    hint: {
      title: interpolate(state.text.title || state.label, vars) || state.label,
      message: interpolate(state.text.message || '{reason}', vars) || vars.reason,
      detail: '手动触发',
      severity: state.severity,
      event: 'ManualAction',
      toolName: null,
      ttlMs: state.id === 'idle' ? 3500 : 9000,
      updatedAt: new Date(now).toISOString(),
    },
  };

  atomicWrite(getUserPaths().stateFile, runtime);
  return runtime;
}

/**
 * Reads runtime state and overlays the *current* config animation params so
 * pet package swaps / fps edits made in settings apply live without a new event.
 */
export function readPayload(): RendererStatePayload {
  const file = getUserPaths().stateFile;
  try {
    if (!fs.existsSync(file)) {
      return { ok: false, error: '等待 TRAE 活动…', statePath: file };
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as PetRuntimeState;
    const config = getConfig();
    return buildRendererStatePayload({
      statePath: file,
      raw,
      config,
      petsDir: {
        builtInDir: getResourcePaths().petsDir,
        userDir: getUserPaths().petsDir,
      },
      soundLibraryRoots: {
        builtInDir: getResourcePaths().soundsDir,
        userDir: getUserPaths().soundsDir,
      },
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      statePath: file,
    };
  }
}
