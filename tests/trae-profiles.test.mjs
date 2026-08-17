import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-profiles-'));
  t.after(() => {
    delete process.env.TRAE_HOOKS_DIR;
    delete process.env.TRAE_PET_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const profile = (name, marker) => {
    const dir = path.join(home, name);
    fs.mkdirSync(dir, { recursive: true });
    if (marker.endsWith('/')) fs.mkdirSync(path.join(dir, marker.slice(0, -1)));
    else fs.writeFileSync(path.join(dir, marker), '{}');
    return dir;
  };
  return { home, profile };
}

test('profile discovery finds every real TRAE variant and rejects lookalikes', async (t) => {
  const { home, profile } = makeHome(t);
  profile('.trae', 'argv.json');
  profile('.trae-cn', 'hooks.json');
  profile('.trae-beta', 'extensions/');
  profile('.trae-notes', 'readme.txt');
  fs.mkdirSync(path.join(home, '.traefoo'));
  fs.writeFileSync(path.join(home, '.traefoo', 'argv.json'), '{}');

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'argv.json'), '{}');
  fs.symlinkSync(outside, path.join(home, '.trae-link'), 'dir');

  const { discoverTraeProfiles } = await import('../src/cli/trae-profiles.ts');
  const { profiles, source, skipped } = discoverTraeProfiles(home);

  assert.equal(source, 'discovery');
  assert.deepEqual(profiles.map((entry) => entry.id), ['trae', 'trae-beta', 'trae-cn']);
  assert.equal(profiles[2].hooksFile, path.join(home, '.trae-cn', 'hooks.json'));
  assert.equal(profiles[2].recordFile, path.join(home, '.trae-cn', 'trae-pet.install.json'));

  const skippedDirs = skipped.map((entry) => entry.dir);
  assert.ok(skippedDirs.includes(path.join(home, '.trae-notes')));
  assert.ok(skippedDirs.includes(path.join(home, '.trae-link')));
  // `.traefoo` does not match the variant naming scheme at all.
  assert.ok(!skippedDirs.includes(path.join(home, '.traefoo')));
});

test('profile overrides take precedence over discovery in a fixed order', async (t) => {
  const { home, profile } = makeHome(t);
  profile('.trae', 'argv.json');
  const cnDir = profile('.trae-cn', 'argv.json');
  const custom = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-custom-'));
  t.after(() => fs.rmSync(custom, { recursive: true, force: true }));

  const { resolveTraeProfiles } = await import('../src/cli/trae-profiles.ts');

  const byProfile = resolveTraeProfiles({ home, args: ['--profile=trae-cn'] });
  assert.equal(byProfile.source, 'explicit-profile');
  assert.deepEqual(byProfile.profiles.map((entry) => entry.dir), [cnDir]);

  const byDir = resolveTraeProfiles({ home, args: [`--dir=${custom}`, '--profile=trae-cn'] });
  assert.equal(byDir.source, 'explicit-dir');
  assert.deepEqual(byDir.profiles.map((entry) => entry.dir), [custom]);

  const byEnv = resolveTraeProfiles({
    home,
    args: [`--dir=${custom}`],
    env: { TRAE_HOOKS_DIR: cnDir },
  });
  assert.equal(byEnv.source, 'TRAE_HOOKS_DIR');
  assert.deepEqual(byEnv.profiles.map((entry) => entry.dir), [cnDir]);

  const relative = resolveTraeProfiles({ home, args: ['--dir=./nope'] });
  assert.equal(relative.profiles.length, 0);
  assert.equal(relative.skipped[0].reason, '必须是绝对路径');

  process.env.TRAE_PET_HOME = home;
  assert.deepEqual(
    resolveTraeProfiles().profiles.map((entry) => entry.id),
    ['trae', 'trae-cn'],
  );
});
