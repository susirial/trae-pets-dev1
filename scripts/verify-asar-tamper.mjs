#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import asar from '@electron/asar';
import { verifyElectronFuses } from './verify-electron-fuses.mjs';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout || '').trim()}`);
  }
}

function executableFor(appPath) {
  const directory = path.join(appPath, 'Contents', 'MacOS');
  const executable = fs.readdirSync(directory)
    .map((entry) => path.join(directory, entry))
    .find((entry) => fs.statSync(entry).isFile() && (fs.statSync(entry).mode & 0o111) !== 0);
  if (!executable) throw new Error('应用包缺少主可执行文件');
  return executable;
}

export async function verifyAsarTamperRejection(appPath, timeoutMs = 5_000) {
  if (process.platform !== 'darwin') throw new Error('ASAR 篡改启动验收仅支持 macOS');
  const absoluteApp = path.resolve(appPath);
  await verifyElectronFuses(absoluteApp);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-asar-tamper-'));
  const copiedApp = path.join(temporary, path.basename(absoluteApp));
  try {
    run('ditto', [absoluteApp, copiedApp]);
    const archive = path.join(copiedApp, 'Contents', 'Resources', 'app.asar');
    const unpacked = path.join(temporary, 'unpacked');
    asar.extractAll(archive, unpacked);
    fs.appendFileSync(path.join(unpacked, 'out', 'main', 'index.js'), '\n');
    const replacement = path.join(temporary, 'tampered.asar');
    await asar.createPackage(unpacked, replacement);
    fs.renameSync(replacement, archive);

    // Re-signing removes normal code-signature rejection from the equation.
    // Electron's embedded ASAR hash must still reject this valid archive.
    run('codesign', ['--force', '--deep', '--sign', '-', copiedApp]);
    const child = spawn(executableFor(copiedApp), [
      `--user-data-dir=${path.join(temporary, 'user-data')}`,
    ], {
      env: { ...process.env, TRAE_PET_BOOTSTRAP_DIAGNOSTICS: '0' },
      stdio: 'ignore',
    });
    const exited = await Promise.race([
      once(child, 'exit').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    if (!exited) {
      child.kill('SIGKILL');
      throw new Error('篡改后的 app.asar 仍可保持运行');
    }
    return true;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

const appArg = process.argv.find((argument) => argument.startsWith('--app='));
if (appArg) {
  await verifyAsarTamperRejection(appArg.slice('--app='.length));
  process.stdout.write(`${JSON.stringify({ ok: true, asarTamperRejected: true })}\n`);
}
