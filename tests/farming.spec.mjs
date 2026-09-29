import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a farmer with a hoe plants the wheat and sapling zones, harvests and replants (#29)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'farmZonesPlanted', { farmer: true });
  expect(r).toMatchObject({ wheat: 3, saplings: 2, seedsSpent: 3, saplingsSpent: 2, harvestedFood: true, replanted: 3 });
});

test('only farmers plant the zones: a worker without a hoe leaves them (#29)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'farmZonesPlanted', { farmer: false });
  expect(r).toMatchObject({ wheat: 0, saplings: 0, seedsSpent: 0, saplingsSpent: 0 });
});

test('zone tiles are painted, switched, toggled off and cleared; never on water (#29)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'farmZonePainting', {})).toEqual({
    afterWheat: ['wheat'], afterSapling: ['sapling'], afterToggleOff: 0, afterClear: 0, onWater: 0
  });
});
