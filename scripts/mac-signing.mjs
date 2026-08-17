import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { verifyElectronFuses } from './verify-electron-fuses.mjs';
import { verifyAsarTamperRejection } from './verify-asar-tamper.mjs';

const DEFAULT_FORBIDDEN_RESOURCES = ['runtime/node', 'runtime/node.exe'];

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  const stdout = String(result.stdout ?? '').trim();
  const stderr = String(result.stderr ?? '').trim();
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败${stderr || stdout ? `：${stderr || stdout}` : ''}`);
  }
  return [stdout, stderr].filter(Boolean).join('\n');
}

function signingDetails(appPath) {
  const details = capture('codesign', ['-d', '--verbose=4', appPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const authority = details.match(/^Authority=(.+)$/m)?.[1]?.trim() ?? null;
  const teamId = details.match(/^TeamIdentifier=(.+)$/m)?.[1]?.trim() ?? null;
  const cdHash = details.match(/^CDHash=(.+)$/m)?.[1]?.trim() ?? null;
  return { authority, teamId, cdHash };
}

function certificateSha256(authority) {
  if (!authority) return null;
  try {
    const pem = execFileSync('security', ['find-certificate', '-c', authority, '-p']);
    const fingerprint = capture(
      'openssl',
      ['x509', '-noout', '-fingerprint', '-sha256'],
      { input: pem, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return fingerprint.split('=').at(-1)?.replaceAll(':', '').toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function findApp(mountPoint) {
  const appName = fs.readdirSync(mountPoint).find((entry) => entry.endsWith('.app'));
  if (!appName) throw new Error('DMG 中未找到 .app');
  return path.join(mountPoint, appName);
}

export function machoArchForReleaseArch(arch) {
  if (arch === 'arm64') return 'arm64';
  if (arch === 'x64') return 'x86_64';
  throw new Error(`不支持的 macOS 架构：${arch}`);
}

function verifySingleArch(binary, expectedArch, label) {
  if (!fs.existsSync(binary)) throw new Error(`应用包缺少 ${label}`);
  const archs = capture('xcrun', ['lipo', '-archs', binary]).split(/\s+/).filter(Boolean);
  const expectedMachOArch = machoArchForReleaseArch(expectedArch);
  if (archs.length !== 1 || archs[0] !== expectedMachOArch) {
    throw new Error(`${label} 架构错误：期望 ${expectedMachOArch}，实际 ${archs.join(', ')}`);
  }
}

export async function verifyMacDmg(dmgPath, options = {}) {
  const absoluteDmg = path.resolve(dmgPath);
  const expectedTeamId = options.teamId ?? null;
  const expectedIdentityPrefix = options.identityPrefix ?? 'Developer ID Application:';
  const expectedArch = options.expectedArch;
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-verify-'));
  let attached = false;

  try {
    if (!fs.existsSync(absoluteDmg)) throw new Error(`DMG 不存在：${absoluteDmg}`);
    machoArchForReleaseArch(expectedArch);
    capture('codesign', ['--verify', '--strict', '--verbose=2', absoluteDmg]);
    capture('xcrun', ['stapler', 'validate', absoluteDmg]);
    capture('spctl', [
      '-a', '-vv', '-t', 'open',
      '--context', 'context:primary-signature',
      absoluteDmg,
    ]);

    capture('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountPoint, absoluteDmg]);
    attached = true;
    const appPath = findApp(mountPoint);
    const appExecutables = fs.readdirSync(path.join(appPath, 'Contents', 'MacOS'));
    if (appExecutables.length !== 1) throw new Error('无法唯一确定 app 主 binary');
    verifySingleArch(
      path.join(appPath, 'Contents', 'MacOS', appExecutables[0]),
      expectedArch,
      'app 主 binary',
    );
    capture('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
    capture('spctl', ['-a', '-vv', '-t', 'exec', appPath]);
    await verifyElectronFuses(appPath);
    const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
    if (expectedArch === hostArch) {
      await verifyAsarTamperRejection(appPath);
    }

    const resourcesPath = path.join(appPath, 'Contents', 'Resources');
    const forbiddenResources = new Set([
      ...DEFAULT_FORBIDDEN_RESOURCES,
      ...(options.forbiddenResources ?? []),
    ]);
    for (const relative of forbiddenResources) {
      if (fs.existsSync(path.join(resourcesPath, relative))) {
        throw new Error(`应用包包含禁止分发的资源：${relative}`);
      }
    }
    const secureCore = path.join(
      appPath,
      'Contents',
      'Resources',
      'secure-core',
      'trae-pet-secure-core',
    );
    if (!fs.existsSync(secureCore)) throw new Error('应用包缺少 secure-core helper');
    if ((fs.statSync(secureCore).mode & 0o111) === 0) throw new Error('secure-core helper 不可执行');
    verifySingleArch(secureCore, expectedArch, 'secure-core helper');
    capture('codesign', ['--verify', '--strict', '--verbose=2', secureCore]);

    const details = signingDetails(appPath);
    if (!details.authority?.startsWith(expectedIdentityPrefix)) {
      throw new Error(`签名证书不是 Developer ID Application：${details.authority ?? 'unknown'}`);
    }
    if (expectedTeamId && details.teamId !== expectedTeamId) {
      throw new Error(`Team ID 不匹配：期望 ${expectedTeamId}，实际 ${details.teamId ?? 'unknown'}`);
    }

    return {
      ok: true,
      signed: true,
      notarized: true,
      stapled: true,
      teamId: details.teamId,
      authority: details.authority,
      cdHash: details.cdHash,
      certificateSha256: certificateSha256(details.authority),
      arch: expectedArch,
      dmgSha256: crypto.createHash('sha256').update(fs.readFileSync(absoluteDmg)).digest('hex'),
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      signed: false,
      notarized: false,
      stapled: false,
      error: error instanceof Error ? error.message : String(error),
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    if (attached) {
      try {
        capture('hdiutil', ['detach', mountPoint]);
      } catch {
        // A failed detach should not hide the verification result.
      }
    }
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}
