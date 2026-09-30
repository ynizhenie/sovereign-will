import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a worker carries fuel to the campfire, cooks all the raw food and carries it home (#30, #106)', async ({ page }) => {
  await openGame(page);
  // 7 raw pieces -> 7 food; 5 pieces per fuel -> 2 wood, fetched in 2 trips
  expect(await sim(page, 'cookingRun', {}))
    .toEqual({ food: 12, rawMeat: 0, rawFish: 0, wheat: 0, wood: 0, coal: 0, maxCooks: 1, carriedFood: true, fuelTrips: 2 });
});

test('coal burns first (#30)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'cookingRun', { raw: { rawMeat: 8 }, fuel: { wood: 3, coal: 1 } });
  expect(r).toMatchObject({ food: 13, rawMeat: 0, coal: 0, wood: 2 });
});

test('all raw food gets cooked even with plenty of food; nothing without fuel (#106)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'cookingRun', { food: 100 })).toMatchObject({ food: 107, rawMeat: 0 });
  expect(await sim(page, 'cookingRun', { fuel: { wood: 0, coal: 0 } })).toMatchObject({ food: 5, rawMeat: 3 });
});

test('one cook per campfire (#30)', async ({ page }) => {
  await openGame(page);
  expect((await sim(page, 'cookingRun', { workers: 3 })).maxCooks).toBe(1);
});

test('boars give raw meat, fishing raw fish, farms grain; berries stay ready food (#31)', async ({ page }) => {
  await openGame(page);
  const y = await page.evaluate(() => ({
    boar: GAME_CONFIG.mapResources.boar.yield, farm: GAME_CONFIG.mapResources.farm.yield,
    fish: GAME_CONFIG.fishing.catch, berry: GAME_CONFIG.mapResources.berry_bush.yield
  }));
  expect(y).toEqual({ boar: { rawMeat: 6, leather: 2 }, farm: { wheat: 4 }, fish: { rawFish: 2 }, berry: { food: 2 } });
});
