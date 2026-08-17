import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'obfuscate-build.mjs');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runObfuscator(fixtureRoot, ...args) {
  return spawnSync(
    process.execPath,
    [script, `--root=${fixtureRoot}`, ...args],
    { cwd: root, encoding: 'utf8' },
  );
}

test('build obfuscation is executable, verifiable, and idempotent', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-obfuscation-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const files = {
    main: path.join(fixtureRoot, 'out', 'main', 'index.js'),
    preload: path.join(fixtureRoot, 'out', 'preload', 'index.js'),
    cli: path.join(fixtureRoot, 'dist', 'cli.cjs'),
  };
  for (const file of Object.values(files)) fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(files.main, 'const greeting = "main fixture"; module.exports = () => greeting;\n');
  fs.writeFileSync(files.preload, 'const channel = "pet-state:get"; module.exports = { channel };\n');
  fs.writeFileSync(
    files.cli,
    'const message = "fixture works"; process.stdout.write(JSON.stringify({ ok: true, message }));\n',
  );
  const inputHashes = Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, sha256(file)]),
  );

  const first = runObfuscator(fixtureRoot);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).skipped, false);
  for (const file of [files.main, files.preload]) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }));
  }
  const execution = spawnSync(process.execPath, [files.cli], { encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
  assert.deepEqual(JSON.parse(execution.stdout), { ok: true, message: 'fixture works' });

  const manifestPath = path.join(fixtureRoot, 'build', 'obfuscation-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'trae.pet.obfuscation-manifest.v1');
  assert.equal(manifest.files.length, 3);
  for (const entry of manifest.files) {
    const file = path.join(fixtureRoot, entry.path);
    const name = Object.entries(files).find(([, value]) => value === file)?.[0];
    assert.equal(entry.inputSha256, inputHashes[name]);
    assert.equal(entry.outputSha256, sha256(file));
    assert.equal(Object.hasOwn(entry, 'source'), false);
  }
  assert.equal(
    fs.readdirSync(fixtureRoot, { recursive: true }).some((file) => String(file).endsWith('.map')),
    false,
  );

  const second = runObfuscator(fixtureRoot);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).skipped, true);
  const verified = runObfuscator(fixtureRoot, '--verify-only');
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verified, true);

  fs.rmSync(manifestPath);
  const missingManifest = runObfuscator(fixtureRoot);
  assert.notEqual(missingManifest.status, 0);
  assert.match(missingManifest.stderr, /无有效 manifest 的已混淆产物/);
});

test('partial stale manifest rejects repeat obfuscation', (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-obfuscation-stale-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const main = path.join(fixtureRoot, 'out', 'main', 'index.js');
  const preload = path.join(fixtureRoot, 'out', 'preload', 'index.js');
  fs.mkdirSync(path.dirname(main), { recursive: true });
  fs.mkdirSync(path.dirname(preload), { recursive: true });
  fs.writeFileSync(main, 'module.exports = 1;\n');
  fs.writeFileSync(preload, 'module.exports = 2;\n');
  assert.equal(runObfuscator(fixtureRoot).status, 0);

  fs.writeFileSync(preload, 'module.exports = 3;\n');
  const repeated = runObfuscator(fixtureRoot);
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /部分产物已混淆，拒绝重复处理/);
});
