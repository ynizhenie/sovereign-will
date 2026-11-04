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
  expect(r).toEqual({ count: 1, inBand: true, notEnemy: true, hunted: true, stays: true, goneOff: true });
});

test('one persistent enemy camp stays on the main map (#255)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'campLayouts', {});
  expect(r).toMatchObject({ same: true, campExists: true, sameWorld: true, outpost: 0, campfires: 1 });
  expect(r.guards).toBeGreaterThan(0);
});

test('preparation does not start the tent assault or enemy attacks; both begin with the wave', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'wavePreparationTiming', {});
  expect(r).toEqual({
    prepTentAssault: false,
    tentHeldFire: true,
    tentFiredAfterStart: true,
    enemyHeldFire: true,
    enemyAttackedAfterStart: true,
    tentAssaultAfterStart: true
  });
  expect(errors).toEqual([]);
});

test('a scout sent from the town hall returns safely; the camp stays (#255)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'scoutTheCamp', {});
  expect(r).toMatchObject({ sent: true, looked: true, campStays: true, phase: null, raidActive: false });
  expect(errors).toEqual([]);
});

test('the town hall offers a raid and a scout for the persistent camp (#255)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'campOpens', {});
  await page.evaluate(() => openHallCard());
  await expect(page.locator('#card-actions')).toContainText('Отправить в набег');
  await expect(page.locator('#card-actions')).toContainText('Отправить разведчика');
});
