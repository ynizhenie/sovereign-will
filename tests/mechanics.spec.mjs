import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('with nothing to do a settler puts its weapon on its back; at work it holds its tool (#171)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'resting', {});
  expect(r).toMatchObject({ idleRests: true, activity: 'patrol', workerRested: false });
  expect(r.workerActivity).not.toBe('patrol');
  await page.evaluate(() => render());
  expect(errors).toEqual([]);
});
