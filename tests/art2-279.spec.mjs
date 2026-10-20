import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279), part E2: a tree falls, then its log is cut up; paths; iron ore
test('a felled tree falling and lying, paths and iron ore all drawn, with no error (#279, 1, 48, 49)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const g = getGridPos(townHall.x, townHall.y);
    game.paths = {};
    for (let i = 2; i < 8; i++) game.paths[`${g.gx + i},${g.gy}`] = 1;
    for (let i = 1; i < 4; i++) game.paths[`${g.gx + 2 + i},${g.gy + i}`] = 0.5;
    const at = (dx, extra) => ({ x: townHall.x + dx * TILE_SIZE, y: townHall.y - 3 * TILE_SIZE, hp: 3, isGrowing: false, ...extra });
    trees.push(at(3, { fallen: true, fallAt: game.pathTick, fallAngle: Math.PI, hp: 1.8 }));
    trees.push(at(5, { fallen: true, fallAt: -999, fallAngle: 0, hp: 0.9 }));
    trees.push(makeAppleTree(at(7, { fallen: true, fallAt: -999, fallAngle: 0, hp: 0.1 })));
    drawPaths();
    for (const t of trees) drawTreeArt(t);
    // (the iron ore icon: its colour checked in p298-small.spec.mjs, #298 7)
    const c = document.createElement('canvas'); c.width = c.height = 32;
    drawIcon(c.getContext('2d'), 'ironOre', 16, 16, 32);
    return {};
  });
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});
