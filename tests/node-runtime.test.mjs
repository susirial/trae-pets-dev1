import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  discoverNode,
  nodeVersionError,
  parseStableNodeVersion,
  readPinnedNode,
  SUPPORTED_NODE,
  writeNodePathRecord,
} from '../src/cli/node-runtime.ts';

test('release config and package engines share the supported Node policy', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const releaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(releaseConfig.supportedNode, {
    min: '22.12.0',
    majors: [22, 24],
    recommended: '24 LTS',
  });
  assert.equal(packageJson.engines.node, '>=22.12.0 <23 || >=24.0.0 <25');
});

test('strict Node version gate accepts only supported stable LTS releases', () => {
  assert.deepEqual(parseStableNodeVersion('22.12.0'), [22, 12, 0]);
  assert.equal(parseStableNodeVersion('v22.12.0'), null);
  assert.equal(parseStableNodeVersion('022.12.0'), null);
  assert.equal(parseStableNodeVersion('24.0.0-rc.1'), null);

  assert.equal(nodeVersionError('22.12.0'), null);
  assert.equal(nodeVersionError('22.17.1'), null);
  assert.equal(nodeVersionError('24.0.0'), null);
  assert.match(nodeVersionError('22.11.9'), /过低/);
  assert.match(nodeVersionError('23.1.0'), /奇数/);
  assert.match(nodeVersionError('25.0.0'), /奇数/);
  assert.match(nodeVersionError('26.0.0'), /不受支持/);
  assert.match(nodeVersionError('24.0.0-rc.1'), /稳定正式版/);
});

test('Node discovery honors overrides and safely handles pinned records', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-node-'));
  const recordFile = path.join(root, 'hook-runtime', 'node-path.json');
  const originalOverride = process.env.TRAE_PET_NODE;
  t.after(() => {
    if (originalOverride === undefined) delete process.env.TRAE_PET_NODE;
    else process.env.TRAE_PET_NODE = originalOverride;
    fs.rmSync(root, { recursive: true, force: true });
  });

  process.env.TRAE_PET_NODE = process.execPath;
  const overridden = discoverNode(SUPPORTED_NODE, recordFile);
  assert.equal(overridden.ok, true);
  assert.equal(overridden.source, 'TRAE_PET_NODE');
  assert.equal(overridden.execPath, path.normalize(process.execPath));

  writeNodePathRecord(overridden, recordFile);
  assert.equal(fs.statSync(recordFile).mode & 0o777, 0o600);
  assert.deepEqual(
    fs.readdirSync(path.dirname(recordFile)).filter((name) => name.includes('.tmp-')),
    [],
  );
  const parsed = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  assert.deepEqual(Object.keys(parsed).sort(), ['arch', 'execPath', 'resolvedAt', 'schema', 'version']);
  assert.equal(parsed.schema, 'trae.pet.node-path.v1');

  delete process.env.TRAE_PET_NODE;
  const pinned = discoverNode(SUPPORTED_NODE, recordFile);
  assert.equal(pinned.ok, true);
  assert.equal(pinned.source, 'node-path.json');
  assert.equal(readPinnedNode(SUPPORTED_NODE, recordFile).ok, true);

  fs.writeFileSync(recordFile, '{"schema":"broken"}\n');
  const damaged = discoverNode(SUPPORTED_NODE, recordFile);
  assert.equal(damaged.ok, true);
  assert.equal(damaged.source, 'process.execPath');
  assert.ok(damaged.attempts.some((attempt) => (
    attempt.source === 'node-path.json' && /schema/.test(attempt.error)
  )));
  assert.equal(readPinnedNode(SUPPORTED_NODE, recordFile).ok, false);

  fs.writeFileSync(recordFile, JSON.stringify({
    schema: 'trae.pet.node-path.v1',
    execPath: path.join(root, 'missing-node'),
    version: process.versions.node,
    arch: process.arch,
    resolvedAt: new Date().toISOString(),
  }));
  const stale = readPinnedNode(SUPPORTED_NODE, recordFile);
  assert.equal(stale.ok, false);
  assert.match(stale.error, /失效/);
});

test('Node discovery never probes the Electron binary it is running inside', (t) => {
  const original = process.versions.electron;
  Object.defineProperty(process.versions, 'electron', {
    value: '42.0.0',
    configurable: true,
    writable: true,
  });
  t.after(() => {
    if (original === undefined) delete process.versions.electron;
    else process.versions.electron = original;
  });

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-electron-node-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const discovered = discoverNode(SUPPORTED_NODE, path.join(root, 'node-path.json'));

  assert.notEqual(discovered.source, 'process.execPath');
  assert.ok(discovered.attempts.every((attempt) => attempt.source !== 'process.execPath'));
});

