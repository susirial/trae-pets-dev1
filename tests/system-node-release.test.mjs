import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('build and release execution paths never prepare or bundle a standalone Node runtime', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts/prepare-node-runtime.mjs')), false);
  for (const file of [
    'package.json',
    'electron-builder.yml',
    'scripts/release.mjs',
    'scripts/release-preflight.mjs',
    'bin/trae-pet.sh',
    'bin/trae-pet.cmd',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /prepare-node-runtime|build\/runtime|Resources\/runtime\/node/);
  }
  assert.doesNotMatch(read('bin/trae-pet.sh'), /ROOT\/runtime/);
  assert.doesNotMatch(read('bin/trae-pet.cmd'), /\\runtime\\node\.exe/i);
});

test('release and install metadata require the same supported system Node', () => {
  const packageJson = JSON.parse(read('package.json'));
  const releaseConfig = JSON.parse(read('release.config.json'));
  const installManifest = JSON.parse(read('install.manifest.json'));
  const tsupConfig = read('tsup.config.ts');

  assert.equal(installManifest.requirements.systemNodeRequired, true);
  assert.deepEqual(installManifest.requirements.node, releaseConfig.supportedNode);
  assert.equal(packageJson.engines.node, '>=22.12.0 <23 || >=24.0.0 <25');
  assert.match(tsupConfig, /target:\s*'node22'/);
  assert.equal('nodeRuntimeVersion' in releaseConfig, false);
});

test('DMG verification rejects standalone Node resources without signing them', () => {
  const signing = read('scripts/mac-signing.mjs');
  const verifyRelease = read('scripts/verify-release.mjs');

  assert.match(signing, /forbiddenResources/);
  assert.match(signing, /DEFAULT_FORBIDDEN_RESOURCES = \['runtime\/node', 'runtime\/node\.exe'\]/);
  assert.doesNotMatch(signing, /verifySingleArch\(runtimeNode|codesign.*runtimeNode/);
  assert.match(verifyRelease, /forbiddenResources: \['runtime\/node', 'runtime\/node\.exe'\]/);
});

test('current installation and release docs consistently describe split mac artifacts and system Node', () => {
  const currentDocs = [
    'README.md',
    'SETUP.md',
    'INSTALL_MAC.md',
    'INSTALL_WINDOWS.md',
    'INSTALL_LINUX.md',
    'TROUBLESHOOTING.md',
    'RELEASE.md',
    'RELEASE_CHECKLIST.md',
    'RELEASE_NOTES.md',
    'AGENTS.md',
    'THIRD_PARTY_NOTICES.txt',
  ].map((file) => [file, read(file)]);

  for (const [file, source] of currentDocs) {
    assert.doesNotMatch(source, /mac(?:OS)?[- ]universal|universal DMG|universal Swift/i, file);
    assert.doesNotMatch(source, /Node(?:\.js)?\s*18\+|Node(?:\.js)?\s*18 或更高/i, file);
    assert.doesNotMatch(source, /无需(?:安装)?\s*Node|不需要(?:安装)?\s*Node|内置.*Node runtime/i, file);
  }

  const mac = read('INSTALL_MAC.md');
  for (const marker of [
    '关于本机',
    'uname -m',
    'arm64',
    'Apple Silicon',
    'x86_64',
    'Intel',
    'mac-arm64',
    'mac-x64',
  ]) assert.match(mac, new RegExp(marker));
  assert.match(mac, /不要把 x64\/Rosetta 版本作为默认安装方案/);

  for (const file of ['SETUP.md', 'INSTALL_MAC.md', 'INSTALL_WINDOWS.md', 'INSTALL_LINUX.md']) {
    const source = read(file);
    assert.match(source, /22\/24 LTS/);
    assert.match(source, /22\.12\.0/);
    assert.match(source, /Node 24 LTS/);
    assert.match(source, /install-hooks/);
    assert.match(source, /install-info/);
    assert.match(source, /doctor/);
    assert.match(source, /verify-hooks/);
  }
  assert.match(read('SETUP.md'), /TRAE_PET_NODE/);
  assert.match(read('AGENTS.md'), /node --version/);
  assert.match(read('AGENTS.md'), /发布包内.*install-hooks/s);
});

test('installation docs and manifest describe launch-time auto install for every TRAE variant', () => {
  for (const file of [
    'README.md',
    'SETUP.md',
    'AGENTS.md',
    'INSTALL_MAC.md',
    'INSTALL_WINDOWS.md',
    'INSTALL_LINUX.md',
    'TROUBLESHOOTING.md',
  ]) {
    const source = read(file);
    assert.match(source, /\.trae-cn/, file);
  }

  for (const file of ['SETUP.md', 'AGENTS.md', 'INSTALL_MAC.md', 'INSTALL_WINDOWS.md']) {
    assert.match(read(file), /自动(?:接入|发现)/, file);
  }
  assert.match(read('SETUP.md'), /--profile=/);

  const installManifest = JSON.parse(read('install.manifest.json'));
  assert.equal(installManifest.autoInstall.onEveryLaunch, true);
  assert.match(installManifest.autoInstall.manualFallback, /install-hooks/);
  assert.equal(installManifest.expected.verify.profilesAllOk, true);
  assert.match(
    installManifest.requirements.traeHooksConfig.pattern.darwin,
    /~\/\.trae\*\/hooks\.json/,
  );
});
