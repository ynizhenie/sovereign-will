import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
test('a wave gathers where it came in before it attacks, and a big one has a commander giving orders (#279, 44, 45)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveMusters', {});
  expect(r.size).toBeGreaterThanOrEqual(6);
  expect(r.early).toBeLessThan(5 * 30); // (gathering by the edge, a tile and a half past the red band)
  expect(r.later).toBeGreaterThan(150); // (then off)
  expect(r.captain).toBe(true);
  expect(r.ordered).toBeGreaterThan(0);
});

test('scouts between waves walk the red band, aren\'t enemies; pointed at, one is hunted and runs off (#279, 23)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'scoutsBetweenWaves', {});
  expect(r).toEqual({ count: 1, inBand: true, notEnemy: true, hunted: true, goneOff: true });
});

test('every camp layout builds, the same camp for its seed; the party starts past the camp\'s red line (#279, 34, 37)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campLayouts', {});
  for (const layout of ['square', 'round', 'scattered', 'fort']) expect(r[layout]).toMatchObject({ same: true, pastLine: true, outpost: true });
  expect(r.scattered.walls).toBe(0);
  expect(r.fort.walls).toBeGreaterThan(r.square.walls);
});

test('a scout sent to the camp looks it over and comes home; the camp stays (#279, 33)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'scoutTheCamp', {});
  expect(r).toMatchObject({ sent: true, looked: true, cols: 26, campStays: true, phase: null });
  expect(errors).toEqual([]);
});

test('the camp\'s bar sits over the bottom panel (#279, 32)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'campOpens', {});
  expect(await page.evaluate(() => document.getElementById('raid-bar').parentElement.id)).toBe('hud-bottom');
  await expect(page.locator('#raid-bar [data-raid-act="scout"]')).toBeVisible();
});
