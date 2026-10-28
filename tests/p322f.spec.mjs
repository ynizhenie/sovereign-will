import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: a step's distance goes with its length (dt), so a settler at half pace walks at half speed, and a longer step goes further

test('a settler walks as far as dt says; arrows too (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    resetTileIndex();
    const make = window.sim.helpers.makeSettler;
    const walk = dt => {
      const s = make(1, townHall.x + 8 * TILE_SIZE, townHall.y + 8 * TILE_SIZE, {});
      const x0 = s.x;
      moveEntityTowards(s, s.x + 300, s.y, 1, false, dt);
      return s.x - x0;
    };
    const full = walk(1 / 60), half = walk(1 / 120), twice = walk(2 / 60), none = walk(undefined);
    projectiles.length = 0;
    projectiles.push({ x: 0, y: 0, vx: 4, vy: 0, life: 100, damage: 0, fromEnemy: false, owner: null });
    tickProjectiles(1 / 120);
    const p = projectiles[0];
    return { full, half, twice, none, arrowX: p ? p.x : null, arrowLife: p ? p.life : null };
  });
  expect(r.full).toBeGreaterThan(0);
  expect(r.half).toBeCloseTo(r.full / 2, 5);
  expect(r.twice).toBeCloseTo(r.full * 2, 5);
  expect(r.none).toBeCloseTo(r.full, 5);
  expect(r.arrowX).toBeCloseTo(2, 5);
  expect(r.arrowLife).toBeCloseTo(99.5, 5);
  expect(errors).toEqual([]);
});
