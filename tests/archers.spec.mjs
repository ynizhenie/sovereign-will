import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('an archer hunting only shoots with a clear line, not into stones (#173)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'huntClearShots')).toEqual({ shots: true, blind: 0 });
});

test('an archer climbs a tower walled in on three sides (#173)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'climbWalledTower')).toEqual({ up: true });
});

test('an archer comes down from a walled-in tower onto a free tile, not into a wall (#173)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'climbDownInPocket')).toEqual({ onFreeTile: true, offTower: true });
});

test('arrows are drawn as arrows (#173)', async ({ page }) => {
  const errors = await openGame(page);
  const drawn = await page.evaluate(() => {
    window.sim.start('arrow-look');
    projectiles = [{ x: townHall.x + 60, y: townHall.y, vx: 3, vy: 1, damage: 1, life: 50, fromEnemy: false, startTile: getGridPos(townHall.x + 60, townHall.y) }];
    let arrows = 0;
    const original = drawArrow;
    window.drawArrow = p => { arrows++; return original(p); };
    try { render(); } finally { window.drawArrow = original; }
    return arrows;
  });
  expect(drawn).toBe(1);
  expect(errors).toEqual([]);
});
