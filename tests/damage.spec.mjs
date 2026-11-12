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
    // cracks are lines drawn over a building: count the line points inside each one's square, damaged against
    // whole (the buildings' own look has lines too, #251)
    const draw = () => {
      const points = [];
      const original = ctx.lineTo;
      ctx.lineTo = function (x, y) { points.push([x, y]); return original.call(this, x, y); };
      try { drawTownHall(); drawBuildings(); } finally { ctx.lineTo = original; }
      return (b, half) => points.filter(([x, y]) => Math.abs(x - b.x) <= half && Math.abs(y - b.y) <= half).length;
    };
    const wholeHall = draw()(townHall, townHall.radius);
    townHall.hp = 50;
    const inside = draw();
    return { hurt: inside(hurt, 14) > inside(whole, 14), hall: inside(townHall, townHall.radius) > wholeHall };
  });
  expect(r).toEqual({ hurt: true, hall: true });
  expect(errors).toEqual([]);
});

test('damage textures are clipped to small building silhouettes', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(async () => {
    const { drawDamage } = await import('/js/domains/economy/building/building.draw.js');
    const originalEllipse = ctx.ellipse, originalClip = ctx.clip;
    const ellipses = [], clips = [];
    ctx.ellipse = function (...args) { ellipses.push(args); return originalEllipse.apply(this, args); };
    ctx.clip = function (...args) { clips.push(args); return originalClip.apply(this, args); };
    try {
      drawDamage(150, 150, 14, 0.2, 'campfire');
      drawDamage(200, 150, 14, 0.2, 'tent');
    } finally {
      ctx.ellipse = originalEllipse;
      ctx.clip = originalClip;
    }
    return { silhouetteClips: clips.length, campfireShape: ellipses.some(([, , rx, ry]) => rx === 13 && ry === 9) };
  });
  expect(result).toEqual({ silhouetteClips: 2, campfireShape: true });
  expect(errors).toEqual([]);
});
