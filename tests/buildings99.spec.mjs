import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a guard climbing down from a tower lands on a free tile the town hall can reach (#99)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'towerExit', {})).toEqual({ inWall: false, reachable: true, besideTower: true });
});

test('one settler at a time carries to the smelter, which holds at most 6 ore, 6 coal and 6 iron (#99)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'smelterRush', {});
  expect(r.maxCarriers).toBe(1);
  expect(r.maxOre).toBeLessThanOrEqual(6);
  expect(r.maxCoal).toBeLessThanOrEqual(6);
  expect(r.ironHome).toBeGreaterThan(0);
  // nobody takes the iron away: smelting stops at 6
  const full = await sim(page, 'smelterRush', { collect: false, seconds: 60 });
  expect(full.maxIron).toBe(6);
});
