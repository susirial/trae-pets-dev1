import test from 'node:test';
import assert from 'node:assert/strict';

function report(overrides = {}) {
  return {
    schema: 'trae.pet.hook-report.v1',
    appVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    ok: true,
    action: 'install',
    profileSource: 'discovery',
    profiles: [
      { id: 'trae', dir: '/home/u/.trae', hooksFile: '/home/u/.trae/hooks.json', ok: true },
    ],
    skippedProfiles: [],
    node: { ok: true, version: '24.0.0', execPath: '/usr/bin/node', error: null },
    nodePromptShownFor: null,
    ...overrides,
  };
}

test('launch sync skips work only when every discovered profile is already verified', async () => {
  const { decideHookSync } = await import('../src/app/main/hook-sync-decision.ts');

  assert.equal(decideHookSync({
    appVersion: '1.0.0',
    report: report(),
    verifyOk: true,
    discoveredProfileIds: ['trae'],
  }).action, 'skip');

  assert.equal(decideHookSync({
    appVersion: '1.0.0',
    report: report(),
    verifyOk: false,
    discoveredProfileIds: ['trae'],
  }).action, 'install');

  // A newly installed TRAE CN build must be picked up on the next launch.
  assert.equal(decideHookSync({
    appVersion: '1.0.0',
    report: report(),
    verifyOk: true,
    discoveredProfileIds: ['trae', 'trae-cn'],
  }).action, 'install');

  assert.equal(decideHookSync({
    appVersion: '1.1.0',
    report: report(),
    verifyOk: true,
    discoveredProfileIds: ['trae'],
  }).action, 'install');

  assert.equal(decideHookSync({
    appVersion: '1.0.0',
    report: report({ ok: false }),
    verifyOk: true,
    discoveredProfileIds: ['trae'],
  }).action, 'install');

  assert.equal(decideHookSync({
    appVersion: '1.0.0',
    report: null,
    verifyOk: true,
    discoveredProfileIds: ['trae'],
  }).action, 'install');
});

test('launch sync reports a missing TRAE installation without attempting an install', async () => {
  const { decideHookSync } = await import('../src/app/main/hook-sync-decision.ts');

  const decision = decideHookSync({
    appVersion: '1.0.0',
    report: null,
    verifyOk: false,
    discoveredProfileIds: [],
  });

  assert.equal(decision.action, 'no-profile');
  assert.match(decision.reason, /未检测到 TRAE 配置目录/);
});

test('missing Node prompt is shown at most once per app version', async () => {
  const { shouldPromptNodeInstall } = await import('../src/app/main/hook-sync-decision.ts');

  assert.equal(shouldPromptNodeInstall(null, '1.0.0', false), true);
  assert.equal(shouldPromptNodeInstall(report({ nodePromptShownFor: null }), '1.0.0', false), true);
  assert.equal(shouldPromptNodeInstall(report({ nodePromptShownFor: '1.0.0' }), '1.0.0', false), false);
  assert.equal(shouldPromptNodeInstall(report({ nodePromptShownFor: '0.9.0' }), '1.0.0', false), true);
  assert.equal(shouldPromptNodeInstall(report({ nodePromptShownFor: null }), '1.0.0', true), false);
});
