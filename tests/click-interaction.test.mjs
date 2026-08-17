import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/pets');

test('click audio keeps focus after visual timeout but yields to explicit replacements', async () => {
  const { audioPlaybackTransition } = await import(
    '../src/app/renderer/pet/audio-playback-policy.ts'
  );
  const activeClick = {
    kind: 'click',
    petId: 'reaper',
    playbackKey: 'reaper:click:ultimate:1:voice.mp3',
  };

  assert.equal(audioPlaybackTransition(activeClick, {
    kind: 'state',
    petId: 'reaper',
    playbackKey: 'reaper:idle:2:idle.mp3',
    payloadOk: true,
    playable: true,
  }), 'preserve');
  assert.equal(audioPlaybackTransition(activeClick, {
    kind: 'click',
    petId: 'reaper',
    playbackKey: 'reaper:click:ultimate:2:voice.mp3',
    payloadOk: true,
    playable: true,
  }), 'replace');
  assert.equal(audioPlaybackTransition(activeClick, {
    kind: 'state',
    petId: 'another-pet',
    playbackKey: 'another-pet:idle:1:',
    payloadOk: true,
    playable: false,
  }), 'stop');
});

test('click interaction resolves package action and independent audio', async () => {
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { buildClickInteraction } = await import('../src/app/main/click-interaction.ts');
  const config = {
    ...DEFAULT_CONFIG,
    pet: { ...DEFAULT_CONFIG.pet, selectedId: 'orc-warrior' },
    audio: { enabled: true, volume: 0.5 },
  };

  const silent = buildClickInteraction({
    config,
    petsDir: PETS_DIR,
    petId: 'orc-warrior',
    actionId: 'heroic-strike',
    token: 1,
  });
  assert.equal(silent?.action, 'heroic-strike');
  assert.equal(silent?.durationMs, 2300);
  assert.equal(silent?.visualFile, 'heroic-strike.webp');
  assert.equal(silent?.audioUrl, null);
  assert.equal(silent?.effectiveAudio.enabled, false);

  const voiced = buildClickInteraction({
    config,
    petsDir: PETS_DIR,
    petId: 'orc-warrior',
    actionId: 'heroic-strike',
    sound: { mode: 'sound', soundId: 'orc-voice' },
    token: 2,
  });
  assert.equal(voiced?.audioFile, 'audio/orc-voice.mp3');
  assert.equal(voiced?.resolvedSoundId, 'orc-voice');
  assert.equal(voiced?.effectiveAudio.enabled, true);
  assert.equal(voiced?.effectiveAudio.mode, 'once');
  assert.equal(voiced?.effectiveAudio.count, 1);
});

test('click controller restarts safely and stale timers cannot restore state', async () => {
  const { ClickInteractionController } = await import('../src/app/main/click-interaction.ts');
  let baseVersion = 1;
  const emitted = [];
  const timers = [];
  const schedule = (callback, delayMs) => {
    const handle = { callback, delayMs, cleared: false };
    timers.push(handle);
    return handle;
  };
  const clear = (handle) => {
    handle.cleared = true;
  };
  const controller = new ClickInteractionController(
    () => ({ ok: true, statePath: `base-${baseVersion}` }),
    (payload) => emitted.push(payload),
    schedule,
    clear,
  );
  const interaction = (token) => ({
    kind: 'click',
    token,
    action: 'waving',
    durationMs: 1000,
    visualUrl: 'visual',
    visualFile: 'waving.webp',
    visualError: null,
    audioUrl: null,
    audioFile: null,
    resolvedSoundId: null,
    audioError: null,
    effectiveAudio: { enabled: false, mode: 'once', count: 1, volume: 1 },
  });

  controller.present(interaction(controller.nextToken()));
  controller.present(interaction(controller.nextToken()));
  assert.equal(timers[0].cleared, true);
  timers[0].callback();
  assert.equal(emitted.length, 2);

  baseVersion = 2;
  timers[1].callback();
  assert.equal(emitted.at(-1).statePath, 'base-2');
  assert.equal(emitted.at(-1).interaction, undefined);

  controller.present(interaction(controller.nextToken()));
  controller.cancel();
  assert.equal(timers[2].cleared, true);
  assert.equal(emitted.at(-1).statePath, 'base-2');
});
