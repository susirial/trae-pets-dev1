import test from 'node:test';
import assert from 'node:assert/strict';

test('official website URL is allowed for external browser opening', async () => {
  const { OFFICIAL_WEBSITE_URL, isAllowedExternalUrl } = await import('../src/shared/external-links.ts');

  assert.equal(OFFICIAL_WEBSITE_URL, 'https://www.trae-pets.com/');
  assert.equal(isAllowedExternalUrl(OFFICIAL_WEBSITE_URL), true);
});

test('external URL allowlist rejects non-official or non-https targets', async () => {
  const { isAllowedExternalUrl } = await import('../src/shared/external-links.ts');

  assert.equal(isAllowedExternalUrl('https://example.com/'), false);
  assert.equal(isAllowedExternalUrl('http://www.trae-pets.com/'), false);
  assert.equal(isAllowedExternalUrl('not a url'), false);
});
