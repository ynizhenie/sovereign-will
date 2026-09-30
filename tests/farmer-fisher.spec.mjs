import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a farmer with nothing to plant gathers grass (#106)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'idleFarmer', {})).toEqual({ grassLeft: 0 });
});

test('a farmer with a watering can fills up at water and waters crops, which then grow twice as fast (#106)', async ({ page }) => {
  await openGame(page);
  const withCan = await sim(page, 'watering', { can: true });
  const without = await sim(page, 'watering', { can: false });
  expect(without.watered).toBe(0);
  expect(withCan.watered).toBe(4); // two trips to the water: 3 per fill
  expect(Math.max(...withCan.growth)).toBeGreaterThan(Math.max(...without.growth));
});

test('fishers take worms off old corpses (1, 2 off a big one) and fish with them first (#106)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'worms', {});
  expect(r.wormsGathered).toBe(3);
  expect(r.freshUntouched).toBe(true);
  expect(r.wormsSpent).toBeGreaterThan(0);
  expect(r.caughtFish).toBe(true);
});

test('a harvested wheat plot always gives a seed back (#106)', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => GAME_CONFIG.mapResources.farm.yield)).toEqual({ wheat: 4, wheatSeeds: 1 });
});
