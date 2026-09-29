import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('water and rock tiles join their own kind; rendering stays error-free (#79)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('terrain-test');
    const tiles = getTileIndex();
    // a lone tile is open on every side; a tile in a row of three is joined left and right
    const lone = openSides(new Set(['105,105']), 105, 105);
    const row = new Set(['75,105', '105,105', '135,105']);
    const middle = openSides(row, 105, 105);
    // rock joins ore: every ore tile is in the set rock tiles join
    const oreJoinsRock = [...ironOres, ...coalOres].every(o => tiles.rockAndOre.has(`${o.x},${o.y}`));
    for (const seed of ['maze-283', 'maze-137', 'shot']) { window.sim.start(seed); render(); }
    return { lone, middle, oreJoinsRock };
  });
  expect(r.lone).toEqual({ n: true, s: true, w: true, e: true });
  expect(r.middle).toEqual({ n: true, s: true, w: false, e: false });
  expect(r.oreJoinsRock).toBe(true);
  expect(errors).toEqual([]);
});
