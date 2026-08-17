import test from 'node:test';
import assert from 'node:assert/strict';

test('default config uses schema v5 and trae as selected pet', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');

  assert.equal(DEFAULT_CONFIG.schema, 'trae.pet.config.v5');
  assert.equal(DEFAULT_CONFIG.pet.selectedId, 'trae');
  assert.equal(DEFAULT_CONFIG.audio.enabled, true);
  assert.ok(DEFAULT_CONFIG.states.every((state) => !('gifFile' in state)));
  assert.ok(DEFAULT_CONFIG.states.every((state) => !('file' in state.audio)));
});

test('mergeConfig migrates v3 without losing settings and normalizes pet overrides', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');
  const merged = mergeConfig(DEFAULT_CONFIG, {
    schema: 'trae.pet.config.v3',
    pet: { selectedId: 'magic-rabbit', displayName: '旧名称' },
    privacy: { showPromptText: true },
    window: { manualX: 123, manualY: 456, positionMode: 'manual' },
    audio: { enabled: true, volume: 0.4 },
    petOverrides: {
      'magic-rabbit': {
        audio: { enabled: false, volume: 0.25 },
        clickAction: 'happy',
        presentation: { reducedMotion: true, scale: 1.5 },
        stateSounds: { idle: false },
      },
    },
  });

  assert.equal(merged.schema, 'trae.pet.config.v5');
  assert.equal(merged.pet.displayName, '旧名称');
  assert.equal(merged.privacy.showPromptText, true);
  assert.equal(merged.window.manualX, 123);
  assert.equal(merged.audio.volume, 0.4);
  assert.deepEqual(merged.petOverrides['magic-rabbit'], {
    audio: { enabled: false, volume: 0.25 },
    click: { action: 'happy' },
    presentation: { scale: 1.5, reducedMotion: true, width: undefined, height: undefined },
    soundSelections: {},
    stateSounds: { idle: false },
  });
});

test('mergeConfig normalizes and deep-merges per-pet sound selections', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');
  const base = mergeConfig(DEFAULT_CONFIG, {
    petOverrides: {
      'orc-warrior': {
        soundSelections: {
          idle: { mode: 'sound', soundId: 'orgrimmar-ambience' },
          failed: { mode: 'none' },
        },
      },
    },
  });
  const merged = mergeConfig(base, {
    petOverrides: {
      'orc-warrior': {
        soundSelections: {
          happy: { mode: 'sound', soundId: 'orc-fight' },
          review: { mode: 'library', soundId: 'user:review.mp3' },
          invalid: { mode: 'sound', soundId: '   ' },
          invalidLibrary: { mode: 'library', soundId: '' },
        },
      },
    },
  });

  assert.deepEqual(merged.petOverrides['orc-warrior'].soundSelections, {
    idle: { mode: 'sound', soundId: 'orgrimmar-ambience' },
    failed: { mode: 'none' },
    happy: { mode: 'sound', soundId: 'orc-fight' },
    review: { mode: 'library', soundId: 'user:review.mp3' },
  });
});

test('mergeConfig migrates legacy clickAction and keeps click sound independent', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');
  const legacy = mergeConfig(DEFAULT_CONFIG, {
    schema: 'trae.pet.config.v4',
    petOverrides: {
      trae: { clickAction: 'waving' },
    },
  });
  assert.deepEqual(legacy.petOverrides.trae.click, { action: 'waving' });

  const merged = mergeConfig(legacy, {
    petOverrides: {
      trae: {
        click: {
          action: null,
          sound: { mode: 'library', soundId: 'user:hello.mp3' },
        },
      },
    },
  });
  assert.deepEqual(merged.petOverrides.trae.click, {
    action: null,
    sound: { mode: 'library', soundId: 'user:hello.mp3' },
  });
});

test('mergeConfig keeps state behavior while overriding selected pet', async () => {
  const { DEFAULT_CONFIG, mergeConfig } = await import('../src/shared/pet-config.ts');

  const merged = mergeConfig(DEFAULT_CONFIG, {
    pet: { selectedId: 'magic-rabbit' },
    states: [{ id: 'idle', holdMs: 1234, text: { title: 'hello' } }],
  });
  const idle = merged.states.find((state) => state.id === 'idle');

  assert.equal(merged.pet.selectedId, 'magic-rabbit');
  assert.equal(idle?.holdMs, 1234);
  assert.equal(idle?.text.title, 'hello');
  assert.ok(!('gifFile' in idle));
});

test('removePetFromConfig clears overrides and falls back only for the selected pet', async () => {
  const {
    DEFAULT_CONFIG,
    mergeConfig,
    removePetFromConfig,
  } = await import('../src/shared/pet-config.ts');
  const selected = mergeConfig(DEFAULT_CONFIG, {
    pet: { selectedId: 'user-pet' },
    petOverrides: {
      'user-pet': { clickAction: 'happy' },
      retained: { clickAction: 'idle' },
    },
  });

  const removedSelected = removePetFromConfig(selected, 'user-pet');
  assert.equal(removedSelected.pet.selectedId, 'trae');
  assert.equal(removedSelected.petOverrides['user-pet'], undefined);
  assert.equal(removedSelected.petOverrides.retained.click.action, 'idle');

  const removedOther = removePetFromConfig(selected, 'retained');
  assert.equal(removedOther.pet.selectedId, 'user-pet');
  assert.equal(removedOther.petOverrides.retained, undefined);
});
