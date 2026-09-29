import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('with food running low a worker cooks all the raw food at a campfire, burning wood (#30, #31)', async ({ page }) => {
  await openGame(page);
  // 7 raw pieces -> 7 food; 4 pieces per wood -> 2 wood
  expect(await sim(page, 'cookingRun', {}))
    .toEqual({ food: 12, rawMeat: 0, rawFish: 0, wheat: 0, wood: 0, coal: 0, maxCooks: 1 });
});

test('coal burns first and lasts twice as long (#30)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'cookingRun', { raw: { rawMeat: 8 }, fuel: { wood: 3, coal: 1 } });
  expect(r).toMatchObject({ food: 13, rawMeat: 0, coal: 0, wood: 3 });
});

test('no cooking with enough food, or without fuel (#30)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'cookingRun', { food: 25 })).toMatchObject({ food: 25, rawMeat: 3 });
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
