import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('open-source version and MIT license metadata stay synchronized', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const installManifest = JSON.parse(fs.readFileSync(path.join(root, 'install.manifest.json'), 'utf8'));
  const license = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.equal(packageJson.version, '0.3.0');
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
  assert.equal(installManifest.app.version, packageJson.version);
  assert.equal(packageJson.license, 'MIT');
  assert.equal(packageLock.packages[''].license, 'MIT');
  assert.equal(installManifest.app.license, 'MIT');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 TRAE Pet contributors/);
  assert.match(readme, /img\.shields\.io\/badge\/license-MIT/);
  assert.match(readme, /MIT License/);
});

test('third-party notices are required in app and release bundles', () => {
  const notices = fs.readFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');
  const preflight = fs.readFileSync(path.join(root, 'scripts/release-preflight.mjs'), 'utf8');
  const verify = fs.readFileSync(path.join(root, 'scripts/verify-release.mjs'), 'utf8');

  for (const component of ['Electron', 'Chromium', 'Node.js', 'ReactDOM', 'adm-zip']) {
    assert.match(notices, new RegExp(component.replace('.', '\\.'), 'i'));
  }
  assert.match(notices, /complete Chromium.*notices.*Electron Framework/is);
  assert.match(notices, /not a complete dependency\s+inventory or legal audit/i);
  for (const source of [builder, release, preflight, verify]) {
    assert.match(source, /THIRD_PARTY_NOTICES\.txt/);
  }
});

test('commercial mac configuration enables hardened runtime and stable metadata', () => {
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');
  const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
  const installManifest = JSON.parse(fs.readFileSync(path.join(root, 'install.manifest.json'), 'utf8'));

  assert.match(builder, /hardenedRuntime:\s*true/);
  assert.match(builder, /entitlements:\s*build\/entitlements\.mac\.plist/);
  assert.doesNotMatch(builder, /identity:\s*null/);
  assert.equal(releaseConfig.commercialChannel, 'stable');
  assert.equal(releaseConfig.testChannel, 'security-test');
  assert.deepEqual(releaseConfig.legal, {
    issuer: 'TRAE Pet',
    reviewStatus: 'test-only',
  });
  assert.equal(releaseConfig.mac.teamId, '563C77XM96');
  assert.equal(installManifest.app.channel, 'unsigned-preview');
  assert.equal(installManifest.app.signing.macos.signed, false);
  assert.match(release, /可信 macOS 通道禁止 --allow-dirty、--skip-verify 和 --skip-build/);
  assert.match(release, /notarytool.*submit/s);
  assert.match(release, /stapler.*staple/s);
  assert.match(release, /verifyMacDmg/);
});

test('stable release fails closed until legal review is approved', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/release.mjs',
      '--platform=mac',
      '--channel=stable',
      '--allow-dirty',
      '--skip-build',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, APPLE_NOTARY_PROFILE: 'test-only' },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /法务状态不是 approved/);
});

test('security-test is supported for mac and rejects every non-mac platform', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const preflight = fs.readFileSync(path.join(root, 'scripts/release-preflight.mjs'), 'utf8');
  const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');

  assert.match(
    packageJson.scripts['release:mac:security-test'],
    /--platform=mac --arch=all --channel=security-test/,
  );
  assert.match(preflight, /releaseConfig\.testChannel/);
  assert.match(release, /issuer:\s*legal\.issuer/);
  assert.match(release, /reviewStatus:\s*legal\.reviewStatus/);

  for (const platform of ['win', 'linux', 'all']) {
    const result = spawnSync(
      process.execPath,
      ['scripts/release.mjs', `--platform=${platform}`, '--channel=security-test', '--allow-dirty'],
      { cwd: root, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /security-test 测试通道仅支持 --platform=mac/);
  }
});

test('security-test uses the same trusted signing and notarization gate as stable', () => {
  const release = fs.readFileSync(path.join(root, 'scripts/release.mjs'), 'utf8');
  const verifyRelease = fs.readFileSync(path.join(root, 'scripts/verify-release.mjs'), 'utf8');
  const verifySigning = fs.readFileSync(path.join(root, 'scripts/verify-mac-signing.mjs'), 'utf8');

  assert.match(release, /const trustedMac = isCommercialMac \|\| isSecurityTest/);
  assert.match(release, /CSC_IDENTITY_AUTO_DISCOVERY: trustedMac \? 'true' : 'false'/);
  assert.match(release, /if \(trustedMac\) \{\s*for .*notarizeAndVerify\(artifact, arch\)/s);
  assert.match(release, /platform === 'mac' && trustedMac/);
  assert.match(verifyRelease, /releaseConfig\.commercialChannel,\s*releaseConfig\.testChannel/s);
  assert.match(verifySigning, /releaseConfig\.commercialChannel,\s*releaseConfig\.testChannel/s);

  const result = spawnSync(
    process.execPath,
    [
      'scripts/release.mjs',
      '--platform=mac',
      '--channel=security-test',
      '--allow-dirty',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, APPLE_NOTARY_PROFILE: 'test-only' },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /security-test 可信 macOS 通道禁止 --allow-dirty/);
});

test('mac release workflow uses secret-backed temporary credentials', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release-mac.yml'), 'utf8');

  for (const secret of [
    'MAC_CERT_P12_BASE64',
    'MAC_CERT_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.match(workflow, /security delete-keychain/);
  assert.match(workflow, /npm run release:mac:stable/);
});
