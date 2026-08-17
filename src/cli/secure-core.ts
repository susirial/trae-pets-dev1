import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveState, type PetConfig } from '../shared/pet-config.ts';
import type { PetHint, Severity } from '../shared/state-schema.ts';
import type { HookEvent } from './hook-adapter.ts';
import { selectAction, type ActionSelection } from './action-mapper.ts';
import { buildHint } from './hint-builder.ts';

declare const __TRAE_PET_SECURE_BUILD__: boolean;

const REQUEST_SCHEMA = 'trae.pet.secure-core.request.v1';
const RESPONSE_SCHEMA = 'trae.pet.secure-core.response.v1';
const MAX_OUTPUT_BYTES = 256 * 1024;
const HELPER_TIMEOUT_MS = 2_000;

export interface SecureCoreDecision {
  selection: ActionSelection;
  hint: PetHint;
}

function moduleDirectory(): string {
  return typeof __dirname === 'string' ? __dirname : path.resolve(process.cwd(), 'src', 'cli');
}

export function resolveSecureCoreHelper(): string | null {
  const explicit = process.env.TRAE_PET_SECURE_CORE;
  if (explicit) {
    const absolute = path.resolve(explicit);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? absolute : null;
  }
  if (process.platform !== 'darwin') return null;

  const dataDir = process.env.TRAE_PET_DATA_DIR;
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : null;
  const releaseArch = process.arch === 'x64' ? 'x64' : 'arm64';
  const candidates = [
    dataDir && path.join(dataDir, 'hook-runtime', 'secure-core'),
    resourcesPath && path.join(resourcesPath, 'secure-core', 'trae-pet-secure-core'),
    resourcesPath && path.join(resourcesPath, 'secure-core'),
    path.resolve(moduleDirectory(), '..', 'secure-core'),
    path.resolve(moduleDirectory(), '..', 'secure-core', 'trae-pet-secure-core'),
    path.resolve(moduleDirectory(), '..', 'build', 'secure-core', `mac-${releaseArch}`, 'trae-pet-secure-core'),
    path.resolve(moduleDirectory(), '..', '..', 'build', 'secure-core', `mac-${releaseArch}`, 'trae-pet-secure-core'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile() && (fs.statSync(candidate).mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }) ?? null;
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function parseDecision(stdout: string): SecureCoreDecision {
  const value = JSON.parse(stdout) as Record<string, unknown>;
  if (
    value.schema !== RESPONSE_SCHEMA
    || value.version !== 1
    || !value.selection || typeof value.selection !== 'object'
    || !value.hint || typeof value.hint !== 'object'
  ) {
    throw new Error('secure-core response schema mismatch');
  }
  const selection = value.selection as Record<string, unknown>;
  const hint = value.hint as Record<string, unknown>;
  const severity = hint.severity;
  if (
    typeof selection.name !== 'string' || !selection.name
    || typeof selection.reason !== 'string'
    || typeof hint.title !== 'string'
    || typeof hint.message !== 'string'
    || typeof hint.detail !== 'string'
    || !['info', 'success', 'error'].includes(String(severity))
    || typeof hint.event !== 'string'
    || !isStringOrNull(hint.toolName)
    || !isStringOrNull(hint.eventLabel)
    || !isStringOrNull(hint.toolLabel)
    || !isStringOrNull(hint.summary)
    || !isStringOrNull(hint.result)
    || typeof hint.persistent !== 'boolean'
    || typeof hint.ttlMs !== 'number' || !Number.isFinite(hint.ttlMs)
    || typeof hint.updatedAt !== 'string' || !Number.isFinite(Date.parse(hint.updatedAt))
  ) {
    throw new Error('secure-core response fields invalid');
  }
  return {
    selection: { name: selection.name, reason: selection.reason },
    hint: {
      title: hint.title,
      message: hint.message,
      detail: hint.detail,
      severity: severity as Severity,
      event: hint.event,
      toolName: hint.toolName,
      eventLabel: hint.eventLabel,
      toolLabel: hint.toolLabel,
      summary: hint.summary,
      result: hint.result,
      persistent: hint.persistent,
      ttlMs: hint.ttlMs,
      updatedAt: hint.updatedAt,
    },
  };
}

function runHelper(helper: string, event: HookEvent, config: PetConfig): SecureCoreDecision {
  const request = JSON.stringify({
    schema: REQUEST_SCHEMA,
    version: 1,
    event,
    config: {
      pet: {
        displayName: config.pet.displayName,
      },
      privacy: {
        showPromptText: config.privacy.showPromptText,
        showCommandArgs: config.privacy.showCommandArgs,
        redactSecrets: config.privacy.redactSecrets,
      },
    },
    states: config.states.map((state) => ({
      id: state.id,
      label: state.label,
      severity: state.severity,
      text: state.text,
    })),
  });
  const result = spawnSync(helper, [], {
    input: request,
    encoding: 'utf8',
    timeout: HELPER_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`secure-core exited ${result.status}: ${String(result.stderr || '').trim()}`);
  }
  return parseDecision(String(result.stdout || ''));
}

function safeDecision(event: HookEvent): SecureCoreDecision {
  const eventName = String(event.hook_event_name || 'Manual');
  return {
    selection: { name: 'idle', reason: '安全核心暂时不可用。' },
    hint: {
      title: '待命中',
      message: '状态更新暂不可用，请继续操作。',
      detail: eventName,
      severity: 'info',
      event: eventName,
      toolName: event.tool_name ? String(event.tool_name) : null,
      eventLabel: eventName,
      toolLabel: event.tool_name ? String(event.tool_name) : null,
      summary: null,
      result: null,
      persistent: false,
      ttlMs: 3500,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function secureCoreDecision(event: HookEvent, config: PetConfig): SecureCoreDecision {
  const helper = resolveSecureCoreHelper();
  if (helper) {
    try {
      return runHelper(helper, event, config);
    } catch {
      // Hook execution must remain non-blocking even if the helper is damaged.
    }
  }

  if (typeof __TRAE_PET_SECURE_BUILD__ === 'undefined' || !__TRAE_PET_SECURE_BUILD__) {
    const selection = selectAction(event);
    return {
      selection,
      hint: buildHint(event, resolveState(config, selection.name), selection.reason, config),
    };
  }
  return safeDecision(event);
}
