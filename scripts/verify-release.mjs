#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { verifyMacDmg } from './mac-signing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseDir = process.argv.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length)
  ?? path.join(root, 'release', 'final');
const manifestFile = path.join(releaseDir, 'release-manifest.json');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

if (!fs.existsSync(manifestFile)) throw new Error(`缺少 ${manifestFile}`);
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const requiredEntries = [
  'SETUP.md',
  'AGENTS.md',
  'install.manifest.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  'PRIVACY.md',
  'RELEASE_NOTES.md',
  'TROUBLESHOOTING.md',
  'SHA256SUMS.txt',
];
const results = [];
const expectedNodeEngine = [...releaseConfig.supportedNode.majors]
  .sort((left, right) => left - right)
  .map((major) => {
    const minimum = String(releaseConfig.supportedNode.min).startsWith(`${major}.`)
      ? releaseConfig.supportedNode.min
      : `${major}.0.0`;
    return `>=${minimum} <${major + 1}`;
  })
  .join(' || ');
if (
  JSON.stringify(manifest.supportedNode) !== JSON.stringify(releaseConfig.supportedNode)
  || packageJson.engines?.node !== expectedNodeEngine
) {
  throw new Error('发布 manifest、release config 与 package engines 的系统 Node 要求不一致');
}

const trustedMacChannel = [
  releaseConfig.commercialChannel,
  releaseConfig.testChannel,
].includes(manifest.channel);
if (manifest.channel === releaseConfig.testChannel) {
  if (
    manifest.issuer !== releaseConfig.legal?.issuer
    || manifest.reviewStatus !== releaseConfig.legal?.reviewStatus
  ) {
    throw new Error('security-test 发布 manifest 缺少匹配的 issuer/reviewStatus');
  }
  if ((manifest.artifacts ?? []).some((artifact) => !['mac-arm64', 'mac-x64'].includes(artifact.platform))) {
    throw new Error('security-test 发布只能包含 mac-arm64/mac-x64 产物');
  }
}
if (trustedMacChannel) {
  const macPlatforms = new Set((manifest.artifacts ?? []).map((artifact) => artifact.platform));
  if (!macPlatforms.has('mac-arm64') || !macPlatforms.has('mac-x64')) {
    throw new Error(`${manifest.channel} 完整发布必须同时包含 mac-arm64 和 mac-x64`);
  }
}
if (
  manifest.channel === releaseConfig.commercialChannel
  && manifest.reviewStatus !== 'approved'
) {
  throw new Error('stable 商业发布的法务状态不是 approved');
}

for (const artifact of manifest.artifacts ?? []) {
  if (
    ['mac-arm64', 'mac-x64'].includes(artifact.platform)
    && artifact.arch !== artifact.platform.slice('mac-'.length)
  ) {
    throw new Error(`${artifact.file} 的 macOS 架构元数据不一致`);
  }
  const file = path.join(releaseDir, artifact.file);
  if (!fs.existsSync(file)) throw new Error(`缺少发布包：${artifact.file}`);
  if (sha256(file) !== artifact.sha256) throw new Error(`发布包 hash 不匹配：${artifact.file}`);
  const zip = new AdmZip(file);
  const names = new Set(zip.getEntries().map((entry) => entry.entryName));
  const missing = requiredEntries.filter((entry) => !names.has(entry));
  if (missing.length > 0) throw new Error(`${artifact.file} 缺少：${missing.join(', ')}`);
  for (const installer of artifact.installers ?? []) {
    if (!names.has(installer)) throw new Error(`${artifact.file} 缺少安装器：${installer}`);
  }
  const setup = zip.readAsText('SETUP.md');
  if (!setup.includes('install-hooks') || !setup.includes('verify-hooks')) {
    throw new Error(`${artifact.file} 的 SETUP.md 缺少 Hook 安装验收命令`);
  }
  const installManifest = JSON.parse(zip.readAsText('install.manifest.json'));
  if (installManifest.app?.channel !== manifest.channel) {
    throw new Error(`${artifact.file} 的安装 manifest 通道不一致`);
  }
  if (
    installManifest.app?.issuer !== manifest.issuer
    || installManifest.app?.reviewStatus !== manifest.reviewStatus
  ) {
    throw new Error(`${artifact.file} 的安装 manifest 法务元数据不一致`);
  }
  if (
    installManifest.requirements?.systemNodeRequired !== true
    || JSON.stringify(installManifest.requirements?.node)
      !== JSON.stringify(releaseConfig.supportedNode)
  ) {
    throw new Error(`${artifact.file} 的安装 manifest 未声明匹配的系统 Node 要求`);
  }
  const expectedInstallPlatform = artifact.platform.startsWith('mac-')
    ? 'darwin'
    : artifact.platform === 'win-x64'
      ? 'win32'
      : 'linux';
  if (
    installManifest.app?.artifact?.platform !== expectedInstallPlatform
    || installManifest.app?.artifact?.arch !== artifact.arch
  ) {
    throw new Error(`${artifact.file} 的安装 manifest 产物平台/架构不一致`);
  }

  let signingVerified = null;
  if (
    trustedMacChannel
    && ['mac-arm64', 'mac-x64'].includes(artifact.platform)
  ) {
    if (process.platform !== 'darwin') throw new Error('macOS 包必须在 macOS 上执行签名验收');
    const trustedMac = [
      releaseConfig.commercialChannel,
      releaseConfig.testChannel,
    ].includes(manifest.channel);
    if (trustedMac && manifest.dirty !== false) {
      throw new Error(`${manifest.channel} macOS 包不能来自 dirty 工作区`);
    }
    if (trustedMac && (
      !artifact.signed
      || !artifact.notarized
      || !artifact.stapled
      || artifact.teamId !== releaseConfig.mac?.teamId
    )) {
      throw new Error(`${artifact.file} 缺少可信的 macOS 签名元数据`);
    }
    const installSigning = installManifest.app?.signing?.macos;
    if (trustedMac && (
      !installSigning?.signed
      || !installSigning?.notarized
      || !installSigning?.stapled
      || installSigning.teamId !== releaseConfig.mac?.teamId
    )) {
      throw new Error(`${artifact.file} 的安装 manifest 缺少可信的 macOS 签名元数据`);
    }
    const dmgName = (artifact.installers ?? []).find((name) => name.endsWith('.dmg'));
    if (!dmgName) throw new Error(`${artifact.file} 未声明 DMG`);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-release-verify-'));
    try {
      zip.extractEntryTo(dmgName, tempDir, false, true);
      signingVerified = await verifyMacDmg(path.join(tempDir, dmgName), {
        teamId: releaseConfig.mac.teamId,
        identityPrefix: releaseConfig.mac.identityPrefix,
        expectedArch: artifact.platform.slice('mac-'.length),
        forbiddenResources: ['runtime/node', 'runtime/node.exe'],
      });
      if (!signingVerified.ok) {
        throw new Error(`${artifact.file} 签名验收失败：${signingVerified.error}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  results.push({
    file: artifact.file,
    entries: names.size,
    signingVerified: signingVerified?.ok ?? null,
    ok: true,
  });
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  version: manifest.version,
  channel: manifest.channel,
  issuer: manifest.issuer,
  reviewStatus: manifest.reviewStatus,
  results,
}, null, 2)}\n`);
