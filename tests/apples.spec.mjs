import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('ripe apples are picked by a worker with no tool; the woodcutter leaves the apple tree (#34)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'appleOrchard', { mark: 'none' }))
    .toEqual({ appleTreeStands: true, plainTreeStands: false, picked: true, foodUp: true });
});

test('an apple tree marked with no apples on it is felled; marked with apples, they get picked (#34)', async ({ page }) => {
  await openGame(page);
  const bare = await sim(page, 'appleOrchard', { mark: 'bare', ripe: false });
  expect(bare.appleTreeStands).toBe(false);
  const ripe = await sim(page, 'appleOrchard', { mark: 'ripe' });
  expect(ripe).toMatchObject({ appleTreeStands: true, picked: true });
});

test('generated maps have a few apple trees, the same ones for the same seed (#34)', async ({ page }) => {
  await openGame(page);
  const seeds = ['maze-283', 'maze-137', 'shot', 'apples-a', 'apples-b'];
  const first = await sim(page, 'appleShare', { seeds });
  const again = await sim(page, 'appleShare', { seeds });
  expect(again.map(m => m.keys)).toEqual(first.map(m => m.keys));
  const apple = first.reduce((n, m) => n + m.apple, 0), grown = first.reduce((n, m) => n + m.grown, 0);
  expect(apple).toBeGreaterThan(0);
  expect(apple / grown).toBeGreaterThan(0.04);
  expect(apple / grown).toBeLessThan(0.2);
});
