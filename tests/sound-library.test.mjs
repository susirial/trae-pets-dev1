import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function writeFakeMp3(file, label = 'audio') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33]),
    Buffer.from(label),
  ]));
}

test('sound library scans source-qualified MP3 files and resolves safe URLs', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-sounds-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const roots = {
    builtInDir: path.join(root, 'built-in'),
    userDir: path.join(root, 'user'),
  };
  writeFakeMp3(path.join(roots.builtInDir, 'notify.mp3'), 'built-in');
  writeFakeMp3(path.join(roots.userDir, 'notify.mp3'), 'user');
  fs.writeFileSync(path.join(roots.userDir, 'invalid.mp3'), 'not-mp3');

  const {
    listSoundLibrary,
    resolveSoundLibraryAsset,
  } = await import('../src/app/main/sound-library.ts');
  const sounds = listSoundLibrary(roots);

  assert.deepEqual(sounds.map((sound) => sound.id), [
    'builtin:notify.mp3',
    'user:notify.mp3',
  ]);
  assert.equal(sounds[0].url, 'trae-pet://sound-library/builtin%3Anotify.mp3');
  assert.equal(
    resolveSoundLibraryAsset(roots, 'user:notify.mp3'),
    fs.realpathSync(path.join(roots.userDir, 'notify.mp3')),
  );
  assert.equal(resolveSoundLibraryAsset(roots, 'user:../notify.mp3'), null);
});

test('sound import is atomic, validates MP3 content and never overwrites', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-sound-import-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const roots = {
    builtInDir: path.join(root, 'built-in'),
    userDir: path.join(root, 'user'),
  };
  const source = path.join(root, 'My Sound.mp3');
  writeFakeMp3(source);
  const invalid = path.join(root, 'invalid.mp3');
  fs.writeFileSync(invalid, 'not-mp3');
  const { importSoundToLibrary } = await import('../src/app/main/sound-library.ts');

  assert.deepEqual(importSoundToLibrary(source, roots), { ok: true, id: 'user:My Sound.mp3' });
  assert.deepEqual(importSoundToLibrary(source, roots), { ok: true, id: 'user:My Sound-2.mp3' });
  assert.match(importSoundToLibrary(invalid, roots).error ?? '', /有效的 MP3/);
  assert.equal(fs.readdirSync(roots.userDir).some((file) => file.startsWith('.import-')), false);

  const symlink = path.join(root, 'linked.mp3');
  fs.symlinkSync(source, symlink);
  assert.match(importSoundToLibrary(symlink, roots).error ?? '', /符号链接/);
});

test('sound deletion protects built-ins and referenced user sounds', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-sound-delete-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const roots = {
    builtInDir: path.join(root, 'built-in'),
    userDir: path.join(root, 'user'),
  };
  writeFakeMp3(path.join(roots.builtInDir, 'fixed.mp3'));
  writeFakeMp3(path.join(roots.userDir, 'custom.mp3'));
  const { DEFAULT_CONFIG } = await import('../src/shared/pet-config.ts');
  const { deleteSoundFromLibrary } = await import('../src/app/main/sound-library.ts');
  const config = {
    ...DEFAULT_CONFIG,
    petOverrides: {
      trae: {
        click: {
          action: 'waving',
          sound: { mode: 'library', soundId: 'user:custom.mp3' },
        },
        soundSelections: {
          idle: { mode: 'library', soundId: 'user:custom.mp3' },
        },
      },
    },
  };

  assert.match(deleteSoundFromLibrary('builtin:fixed.mp3', roots, config).error ?? '', /不能删除/);
  const referenced = deleteSoundFromLibrary('user:custom.mp3', roots, config);
  assert.equal(referenced.ok, false);
  assert.deepEqual(referenced.referencedBy, ['trae/click', 'trae/idle']);
  assert.equal(
    deleteSoundFromLibrary('user:custom.mp3', roots, { ...config, petOverrides: {} }).ok,
    true,
  );
  assert.equal(fs.existsSync(path.join(roots.userDir, 'custom.mp3')), false);
});
