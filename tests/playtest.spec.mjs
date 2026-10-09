import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('with no food left, workers holding tools cook the raw food too (playtest: food 0, raw meat piling up)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'cookingWithTools', {});
  expect(r.cooked).toBe(true);
  expect(r.food).toBeGreaterThan(0);
  expect(r.rawMeat).toBeLessThan(20);
  expect(r.tools).toEqual(['hoe', 'pickaxe', 'none']); // they keep their tools
});

test('...and do so in a wave too, when the food has run out', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'cookingWithTools', { seed: 'cook-tools-wave', wave: true });
  expect(r.food).toBeGreaterThan(0);
});

test('with food to spare, workers holding tools stay at their own work', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'cookingWithTools', { seed: 'cook-tools-fed', food: 100, seconds: 20 });
  expect(r.cooked).toBe(false);
});

test('a badly hurt settler healing at a tent turns on an enemy hitting it there, not stand and die (playtest)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'healUnderAttack', {});
  expect(r.mostly).not.toBe('healAtTent');
  expect(r.enemyHurt).toBe(true);
});
