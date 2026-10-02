import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('damaged buildings and the town hall are drawn with cracks, the more the worse (#157)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('damage-look');
    const at = window.sim.helpers.tileCenter;
    const g = getGridPos(townHall.x, townHall.y);
    const whole = window.sim.helpers.placeBuilding('wall_stone', at(g.gx + 4, g.gy).x, at(g.gx + 4, g.gy).y);
    const hurt = window.sim.helpers.placeBuilding('wall_stone', at(g.gx + 5, g.gy).x, at(g.gx + 5, g.gy).y);
    hurt.hp = hurt.maxHp * 0.2;
    townHall.hp = 50;
    const drawn = [];
    const original = drawDamage;
    window.drawDamage = (x, y, half, share) => { drawn.push([x, y, Math.round(share * 100)]); return original(x, y, half, share); };
    try { render(); } finally { window.drawDamage = original; }
    return {
      hurt: drawn.some(([x, y, share]) => x === hurt.x && y === hurt.y && share === 20),
      whole: drawn.some(([x, y, share]) => x === whole.x && y === whole.y && share === 100),
      hall: drawn.some(([x, y, share]) => x === townHall.x && y === townHall.y && share === 50)
    };
  });
  expect(r).toEqual({ hurt: true, whole: true, hall: true });
  expect(errors).toEqual([]);
});
