import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const STATES = [
  'idle', 'waving', 'running-left', 'running-right', 'waiting',
  'review', 'jumping', 'happy', 'failed',
];

function makePackage(parent, id, extra = {}) {
  const dir = path.join(parent, id);
  fs.mkdirSync(path.join(dir, 'visuals'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'sounds'), { recursive: true });
  const visuals = {};
  for (const state of STATES) {
    visuals[state] = { file: `visuals/${state}.png` };
    fs.writeFileSync(path.join(dir, visuals[state].file), state);
  }
  fs.writeFileSync(path.join(dir, 'sounds', 'hello.ogg'), 'audio');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    schema: 'trae.pet.manifest.v2',
    identity: { id, name: `Pet ${id}`, description: 'test', version: '2.1.0' },
    visuals,
    actions: { celebrate: { state: 'happy' } },
    sounds: { hello: { file: 'sounds/hello.ogg', volume: 0.5 } },
    stateSounds: { happy: 'hello' },
    interaction: { clickAction: 'celebrate' },
    presentation: { reducedMotion: true },
    theme: { primary: '#123456' },
    author: { name: 'Tester' },
    license: { name: 'MIT' },
    ...extra,
  }));
  return dir;
}

test('manifest v2 resolves explicit visuals, actions and state sounds', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-v2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const builtInDir = path.join(root, 'built-in');
  makePackage(builtInDir, 'explicit-pet');
  const {
    listPetPackages,
    listPetActionOptions,
    resolvePetAction,
    resolvePetAudio,
    resolvePetVisual,
  } = await import('../src/app/main/pet-packages.ts');

  const packages = listPetPackages(builtInDir);
  assert.equal(packages[0].manifest.schema, 'trae.pet.manifest.v2');
  assert.deepEqual(
    listPetActionOptions(packages[0]).find((option) => option.id === 'celebrate'),
    {
      id: 'celebrate',
      stateId: 'happy',
      file: 'visuals/happy.png',
      durationMs: 2000,
    },
  );
  assert.equal(resolvePetAction(builtInDir, 'explicit-pet', 'celebrate'), 'happy');
  assert.equal(resolvePetVisual(builtInDir, 'explicit-pet', 'idle').file, 'visuals/idle.png');
  assert.equal(resolvePetAudio(builtInDir, 'explicit-pet', 'happy').file, 'sounds/hello.ogg');
  assert.equal(
    resolvePetAudio(
      builtInDir,
      'explicit-pet',
      'idle',
      { mode: 'sound', soundId: 'hello' },
    ).file,
    'sounds/hello.ogg',
  );
  assert.equal(
    resolvePetAudio(builtInDir, 'explicit-pet', 'happy', { mode: 'none' }).url,
    null,
  );
  assert.match(
    resolvePetAudio(
      builtInDir,
      'explicit-pet',
      'happy',
      { mode: 'sound', soundId: 'missing' },
    ).error ?? '',
    /Sound not found/,
  );
});

test('manifest normalizes click duration from action and legacy metadata', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-duration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const builtInDir = path.join(root, 'built-in');
  makePackage(builtInDir, 'duration-pet', {
    actions: {
      celebrate: { state: 'happy' },
      wave: { state: 'waving', durationMs: 1200 },
    },
    actionMetadata: {
      celebrate: { durationMs: 2300 },
    },
  });
  const { listPetActionOptions, listPetPackages } = await import('../src/app/main/pet-packages.ts');
  const options = listPetActionOptions(listPetPackages(builtInDir)[0]);

  assert.equal(options.find((option) => option.id === 'celebrate').durationMs, 2300);
  assert.equal(options.find((option) => option.id === 'wave').durationMs, 1200);
});

test('settings preview resolves manifest filenames through action mappings', async () => {
  const {
    petPackageVisualUrl,
    resolvePetPackageSound,
  } = await import('../src/shared/pet-package-view.ts');
  const pkg = {
    id: 'explicit-pet',
    visuals: {
      idle: 'visuals/idle.png',
      happy: 'visuals/celebration.webp',
    },
    actions: {
      celebrate: 'happy',
    },
    sounds: {
      hello: { file: 'sounds/hello.ogg', volume: 0.5 },
    },
    stateSounds: {
      happy: 'hello',
    },
    defaultAudio: {
      happy: {
        soundId: 'hello',
        file: 'sounds/hello.ogg',
        url: 'trae-pet://pet-asset/explicit-pet/audio/sounds%2Fhello.ogg',
        error: null,
        volume: 0.5,
      },
    },
    clickAction: 'celebrate',
    actionOptions: [{
      id: 'celebrate',
      stateId: 'happy',
      file: 'visuals/celebration.webp',
      durationMs: 1800,
    }],
  };

  assert.equal(
    petPackageVisualUrl(pkg, 'idle'),
    'trae-pet://pet-asset/explicit-pet/visual/visuals%2Fidle.png',
  );
  assert.equal(
    petPackageVisualUrl(pkg, 'celebrate'),
    'trae-pet://pet-asset/explicit-pet/visual/visuals%2Fcelebration.webp',
  );
  assert.equal(petPackageVisualUrl(pkg, 'missing'), null);
  assert.equal(resolvePetPackageSound(pkg, 'celebrate').soundId, 'hello');
  assert.equal(
    resolvePetPackageSound(pkg, 'idle', { mode: 'sound', soundId: 'hello' }).url,
    'trae-pet://pet-asset/explicit-pet/audio/sounds%2Fhello.ogg',
  );
  assert.equal(resolvePetPackageSound(pkg, 'idle', { mode: 'none' }).source, 'none');
  assert.deepEqual(
    resolvePetPackageSound(
      pkg,
      'idle',
      { mode: 'library', soundId: 'user:shared.mp3' },
      [{
        id: 'user:shared.mp3',
        name: 'shared',
        file: 'shared.mp3',
        source: 'user',
        size: 128,
        url: 'trae-pet://sound-library/user%3Ashared.mp3',
      }],
    ),
    {
      source: 'library',
      soundId: 'user:shared.mp3',
      file: 'shared.mp3',
      url: 'trae-pet://sound-library/user%3Ashared.mp3',
      volume: 1,
      error: null,
    },
  );
});

test('built-in package wins over a user package with the same id', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-priority-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  makePackage(builtInDir, 'same-id');
  makePackage(userDir, 'same-id');
  const { listPetPackages } = await import('../src/app/main/pet-packages.ts');

  const packages = listPetPackages({ builtInDir, userDir });
  assert.equal(packages.length, 1);
  assert.equal(packages[0].source, 'built-in');
});

test('folder import is atomic and rejects duplicate ids and symlinks', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  const sourceDir = makePackage(path.join(root, 'source'), 'new-pet');
  fs.mkdirSync(builtInDir, { recursive: true });
  const { importPetPackage } = await import('../src/app/main/pet-package-manager.ts');

  assert.deepEqual(importPetPackage(sourceDir, { builtInDir, userDir }), { ok: true, id: 'new-pet' });
  assert.match(importPetPackage(sourceDir, { builtInDir, userDir }).error ?? '', /已存在/);
  assert.equal(fs.readdirSync(userDir).some((name) => name.startsWith('.staging-')), false);

  const linked = makePackage(path.join(root, 'linked-source'), 'linked-pet');
  fs.symlinkSync(path.join(linked, 'visuals', 'idle.png'), path.join(linked, 'extra.png'));
  assert.match(importPetPackage(linked, { builtInDir, userDir }).error ?? '', /符号链接/);
});

test('ZIP import rejects path traversal before installation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-zip-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const zipPath = path.join(root, 'unsafe.zip');
  const zip = new AdmZip();
  zip.addFile('../escape.json', Buffer.from('{}'));
  zip.writeZip(zipPath);
  const { importPetPackage } = await import('../src/app/main/pet-package-manager.ts');
  const userDir = path.join(root, 'user');

  const result = importPetPackage(zipPath, { builtInDir: path.join(root, 'built-in'), userDir });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(root, 'escape.json')), false);
});

test('quick creator recognizes nine state files and installs canonical manifest v2', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-quick-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'reaper');
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(builtInDir, { recursive: true });
  for (const state of STATES) fs.writeFileSync(path.join(source, `${state}.webp`), state);
  const {
    inspectPetPackage,
    installInspectedPetPackage,
    resolveStagedPetVisual,
  } = await import('../src/app/main/pet-package-manager.ts');

  const inspection = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.ok(inspection.sessionId);
  assert.equal(inspection.id, 'reaper');
  assert.equal(inspection.stateFiles.idle, 'idle.webp');
  assert.match(resolveStagedPetVisual(inspection.sessionId, 'idle.webp') ?? '', /idle\.webp$/);

  const result = installInspectedPetPackage(inspection.sessionId, { builtInDir, userDir }, {
    id: 'reaper',
    name: 'Reaper',
    description: 'custom pet',
    author: 'Tester',
    license: 'MIT',
    stateFiles: Object.fromEntries(STATES.map((state) => [state, `${state}.webp`])),
  });
  assert.deepEqual(result, { ok: true, id: 'reaper' });
  const manifest = JSON.parse(fs.readFileSync(path.join(userDir, 'reaper', 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'trae.pet.manifest.v2');
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.identity.name, 'Reaper');
  assert.equal(manifest.visuals.idle.file, 'idle.webp');
  assert.deepEqual(manifest.actions, {});
  assert.equal(manifest.interaction.clickAction, 'waving');
  assert.equal(resolveStagedPetVisual(inspection.sessionId, 'idle.webp'), null);
});

test('quick creator maps extra visuals to configurable click actions', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-extra-actions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'reaper');
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(builtInDir, { recursive: true });
  for (const state of STATES) fs.writeFileSync(path.join(source, `${state}.webp`), state);
  fs.writeFileSync(path.join(source, 'ultimate-death-blossom.webp'), 'ultimate');
  fs.writeFileSync(path.join(source, 'victory-pose.webp'), 'victory');
  const {
    inspectPetPackage,
    installInspectedPetPackage,
  } = await import('../src/app/main/pet-package-manager.ts');

  const inspection = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.equal(inspection.availableVisuals.length, 11);
  const result = installInspectedPetPackage(inspection.sessionId, { builtInDir, userDir }, {
    id: 'reaper-extra',
    name: 'Reaper Extra',
    stateFiles: Object.fromEntries(STATES.map((state) => [state, `${state}.webp`])),
    extraActions: [
      {
        id: 'ultimate-death-blossom',
        file: 'ultimate-death-blossom.webp',
        durationMs: 3000,
        enabled: true,
      },
      {
        id: 'victory-pose',
        file: 'victory-pose.webp',
        durationMs: 1600,
        enabled: true,
      },
    ],
    clickAction: 'ultimate-death-blossom',
  });

  assert.deepEqual(result, { ok: true, id: 'reaper-extra' });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(userDir, 'reaper-extra', 'manifest.json'), 'utf8'),
  );
  assert.deepEqual(manifest.visuals['ultimate-death-blossom'], {
    file: 'ultimate-death-blossom.webp',
    fps: 10,
    loopKind: 'one-shot-then-idle',
    durationMs: 3000,
  });
  assert.deepEqual(manifest.actions['ultimate-death-blossom'], {
    state: 'ultimate-death-blossom',
    fallback: 'idle',
    durationMs: 3000,
  });
  assert.equal(manifest.interaction.clickAction, 'ultimate-death-blossom');

  const { listPetActionOptions, listPetPackages } = await import('../src/app/main/pet-packages.ts');
  const pkg = listPetPackages({ builtInDir, userDir }).find((candidate) => (
    candidate.id === 'reaper-extra'
  ));
  assert.ok(pkg);
  assert.equal(
    listPetActionOptions(pkg).find((option) => option.id === 'victory-pose').durationMs,
    1600,
  );
});

test('quick creator rejects unsafe extra action mappings', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-extra-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(builtInDir, { recursive: true });
  for (const state of STATES) fs.writeFileSync(path.join(source, `${state}.webp`), state);
  fs.writeFileSync(path.join(source, 'special.webp'), 'special');
  const {
    inspectPetPackage,
    installInspectedPetPackage,
  } = await import('../src/app/main/pet-package-manager.ts');
  const stateFiles = Object.fromEntries(STATES.map((state) => [state, `${state}.webp`]));

  const invalidDuration = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.match(installInspectedPetPackage(invalidDuration.sessionId, { builtInDir, userDir }, {
    id: 'invalid-duration',
    name: 'Invalid Duration',
    stateFiles,
    extraActions: [{
      id: 'special', file: 'special.webp', durationMs: 100, enabled: true,
    }],
  }).error ?? '', /250–30000ms/);

  const reusedState = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.match(installInspectedPetPackage(reusedState.sessionId, { builtInDir, userDir }, {
    id: 'reused-state',
    name: 'Reused State',
    stateFiles,
    extraActions: [{
      id: 'special', file: 'idle.webp', durationMs: 1000, enabled: true,
    }],
  }).error ?? '', /已用于标准状态/);

  const duplicateId = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.match(installInspectedPetPackage(duplicateId.sessionId, { builtInDir, userDir }, {
    id: 'duplicate-action',
    name: 'Duplicate Action',
    stateFiles,
    extraActions: [
      { id: 'special', file: 'special.webp', durationMs: 1000, enabled: true },
      { id: 'special', file: 'missing.webp', durationMs: 1000, enabled: true },
    ],
  }).error ?? '', /特殊动作 ID 重复/);

  const foreignFile = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.match(installInspectedPetPackage(foreignFile.sessionId, { builtInDir, userDir }, {
    id: 'foreign-file',
    name: 'Foreign File',
    stateFiles,
    extraActions: [{
      id: 'foreign', file: '../foreign.webp', durationMs: 1000, enabled: true,
    }],
  }).error ?? '', /不属于当前导入会话/);

  const missingClick = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.match(installInspectedPetPackage(missingClick.sessionId, { builtInDir, userDir }, {
    id: 'missing-click',
    name: 'Missing Click',
    stateFiles,
    extraActions: [{
      id: 'special', file: 'special.webp', durationMs: 1000, enabled: true,
    }],
    clickAction: 'not-installed',
  }).error ?? '', /默认点击动作不可用/);
});

test('quick creator allows manual mapping for a missing conventional filename', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-map-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'custom-source');
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(builtInDir, { recursive: true });
  for (const state of STATES.filter((state) => state !== 'failed')) {
    fs.writeFileSync(path.join(source, `${state}.webp`), state);
  }
  fs.writeFileSync(path.join(source, 'error-animation.webp'), 'failed');
  const {
    inspectPetPackage,
    installInspectedPetPackage,
  } = await import('../src/app/main/pet-package-manager.ts');

  const inspection = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.equal(inspection.ok, false);
  assert.ok(inspection.issues.some((entry) => (
    entry.code === 'MISSING_STATE_MAPPING' && entry.path === 'visuals.failed'
  )));

  const mappings = Object.fromEntries(STATES.map((state) => [
    state,
    state === 'failed' ? 'error-animation.webp' : `${state}.webp`,
  ]));
  const result = installInspectedPetPackage(inspection.sessionId, { builtInDir, userDir }, {
    id: 'custom-reaper',
    name: 'Custom Reaper',
    stateFiles: mappings,
  });
  assert.equal(result.ok, true);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(userDir, 'custom-reaper', 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.visuals.failed.file, 'error-animation.webp');
});

test('inspection reports duplicate ids and cancel removes staged previews', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-inspect-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  const source = makePackage(path.join(root, 'source'), 'duplicate-pet');
  makePackage(builtInDir, 'duplicate-pet');
  const {
    cancelPetPackageInspection,
    inspectPetPackage,
    resolveStagedPetVisual,
  } = await import('../src/app/main/pet-package-manager.ts');

  const inspection = inspectPetPackage(source, { builtInDir, userDir }, 'package');
  assert.equal(inspection.ok, false);
  assert.ok(inspection.issues.some((entry) => entry.code === 'DUPLICATE_ID'));
  assert.ok(resolveStagedPetVisual(inspection.sessionId, 'visuals/idle.png'));
  assert.deepEqual(cancelPetPackageInspection(inspection.sessionId), { ok: true });
  assert.equal(resolveStagedPetVisual(inspection.sessionId, 'visuals/idle.png'), null);
  assert.equal(fs.readdirSync(userDir).some((name) => name.startsWith('.staging-')), false);
});

test('expired inspection sessions invalidate previews and remove staging', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-expiry-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'expiry-pet');
  const builtInDir = path.join(root, 'built-in');
  const userDir = path.join(root, 'user');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(builtInDir, { recursive: true });
  for (const state of STATES) fs.writeFileSync(path.join(source, `${state}.webp`), state);
  const {
    cleanupExpiredPetPackageInspections,
    inspectPetPackage,
    resolveStagedPetVisual,
  } = await import('../src/app/main/pet-package-manager.ts');

  const inspection = inspectPetPackage(source, { builtInDir, userDir }, 'quick');
  assert.ok(resolveStagedPetVisual(inspection.sessionId, 'idle.webp'));
  cleanupExpiredPetPackageInspections(Date.now() + 16 * 60 * 1000);
  assert.equal(resolveStagedPetVisual(inspection.sessionId, 'idle.webp'), null);
  assert.equal(fs.readdirSync(userDir).some((name) => name.startsWith('.staging-')), false);
});

test('validation reports broken action and state sound references', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-references-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = makePackage(path.join(root, 'source'), 'broken-refs', {
    actions: { invalid: { state: 'missing-state' } },
    stateSounds: { idle: 'missing-sound' },
  });
  const { validatePetPackageDirectory } = await import('../src/app/main/pet-package-manager.ts');

  const diagnostic = validatePetPackageDirectory(source);
  assert.equal(diagnostic.valid, false);
  assert.ok(diagnostic.errors.some((message) => /不存在的视觉状态/.test(message)));
  assert.ok(diagnostic.errors.some((message) => /不存在的声音/.test(message)));
});
