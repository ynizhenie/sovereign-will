import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a damaged wall is repaired only once ordered, a share of its cost per step (#24)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'wallRepair', {});
  expect(r.stepCost).toEqual({ stone: 1 }); // 20% of 5 stone, rounded up
  expect(r.beforeOrder).toBe(0.5);
  expect(r.after).toBe(1);
  expect(r.stillOrdered).toBe(false);
  expect(r.stoneSpent).toBe(2); // two steps of 25% hp
});

test('Repair all orders every damaged building and the town hall, and workers mend them (#24)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'repairAll', {})).toEqual({ ordered: true, allMended: true });
});
