import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, point 27: paths by hand, and the gaps between path tiles filled in

test('a Path tool in Zones marks tiles by hand (again: takes it off, Remove zone too); tiles the others close in on fill with the same path (#326, 27)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    for (const list of [game.trees, game.cacti, game.boulders, game.naturalRocks, game.waterTiles, game.ironOres, game.coalOres, game.berryBushes, game.grassList, game.sticks, game.pebbles]) list.length = 0;
    resetTileIndex();
    const g = getGridPos(townHall.x, townHall.y);
    const px = (dx, dy) => ({ x: (g.gx + 8 + dx) * TILE_SIZE + 15, y: (g.gy + 8 + dy) * TILE_SIZE + 15 });
    const mark = (dx, dy) => toggleZone(px(dx, dy).x, px(dx, dy).y, 'path');
    const at = (dx, dy) => isPathTile(px(dx, dy).x, px(dx, dy).y);
    const out = {};
    // by hand: it stays, again takes it off
    mark(0, 0); out.marked = pathZones.length === 1 && at(0, 0);
    mark(0, 0); out.unmarked = pathZones.length === 0 && !at(0, 0);
    // four tiles round one: it fills (the centre isn't grass), with the diagonals not made path by it
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) mark(dx, dy);
    out.plusCentre = at(0, 0); out.plusCorner = at(1, 1);
    pathZones.length = 0;
    // three of four sides: a notch fills
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) mark(dx + 10, dy);
    out.notch = at(10, 0);
    pathZones.length = 0;
    // the four diagonals: the middle fills
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) mark(dx + 20, dy);
    out.diagonals = at(20, 0);
    pathZones.length = 0;
    // the missing corner of a block of four
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) mark(dx + 30, dy);
    out.corner = at(30, 0);
    pathZones.length = 0;
    // two apart: nothing between them is made path
    mark(40, 0); mark(42, 0);
    out.apart = at(41, 0);
    // Remove zone takes a path tile off too
    toggleZone(px(40, 0).x, px(40, 0).y, 'clear'); out.cleared = !at(40, 0);
    pathZones.length = 0;
    return out;
  });
  expect(r).toEqual({ marked: true, unmarked: true, plusCentre: true, plusCorner: false, notch: true, diagonals: true, corner: true, apart: false, cleared: true });
  // the tool: its button sets the mode and a tap marks the tile
  const tool = await page.evaluate(() => {
    openTab('tab-farming');
    document.getElementById('btn-zone_path').click(); // (its sheet closed here: the button's own handler)
    const mode = game.buildMode;
    const g = getGridPos(townHall.x, townHall.y), x = (g.gx + 8) * TILE_SIZE + 15, y = (g.gy + 8) * TILE_SIZE + 15;
    mouse.x = x; mouse.y = y; handleCanvasClick(); // (a tap on the map in that mode)
    const marked = pathZones.length;
    handleCanvasClick(); // (again: off)
    return { mode, marked, off: pathZones.length };
  });
  expect(tool).toEqual({ mode: 'zone_path', marked: 1, off: 0 });
  expect(errors).toEqual([]);
});

test('paths the player marked are saved with the game, and drawn without error (#326, 27)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(async () => {
    isPaused = true;
    const g = getGridPos(townHall.x, townHall.y);
    const spot = { x: (g.gx + 8) * TILE_SIZE + 15, y: (g.gy + 8) * TILE_SIZE + 15 };
    for (const list of [game.trees, game.boulders, game.naturalRocks, game.waterTiles]) list.length = 0;
    resetTileIndex();
    toggleZone(spot.x, spot.y, 'path');
    render();
    await saveCurrentGame();
    const data = await saveDataOf(loadSaves()[`world:${worldSeed.value}`]);
    pathZones.length = 0;
    await loadGame(data);
    return { restored: pathZones.length, shown: isPathTile(spot.x, spot.y) };
  });
  expect(r).toEqual({ restored: 1, shown: true });
  expect(errors).toEqual([]);
});
