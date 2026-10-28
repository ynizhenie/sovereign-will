import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: walking distances shared between settlers standing together and kept while one only moves a tile or two

test('a settler walking a tile or two keeps its map of walking distances; one beside it shares it; a wall changes it at once (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    resetTileIndex();
    const { makeSettler: make, placeBuilding } = window.sim.helpers;
    const a = make(1, townHall.x + 6 * TILE_SIZE, townHall.y, {});
    const b = make(2, a.x + TILE_SIZE, a.y, {});
    settlers.push(a, b);
    const first = getSettlerReach(a);
    const same = getSettlerReach(b) === first; // (next to it: shared)
    a.x += TILE_SIZE;
    const kept = getSettlerReach(a) === first; // (a tile on: the same map)
    a.x += 6 * TILE_SIZE;
    const here = getGridPos(a.x, a.y);
    const moved = getReachSteps(getSettlerReach(a), here.gx, here.gy) === 0; // (far on: worked out from where it is)
    // a wall round a tile: not reachable from outside, at once
    const g = getGridPos(a.x, a.y);
    const target = { gx: g.gx, gy: g.gy + 6 };
    const tx = target.gx * TILE_SIZE + 15, ty = target.gy * TILE_SIZE + 15;
    const before = getReachSteps(getSettlerReach(a), target.gx, target.gy) !== -1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) placeBuilding('wall_wood', tx + dx * TILE_SIZE, ty + dy * TILE_SIZE);
    resetTileIndex();
    const after = getReachSteps(getSettlerReach(a), target.gx, target.gy) !== -1;
    return { same, kept, moved, before, after };
  });
  expect(r).toEqual({ same: true, kept: true, moved: true, before: true, after: false });
  expect(errors).toEqual([]);
});
