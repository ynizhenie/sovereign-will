import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('during an attack a medic heals the wounded, soldiers first, one herb per 30 hp (#28)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'medicUnderAttack', { herbs: 5, seconds: 6 });
  expect(r.soldierHp).toBe(100); // 20 + 3 herbs x 30, capped at 100
  // the rest of the herbs went on the worker, 30 hp each
  expect(r.workerHp).toBe(Math.min(100, 50 + (5 - r.herbsLeft - 3) * 30));
});

test('without herbs a medic can not heal (#28)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'medicUnderAttack', { herbs: 0, seconds: 6 });
  expect(r).toEqual({ soldierHp: 20, workerHp: 50, herbsLeft: 0, inBag: 0 });
});

test('when not busy a medic gathers grass and brings herbs home (#28)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'medicGathers', {});
  expect(r.grassLeft).toBe(0);
  expect(r.herbs).toBeGreaterThanOrEqual(3); // one per grass, plus the odd bonus
});

test('the medbag turns a settler with nothing into the medic (#28)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'medbagGoesToEmptyHanded', {})).toEqual({ medic: 3, leather: 0, herbs: 0 });
});
