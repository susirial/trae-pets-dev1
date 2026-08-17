import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('buildRendererStatePayload resolves visual and audio from selected pet package', async (t) => {
  const { DEFAULT_CONFIG, resolveState } = await import('../src/shared/pet-config.ts');
  const { RUNTIME_SCHEMA } = await import('../src/shared/state-schema.ts');
  const { buildRendererStatePayload } = await import('../src/app/main/pet-state-payload.ts');

  const config = {
    ...DEFAULT_CONFIG,
    pet: {
      ...DEFAULT_CONFIG.pet,
      selectedId: 'magic-rabbit',
    },
    audio: {
      ...DEFAULT_CONFIG.audio,
      enabled: true,
    },
    states: DEFAULT_CONFIG.states.map((state) => (
      state.id === 'idle'
        ? { ...state, audio: { ...state.audio, enabled: true } }
        : state
    )),
  };
  const cfgState = resolveState(config, 'idle');
  const raw = {
    schema: RUNTIME_SCHEMA,
    version: 1,
    updatedAt: '2026-06-17T00:00:00.000Z',
    updatedAtMs: 1,
    holdUntilMs: 0,
    source: { event: 'ManualAction', toolName: null, sessionId: null },
    event: 'ManualAction',
    toolName: null,
    action: 'idle',
    reason: 'manual',
    fps: cfgState.fps,
    loopKind: cfgState.loopKind,
    oneShot: cfgState.oneShot,
    fallbackAction: cfgState.fallback,
    priority: cfgState.priority,
    pet: { found: true, id: 'trae', displayName: 'TRAE 宠物', description: '陪你写代码的桌面小伙伴' },
    hint: {
      title: '待命中',
      message: '准备好接收下一个请求 ✨',
      detail: '手动触发',
      severity: 'info',
      event: 'ManualAction',
      toolName: null,
      ttlMs: 3500,
      updatedAt: '2026-06-17T00:00:00.000Z',
    },
  };

  const payload = buildRendererStatePayload({
    statePath: '/tmp/state.json',
    raw,
    config,
    petsDir: '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.selectedPetId, 'magic-rabbit');
  assert.equal(payload.selectedPetName, 'Magic Rabbit');
  assert.equal(payload.visualFile, 'idle.webp');
  assert.match(payload.visualUrl ?? '', /^trae-pet:\/\/pet-asset\/magic-rabbit\/visual\/idle\.webp$/);
  assert.equal(payload.audioFile, 'idle.m4a');
  assert.match(payload.audioUrl ?? '', /^trae-pet:\/\/pet-asset\/magic-rabbit\/audio\/idle\.m4a$/);
  assert.equal(payload.effectiveAudio?.enabled, true);

  const selectedSoundPayload = buildRendererStatePayload({
    statePath: '/tmp/state.json',
    raw,
    petsDir: '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
    config: {
      ...DEFAULT_CONFIG,
      pet: { ...DEFAULT_CONFIG.pet, selectedId: 'orc-warrior' },
      audio: { enabled: true, volume: 0.8 },
      petOverrides: {
        'orc-warrior': {
          soundSelections: {
            idle: { mode: 'sound', soundId: 'orgrimmar-ambience' },
          },
        },
      },
    },
  });
  assert.equal(selectedSoundPayload.resolvedSoundId, 'orgrimmar-ambience');
  assert.equal(selectedSoundPayload.audioFile, 'audio/orgrimmar-ambience.mp3');
  assert.equal(selectedSoundPayload.effectiveAudio?.enabled, true);
  assert.equal(selectedSoundPayload.effectiveAudio?.volume, 0.24);

  const silentPayload = buildRendererStatePayload({
    statePath: '/tmp/state.json',
    raw,
    petsDir: '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
    config: {
      ...DEFAULT_CONFIG,
      pet: { ...DEFAULT_CONFIG.pet, selectedId: 'orc-warrior' },
      audio: { enabled: true, volume: 0.8 },
      petOverrides: {
        'orc-warrior': {
          soundSelections: {
            idle: { mode: 'none' },
          },
        },
      },
    },
  });
  assert.equal(silentPayload.audioUrl, null);
  assert.equal(silentPayload.effectiveAudio?.enabled, false);

  const soundRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-payload-sound-'));
  t.after(() => fs.rmSync(soundRoot, { recursive: true, force: true }));
  const userSounds = path.join(soundRoot, 'user');
  fs.mkdirSync(userSounds, { recursive: true });
  fs.writeFileSync(path.join(userSounds, 'notify.mp3'), Buffer.from([0x49, 0x44, 0x33, 0x01]));
  const libraryPayload = buildRendererStatePayload({
    statePath: '/tmp/state.json',
    raw,
    petsDir: '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
    soundLibraryRoots: {
      builtInDir: path.join(soundRoot, 'built-in'),
      userDir: userSounds,
    },
    config: {
      ...DEFAULT_CONFIG,
      pet: { ...DEFAULT_CONFIG.pet, selectedId: 'orc-warrior' },
      audio: { enabled: true, volume: 0.8 },
      petOverrides: {
        'orc-warrior': {
          soundSelections: {
            idle: { mode: 'library', soundId: 'user:notify.mp3' },
          },
        },
      },
    },
  });
  assert.equal(libraryPayload.audioUrl, 'trae-pet://sound-library/user%3Anotify.mp3');
  assert.equal(libraryPayload.audioFile, 'notify.mp3');
  assert.equal(libraryPayload.resolvedSoundId, 'user:notify.mp3');
  assert.equal(libraryPayload.effectiveAudio?.enabled, true);
});

test('buildRendererStatePayload falls back to trae when selected pet is invalid', async () => {
  const { DEFAULT_CONFIG, resolveState } = await import('../src/shared/pet-config.ts');
  const { RUNTIME_SCHEMA } = await import('../src/shared/state-schema.ts');
  const { buildRendererStatePayload } = await import('../src/app/main/pet-state-payload.ts');

  const config = {
    ...DEFAULT_CONFIG,
    pet: {
      ...DEFAULT_CONFIG.pet,
      selectedId: 'missing-pet',
    },
  };
  const cfgState = resolveState(config, 'idle');
  const raw = {
    schema: RUNTIME_SCHEMA,
    version: 2,
    updatedAt: '2026-06-17T00:00:00.000Z',
    updatedAtMs: 2,
    holdUntilMs: 0,
    source: { event: 'ManualAction', toolName: null, sessionId: null },
    event: 'ManualAction',
    toolName: null,
    action: 'idle',
    reason: 'manual',
    fps: cfgState.fps,
    loopKind: cfgState.loopKind,
    oneShot: cfgState.oneShot,
    fallbackAction: cfgState.fallback,
    priority: cfgState.priority,
    pet: { found: true, id: 'trae', displayName: 'TRAE 宠物', description: '陪你写代码的桌面小伙伴' },
    hint: {
      title: '待命中',
      message: '准备好接收下一个请求 ✨',
      detail: '手动触发',
      severity: 'info',
      event: 'ManualAction',
      toolName: null,
      ttlMs: 3500,
      updatedAt: '2026-06-17T00:00:00.000Z',
    },
  };

  const payload = buildRendererStatePayload({
    statePath: '/tmp/state.json',
    raw,
    config,
    petsDir: '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
  });

  assert.equal(payload.selectedPetId, 'trae');
  assert.ok(payload.selectedPetName);
  assert.equal(payload.visualFile, 'idle.webp');
});
