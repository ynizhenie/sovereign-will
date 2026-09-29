import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('spikes hurt once per visit and break after 5 visits (#32)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'spikeVisits', {});
  // [damage taken so far, uses left] after each move
  expect(r.log.slice(0, 4)).toEqual([[25, 4], [25, 4], [25, 4], [50, 3]]);
  expect(r.log.at(-1)).toEqual([125, 0]);
  expect(r.trapGone).toBe(true);
});

test('settlers walk around spikes (#32)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'settlerAvoidsSpikes', {})).toEqual({ found: true, overSpikes: false });
});

test('with no safe way in, raiders cross the spikes instead of breaking walls (#32)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'spikeGap', {});
  expect(r.spikeSteps).toBeGreaterThan(0);
  expect(r.wallsBroken).toBe(0);
});
