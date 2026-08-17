import test from 'node:test';
import assert from 'node:assert/strict';

test('pet scale clamps invalid and out-of-range values', async () => {
  const { clampPetScale, MIN_PET_SCALE, MAX_PET_SCALE } = await import(
    '../src/shared/pet-config.ts'
  );

  assert.equal(clampPetScale(0.1), MIN_PET_SCALE);
  assert.equal(clampPetScale(4), MAX_PET_SCALE);
  assert.equal(clampPetScale(Number.NaN), 1);
  assert.equal(clampPetScale(1.35), 1.35);
});

test('pet gesture keeps short movement as click and starts drag at threshold', async () => {
  const {
    PET_DRAG_THRESHOLD_PX,
    isPetDrag,
    shouldTriggerPetClick,
  } = await import('../src/app/renderer/pet/pointer-gesture.ts');

  const start = { x: 100, y: 100 };
  assert.equal(isPetDrag(start, { x: 105, y: 105 }), false);
  assert.equal(isPetDrag(start, { x: 100 + PET_DRAG_THRESHOLD_PX, y: 100 }), true);
  assert.equal(shouldTriggerPetClick(false, false), true);
  assert.equal(shouldTriggerPetClick(true, false), false);
  assert.equal(shouldTriggerPetClick(false, true), false);
});

test('window position clamps to positive and offset work areas', async () => {
  const { clampWindowPosition } = await import('../src/app/main/window-geometry.ts');
  const size = { width: 280, height: 400 };

  assert.deepEqual(
    clampWindowPosition({ x: -50, y: 900 }, size, { x: 0, y: 0, width: 1440, height: 900 }),
    { x: 0, y: 500 },
  );
  assert.deepEqual(
    clampWindowPosition(
      { x: -3000, y: 100 },
      size,
      { x: -1920, y: 0, width: 1920, height: 1080 },
    ),
    { x: -1920, y: 100 },
  );
});

test('bottom-center anchor remains stable while scaling and respects bounds', async () => {
  const { bottomCenterAnchoredPosition } = await import(
    '../src/app/main/window-geometry.ts'
  );
  const workArea = { x: 0, y: 0, width: 1440, height: 900 };

  assert.deepEqual(
    bottomCenterAnchoredPosition(
      { x: 1000, y: 500, width: 280, height: 400 },
      { width: 420, height: 600 },
      workArea,
    ),
    { x: 930, y: 300 },
  );

  assert.deepEqual(
    bottomCenterAnchoredPosition(
      { x: 0, y: 0, width: 280, height: 400 },
      { width: 700, height: 1000 },
      workArea,
    ),
    { x: 0, y: 0 },
  );
});
