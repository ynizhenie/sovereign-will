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

test('...and keep cooking past a few meals, up to enough to hire with (playtest: food stuck at 3, 90 raw)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'cookingWithTools', { seed: 'cook-tools-hire', food: 12 });
  expect(r.cooked).toBe(true);
  expect(r.food).toBeGreaterThan(15);
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

test('a walking settler turns its weapon the way it walks, not keep it where it last struck (playtest: a weapon stuck in one pose)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'facingWhileWalking', {});
  expect(r.pointsEastShare).toBeGreaterThan(0.8);
});

test('a building placed: back to Point; with Shift held, the build mode stays for another (playtest)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.wood = 100;
    for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, naturalRocks, waterTiles, desertTiles, beachTiles]) list.length = 0;
    invalidateAllPaths(); // free tiles to build on, whatever the map
    const place = (gx, gy) => { setMode('wall_wood'); mouse.x = gx * TILE_SIZE + 15; mouse.y = gy * TILE_SIZE + 15; };
    const g = getGridPos(townHall.x, townHall.y);
    place(g.gx + 4, g.gy + 4); handleCanvasClick(); const after = buildMode;
    shiftDown = true; place(g.gx + 5, g.gy + 4); handleCanvasClick(); const withShift = buildMode; shiftDown = false;
    return { after, withShift, placed: blueprints.length };
  });
  expect(r).toEqual({ after: 'interact', withShift: 'wall_wood', placed: 2 });
});

test('P pauses too, as Space does (playtest)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.keyboard.press('KeyP');
  expect(await page.evaluate(() => isPaused)).toBe(true);
  await page.keyboard.press('KeyP');
  expect(await page.evaluate(() => isPaused)).toBe(false);
});
