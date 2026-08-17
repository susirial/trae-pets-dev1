#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') {
  process.stdout.write(`${JSON.stringify({ ok: true, skipped: true, reason: 'macOS only' })}\n`);
  process.exit(0);
}

const source = path.join(root, 'native', 'secure-core', 'main.swift');
const sliceDir = path.join(root, 'build', 'secure-core', 'slices');
const targets = [
  ['arm64', 'arm64', 'arm64-apple-macos12.0'],
  ['x64', 'x86_64', 'x86_64-apple-macos12.0'],
];

if (!fs.existsSync(source)) throw new Error(`缺少 Swift 源文件：${source}`);
fs.mkdirSync(sliceDir, { recursive: true });

const outputs = targets.map(([releaseArch, machoArch, target]) => {
  const file = path.join(sliceDir, `trae-pet-secure-core-${machoArch}`);
  execFileSync('xcrun', [
    'swiftc',
    source,
    '-target', target,
    '-O',
    '-whole-module-optimization',
    '-o', file,
  ], { cwd: root, stdio: 'inherit' });
  const outputDir = path.join(root, 'build', 'secure-core', `mac-${releaseArch}`);
  const output = path.join(outputDir, 'trae-pet-secure-core');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(file, output);
  fs.chmodSync(output, 0o755);
  const archs = execFileSync('xcrun', ['lipo', '-archs', output], {
    cwd: root,
    encoding: 'utf8',
  }).trim().split(/\s+/);
  if (archs.length !== 1 || archs[0] !== machoArch) {
    throw new Error(`secure-core ${releaseArch} 架构错误：${archs.join(', ')}`);
  }
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', output], {
    cwd: root,
    stdio: 'inherit',
  });
  execFileSync('codesign', ['--verify', '--strict', output], { cwd: root, stdio: 'inherit' });
  return { arch: releaseArch, machoArch, output };
});

process.stdout.write(`${JSON.stringify({ ok: true, outputs }, null, 2)}\n`);
