#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { verifyMacDmg } from './mac-signing.mjs';
import { submitNotarizationWithRetry } from './notary-retry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
const version = packageJson.version;
const channelArg = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1];
const channel = channelArg ?? releaseConfig.channel;
const commercialChannel = releaseConfig.commercialChannel ?? 'stable';
const testChannel = releaseConfig.testChannel ?? 'security-test';
const legal = releaseConfig.legal ?? {};
const isCommercialMac = channel === commercialChannel;
const isSecurityTest = channel === testChannel;
const trustedMac = isCommercialMac || isSecurityTest;
const rawDir = path.join(root, 'release', 'raw');
const stagingDir = path.join(root, 'release', 'staging');
const finalDir = path.join(root, 'release', 'final');
const platformArg = process.argv.find((arg) => arg.startsWith('--platform='))?.split('=')[1] ?? 'all';
const platforms = platformArg === 'all' ? ['mac', 'win', 'linux'] : [platformArg];
const archArg = process.argv.find((arg) => arg.startsWith('--arch='))?.split('=')[1]
  ?? (platforms.includes('mac') ? 'all' : null);
const macArchs = archArg === 'all' ? ['arm64', 'x64'] : [archArg];
const skipVerify = process.argv.includes('--skip-verify');
const skipBuild = process.argv.includes('--skip-build');
const allowDirty = process.argv.includes('--allow-dirty');
const signingResults = new Map();

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

function dockerBuild(platform) {
  const image = releaseConfig.containers[platform === 'win' ? 'windows' : 'linux'];
  const outputName = platform === 'win' ? 'windows' : 'linux';
  const builderArgs = platform === 'win' ? '--win --x64' : '--linux --x64';
  try {
    run('docker', ['pull', '--platform', 'linux/amd64', image], { timeout: 10 * 60 * 1000 });
  } catch {
    throw new Error(
      `无法下载 ${image}。请检查 Docker Desktop 的代理/DNS，确认 docker pull alpine:3.20 可用后重试。`,
    );
  }
  run('docker', [
    'run', '--rm', '--platform', 'linux/amd64',
    '-v', `${root}:/project`,
    '-v', `trae-pet-${outputName}-node-modules:/project/node_modules`,
    '-v', `trae-pet-${outputName}-electron-cache:/root/.cache/electron`,
    '-v', `trae-pet-${outputName}-builder-cache:/root/.cache/electron-builder`,
    '-w', '/project',
    image,
    'bash', '-lc',
    `npm ci && npm run build && npx electron-builder ${builderArgs} --config.directories.output=release/raw/${outputName}`,
  ]);
}

function artifactFiles(platform, arch = null) {
  const folder = platform === 'mac' ? 'macos' : platform === 'win' ? 'windows' : 'linux';
  const extensions = platform === 'mac'
    ? ['.dmg']
    : platform === 'win'
      ? ['.exe']
      : ['.AppImage', '.deb'];
  return listFiles(path.join(rawDir, folder)).filter((file) => (
    extensions.some((extension) => file.endsWith(extension))
    && !file.endsWith('.blockmap')
    && (platform !== 'mac' || !arch || path.basename(file).includes(`-mac-${arch}.`))
  ));
}

function copyDocs(target, platform, arch, signing = null) {
  const docs = [
    'SETUP.md',
    'AGENTS.md',
    'LICENSE',
    'THIRD_PARTY_NOTICES.txt',
    'PRIVACY.md',
    'RELEASE_NOTES.md',
    'RELEASE_CHECKLIST.md',
    'TROUBLESHOOTING.md',
    platform === 'mac' ? 'INSTALL_MAC.md' : platform === 'win' ? 'INSTALL_WINDOWS.md' : 'INSTALL_LINUX.md',
  ];
  for (const file of docs) fs.copyFileSync(path.join(root, file), path.join(target, file));
  const installManifest = JSON.parse(fs.readFileSync(path.join(root, 'install.manifest.json'), 'utf8'));
  installManifest.app.channel = channel;
  installManifest.app.issuer = legal.issuer;
  installManifest.app.reviewStatus = legal.reviewStatus;
  installManifest.app.artifact = {
    platform: platform === 'mac' ? 'darwin' : platform === 'win' ? 'win32' : 'linux',
    arch: arch ?? 'x64',
  };
  if (platform === 'mac') {
    installManifest.app.signing.macos = signing ?? {
      signed: false,
      notarized: false,
      stapled: false,
      teamId: null,
    };
  }
  fs.writeFileSync(
    path.join(target, 'install.manifest.json'),
    `${JSON.stringify(installManifest, null, 2)}\n`,
  );
}

function createDeterministicZip(sourceDir, destination) {
  const zip = new AdmZip();
  const epoch = new Date('2000-01-01T00:00:00.000Z');
  for (const file of listFiles(sourceDir).sort()) {
    const relative = path.relative(sourceDir, file).split(path.sep).join('/');
    zip.addFile(relative, fs.readFileSync(file));
    const entry = zip.getEntry(relative);
    if (entry) entry.header.time = epoch;
  }
  zip.writeZip(destination);
}

function assertTrustedMacPrerequisites() {
  if (isCommercialMac && legal.reviewStatus !== 'approved') {
    throw new Error('stable 商业通道法务状态不是 approved，已拒绝发布');
  }
  if (isSecurityTest && legal.reviewStatus !== 'test-only' && legal.reviewStatus !== 'approved') {
    throw new Error('security-test 通道法务状态必须是 test-only 或 approved');
  }
  if (platformArg !== 'mac') throw new Error(`${channel} 可信 macOS 通道仅支持 --platform=mac`);
  if (archArg !== 'all') throw new Error(`${channel} 可信 macOS 通道必须使用 --arch=all`);
  if (allowDirty || skipVerify || skipBuild) {
    throw new Error(`${channel} 可信 macOS 通道禁止 --allow-dirty、--skip-verify 和 --skip-build`);
  }
  const profile = process.env.APPLE_NOTARY_PROFILE;
  if (!profile) throw new Error(`${channel} 可信 macOS 通道需要 APPLE_NOTARY_PROFILE`);
  const identities = output('security', ['find-identity', '-v', '-p', 'codesigning']);
  const expected = `${releaseConfig.mac.identityPrefix} `;
  if (!identities.includes(expected) || !identities.includes(`(${releaseConfig.mac.teamId})`)) {
    throw new Error(`钥匙串中缺少 Team ${releaseConfig.mac.teamId} 的 Developer ID Application 证书`);
  }
}

async function notarizeAndVerify(dmgPath, expectedArch) {
  const args = [
    'notarytool', 'submit', dmgPath,
    '--keychain-profile', process.env.APPLE_NOTARY_PROFILE,
    '--wait',
    '--output-format', 'json',
  ];
  if (process.env.APPLE_NOTARY_KEYCHAIN) {
    args.push('--keychain', process.env.APPLE_NOTARY_KEYCHAIN);
  }
  const submission = submitNotarizationWithRetry(
    () => JSON.parse(output('xcrun', args)),
    { maxAttempts: 3, delays: [1_000, 3_000] },
  );
  run('xcrun', ['stapler', 'staple', dmgPath]);
  const result = await verifyMacDmg(dmgPath, {
    teamId: releaseConfig.mac.teamId,
    identityPrefix: releaseConfig.mac.identityPrefix,
    expectedArch,
    forbiddenResources: ['runtime/node', 'runtime/node.exe'],
  });
  if (!result.ok) throw new Error(`macOS 签名验收失败：${result.error}`);
  return { ...result, notarizationId: submission.id ?? null };
}

if (!['mac', 'win', 'linux', 'all'].includes(platformArg)) {
  throw new Error(`不支持的平台：${platformArg}`);
}
if (platforms.includes('mac') && !['arm64', 'x64', 'all'].includes(archArg)) {
  throw new Error(`不支持的 macOS 架构：${archArg}`);
}
if (!platforms.includes('mac') && archArg) {
  throw new Error('--arch 仅适用于 macOS 发布');
}
if (![releaseConfig.channel, commercialChannel, testChannel].includes(channel)) {
  throw new Error(`不支持的发布通道：${channel}`);
}
if (isSecurityTest && platformArg !== 'mac') {
  throw new Error('security-test 测试通道仅支持 --platform=mac');
}
if (trustedMac) assertTrustedMacPrerequisites();
if (!allowDirty && output('git', ['status', '--porcelain'])) {
  throw new Error('发布要求干净工作区；仅本地试验可显式传入 --allow-dirty');
}
if (!skipVerify) run('npm', ['run', 'verify']);
if (isSecurityTest || isCommercialMac) {
  run('npm', ['run', 'secure-core:build']);
  run('npm', ['run', 'build:cli'], {
    env: { ...process.env, TRAE_PET_SECURE_BUILD: '1' },
  });
  run('npm', ['run', 'build:app']);
  run('node', ['scripts/obfuscate-build.mjs']);
} else if (platforms.includes('mac')) {
  run('npm', ['run', 'secure-core:build']);
}
run('node', [
  'scripts/release-preflight.mjs',
  `--channel=${channel}`,
  ...(platforms.includes('mac') ? [`--arch=${archArg}`] : []),
]);

if (!skipBuild) {
  fs.rmSync(rawDir, { recursive: true, force: true });
  fs.mkdirSync(rawDir, { recursive: true });
  if (platforms.includes('mac')) {
    if (process.platform !== 'darwin') throw new Error('macOS 安装包必须在 macOS 上构建');
    for (const arch of macArchs) {
      run('npx', [
        'electron-builder', '--mac', `--${arch}`,
        '--config.directories.output=release/raw/macos',
      ], {
        env: {
          ...process.env,
          CSC_IDENTITY_AUTO_DISCOVERY: trustedMac ? 'true' : 'false',
        },
      });
      if (trustedMac) {
        for (const artifact of artifactFiles('mac', arch)) {
          signingResults.set(artifact, await notarizeAndVerify(artifact, arch));
        }
      }
    }
  }
  if (platforms.includes('win')) dockerBuild('win');
  if (platforms.includes('linux')) dockerBuild('linux');
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.rmSync(finalDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });
fs.mkdirSync(finalDir, { recursive: true });

const releaseEntries = [];
const releaseTargets = platforms.flatMap((platform) => (
  platform === 'mac'
    ? macArchs.map((arch) => ({ platform, arch, platformName: `mac-${arch}` }))
    : [{ platform, arch: null, platformName: platform === 'win' ? 'win-x64' : 'linux-x64' }]
));
for (const { platform, arch, platformName } of releaseTargets) {
  const artifacts = artifactFiles(platform, arch);
  if (artifacts.length === 0) throw new Error(`${platform} 没有可发布安装器`);
  if (platform === 'mac' && artifacts.length !== 1) {
    throw new Error(`${platformName} 必须且只能有一个 DMG`);
  }
  const platformStage = path.join(stagingDir, platformName);
  fs.mkdirSync(platformStage, { recursive: true });
  const signing = platform === 'mac' && trustedMac
    ? signingResults.get(artifacts[0])
    : null;
  if (platform === 'mac' && trustedMac && (!signing || signing.arch !== arch)) {
    throw new Error(`${platformName} 缺少独立的签名、公证和架构验收结果`);
  }
  copyDocs(platformStage, platform, arch, signing && {
    signed: signing.signed,
    notarized: signing.notarized,
    stapled: signing.stapled,
    teamId: signing.teamId,
  });
  for (const artifact of artifacts) {
    fs.copyFileSync(artifact, path.join(platformStage, path.basename(artifact)));
  }
  const sums = artifacts.map((artifact) => `${sha256(artifact)}  ${path.basename(artifact)}`);
  fs.writeFileSync(path.join(platformStage, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
  const zipName = `TRAE-Pet-${version}-${platformName}-${channel}.zip`;
  const zipPath = path.join(finalDir, zipName);
  createDeterministicZip(platformStage, zipPath);
  const entry = {
    platform: platformName,
    arch: arch ?? 'x64',
    file: zipName,
    size: fs.statSync(zipPath).size,
    sha256: sha256(zipPath),
    signed: Boolean(signing?.signed),
    notarized: Boolean(signing?.notarized),
    stapled: Boolean(signing?.stapled),
    teamId: signing?.teamId ?? null,
    installers: artifacts.map((artifact) => path.basename(artifact)),
  };
  if (signing) {
    entry.signing = {
      authority: signing.authority,
      cdHash: signing.cdHash,
      certificateSha256: signing.certificateSha256,
      notarizationId: signing.notarizationId,
      verifiedAt: signing.verifiedAt,
    };
  }
  releaseEntries.push(entry);
}

const manifest = {
  schema: 'trae.pet.release-manifest.v1',
  version,
  channel,
  issuer: legal.issuer,
  reviewStatus: legal.reviewStatus,
  commit: output('git', ['rev-parse', 'HEAD']),
  dirty: Boolean(output('git', ['status', '--porcelain'])),
  builtAt: new Date().toISOString(),
  supportedNode: releaseConfig.supportedNode,
  containers: Object.fromEntries(
    platforms.filter((platform) => platform !== 'mac').map((platform) => {
      const image = releaseConfig.containers[platform === 'win' ? 'windows' : 'linux'];
      let imageId = null;
      try {
        imageId = output('docker', ['image', 'inspect', '--format', '{{.Id}}', image]);
      } catch {
        // A skipped build may intentionally verify pre-existing artifacts.
      }
      return [platform, { image, imageId }];
    }),
  ),
  artifacts: releaseEntries,
};
fs.writeFileSync(path.join(finalDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(
  path.join(finalDir, 'SHA256SUMS.txt'),
  `${releaseEntries.map((entry) => `${entry.sha256}  ${entry.file}`).join('\n')}\n`,
);

if (platformArg === 'all') {
  const bundleStage = path.join(stagingDir, 'release-bundle');
  fs.mkdirSync(bundleStage, { recursive: true });
  for (const file of listFiles(finalDir)) fs.copyFileSync(file, path.join(bundleStage, path.basename(file)));
  for (const doc of [
    'SETUP.md',
    'AGENTS.md',
    'install.manifest.json',
    'LICENSE',
    'THIRD_PARTY_NOTICES.txt',
    'PRIVACY.md',
    'RELEASE_NOTES.md',
  ]) {
    fs.copyFileSync(path.join(root, doc), path.join(bundleStage, doc));
  }
  createDeterministicZip(bundleStage, path.join(finalDir, `TRAE-Pet-${version}-release-bundle.zip`));
}

process.stdout.write(`${JSON.stringify({ ok: true, finalDir, manifest }, null, 2)}\n`);
