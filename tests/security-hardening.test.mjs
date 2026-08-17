import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('electron-builder enables the required Electron fuses', () => {
  const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  const expected = {
    runAsNode: false,
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  };
  assert.match(builder, /^electronFuses:\s*$/m);
  for (const [name, value] of Object.entries(expected)) {
    assert.match(builder, new RegExp(`^\\s{2}${name}: ${value}$`, 'm'));
  }
});

test('BrowserWindows use sandboxed production-safe web preferences and navigation hooks', () => {
  const main = fs.readFileSync(path.join(root, 'src/app/main/index.ts'), 'utf8');
  assert.equal((main.match(/sandbox:\s*true/g) ?? []).length, 2);
  assert.equal((main.match(/contextIsolation:\s*true/g) ?? []).length, 2);
  assert.equal((main.match(/nodeIntegration:\s*false/g) ?? []).length, 2);
  assert.equal((main.match(/devTools:\s*!app\.isPackaged/g) ?? []).length, 2);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(main, /will-navigate/);
  assert.match(main, /before-input-event/);
});

test('navigation helper only accepts the loaded page and blocks DevTools shortcuts', async () => {
  const { isAllowedPageNavigation, isDevToolsShortcut, safeRendererPath } = await import(
    '../src/app/main/security.ts'
  );
  const page = 'trae-pet://app/settings/index.html';
  assert.equal(isAllowedPageNavigation(page, page), true);
  assert.equal(isAllowedPageNavigation(`${page}#form`, `${page}#other`), true);
  assert.equal(isAllowedPageNavigation(page, 'https://example.com/'), false);
  assert.equal(isAllowedPageNavigation(page, 'file:///tmp/index.html'), false);
  assert.equal(safeRendererPath('/pet/index.html'), 'pet/index.html');
  assert.equal(safeRendererPath('/assets/pet-A1_b.js'), 'assets/pet-A1_b.js');
  assert.equal(safeRendererPath('/assets/pet-A1_b.css'), 'assets/pet-A1_b.css');
  assert.equal(safeRendererPath('/../package.json'), null);
  assert.equal(safeRendererPath('/assets/payload.html'), null);
  assert.equal(isDevToolsShortcut({ key: 'F12' }), true);
  assert.equal(isDevToolsShortcut({ key: 'i', control: true, shift: true }), true);
  assert.equal(isDevToolsShortcut({ key: 'I', meta: true, shift: true }), true);
  assert.equal(isDevToolsShortcut({ key: 'i', meta: true, alt: true }), true);
  assert.equal(isDevToolsShortcut({ key: 'i', meta: true }), false);
});

test('packaged renderer loads only through the restricted custom protocol', () => {
  const main = fs.readFileSync(path.join(root, 'src/app/main/index.ts'), 'utf8');
  assert.match(main, /trae-pet:\/\/app\/\$\{page\}\/index\.html/);
  assert.match(main, /url\.hostname === 'app'/);
  assert.match(main, /safeRendererPath\(url\.pathname\)/);
  assert.doesNotMatch(main, /pathToFileURL/);
});

test('production menu keeps edit/window/app roles without DevTools', () => {
  const main = fs.readFileSync(path.join(root, 'src/app/main/index.ts'), 'utf8');
  const menu = main.slice(
    main.indexOf('function setupApplicationMenu'),
    main.indexOf('function setupTray'),
  );
  assert.match(menu, /role: 'appMenu'/);
  assert.match(menu, /role: 'editMenu'/);
  assert.match(menu, /role: 'windowMenu'/);
  assert.doesNotMatch(menu, /toggleDevTools|devtools/i);
  assert.match(menu, /if \(!app\.isPackaged\) return/);
});

test('production and development CSP differ only where development connectivity needs it', async () => {
  const { contentSecurityPolicy } = await import('../src/shared/content-security-policy.ts');
  const production = contentSecurityPolicy(true);
  const development = contentSecurityPolicy(false);
  assert.match(production, /script-src 'self'/);
  assert.match(production, /connect-src 'none'/);
  assert.doesNotMatch(production, /localhost|ws:/);
  assert.match(production, /object-src 'none'/);
  assert.match(production, /base-uri 'none'/);
  assert.match(production, /frame-src 'none'/);
  assert.match(production, /form-action 'none'/);
  assert.match(production, /style-src 'self' 'unsafe-inline'/);
  assert.match(production, /img-src 'self' data: blob: trae-pet:/);
  assert.match(development, /http:\/\/localhost:\*/);
  assert.match(development, /ws:\/\/localhost:\*/);
  for (const page of ['pet', 'settings']) {
    const html = fs.readFileSync(
      path.join(root, `src/app/renderer/${page}/index.html`),
      'utf8',
    );
    assert.doesNotMatch(html, /Content-Security-Policy|default-src/);
  }
});

test('notary retry only retries transient transport failures', async () => {
  const { submitNotarizationWithRetry } = await import('../scripts/notary-retry.mjs');
  let attempts = 0;
  const accepted = submitNotarizationWithRetry(() => {
    attempts += 1;
    if (attempts === 1) throw new Error('Connection reset by peer');
    return { status: 'Accepted', id: 'ok' };
  }, { sleep: () => {}, delays: [0] });
  assert.equal(accepted.id, 'ok');
  assert.equal(attempts, 2);

  attempts = 0;
  assert.throws(
    () => submitNotarizationWithRetry(() => {
      attempts += 1;
      return { status: 'Invalid', id: 'rejected' };
    }, { sleep: () => {} }),
    /Apple 公证未通过：Invalid/,
  );
  assert.equal(attempts, 1);
});

test('mac signing verification includes a repacked ASAR rejection test', () => {
  const verifier = fs.readFileSync(path.join(root, 'scripts/mac-signing.mjs'), 'utf8');
  const tamper = fs.readFileSync(path.join(root, 'scripts/verify-asar-tamper.mjs'), 'utf8');
  assert.match(verifier, /verifyAsarTamperRejection\(appPath\)/);
  assert.match(tamper, /asar\.extractAll/);
  assert.match(tamper, /asar\.createPackage/);
  assert.match(tamper, /codesign.*--force.*--deep.*--sign/s);
  assert.match(tamper, /篡改后的 app\.asar 仍可保持运行/);
});
