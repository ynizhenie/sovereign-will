import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';











test('a building placed: back to Point; with Shift held, the build mode stays for another (playtest)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.wood = 100;
    for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, naturalRocks, waterTiles, desertTiles, beachTiles, boars]) list.length = 0;
    invalidateAllPaths(); // free tiles to build on, whatever the map (a boar wandering onto one would take it)
    const place = (gx, gy) => { setMode('wall_wood'); mouse.x = gx * TILE_SIZE + 15; mouse.y = gy * TILE_SIZE + 15; };
    const g = getGridPos(townHall.x, townHall.y);
    place(g.gx + 4, g.gy + 4); handleCanvasClick(); const after = buildMode;
    const shift = type => window.dispatchEvent(new KeyboardEvent(type, { key: 'Shift' }));
    shift('keydown'); place(g.gx + 5, g.gy + 4); handleCanvasClick(); const withShift = buildMode; shift('keyup');
    return { after, withShift, placed: blueprints.length };
  });
  expect(r).toEqual({ after: 'interact', withShift: 'wall_wood', placed: 2 });
});

test('P pauses too, as Space does (playtest)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.keyboard.press('KeyP');
  expect(await page.evaluate(() => isPaused)).toBe(true);
  await page.keyboard.press('KeyP');
  expect(await page.evaluate(() => isPaused)).toBe(false);
});
