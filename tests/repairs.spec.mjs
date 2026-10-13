import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('Repair all orders every damaged building and the town hall, and workers mend them (#24)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'repairAll', {})).toEqual({ ordered: true, allMended: true });
});
