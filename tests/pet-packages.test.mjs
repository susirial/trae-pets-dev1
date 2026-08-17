import test from 'node:test';
import assert from 'node:assert/strict';

test('resourcePaths exposes package and public sound directories', async () => {
  const { resourcePaths } = await import('../src/shared/paths.ts');

  const paths = resourcePaths('/tmp/trae-pet-resources');

  assert.equal(paths.petsDir, '/tmp/trae-pet-resources/pets');
  assert.equal(paths.soundsDir, '/tmp/trae-pet-resources/sounds');
});

test('listPetPackages returns complete built-in pet packages only', async () => {
  const { listPetPackages } = await import('../src/app/main/pet-packages.ts');

  const packages = listPetPackages('/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets');
  const ids = packages.map((pkg) => pkg.id).sort();

  assert.ok(['little-bro', 'magic-rabbit', 'ryu', 'shadow-puppetry', 'trae', 'yong-girl']
    .every((id) => ids.includes(id)));
});

test('resolvePetVisual resolves a state webp from the selected package', async () => {
  const { resolvePetVisual } = await import('../src/app/main/pet-packages.ts');

  const asset = resolvePetVisual(
    '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
    'trae',
    'idle',
  );

  assert.equal(asset.file, 'idle.webp');
  assert.match(asset.url ?? '', /^trae-pet:\/\/pet-asset\//);
  assert.equal(asset.error, null);
});

test('resolvePetAudio returns null url when package audio is absent', async () => {
  const { resolvePetAudio } = await import('../src/app/main/pet-packages.ts');

  const asset = resolvePetAudio(
    '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
    'trae',
    'idle',
  );

  assert.equal(asset.url, null);
  assert.equal(asset.error, null);
});

test('resolvePetAudio finds normalized state audio inside the package audio dir', async () => {
  const { resolvePetAudio } = await import('../src/app/main/pet-packages.ts');

  const asset = resolvePetAudio(
    '/Users/susirial/work_station/SOLO_MTC_SHOW/trae-pet_v1.0/resources/pets',
    'magic-rabbit',
    'idle',
  );

  assert.equal(asset.file, 'idle.m4a');
  assert.match(asset.url ?? '', /^trae-pet:\/\/pet-asset\/magic-rabbit\/audio\/idle\.m4a$/);
  assert.equal(asset.error, null);
});
