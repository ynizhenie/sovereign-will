import { test, expect } from './helpers.mjs';
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
    // cracks are lines drawn over a building: count the line points inside each one's square
    const points = [];
    const original = ctx.lineTo;
    ctx.lineTo = function (x, y) { points.push([x, y]); return original.call(this, x, y); };
    try { drawTownHall(); drawBuildings(); } finally { ctx.lineTo = original; }
    const inside = (b, half) => points.filter(([x, y]) => Math.abs(x - b.x) <= half && Math.abs(y - b.y) <= half).length;
    return { hurt: inside(hurt, 14) > 0, whole: inside(whole, 14) === 0, hall: inside(townHall, townHall.radius) > 0 };
  });
  expect(r).toEqual({ hurt: true, whole: true, hall: true });
  expect(errors).toEqual([]);
});
