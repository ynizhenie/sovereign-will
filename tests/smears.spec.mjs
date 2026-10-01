import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('walking through blood or dung leaves a few footprints after it (#124)', async ({ page }) => {
  await openGame(page);
  const blood = await sim(page, 'footprints', { source: 'blood' });
  expect(blood).toEqual({ trails: 6, color: 'blood', beyond: true });
  const dung = await sim(page, 'footprints', { source: 'dung' });
  expect(dung).toEqual({ trails: 6, color: 'dung', beyond: true });
});

test('whoever left the dung does not step in it before walking off (#124)', async ({ page }) => {
  await openGame(page);
  // starts on its own pile and walks off: no footprints; coming back across it later: footprints
  const r = await sim(page, 'footprints', { source: 'dung', by: 'self' });
  expect(r.trails).toBe(0);
  expect(r.later).toBe(6);
});

test('after three meals a settler relieves itself near grass, away from the buildings (#124)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'relief', {})).toEqual({ needs: true, piles: 1, stillNeeds: false, meals: 0, awayFromBuildings: true, nearGrass: true });
});
