import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// (the loading screen and the page's first showing wait on the browser's frames: its own here, see helpers.mjs)
test.use({ frameMs: 0 });

// The friend's #326, the bugs and small things: in the page

test('the page shows once it\'s made; Point on a tile: only its things, a settler standing there too, wheat named (#326)', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => document.body.classList.contains('booting'))).toBe(false);
  await page.click('#play-button');
  await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    const g = getGridPos(townHall.x + 150, townHall.y), x = g.gx * TILE_SIZE + 15, y = g.gy * TILE_SIZE + 15;
    window.stick = addMapResource('stick', x - 6, y);
    window.pebble = addMapResource('pebble', x + 4, y + 3);
    window.next = addMapResource('pebble', x + 18, y); // (on the next tile, within the old reach)
    buildMode = 'interact'; mouse.x = x + 12; mouse.y = y;
    handleCanvasClick();
  });
  const rows = page.locator('#pick-menu button');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'Камешек' }).click();
  expect(await page.evaluate(() => [window.stick.priority, window.pebble.priority, window.next.priority])).toEqual([0, 1, 0]);

  // a settler on the tile: a row of its own, which selects it
  await page.evaluate(() => {
    const s = window.sim.helpers.makeSettler(1, window.stick.x + 4, window.stick.y);
    settlers = [s]; window.s = s; selectedSettler = null;
    mouse.x = s.x; mouse.y = s.y;
    handleCanvasClick();
  });
  await expect(rows).toHaveCount(3);
  await rows.first().click();
  expect(await page.evaluate(() => selectedSettler === window.s)).toBe(true);

  // a ripe wheat plot is called wheat
  await page.evaluate(() => {
    const plot = { x: window.stick.x, y: window.stick.y + TILE_SIZE, growth: 100, priority: 0 };
    farmPlots.push(plot); addMapResource('stick', plot.x + 4, plot.y);
    mouse.x = plot.x; mouse.y = plot.y; handleCanvasClick();
  });
  await expect(rows.filter({ hasText: 'Пшеница' })).toHaveCount(1);
  await page.evaluate(() => {
    hidePickMenu();
    buildMode = 'interact';
    const plot = { x: window.stick.x + TILE_SIZE, y: window.stick.y + TILE_SIZE, growth: 100, priority: 0, crop: 'rice' };
    farmPlots.push(plot);
    addMapResource('stick', plot.x + 4, plot.y);
    mouse.x = plot.x; mouse.y = plot.y; handleCanvasClick();
  });
  await expect(rows.filter({ hasText: 'Рис' })).toHaveCount(1);
});

test('the hall is mended in steps, each with its hammering; no flute; ghosts scare the big in two; no hitting through a wall (#326)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    townHall.hp = townHall.maxHp / 2;
    const step = getHallRepairStep();
    townHall.hp = townHall.maxHp;
    const big = { type: 'big', x: townHall.x, y: townHall.y, morale: 100 };
    ghostScare(big, 'enemy');
    const afterOne = !!big.fleeing || !!big.routed;
    const hitsAfterOne = big.ghostHits;
    ghostScare(big, 'enemy');
    // a wall between: no reach; nothing between: reach
    const g = getGridPos(townHall.x + 200, townHall.y);
    window.sim.helpers.placeBuilding('wall_stone', (g.gx + 1) * TILE_SIZE + 15, g.gy * TILE_SIZE + 15);
    const a = { x: g.gx * TILE_SIZE + 15, y: g.gy * TILE_SIZE + 15 }, b = { x: (g.gx + 2) * TILE_SIZE + 15, y: a.y }, c = { x: a.x, y: a.y + 2 * TILE_SIZE };
    return {
      steps: GAME_CONFIG.repairs.townHall.steps, stepHp: Math.round(step.hp), stepCost: step.cost, seconds: step.seconds,
      flute: !!GAME_CONFIG.gear.flute, afterOne, hitsAfterOne, hitsAfterTwo: big.ghostHits,
      throughWall: hasMeleeReach(a, b), open: hasMeleeReach(a, c)
    };
  });
  expect(r.steps).toBe(3);
  expect(r.stepHp).toBeGreaterThan(0);
  expect(r.stepCost).toEqual({ wood: 10, stone: 10 });
  expect(r.seconds).toBe(3);
  expect(r.flute).toBe(false);
  expect(r.afterOne).toBe(false);
  expect(r.hitsAfterOne).toBe(1);
  expect(r.hitsAfterTwo).toBe(0); // (the second scared it off: counted from nothing again)
  expect(r.throughWall).toBe(false);
  expect(r.open).toBe(true);
});

test('allies in a fight stand apart, workers at one thing aren\'t pushed off it; a hungry worker finishes its job first (#326)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    // (open ground: the map's random, a tree or a rock there kept them where they were)
    for (const list of [game.trees, game.cacti, game.boulders, game.naturalRocks, game.waterTiles, game.ironOres, game.coalOres, game.berryBushes]) list.length = 0;
    resetTileIndex();
    const at = { x: townHall.x + 200, y: townHall.y };
    const a = makeSettler(1, at.x, at.y), b = makeSettler(2, at.x + 2, at.y);
    separateAllies([a, b], true);
    const workersApart = Math.hypot(a.x - b.x, a.y - b.y);
    a.struckAt = b.struckAt = pathTick;
    for (let i = 0; i < 30; i++) separateAllies([a, b], true);
    const fightersApart = Math.hypot(a.x - b.x, a.y - b.y);
    // hungry while harvesting: it waits; past finishJobSeconds, it goes
    const s = makeSettler(3, townHall.x + 300, townHall.y);
    stock.food = 10;
    Object.assign(s, { wantsMeal: true, activity: 'harvest' });
    const waits = !goEat(s, { dt: 1 / 60, isWaveActive: false }) && !s.eating;
    pathTick += GAME_CONFIG.meals.finishJobSeconds * 60 + 1;
    const goes = goEat(s, { dt: 1 / 60, isWaveActive: false });
    return { workersApart, fightersApart, waits, goes };
  });
  expect(r.workersApart).toBeLessThan(3);
  expect(r.fightersApart).toBeGreaterThan(15);
  expect(r.waits).toBe(true);
  expect(r.goes).toBe(true);
});

test('distant settlers and enemies skip exact collision checks', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const checks = await page.evaluate(() => {
    const make = window.sim.helpers.makeSettler;
    settlers = [make(1, townHall.x + 200, townHall.y), make(2, townHall.x + 230, townHall.y)];
    enemies = [make(3, townHall.x + 200, townHall.y + 400), make(4, townHall.x + 230, townHall.y + 400)];
    const hypot = Math.hypot;
    let calls = 0;
    Math.hypot = (...args) => { calls++; return hypot(...args); };
    try { separateSettlersFromEnemies(); } finally { Math.hypot = hypot; }
    return calls;
  });
  expect(checks).toBe(0);
});

test('enemy separation finds overlaps across spatial cells with large unit lists', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const make = window.sim.helpers.makeSettler;
    for (const list of [game.trees, game.cacti, game.boulders, game.naturalRocks, game.waterTiles, game.ironOres, game.coalOres, game.berryBushes]) list.length = 0;
    resetTileIndex();
    settlers = Array.from({ length: 40 }, (_, i) => make(i + 1, 100 + i * 70, 100));
    enemies = Array.from({ length: 40 }, (_, i) => make(i + 101, 100 + i * 70, 500));
    const x = Math.floor((townHall.x + 150) / 48) * 48 + 46, y = townHall.y + 180;
    settlers[0] = make(1, x, y);
    enemies[0] = make(101, x + 20, y);
    const reach = settlers[0].visualRadius + enemies[0].radius;
    const before = Math.hypot(settlers[0].x - enemies[0].x, settlers[0].y - enemies[0].y);
    separateSettlersFromEnemies();
    const after = Math.hypot(settlers[0].x - enemies[0].x, settlers[0].y - enemies[0].y);
    settlers = Array.from({ length: 120 }, (_, i) =>
      Object.assign(make(i + 201, 100 + (i % 20) * 80, 700 + Math.floor(i / 20) * 80), { struckAt: pathTick }));
    enemies = [];
    settlers[0] = Object.assign(make(201, x, y), { struckAt: pathTick });
    settlers[1] = Object.assign(make(202, x + 10, y), { struckAt: pathTick });
    const allyBefore = Math.hypot(settlers[0].x - settlers[1].x, settlers[0].y - settlers[1].y);
    separateAllies(settlers, true);
    const allyAfter = Math.hypot(settlers[0].x - settlers[1].x, settlers[0].y - settlers[1].y);
    return { before, after, reach, allyBefore, allyAfter };
  });
  expect(result.before).toBeLessThan(result.reach);
  expect(result.after).toBeGreaterThanOrEqual(result.reach - 0.01);
  expect(result.allyAfter).toBeGreaterThan(result.allyBefore);
});

test('a continent\'s beach has only pebbles and boulders; the base starts with grass, bushes, sticks and pebbles near it (#326)', async ({ page }) => {
  test.setTimeout(60000);
  await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 256, rows: 256 }; window.sim.start('beach-326');
    const beach = new Set(beachTiles.map(t => `${Math.floor(t.x / TILE_SIZE)},${Math.floor(t.y / TILE_SIZE)}`));
    const on = list => list.filter(o => beach.has(`${Math.floor(o.x / TILE_SIZE)},${Math.floor(o.y / TILE_SIZE)}`)).length;
    const reach = (GAME_CONFIG.continent.nearBaseTiles + 1) * TILE_SIZE;
    const near = list => list.filter(o => Math.abs(o.x - townHall.x) < reach && Math.abs(o.y - townHall.y) < reach).length;
    return {
      beach: beach.size, onBeach: on(trees) + on(grassList) + on(berryBushes) + on(sticks) + on(cacti),
      grass: near(grassList), bushes: near(berryBushes), sticks: near(sticks), pebbles: near(pebbles)
    };
  });
  expect(r.beach).toBeGreaterThan(0);
  expect(r.onBeach).toBe(0);
  expect(r.grass).toBeGreaterThanOrEqual(16);
  expect(r.bushes).toBeGreaterThanOrEqual(8);
  expect(r.sticks).toBeGreaterThanOrEqual(15);
  expect(r.pebbles).toBeGreaterThanOrEqual(14);
});
