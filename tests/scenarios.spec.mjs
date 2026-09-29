import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('scenario files in tests/scenarios are loaded next to tests/sim.js', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'scenarioFilesLoad', {});
  expect(r.settlers).toBe(1);
  expect(errors).toEqual([]);
});
