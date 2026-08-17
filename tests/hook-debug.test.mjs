import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

test('hook CLI writes a redacted debug log entry', () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-home-'));
  const event = {
    hook_event_name: 'PostToolUse',
    tool_name: 'RunCommand',
    session_id: 'session-123',
    prompt: '请帮我检查构建失败原因',
    tool_input: {
      command: 'npm run build --watch --token abc123',
      file_path: '/tmp/secret.txt',
    },
    tool_response: {
      exitCode: 1,
      error: 'Command failed',
      stderr: 'token leaked',
    },
  };

  const run = spawnSync('node', ['bin/trae-pet.js', 'hook'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tempHome,
      TRAE_PET_INPUT_JSON: JSON.stringify(event),
    },
  });

  assert.equal(run.status, 0, run.stderr || run.stdout);

  const logPath = path.join(
    tempHome,
    'Library',
    'Application Support',
    'trae-pet',
    'logs',
    'hook-debug.log',
  );
  assert.equal(fs.existsSync(logPath), true, 'expected hook-debug.log to be created');

  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 1);

  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, 'PostToolUse');
  assert.equal(entry.toolName, 'RunCommand');
  assert.equal(entry.sessionId, 'session-123');
  assert.equal(entry.action, 'failed');
  assert.equal(entry.hasPrompt, true);
  assert.match(entry.promptPreview ?? '', /构建失败/);
  assert.equal(entry.hasToolInput, true);
  assert.match(entry.toolInputPreview ?? '', /npm run build/);
  assert.doesNotMatch(entry.toolInputPreview ?? '', /abc123/);
  assert.equal(entry.hasToolResponse, true);
  assert.equal(entry.toolResponsePreview, 'exitCode=1 error=Command failed');
});

test('hook CLI does not hang when stdin stays open after the payload', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-pet-home-'));
  const event = { hook_event_name: 'UserPromptSubmit', prompt: '打开看板', session_id: 's-open' };

  const child = spawn('node', ['bin/trae-pet.js', 'hook'], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: tempHome, TRAE_PET_INPUT_JSON: '' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  // Deliver the event but intentionally keep the pipe open (never call end()),
  // mirroring how TRAE invokes the hook. The CLI must still finish promptly.
  child.stdin.write(JSON.stringify(event));

  const start = Date.now();
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve('timeout');
    }, 5000);
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  const elapsed = Date.now() - start;

  assert.equal(code, 0, `expected clean exit, got ${code} after ${elapsed}ms`);
  assert.ok(elapsed < 4000, `hook should not hang on an open stdin (took ${elapsed}ms)`);
  assert.match(stdout, /"hookEventName":"UserPromptSubmit"/);

  const statePath = path.join(
    tempHome, 'Library', 'Application Support', 'trae-pet', 'state.json',
  );
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.action, 'review');
});
