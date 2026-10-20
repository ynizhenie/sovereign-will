import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part C3: zones
test('a relief zone: settlers go there, 5 heaps at most, its dung isn\'t smeared (#279, 50)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'reliefZone', {});
  expect(r.inZone).toBeLessThanOrEqual(5); // (never more)
  expect(r.inZone).toBeGreaterThanOrEqual(4);
  expect(r.heaps).toBe(7); // (the others as ever)
  expect(r.allMarked).toBe(true);
  expect(r.smeared).toBe(false);
});

test('soldiers\' posts marked: one soldier on each before a wave, the rest posted as ever (#279, 50)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'postZones', {})).toEqual({ onTiles: 2, everyoneHasAPost: true, standing: 2 });
});
