import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('fireflies fly over some grass at dusk and night, not by day', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    fogEnabled = false;
    const center = { x: townHall.x, y: townHall.y };
    camera.x = center.x; camera.y = center.y;
    game.grassList = [];
    for (let gy = -12; gy <= 12; gy++) {
      for (let gx = -12; gx <= 12; gx++) {
        game.grassList.push({ x: center.x + gx * TILE_SIZE, y: center.y + gy * TILE_SIZE, hp: 1, maxHp: 1 });
      }
    }
    const c = GAME_CONFIG.daytime, originalArc = ctx.arc;
    const countAt = time => {
      dayTime = time;
      let arcs = 0;
      ctx.arc = function (...args) { arcs++; return originalArc.apply(this, args); };
      try { drawFireflies(); } finally { ctx.arc = originalArc; }
      return arcs;
    };
    return {
      day: countAt(c.morning + 10),
      evening: countAt(c.morning + c.day + c.evening / 2),
      night: countAt(c.morning + c.day + c.evening + 10)
    };
  });
  expect(r.day).toBe(0);
  expect(r.evening).toBeGreaterThan(0);
  expect(r.night).toBeGreaterThan(0);
});
