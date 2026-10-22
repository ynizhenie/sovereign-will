import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #299, step 1: big maps (128, 256, 512) that play smoothly, the base's land, waves from its frontier

test('big maps are made in seconds and start as close as a default one; zoomed out only so far (#299)', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const out = {};
    for (const size of [128, 256, 512]) {
      mapSettings = { cols: size, rows: size };
      const t = performance.now();
      window.sim.start(`big-${size}`);
      const made = performance.now() - t;
      const close = getViewScale();
      setZoom(0);
      out[size] = { made, close, far: getViewScale(), trees: trees.length, iron: getOreSpawners('iron').length, coal: getOreSpawners('coal').length };
      render();
    }
    mapSettings = { cols: 40, rows: 40 }; window.sim.start('big-40');
    out.small = getViewScale();
    return out;
  });
  for (const size of [128, 256, 512]) {
    expect(r[size].made).toBeLessThan(15000);
    // as close as a default map's whole (within a little), not the whole big map on the screen
    expect(r[size].close).toBeGreaterThan(r.small * 0.9);
    expect(r[size].far).toBeLessThan(r[size].close);
    expect(r[size].iron).toBeGreaterThan(size / 40);
  }
  expect(r[512].trees).toBeGreaterThan(r[128].trees * 10);
  // all of a 512 map would be 0.04 a world unit to a pixel: not that far out
  expect(r[512].far).toBeGreaterThan(0.2);
  expect(errors).toEqual([]);
});

test('the base\'s land: a default map\'s square round the hall, a circle round each building but walls; settlers work and the player builds only on it (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 128, rows: 128 }; window.sim.start('land');
    const hall = { x: townHall.x, y: townHall.y };
    const inside = inTerritory(hall.x + 19 * TILE_SIZE, hall.y), outside = inTerritory(hall.x + 22 * TILE_SIZE, hall.y);
    // a building near the edge spreads it; a wall there doesn't
    const edge = { x: hall.x + 19 * TILE_SIZE, y: hall.y };
    buildings.push({ type: 'wall_wood', x: edge.x, y: edge.y + 60, hp: 50, maxHp: 50 });
    const byWall = inTerritory(edge.x + 4 * TILE_SIZE, edge.y + 60);
    buildings.push({ type: 'warehouse', x: edge.x, y: edge.y, hp: 50, maxHp: 50 });
    const byStore = inTerritory(edge.x + 5 * TILE_SIZE, edge.y);
    // what settlers would work: on the land only, though the map has far more
    const work = getWorkableResources();
    const allOn = work.every(o => inTerritory(o.x, o.y));
    const everything = getHarvestableResources().length;
    return { inside, outside, byWall, byStore, allOn, some: work.length, fewer: work.length < everything / 4 };
  });
  expect(r).toMatchObject({ inside: true, outside: false, byWall: false, byStore: true, allOn: true, fewer: true });
  expect(r.some).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('a tap past the base\'s land neither builds nor marks there, with a word why (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 128, rows: 128 }; window.sim.start('tap-land');
    isPaused = true;
    const tap = (x, y, mode) => { buildMode = mode; mouse.x = x; mouse.y = y; recentNotifications.length = 0; handleCanvasClick(); return recentNotifications.slice(); };
    // a tree past the land, tapped with the Point tool; one on it
    const far = { x: townHall.x + 25 * TILE_SIZE, y: townHall.y }, near = { x: townHall.x + 8 * TILE_SIZE, y: townHall.y + 8 * TILE_SIZE };
    for (const p of [far, near]) trees = trees.filter(t => Math.hypot(t.x - p.x, t.y - p.y) > 40);
    const farTree = addMapResource('tree', far.x, far.y), nearTree = addMapResource('tree', near.x, near.y);
    const saidMark = tap(far.x, far.y, 'interact');
    tap(near.x, near.y, 'interact');
    // a warehouse past it, and on it
    addResources({ wood: 50 });
    const spot = { x: far.x, y: far.y + 2 * TILE_SIZE }, home = { x: townHall.x - 6 * TILE_SIZE + 0, y: townHall.y + 6 * TILE_SIZE };
    const saidBuild = tap(spot.x, spot.y, 'warehouse');
    const placedFar = blueprints.length;
    tap(home.x, home.y, 'warehouse');
    // a farm zone past it
    const saidZone = tap(spot.x + TILE_SIZE, spot.y, 'zone_wheat');
    return { farMarked: farTree.priority || 0, nearMarked: nearTree.priority || 0, placedFar, placedHome: blueprints.length, zones: farmZones.length, said: [...saidMark, ...saidBuild, ...saidZone] };
  });
  expect(r).toMatchObject({ farMarked: 0, nearMarked: 1, placedFar: 0, placedHome: 1, zones: 0 });
  expect(r.said.length).toBe(3);
  expect(r.said.join(' ')).toMatch(/базы/);
  expect(errors).toEqual([]);
});

test('waves, scouts and the runaways come and go at the frontier past the base\'s land, not a big map\'s edge; a default map\'s is its edge (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 40, rows: 40 }; window.sim.start('front-40');
    let same = true;
    for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) if (isOutskirts(gx, gy) !== isBorderZone(gx, gy)) same = false;
    const whole = getFrontier();
    mapSettings = { cols: 256, rows: 256 }; window.sim.start('front-256');
    const f = getFrontier(), land = getTerritoryBox();
    const spots = Array.from({ length: 60 }, () => getRandomBorderPos());
    const inBand = spots.every(p => p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1 && isOutskirts(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE)));
    const open = spots.every(p => !isTileBlockedForEnemyStrict(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE)));
    const pastLand = spots.every(p => !inTerritory(p.x, p.y));
    // a wave comes and gets to the base
    waveNum = 2; startNextWave();
    window.sim.run(30, { holdWaves: false });
    const closest = Math.min(...enemies.map(en => Math.hypot(en.x - townHall.x, en.y - townHall.y)));
    mapSettings = { cols: 40, rows: 40 };
    return { same, whole, world: [WORLD_WIDTH, WORLD_HEIGHT], inBand, open, pastLand, inside: f.x0 > 0 && f.x1 < 256 * TILE_SIZE, around: f.x0 < land.x0 && f.x1 > land.x1, closest, enemies: enemies.length };
  });
  expect(r.same).toBe(true);
  expect(r.whole).toEqual({ x0: 0, y0: 0, x1: 1200, y1: 1200 });
  expect(r).toMatchObject({ inBand: true, open: true, pastLand: true, inside: true, around: true });
  expect(r.enemies).toBeGreaterThan(0);
  expect(r.closest).toBeLessThan(20 * 30);
  expect(errors).toEqual([]);
});

test('on a big map: walking distances only as far as the frontier; boars far off still wander, by turns; the drawing only of what\'s on the screen (#299)', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 256, rows: 256 }; window.sim.start('far-256');
    const f = getFrontierTiles();
    const reach = getSettlerReach({ x: townHall.x, y: townHall.y + 90 });
    let past = 0, within = 0;
    for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) {
      if (reach[gy * COLS + gx] < 0) continue;
      if (gx < f.gx0 || gx > f.gx1 || gy < f.gy0 || gy > f.gy1) past++; else within++;
    }
    const F = getFrontier();
    const far = boars.filter(b => b.x < F.x0 - 300 || b.y < F.y0 - 300).slice(0, 20);
    const was = far.map(b => [b.x, b.y]);
    window.sim.run(20);
    const moved = far.filter((b, i) => Math.hypot(b.x - was[i][0], b.y - was[i][1]) > 5).length;
    // panned all over at a few zooms: no errors
    isPaused = true;
    for (const zoom of [0, 1, 99]) { setZoom(zoom); for (const [x, y] of [[0, 0], [WORLD_WIDTH, 0], [WORLD_WIDTH / 2, WORLD_HEIGHT / 2], [WORLD_WIDTH, WORLD_HEIGHT]]) { camera.x = x; camera.y = y; clampCamera(); render(); } }
    mapSettings = { cols: 40, rows: 40 };
    return { past, within, far: far.length, moved };
  });
  expect(r.past).toBe(0);
  expect(r.within).toBeGreaterThan(500);
  expect(r.far).toBeGreaterThan(5);
  expect(r.moved).toBeGreaterThan(r.far / 3);
  expect(errors).toEqual([]);
});

test('what\'s near a point, found by its tiles, is what going through the list finds, as the lists change; the blocked tiles too (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 96, rows: 96 }; window.sim.start('near-96');
    let bad = 0;
    const check = () => {
      for (let k = 0; k < 300; k++) {
        const x = Math.random() * WORLD_WIDTH, y = Math.random() * WORLD_HEIGHT, rr = 10 + Math.random() * 120;
        for (const list of [trees, naturalRocks, waterTiles, grassList]) {
          if (anyWithin(list, x, y, rr) !== list.some(o => Math.hypot(o.x - x, o.y - y) < rr)) bad++;
        }
      }
    };
    check();
    trees.splice(5, 3); grassList.push({ x: 615, y: 615 }); naturalRocks = naturalRocks.slice(10); waterTiles.pop();
    check();
    trees.push(trees.shift()); check();
    window.sim.run(10);
    settlerBlockedGrid.signature = null; const g = getSettlerBlockedGrid();
    for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) if ((g[gy * COLS + gx] === 1) !== computeTileBlockedForSettler(gx, gy)) bad++;
    mapSettings = { cols: 40, rows: 40 };
    return bad;
  });
  expect(r).toBe(0);
  expect(errors).toEqual([]);
});

test('a big map saves squeezed (several fit on the device) and loads back as it was (#299)', async ({ page }) => {
  test.setTimeout(60000);
  const errors = await openGame(page);
  const r = await page.evaluate(async () => {
    localStorage.clear();
    mapSettings = { cols: 512, rows: 512 }; window.sim.start('save-512');
    const was = { rocks: naturalRocks.length, water: waterTiles.length, trees: trees.length, first: { ...naturalRocks[0] }, spawner: naturalRocks.findIndex(r => r.oreSpawner) };
    await saveCurrentGame();
    const size = localStorage.getItem('sovereign-will-saves').length;
    resetGame();
    await loadGame(await saveDataOf(loadSaves()[`world:${worldSeed.value}`]));
    mapSettings = { cols: 40, rows: 40 };
    return { was, size, now: { rocks: naturalRocks.length, water: waterTiles.length, trees: trees.length, first: { ...naturalRocks[0] }, spawner: naturalRocks.findIndex(r => r.oreSpawner) }, cols: COLS };
  });
  expect(r.size).toBeLessThan(1_000_000);
  expect(r.now).toEqual(r.was);
  expect(r.cols).toBe(512);
  expect(errors).toEqual([]);
});

test('on a big map what\'s taken grows back within the frontier, round the base, not anywhere on the map (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 256, rows: 256 }; window.sim.start('regrow-256');
    // (a forest in it, or an ore's rock, may reach a few tiles past its edge)
    const f = getFrontier(), m = 8 * TILE_SIZE, inside = o => o.x >= f.x0 - m && o.x <= f.x1 + m && o.y >= f.y0 - m && o.y <= f.y1 + m;
    const before = { trees: new Set(trees), sticks: new Set(sticks), iron: new Set(ironOres) };
    for (let i = 0; i < 20; i++) { scheduleRespawn('tree'); scheduleRespawn('stick'); scheduleRespawn('iron_ore'); }
    pendingRespawns.forEach(p => { p.timer = 0; });
    updatePendingRespawns(1);
    const grown = [...trees.filter(t => !before.trees.has(t)), ...sticks.filter(s => !before.sticks.has(s)), ...ironOres.filter(o => !before.iron.has(o))];
    mapSettings = { cols: 40, rows: 40 };
    return { grown: grown.length, inside: grown.filter(inside).length };
  });
  expect(r.grown).toBeGreaterThan(30);
  expect(r.inside).toBe(r.grown);
  expect(errors).toEqual([]);
});
