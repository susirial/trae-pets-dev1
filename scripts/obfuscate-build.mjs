#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootArg = process.argv.find((arg) => arg.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice('--root='.length)) : repositoryRoot;
const manifestArg = process.argv.find((arg) => arg.startsWith('--manifest='));
const manifestPath = manifestArg
  ? path.resolve(root, manifestArg.slice('--manifest='.length))
  : path.join(root, 'build', 'obfuscation-manifest.json');
const verifyOnly = process.argv.includes('--verify-only');
const obfuscationFormat = 'trae-pet-obfuscated-v1';

const options = Object.freeze({
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.65,
  rotateStringArray: true,
  shuffleStringArray: true,
  // Electron's main/preload startup path is intentionally not control-flow
  // flattened. In a real packaged launch this transform can change startup
  // timing/semantics even when V8 syntax checks still pass. The CLI is a
  // narrower synchronous surface and receives a low threshold below.
  controlFlowFlattening: false,
  controlFlowFlatteningThreshold: 0,
  selfDefending: false,
  deadCodeInjection: false,
  debugProtection: false,
  debugProtectionInterval: 0,
  sourceMap: false,
  reservedNames: [
    '^require$',
    '^module$',
    '^exports$',
    '^__dirname$',
    '^__filename$',
    '^process$',
    '^Buffer$',
    '^IPC$',
    '^PetAPI$',
    '^hook_event_name$',
    '^tool_name$',
    '^tool_input$',
    '^tool_response$',
    '^hookSpecificOutput$',
    '^permissionDecision$',
    '^permissionDecisionReason$',
    '^additionalContext$',
    '^schema$',
    '^version$',
  ],
  reservedStrings: [
    '^electron$',
    '^node:',
    '^trae\\.pet\\.',
    '^pet-state:',
    '^pet-window:',
    '^pet-packages:',
    '^pet-interaction:',
    '^settings:',
    '^config:',
    '^sound-library:',
    '^external:',
    '^action:',
    '^SessionStart$',
    '^UserPromptSubmit$',
    '^PreToolUse$',
    '^PostToolUse$',
    '^ManualAction$',
  ],
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function configSha256() {
  return sha256(JSON.stringify({
    obfuscationFormat,
    options,
    cliControlFlowFlatteningThreshold: 0.08,
  }));
}

function optionsFor(file) {
  const cli = relative(file) === 'dist/cli.cjs';
  return cli
    ? {
        ...options,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.08,
      }
    : options;
}

function listJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  });
}

function targetFiles() {
  const cli = path.join(root, 'dist', 'cli.cjs');
  return [
    ...listJavaScriptFiles(path.join(root, 'out', 'main')),
    ...listJavaScriptFiles(path.join(root, 'out', 'preload')),
    ...(fs.existsSync(cli) ? [cli] : []),
  ].sort();
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error(`混淆 manifest 无法解析：${relative(manifestPath)}`);
  }
}

function verifyManifest(manifest, files) {
  if (manifest?.schema !== 'trae.pet.obfuscation-manifest.v1') {
    throw new Error('缺少有效的混淆 manifest');
  }
  if (manifest.configSha256 !== configSha256()) {
    throw new Error('混淆 manifest 的配置摘要不匹配');
  }
  const entries = new Map(
    Array.isArray(manifest.files) ? manifest.files.map((entry) => [entry.path, entry]) : [],
  );
  const expected = files.map(relative);
  if (entries.size !== expected.length || expected.some((file) => !entries.has(file))) {
    throw new Error('混淆 manifest 的文件集合与当前构建不匹配');
  }
  for (const file of files) {
    const entry = entries.get(relative(file));
    if (!/^[a-f0-9]{64}$/.test(entry.inputSha256 ?? '')) {
      throw new Error(`混淆 manifest 缺少输入 SHA256：${relative(file)}`);
    }
    const currentSha256 = sha256(fs.readFileSync(file));
    if (currentSha256 !== entry.outputSha256) {
      throw new Error(`混淆产物 SHA256 不匹配：${relative(file)}`);
    }
  }
  return manifest;
}

const files = targetFiles();
if (files.length === 0) throw new Error('没有找到可混淆的构建产物');

const existingManifest = readManifest();
if (verifyOnly) {
  const manifest = verifyManifest(existingManifest, files);
  process.stdout.write(`${JSON.stringify({ ok: true, verified: true, manifestPath, files: manifest.files }, null, 2)}\n`);
  process.exit(0);
}

if (existingManifest) {
  try {
    const manifest = verifyManifest(existingManifest, files);
    process.stdout.write(`${JSON.stringify({ ok: true, skipped: true, manifestPath, files: manifest.files }, null, 2)}\n`);
    process.exit(0);
  } catch {
    const priorOutputs = new Map(
      Array.isArray(existingManifest.files)
        ? existingManifest.files.map((entry) => [entry.path, entry.outputSha256])
        : [],
    );
    const alreadyObfuscated = files
      .filter((file) => sha256(fs.readFileSync(file)) === priorOutputs.get(relative(file)))
      .map(relative);
    if (alreadyObfuscated.length > 0) {
      throw new Error(
        `检测到部分产物已混淆，拒绝重复处理：${alreadyObfuscated.join(', ')}`,
      );
    }
    // A fresh build replaces all inputs; the old manifest is overwritten only
    // after every new target has been transformed successfully.
  }
}

const markedInputs = files.filter((file) => (
  fs.readFileSync(file, 'utf8').startsWith(`/* ${obfuscationFormat}:`)
));
if (markedInputs.length > 0) {
  throw new Error(
    `检测到无有效 manifest 的已混淆产物，拒绝重复处理：${markedInputs.map(relative).join(', ')}`,
  );
}

const transformed = files.map((file) => {
  const input = fs.readFileSync(file, 'utf8');
  const inputSha256 = sha256(input);
  const seed = Number.parseInt(inputSha256.slice(0, 8), 16);
  const obfuscated = JavaScriptObfuscator.obfuscate(input, {
    ...optionsFor(file),
    seed,
  }).getObfuscatedCode();
  const output = `/* ${obfuscationFormat}:${inputSha256} */\n${obfuscated}`;
  return {
    file,
    output,
    entry: {
      path: relative(file),
      inputSha256,
      outputSha256: sha256(output),
      bytes: Buffer.byteLength(output),
    },
  };
});

for (const item of transformed) fs.writeFileSync(item.file, item.output);
const manifest = {
  schema: 'trae.pet.obfuscation-manifest.v1',
  version: 1,
  generatedAt: new Date().toISOString(),
  configSha256: configSha256(),
  files: transformed.map((item) => item.entry),
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, skipped: false, manifestPath, files: manifest.files }, null, 2)}\n`);
