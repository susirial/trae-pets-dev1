import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function managedCommands(hooksFile, event) {
  const doc = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
  return doc.hooks[event]
    .flatMap((group) => group.hooks)
    .filter((hook) => String(hook.command).includes('trae-pet.sh'));
}

test('Hook installer wires every TRAE variant idempotently and leaves other hooks alone', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-hooks-'));
  t.after(() => {
    delete process.env.TRAE_PET_HOME;
    delete process.env.TRAE_PET_HOOK_LAUNCHER;
    delete process.env.TRAE_PET_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const intlDir = path.join(root, '.trae');
  const cnDir = path.join(root, '.trae-cn');
  const strangerDir = path.join(root, '.trae-notes');
  const launcher = path.join(root, 'trae-pet.sh');
  fs.mkdirSync(intlDir, { recursive: true });
  fs.mkdirSync(cnDir, { recursive: true });
  fs.mkdirSync(strangerDir, { recursive: true });
  fs.writeFileSync(path.join(strangerDir, 'readme.txt'), 'not a TRAE profile');
  fs.writeFileSync(launcher, '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(intlDir, 'hooks.json'), JSON.stringify({
    custom: 'preserved',
    hooks: {
      UserPromptSubmit: [{
        matcher: '*',
        hooks: [{ type: 'command', command: '/usr/bin/custom-hook', timeout: 5 }],
      }],
    },
  }));
  // The China build is present but has never had a hooks.json written.
  fs.writeFileSync(path.join(cnDir, 'argv.json'), '{}');
  process.env.TRAE_PET_HOME = root;
  process.env.TRAE_PET_HOOK_LAUNCHER = launcher;
  process.env.TRAE_PET_DATA_DIR = path.join(root, 'data');
  const hookRuntime = path.join(root, 'data', 'hook-runtime');
  const legacyRuntime = path.join(hookRuntime, 'runtime');
  fs.mkdirSync(legacyRuntime, { recursive: true });
  fs.writeFileSync(path.join(legacyRuntime, 'node'), 'legacy runtime');
  fs.writeFileSync(path.join(hookRuntime, 'preserve.txt'), 'preserve managed sibling');
  fs.writeFileSync(path.join(root, 'data', 'user-file.txt'), 'preserve user data');

  const {
    HOOK_RESULT_SCHEMA,
    TRAE_HOOK_EVENTS,
    installTraeHooks,
    uninstallTraeHooks,
    verifyTraeHooks,
  } = await import('../src/cli/hook-installer.ts');

  const first = installTraeHooks('0.2.0');
  assert.equal(first.ok, true);
  assert.equal(first.schema, HOOK_RESULT_SCHEMA);
  assert.equal(first.changed, true);
  assert.equal(first.profileSource, 'discovery');
  assert.deepEqual(first.profiles.map((entry) => entry.id), ['trae', 'trae-cn']);
  assert.ok(first.profiles.every((entry) => entry.ok));
  assert.ok(first.skippedProfiles.some((entry) => entry.dir === strangerDir));
  assert.equal(first.nodePath, process.execPath);
  assert.equal(first.nodeVersion, process.versions.node);
  assert.equal(first.arch, process.arch);
  assert.equal(first.migratedBundledRuntime, true);
  assert.equal(fs.existsSync(legacyRuntime), false);
  assert.equal(fs.readFileSync(path.join(hookRuntime, 'preserve.txt'), 'utf8'), 'preserve managed sibling');
  assert.equal(fs.readFileSync(path.join(root, 'data', 'user-file.txt'), 'utf8'), 'preserve user data');
  // Only the profile that already had a hooks.json needs a backup.
  const [intl, cn] = first.profiles;
  assert.ok(intl.backupFile && fs.existsSync(intl.backupFile));
  assert.equal(cn.backupFile, null);
  assert.equal(fs.existsSync(path.join(cnDir, 'hooks.json')), true);
  assert.equal(fs.existsSync(path.join(strangerDir, 'hooks.json')), false);
  assert.equal(
    fs.statSync(path.join(root, 'data', 'hook-runtime', 'node-path.json')).mode & 0o777,
    0o600,
  );
  for (const profile of first.profiles) {
    const record = JSON.parse(fs.readFileSync(
      path.join(profile.dir, 'trae-pet.install.json'),
      'utf8',
    ));
    assert.equal(record.hooksFile, profile.hooksFile);
    assert.equal(record.version, '0.2.0');
  }
  assert.equal(verifyTraeHooks().ok, true);

  const second = installTraeHooks('0.2.0');
  assert.equal(second.ok, true);
  assert.equal(second.profiles[0].backupFile, intl.backupFile);
  const installed = JSON.parse(fs.readFileSync(path.join(intlDir, 'hooks.json'), 'utf8'));
  assert.equal(installed.custom, 'preserved');
  for (const event of TRAE_HOOK_EVENTS) {
    assert.equal(managedCommands(path.join(intlDir, 'hooks.json'), event).length, 1);
    assert.equal(managedCommands(path.join(cnDir, 'hooks.json'), event).length, 1);
  }

  fs.mkdirSync(legacyRuntime, { recursive: true });
  fs.writeFileSync(path.join(legacyRuntime, 'node'), 'legacy runtime');
  fs.writeFileSync(path.join(legacyRuntime, 'user-note.txt'), 'not installer managed');
  const guardedMigration = installTraeHooks('0.2.0');
  assert.equal(guardedMigration.ok, true);
  assert.equal(guardedMigration.migratedBundledRuntime, false);
  assert.equal(fs.readFileSync(path.join(legacyRuntime, 'user-note.txt'), 'utf8'), 'not installer managed');

  const beforeFailure = fs.readFileSync(path.join(intlDir, 'hooks.json'), 'utf8');
  const beforeCnFailure = fs.readFileSync(path.join(cnDir, 'hooks.json'), 'utf8');
  fs.writeFileSync(path.join(legacyRuntime, 'node'), 'leave on failed install');
  const unsupported = installTraeHooks('0.2.0', {
    requirements: { min: '98.0.0', majors: [98], recommended: '98 LTS' },
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.node.ok, false);
  assert.equal(fs.readFileSync(path.join(intlDir, 'hooks.json'), 'utf8'), beforeFailure);
  assert.equal(fs.readFileSync(path.join(cnDir, 'hooks.json'), 'utf8'), beforeCnFailure);
  assert.equal(fs.readFileSync(path.join(legacyRuntime, 'node'), 'utf8'), 'leave on failed install');

  const scoped = installTraeHooks('0.2.0', { args: ['--profile=trae-cn'] });
  assert.equal(scoped.ok, true);
  assert.deepEqual(scoped.profiles.map((entry) => entry.id), ['trae-cn']);

  assert.equal(uninstallTraeHooks().ok, true);
  const uninstalled = JSON.parse(fs.readFileSync(path.join(intlDir, 'hooks.json'), 'utf8'));
  assert.equal(uninstalled.custom, 'preserved');
  assert.equal(uninstalled.hooks.UserPromptSubmit[0].hooks[0].command, '/usr/bin/custom-hook');
  for (const event of TRAE_HOOK_EVENTS) {
    assert.equal(managedCommands(path.join(cnDir, 'hooks.json'), event).length, 0);
  }
  assert.equal(fs.existsSync(path.join(intlDir, 'trae-pet.install.json')), false);
  assert.equal(fs.existsSync(path.join(cnDir, 'trae-pet.install.json')), false);
});

test('Hook installer reports a missing TRAE installation instead of creating one', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-no-trae-'));
  t.after(() => {
    delete process.env.TRAE_PET_HOME;
    delete process.env.TRAE_PET_HOOK_LAUNCHER;
    delete process.env.TRAE_PET_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const launcher = path.join(root, 'trae-pet.sh');
  fs.writeFileSync(launcher, '#!/bin/sh\n', { mode: 0o755 });
  process.env.TRAE_PET_HOME = root;
  process.env.TRAE_PET_HOOK_LAUNCHER = launcher;
  process.env.TRAE_PET_DATA_DIR = path.join(root, 'data');

  const { installTraeHooks } = await import('../src/cli/hook-installer.ts');
  const result = installTraeHooks('0.2.0');

  assert.equal(result.ok, false);
  assert.deepEqual(result.profiles, []);
  assert.match(result.error, /未检测到 TRAE 配置目录/);
  assert.deepEqual(fs.readdirSync(root).filter((entry) => entry.startsWith('.trae')), []);
});

test('TRAE_HOOKS_DIR still targets a single explicit directory', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-legacy-'));
  t.after(() => {
    delete process.env.TRAE_HOOKS_DIR;
    delete process.env.TRAE_PET_HOME;
    delete process.env.TRAE_PET_HOOK_LAUNCHER;
    delete process.env.TRAE_PET_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const hooksDir = path.join(root, '.trae');
  const otherDir = path.join(root, '.trae-cn');
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(otherDir, { recursive: true });
  fs.writeFileSync(path.join(otherDir, 'argv.json'), '{}');
  const launcher = path.join(root, 'trae-pet.sh');
  fs.writeFileSync(launcher, '#!/bin/sh\n', { mode: 0o755 });
  process.env.TRAE_HOOKS_DIR = hooksDir;
  process.env.TRAE_PET_HOME = root;
  process.env.TRAE_PET_HOOK_LAUNCHER = launcher;
  process.env.TRAE_PET_DATA_DIR = path.join(root, 'data');

  const { installTraeHooks, verifyTraeHooks } = await import('../src/cli/hook-installer.ts');
  const result = installTraeHooks('0.2.0');

  assert.equal(result.ok, true);
  assert.equal(result.profileSource, 'TRAE_HOOKS_DIR');
  assert.deepEqual(result.profiles.map((entry) => entry.dir), [hooksDir]);
  assert.equal(fs.existsSync(path.join(otherDir, 'hooks.json')), false);
  assert.equal(verifyTraeHooks().ok, true);
});
