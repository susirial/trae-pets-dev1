import test from 'node:test';
import assert from 'node:assert/strict';

function samplePackage(overrides = {}) {
  return {
    id: 'trae',
    name: 'TRAE',
    description: 'Default pet',
    source: 'builtin',
    root: '/pets/trae',
    version: '1.0.0',
    manifestVersion: 2,
    visuals: {
      idle: 'idle.webp',
      waving: 'waving.webp',
      'running-left': 'running-left.webp',
      'running-right': 'running-right.webp',
      waiting: 'waiting.webp',
      review: 'review.webp',
      jumping: 'jumping.webp',
      happy: 'happy.webp',
      failed: 'failed.webp',
    },
    actions: {},
    sounds: {
      hello: { id: 'hello', file: 'hello.mp3', name: 'Hello' },
    },
    actionOptions: [{ id: 'waving', stateId: 'waving', file: 'waving.webp', durationMs: 2000 }],
    theme: {
      primary: '#7288ff',
      accent: '#a66fff',
      bubble: 'rgba(20, 22, 32, 0.96)',
    },
    ...overrides,
  };
}

test('health summary reports an excellent score for a usable default config', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');

  const summary = createSettingsHealthSummary({
    config: DEFAULT_CONFIG,
    petPackages: [samplePackage()],
    librarySounds: [],
  });

  assert.equal(summary.blockingCount, 0);
  assert.equal(summary.level, 'excellent');
  assert.ok(summary.score >= 90);
});

test('health summary blocks when the selected pet package is missing', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const config = mergeConfig(DEFAULT_CONFIG, { pet: { selectedId: 'missing-pet' } });

  const summary = createSettingsHealthSummary({ config, petPackages: [], librarySounds: [] });

  assert.equal(summary.level, 'blocked');
  assert.equal(summary.blockingCount, 1);
  assert.equal(summary.issues[0].code, 'selected-pet-missing');
  assert.equal(summary.issues[0].section, 'role');
});

test('health summary warns about missing library sound references', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const config = mergeConfig(DEFAULT_CONFIG, {
    petOverrides: {
      trae: {
        soundSelections: {
          idle: { mode: 'library', soundId: 'user:missing.mp3' },
        },
      },
    },
  });

  const summary = createSettingsHealthSummary({
    config,
    petPackages: [samplePackage()],
    librarySounds: [],
  });

  assert.equal(summary.blockingCount, 1);
  assert.equal(summary.issues[0].code, 'library-sound-missing');
  assert.equal(summary.issues[0].section, 'states');
});

test('health summary warns when all audio is disabled while state sounds are configured', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const config = mergeConfig(DEFAULT_CONFIG, {
    audio: { enabled: false },
    petOverrides: {
      trae: {
        soundSelections: {
          idle: { mode: 'sound', soundId: 'hello' },
        },
      },
    },
  });

  const summary = createSettingsHealthSummary({
    config,
    petPackages: [samplePackage()],
    librarySounds: [],
  });

  assert.ok(summary.warningCount >= 1);
  assert.ok(summary.issues.some((issue) => issue.code === 'audio-disabled-with-sounds'));
});

test('health summary detects duplicate state ids', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const config = {
    ...DEFAULT_CONFIG,
    states: [...DEFAULT_CONFIG.states, { ...DEFAULT_CONFIG.states[0], label: '重复待命' }],
  };

  const summary = createSettingsHealthSummary({
    config,
    petPackages: [samplePackage()],
    librarySounds: [],
  });

  assert.ok(summary.issues.some((issue) => issue.code === 'duplicate-state-id'));
  assert.equal(summary.level, 'blocked');
});

test('health summary detects enabled states without a visual', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const pkg = samplePackage();
  delete pkg.visuals.failed;

  const summary = createSettingsHealthSummary({
    config: DEFAULT_CONFIG,
    petPackages: [pkg],
    librarySounds: [],
  });

  const issue = summary.issues.find((entry) => entry.code === 'state-visual-missing');
  assert.equal(issue?.stateId, 'failed');
  assert.equal(issue?.section, 'states');
});

test('health summary detects invalid click action references', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const config = {
    ...DEFAULT_CONFIG,
    petOverrides: {
      trae: { click: { action: 'missing-action', sound: { mode: 'none' } } },
    },
  };

  const summary = createSettingsHealthSummary({
    config,
    petPackages: [samplePackage()],
    librarySounds: [],
  });

  assert.ok(summary.issues.some((issue) => issue.code === 'click-action-missing'));
});

test('health summary warns when global audio disables a configured click sound', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { createSettingsHealthSummary } = await import('../src/app/renderer/settings/health.ts');
  const config = {
    ...DEFAULT_CONFIG,
    audio: { ...DEFAULT_CONFIG.audio, enabled: false },
    petOverrides: {
      trae: { click: { action: 'waving', sound: { mode: 'sound', soundId: 'hello' } } },
    },
  };

  const summary = createSettingsHealthSummary({
    config,
    petPackages: [samplePackage()],
    librarySounds: [],
  });

  assert.ok(summary.issues.some((issue) => issue.code === 'audio-disabled-with-sounds'));
});
