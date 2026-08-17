import test from 'node:test';
import assert from 'node:assert/strict';

const { buildHintBubbleModel, shouldPersistHint } = await import(
  '../src/app/renderer/pet/hint-bubble-model.ts'
);

function hint(overrides = {}) {
  return {
    title: '正在读取',
    message: '正在查看相关内容',
    detail: '调用前 · Read',
    severity: 'info',
    event: 'PreToolUse',
    toolName: 'Read',
    ttlMs: 9000,
    updatedAt: '2026-07-24T12:00:00.000Z',
    ...overrides,
  };
}

test('buildHintBubbleModel prioritizes human-readable structured content', () => {
  const model = buildHintBubbleModel(hint({
    eventLabel: 'PreToolUse',
    toolLabel: 'Read',
    summary: 'README.md',
    result: null,
  }));

  assert.deepEqual(model, {
    severity: 'info',
    title: '正在读取',
    context: 'Read · PRE',
    summary: 'README.md',
    result: null,
  });
});

test('buildHintBubbleModel preserves compatibility with legacy hints', () => {
  const model = buildHintBubbleModel(hint({
    event: 'ManualAction',
    toolName: null,
    message: '准备好接收下一个请求',
    detail: '手动触发',
  }));

  assert.equal(model.context, 'ManualAction');
  assert.equal(model.summary, '准备好接收下一个请求');
  assert.equal(model.result, '手动触发');
});

test('buildHintBubbleModel omits empty optional rows', () => {
  const model = buildHintBubbleModel(hint({
    message: ' ',
    detail: 'legacy detail',
    eventLabel: 'UserPromptSubmit',
    toolName: null,
    summary: ' ',
    result: null,
  }));

  assert.equal(model.context, 'INPUT');
  assert.equal(model.summary, null);
  assert.equal(model.result, null);
});

test('error hints stay visible even if persistent is explicitly false', () => {
  assert.equal(shouldPersistHint(hint({ severity: 'error', persistent: false })), true);
  assert.equal(shouldPersistHint(hint({ severity: 'success', persistent: true })), true);
  assert.equal(shouldPersistHint(hint({ severity: 'success', persistent: false })), false);
});
