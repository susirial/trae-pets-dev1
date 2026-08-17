#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archArg = process.argv.find((arg) => arg.startsWith('--arch='))?.split('=')[1] ?? 'all';
const channel = process.argv.find((arg) => arg.startsWith('--channel='))?.split('=')[1];
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const installManifest = JSON.parse(fs.readFileSync(path.join(root, 'install.manifest.json'), 'utf8'));
const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
const secureChannel = channel === releaseConfig.testChannel
  || channel === releaseConfig.commercialChannel;
if (!['arm64', 'x64', 'all'].includes(archArg)) {
  throw new Error(`不支持的 macOS 架构：${archArg}`);
}
if (secureChannel && archArg !== 'all') {
  throw new Error(`${channel} 完整发布预检必须使用 --arch=all`);
}
const requiredFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'PRIVACY.md',
  'package-lock.json',
  'release.config.json',
  'resources/default-config.json',
  'resources/tray.png',
  'resources/pets/trae/manifest.json',
  'build/mj_logo.png',
  'build/entitlements.mac.plist',
  'dist/cli.cjs',
  'out/main/index.js',
  'out/preload/index.js',
  'out/renderer/pet/index.html',
  'out/renderer/settings/index.html',
];
const secureCoreArchs = secureChannel || archArg === 'all' ? ['arm64', 'x64'] : [archArg];
const secureCores = secureCoreArchs.map((arch) => ({
  arch,
  machoArch: arch === 'x64' ? 'x86_64' : 'arm64',
  file: path.join(root, 'build', 'secure-core', `mac-${arch}`, 'trae-pet-secure-core'),
}));
if (secureChannel) {
  requiredFiles.push(...secureCores.map(({ file }) => path.relative(root, file)));
  requiredFiles.push('build/obfuscation-manifest.json');
}

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
const mainBundle = path.join(root, 'out/main/index.js');
const mainCode = fs.existsSync(mainBundle) ? fs.readFileSync(mainBundle, 'utf8') : '';
const secureCoreChecks = secureCores.map(({ arch, machoArch, file }) => {
  const exists = fs.existsSync(file);
  const executable = exists && (fs.statSync(file).mode & 0o111) !== 0;
  let singleArch = !secureChannel;
  let codeSigned = !secureChannel;
  if (exists && process.platform === 'darwin') {
    const archs = execFileSync('xcrun', ['lipo', '-archs', file], { encoding: 'utf8' })
      .trim().split(/\s+/);
    singleArch = archs.length === 1 && archs[0] === machoArch;
    try {
      execFileSync('codesign', ['--verify', '--strict', file], { stdio: 'ignore' });
      codeSigned = true;
    } catch {
      codeSigned = false;
    }
  }
  return { arch, exists, executable, singleArch, codeSigned };
});

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verifyObfuscationManifest() {
  if (!secureChannel) return true;
  const manifestFile = path.join(root, 'build', 'obfuscation-manifest.json');
  if (!fs.existsSync(manifestFile)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (
      manifest.schema !== 'trae.pet.obfuscation-manifest.v1'
      || !Array.isArray(manifest.files)
      || manifest.files.length === 0
    ) return false;
    const expected = [
      ...listFiles(path.join(root, 'out', 'main')).filter((file) => file.endsWith('.js')),
      ...listFiles(path.join(root, 'out', 'preload')).filter((file) => file.endsWith('.js')),
      path.join(root, 'dist', 'cli.cjs'),
    ].map((file) => path.relative(root, file).split(path.sep).join('/')).sort();
    const entries = [...manifest.files].sort((a, b) => String(a.path).localeCompare(String(b.path)));
    if (entries.length !== expected.length) return false;
    return entries.every((entry, index) => (
      entry.path === expected[index]
      && /^[a-f0-9]{64}$/.test(entry.inputSha256 ?? '')
      && /^[a-f0-9]{64}$/.test(entry.outputSha256 ?? '')
      && fs.existsSync(path.join(root, entry.path))
      && sha256(path.join(root, entry.path)) === entry.outputSha256
    ));
  } catch {
    return false;
  }
}

const sourceMapFiles = secureChannel
  ? [
      ...listFiles(path.join(root, 'out')),
      ...listFiles(path.join(root, 'dist')),
    ].filter((file) => file.endsWith('.map')).map((file) => path.relative(root, file))
  : [];
const secureCli = path.join(root, 'dist', 'cli.cjs');
const secureCliCode = fs.existsSync(secureCli) ? fs.readFileSync(secureCli, 'utf8') : '';
const fallbackMarkers = [
  '新会话开始，播放问候动画。',
  '即将执行命令或耗时任务。',
  '文件改动完成，播放提示动画。',
  '未知或手动事件，保持待命。',
  'selectAction',
  'buildHint',
];
const supportedNode = releaseConfig.supportedNode;
const supportedNodeValid = Boolean(
  supportedNode
  && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(supportedNode.min ?? '')
  && Array.isArray(supportedNode.majors)
  && supportedNode.majors.length > 0
  && supportedNode.majors.every((major) => Number.isSafeInteger(major) && major > 0 && major % 2 === 0)
  && new Set(supportedNode.majors).size === supportedNode.majors.length
  && supportedNode.majors.includes(Number(String(supportedNode.min).split('.')[0]))
  && typeof supportedNode.recommended === 'string'
  && supportedNode.recommended.length > 0
);
const expectedNodeEngine = supportedNodeValid
  ? [...supportedNode.majors].sort((left, right) => left - right).map((major) => {
      const minimum = String(supportedNode.min).startsWith(`${major}.`)
        ? supportedNode.min
        : `${major}.0.0`;
      return `>=${minimum} <${major + 1}`;
    }).join(' || ')
  : null;
const checks = {
  missing,
  admZipBundled: Boolean(mainCode)
    && !/require\((['"])adm-zip\1\)/.test(mainCode),
  debugNetworkRemoved: !fs.readFileSync(path.join(root, 'bin/trae-pet.js'), 'utf8')
    .includes('127.0.0.1:7777'),
  installVersionMatches: installManifest.app?.version === packageJson.version,
  supportedNodeValid,
  packageNodeEngineMatches: packageJson.engines?.node === expectedNodeEngine,
  installRequiresSystemNode: installManifest.requirements?.systemNodeRequired === true,
  installNodeRequirementsMatch: JSON.stringify(installManifest.requirements?.node)
    === JSON.stringify(supportedNode),
  channelSupported: !channel || [
    releaseConfig.channel,
    releaseConfig.commercialChannel,
    releaseConfig.testChannel,
  ].includes(channel),
  testLegalConfigured: channel !== releaseConfig.testChannel || Boolean(
    releaseConfig.legal?.issuer && releaseConfig.legal?.reviewStatus,
  ),
  commercialMacConfigured: channel !== releaseConfig.commercialChannel || Boolean(
    releaseConfig.mac?.teamId && releaseConfig.mac?.identityPrefix,
  ),
  secureCoreChecks,
  sourceMapFiles,
  obfuscationManifestValid: verifyObfuscationManifest(),
  secureCliFallbackRemoved: !secureChannel
    || fallbackMarkers.every((marker) => !secureCliCode.includes(marker)),
};

if (
  missing.length > 0
  || !checks.admZipBundled
  || !checks.debugNetworkRemoved
  || !checks.installVersionMatches
  || !checks.supportedNodeValid
  || !checks.packageNodeEngineMatches
  || !checks.installRequiresSystemNode
  || !checks.installNodeRequirementsMatch
  || !checks.channelSupported
  || !checks.testLegalConfigured
  || !checks.commercialMacConfigured
  || checks.secureCoreChecks.some((check) => secureChannel
    && (!check.executable || !check.singleArch || !check.codeSigned))
  || checks.sourceMapFiles.length > 0
  || !checks.obfuscationManifestValid
  || !checks.secureCliFallbackRemoved
) {
  process.stderr.write(`${JSON.stringify({ ok: false, checks }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true, checks }, null, 2)}\n`);
