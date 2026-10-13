import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('arrows are drawn as arrows (#173)', async ({ page }) => {
  const errors = await openGame(page);
  const drawn = await page.evaluate(() => {
    window.sim.start('arrow-look');
    projectiles = [{ x: townHall.x + 60, y: townHall.y, vx: 3, vy: 1, damage: 1, life: 50, fromEnemy: false, startTile: getGridPos(townHall.x + 60, townHall.y) }];
    // an arrow is drawn turned the way it flies; a dot (a fireball) isn't turned at all
    const way = Math.atan2(1, 3);
    let arrows = 0;
    const original = ctx.rotate;
    ctx.rotate = function (angle) { if (Math.abs(angle - way) < 1e-9) arrows++; return original.call(this, angle); };
    try { render(); } finally { ctx.rotate = original; }
    return arrows;
  });
  expect(drawn).toBe(1);
  expect(errors).toEqual([]);
});
