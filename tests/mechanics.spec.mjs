import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a killed boar bleeds, drops as a carcass and is butchered where it lies before the meat is carried (#172)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'butcherBoar', {});
  expect(r).toMatchObject({ killed: true, worked: true, gone: true, bled: true, dung: true });
  expect(r.butcherSeconds).toBeGreaterThanOrEqual(1.9);
  expect(r.butcherSeconds).toBeLessThan(4);
});

test('every settler has its own hunger clock, and goes off after five meals (#178)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'ownHunger', {});
  expect(r.distinct).toBe(4);
  expect(r.eaten).toBe(5);
  expect(r.needsAfter).toEqual([false, false, false, false, true]);
});

test('the first wave is lighter, and waves grow with the player army; never empty (#179)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveSizes', {});
  expect(r.first).toBeLessThan(r.second);
  expect(r.small).toBeLessThan(r.second);
  expect(r.big).toBeGreaterThan(r.second);
  expect(r.firstTiny).toBeGreaterThanOrEqual(1);
});

test('with nothing to do a settler puts its weapon on its back; at work it holds its tool (#171)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'resting', {});
  expect(r).toMatchObject({ idleRests: true, activity: 'patrol', workerRested: false });
  expect(r.workerActivity).not.toBe('patrol');
  await page.evaluate(() => render());
  expect(errors).toEqual([]);
});
