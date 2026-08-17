import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_CONFIG, resolveState } from '../src/shared/pet-config.ts';
import { selectAction } from '../src/cli/action-mapper.ts';
import { buildHint } from '../src/cli/hint-builder.ts';
import { secureCoreDecision } from '../src/cli/secure-core.ts';

const root = path.resolve(import.meta.dirname, '..');
const helper = path.join(
  root,
  'build',
  'secure-core',
  `mac-${process.arch === 'x64' ? 'x64' : 'arm64'}`,
  'trae-pet-secure-core',
);

function helperDecision(event, config = DEFAULT_CONFIG) {
  const result = spawnSync(helper, [], {
    input: JSON.stringify({
      schema: 'trae.pet.secure-core.request.v1',
      version: 1,
      event,
      config: {
        pet: { displayName: config.pet.displayName },
        privacy: config.privacy,
      },
      states: config.states.map(({ id, label, severity, text }) => ({
        id, label, severity, text,
      })),
    }),
    encoding: 'utf8',
    timeout: 2_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function withoutTimestamp(hint) {
  const { updatedAt, ...semantic } = hint;
  assert.ok(Number.isFinite(Date.parse(updatedAt)));
  return semantic;
}

test('Swift helper matches TypeScript action and hint semantics', {
  skip: process.platform !== 'darwin' || !fs.existsSync(helper),
}, () => {
  const privateConfig = {
    ...DEFAULT_CONFIG,
    privacy: { ...DEFAULT_CONFIG.privacy, showPromptText: false, showCommandArgs: false },
  };
  const visibleConfig = {
    ...DEFAULT_CONFIG,
    privacy: { ...DEFAULT_CONFIG.privacy, showPromptText: true, showCommandArgs: true },
  };
  const fixtures = [
    [{ hook_event_name: 'SessionStart' }, privateConfig],
    [{
      hook_event_name: 'PreToolUse',
      tool_name: 'run_terminal',
      tool_input: { command: 'npm test -- --token very-secret-value' },
    }, privateConfig],
    [{
      hook_event_name: 'PostToolUse',
      tool_name: 'write_file',
      tool_input: { file_path: '/tmp/example.ts' },
      tool_response: { success: true },
    }, privateConfig],
    [{
      hook_event_name: 'PostToolUse',
      tool_name: 'run_terminal',
      tool_input: { command: 'npm test' },
      tool_response: { success: false, errorMessage: 'token=hidden-value' },
    }, privateConfig],
    [{
      hook_event_name: 'UserPromptSubmit',
      prompt: '请检查 Authorization: Bearer top-secret-token',
    }, visibleConfig],
  ];

  for (const [event, config] of fixtures) {
    const selection = selectAction(event);
    const reference = buildHint(event, resolveState(config, selection.name), selection.reason, config);
    const native = helperDecision(event, config);
    assert.deepEqual(native.selection, selection);
    assert.deepEqual(withoutTimestamp(native.hint), withoutTimestamp(reference));
  }
});

test('Swift helper rejects malformed and oversized requests', {
  skip: process.platform !== 'darwin' || !fs.existsSync(helper),
}, () => {
  const malformed = spawnSync(helper, [], { input: '{}', encoding: 'utf8' });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /^secure-core: invalid schema/m);

  const oversized = spawnSync(helper, [], {
    input: Buffer.alloc(1_048_577, 0x20),
    encoding: 'utf8',
  });
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /^secure-core: input too large/m);
});

test('wrapper falls back to TypeScript reference when helper is absent', () => {
  const previous = process.env.TRAE_PET_SECURE_CORE;
  process.env.TRAE_PET_SECURE_CORE = path.join(root, 'does-not-exist', 'secure-core');
  try {
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { file_path: '/tmp/README.md' },
    };
    const expectedSelection = selectAction(event);
    const decision = secureCoreDecision(event, DEFAULT_CONFIG);
    assert.deepEqual(decision.selection, expectedSelection);
    assert.deepEqual(
      withoutTimestamp(decision.hint),
      withoutTimestamp(buildHint(
        event,
        resolveState(DEFAULT_CONFIG, expectedSelection.name),
        expectedSelection.reason,
        DEFAULT_CONFIG,
      )),
    );
  } finally {
    if (previous === undefined) delete process.env.TRAE_PET_SECURE_CORE;
    else process.env.TRAE_PET_SECURE_CORE = previous;
  }
});
