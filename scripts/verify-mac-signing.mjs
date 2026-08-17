#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { verifyMacDmg } from './mac-signing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
const dmgArg = process.argv.find((arg) => arg.startsWith('--dmg='))?.slice('--dmg='.length);
const archArg = process.argv.find((arg) => arg.startsWith('--arch='))?.slice('--arch='.length);
const dirArg = process.argv.find((arg) => arg.startsWith('--dir='))?.slice('--dir='.length);
const releaseDir = path.resolve(dirArg || path.join(root, 'release', 'final'));
const temporaryDirs = [];

function dmgFilesFromRelease() {
  const manifestPath = path.join(releaseDir, 'release-manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`缺少 ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const artifacts = (manifest.artifacts ?? []).filter((artifact) => (
    artifact.platform === 'mac-arm64' || artifact.platform === 'mac-x64'
  ));
  if (artifacts.length === 0) throw new Error('release manifest 中没有 mac-arm64/mac-x64 产物');
  const trustedChannel = [
    releaseConfig.commercialChannel,
    releaseConfig.testChannel,
  ].includes(manifest.channel);
  const platforms = new Set(artifacts.map((artifact) => artifact.platform));
  if (trustedChannel && (!platforms.has('mac-arm64') || !platforms.has('mac-x64'))) {
    throw new Error(`${manifest.channel} 签名验收必须同时包含 mac-arm64 和 mac-x64`);
  }

  return artifacts.map((artifact) => {
    const zipPath = path.join(releaseDir, artifact.file);
    if (!fs.existsSync(zipPath)) throw new Error(`缺少 ${zipPath}`);
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-release-'));
    temporaryDirs.push(extractDir);
    new AdmZip(zipPath).extractAllTo(extractDir, true);
    const dmgName = (artifact.installers ?? []).find((file) => file.endsWith('.dmg'));
    if (!dmgName) throw new Error(`${artifact.file} 未声明 DMG 安装器`);
    return {
      artifact,
      dmgPath: path.join(extractDir, dmgName),
      expectedArch: artifact.platform.slice('mac-'.length),
      manifest,
    };
  });
}

let exitCode = 0;
try {
  const targets = dmgArg
    ? [{ artifact: null, dmgPath: path.resolve(dmgArg), expectedArch: archArg, manifest: null }]
    : dmgFilesFromRelease();
  if (dmgArg && !['arm64', 'x64'].includes(archArg)) {
    throw new Error('--dmg 验证必须提供 --arch=arm64|x64');
  }
  const results = await Promise.all(targets.map(async ({
    artifact, dmgPath, expectedArch, manifest,
  }) => {
    const trustedChannel = !manifest || [
      releaseConfig.commercialChannel,
      releaseConfig.testChannel,
    ].includes(manifest.channel);
    const result = await verifyMacDmg(dmgPath, {
      teamId: releaseConfig.mac?.teamId,
      identityPrefix: releaseConfig.mac?.identityPrefix,
      expectedArch,
    });
    const metadataMatches = !artifact || !trustedChannel || (
      artifact.signed === result.signed
      && artifact.notarized === result.notarized
      && artifact.stapled === result.stapled
      && artifact.teamId === result.teamId
      && manifest?.dirty === false
    );
    return {
      file: artifact?.file ?? dmgPath,
      ...result,
      metadataMatches,
      ok: result.ok && metadataMatches,
    };
  }));
  if (results.some((result) => !result.ok)) exitCode = 1;
  process.stdout.write(`${JSON.stringify({ ok: exitCode === 0, results }, null, 2)}\n`);
} catch (error) {
  exitCode = 1;
  process.stderr.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
} finally {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
}

process.exitCode = exitCode;
