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

test('a campfire in front of the base: nobody ends up standing inside it (playtest: settlers stuck in the fire)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campfireInFront', {});
  expect(r.longestInsideSeconds).toBeLessThan(2);
  expect(r.food).toBeGreaterThan(0); // and the cooking still gets done
});

test('a settler caught inside an obstacle walks out of it to where it is going', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'walksOutOfObstacle', {});
  expect(r.reached).toBe(true);
});

test('a settler carrying a load to a storage keeps to the one it chose, not turn between the hall and a warehouse (playtest jitter)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'deliveryJitter', {});
  expect(r.stuck).toBe(0);
});

test('spikes against the hall: settlers carrying wood home do not step on them (playtest: settlers killed by their own spikes)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'ownSpikesAtHall', {});
  expect(r.wood).toBeGreaterThan(0); // they did carry wood home
  expect(r.hurt).toBe(0);
});
