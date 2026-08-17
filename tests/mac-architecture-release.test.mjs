import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { machoArchForReleaseArch } from '../scripts/mac-signing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mac builder and install metadata declare separate arm64 and x64 artifacts', () => {
  const builder = read('electron-builder.yml');
  const manifest = JSON.parse(read('install.manifest.json'));
  assert.match(builder, /build\/secure-core\/mac-\$\{arch\}\/trae-pet-secure-core/);
  assert.match(builder, /arch:\s*\n\s*- arm64\s*\n\s*- x64/);
  assert.deepEqual(manifest.platforms.darwin.arch, ['arm64', 'x64']);
  assert.deepEqual(manifest.platforms.darwin.artifactPatterns, [
    'TRAE-Pet-*-mac-arm64.dmg',
    'TRAE-Pet-*-mac-x64.dmg',
  ]);
});

test('secure-core preparation retains only per-architecture mac outputs', () => {
  const secureCore = read('scripts/prepare-secure-core.mjs');
  assert.match(secureCore, /`mac-\$\{releaseArch\}`/);
  assert.match(secureCore, /archs\.length !== 1/);
});

test('release accepts explicit mac architectures and trusted channels require all', () => {
  const invalid = spawnSync(process.execPath, [
    'scripts/release.mjs', '--platform=mac', '--arch=universal', '--allow-dirty',
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(`${invalid.stdout}${invalid.stderr}`, /不支持的 macOS 架构：universal/);

  const trustedSingle = spawnSync(process.execPath, [
    'scripts/release.mjs',
    '--platform=mac',
    '--arch=arm64',
    '--channel=security-test',
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(trustedSingle.status, 0);
  assert.match(`${trustedSingle.stdout}${trustedSingle.stderr}`, /必须使用 --arch=all/);
});

test('all-platform release defaults mac to both architectures without leaking arch to other builders', () => {
  const release = read('scripts/release.mjs');
  assert.match(
    release,
    /const archArg = .*[\s\S]*\?\? \(platforms\.includes\('mac'\) \? 'all' : null\)/,
  );
  assert.match(release, /platformArg === 'all' \? \['mac', 'win', 'linux'\]/);
  assert.match(release, /const builderArgs = platform === 'win' \? '--win --x64' : '--linux --x64'/);
  assert.match(release, /\.\.\.\(platforms\.includes\('mac'\) \? \[`--arch=\$\{archArg\}`\] : \[\]\)/);

  const polluted = spawnSync(process.execPath, [
    'scripts/release.mjs', '--platform=win', '--arch=all', '--allow-dirty',
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(polluted.status, 0);
  assert.match(`${polluted.stdout}${polluted.stderr}`, /--arch 仅适用于 macOS 发布/);
});

test('release creates two mac entries and maps signing results per DMG', () => {
  const release = read('scripts/release.mjs');
  const verify = read('scripts/verify-release.mjs');
  assert.match(release, /macArchs\.map\(\(arch\) => \(\{ platform, arch, platformName: `mac-\$\{arch\}` \}\)\)/);
  assert.match(release, /signingResults\.set\(artifact, await notarizeAndVerify\(artifact, arch\)\)/);
  assert.match(release, /signingResults\.get\(artifacts\[0\]\)/);
  assert.match(release, /installManifest\.app\.artifact = \{/);
  assert.match(verify, /安装 manifest 产物平台\/架构不一致/);
  assert.match(verify, /同时包含 mac-arm64 和 mac-x64/);
  assert.doesNotMatch(release, /mac-universal|--universal/);
});

test('package and release commands name both mac architectures explicitly', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts['package:mac'], /--arm64 --x64/);
  assert.match(packageJson.scripts['package:mac:arm64'], /--arm64/);
  assert.match(packageJson.scripts['package:mac:x64'], /--x64/);
  assert.match(packageJson.scripts['release:mac:stable'], /--platform=mac --arch=all/);
  assert.match(packageJson.scripts['release:mac:security-test'], /--platform=mac --arch=all/);
});

test('Mach-O architecture mapping is exact', () => {
  assert.equal(machoArchForReleaseArch('arm64'), 'arm64');
  assert.equal(machoArchForReleaseArch('x64'), 'x86_64');
  assert.throws(() => machoArchForReleaseArch('universal'), /不支持的 macOS 架构/);
});
