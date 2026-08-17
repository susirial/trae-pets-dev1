import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'tsup';

const root = path.resolve(import.meta.dirname, '..');

test('secure CLI bundle excludes TypeScript decision fallback', async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-secure-cli-'));
  const outDir = path.join(fixtureRoot, 'dist');
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  await build({
    entry: { cli: path.join(root, 'src', 'cli', 'index.ts') },
    tsconfig: path.join(root, 'tsconfig.node.json'),
    outDir,
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    target: 'node22',
    platform: 'node',
    bundle: true,
    splitting: false,
    clean: true,
    external: ['electron'],
    minify: true,
    sourcemap: false,
    dts: false,
    define: { __TRAE_PET_SECURE_BUILD__: 'true' },
    silent: true,
  });

  const code = fs.readFileSync(path.join(outDir, 'cli.cjs'), 'utf8');
  for (const forbidden of [
    '新会话开始，播放问候动画。',
    '即将执行命令或耗时任务。',
    '文件改动完成，播放提示动画。',
    '未知或手动事件，保持待命。',
    'selectAction',
    'buildHint',
  ]) {
    assert.equal(code.includes(forbidden), false, `secure bundle leaked ${forbidden}`);
  }
  assert.match(code, /trae\.pet\.secure-core\.request\.v1/);

  const obfuscation = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'obfuscate-build.mjs'), `--root=${fixtureRoot}`],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(obfuscation.status, 0, obfuscation.stderr);
  const version = spawnSync(
    process.execPath,
    ['-e', 'require(process.argv[1]).run(["version"])', path.join(outDir, 'cli.cjs')],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TRAE_PET_DATA_DIR: path.join(fixtureRoot, 'data') },
    },
  );
  assert.equal(version.status, 0, version.stderr);
  assert.deepEqual(JSON.parse(version.stdout), {
    ok: true,
    name: 'trae-pet',
    version: '0.3.0',
  });
});
