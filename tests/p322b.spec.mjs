import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322 (the friend's second report: still laggy zoomed out and when moving the camera): what a frame and a step cost

test('the canvas\'s size on the page is read only when it has changed, not every frame (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(async () => {
    let reads = 0;
    const own = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth').get;
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, get() { reads++; return own.call(this); } });
    fitCanvasToScreen(); const first = reads;
    for (let i = 0; i < 100; i++) fitCanvasToScreen();
    const steady = reads - first;
    window.dispatchEvent(new Event('resize'));
    const afterResize = reads - first - steady;
    delete canvas.clientWidth;
    return { steady, afterResize };
  });
  expect(r.steady).toBe(0);
  expect(r.afterResize).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('zoomed out, trees, cacti and boulders are flat dots in one go; grass and the like are left out; close up they are drawn whole (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    for (const list of [game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.stumps, game.naturalRocks, game.waterTiles]) list.length = 0;
    game.trees.length = 0;
    resetTileIndex();
    const g = getGridPos(townHall.x, townHall.y);
    for (let i = 0; i < 300; i++) addMapResource('tree', (g.gx - 8 + (i % 20)) * TILE_SIZE + 15, (g.gy + 6 + Math.floor(i / 20)) * TILE_SIZE + 15);
    camera.x = townHall.x; camera.y = townHall.y + 300;
    const arcs = () => { let n = 0; const arc = ctx.arc; ctx.arc = function (...a) { n++; return arc.apply(this, a); }; render(); ctx.arc = arc; return n; };
    const visible = () => { const v = getViewRect(60); return game.trees.filter(t => t.x >= v.x0 && t.x <= v.x1 && t.y >= v.y0 && t.y <= v.y1).length; };
    setZoom(getMinZoom()); const farScale = getViewScale(), farTrees = visible(), farArcs = arcs();
    setZoom(getMaxZoom() * 0.5); const nearScale = getViewScale(), nearTrees = visible(), nearArcs = arcs();
    return { farScale, nearScale, farPer: farArcs / Math.max(1, farTrees), nearPer: nearArcs / Math.max(1, nearTrees), farTrees, nearTrees };
  });
  expect(r.farScale).toBeLessThan(0.65);
  expect(r.nearScale).toBeGreaterThan(0.65);
  expect(r.farTrees).toBeGreaterThan(100);
  expect(r.nearTrees).toBeGreaterThan(20);
  expect(r.farPer).toBeLessThan(3);
  expect(r.nearPer).toBeGreaterThan(r.farPer * 2.5);
  expect(errors).toEqual([]);
});

test('the terrain is drawn from its pictures at every zoom, zoomed in too; the pictures are kept within a budget of pixels (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const out = {};
    const g = getGridPos(townHall.x, townHall.y);
    for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 8; dx++) waterTiles.push({ x: (g.gx + 4 + dx) * TILE_SIZE + 15, y: (g.gy + 4 + dy) * TILE_SIZE + 15, isFishing: false, fishTimer: 0, fishCount: 0, fishRegrowTimer: 0 });
    resetTileIndex();
    camera.x = townHall.x + 200; camera.y = townHall.y + 200;
    for (const [name, zoom] of [['out', getMinZoom()], ['in', getMaxZoom() * 0.6], ['closest', getMaxZoom()]]) {
      setZoom(zoom);
      let images = 0; const draw = ctx.drawImage; ctx.drawImage = function (...a) { images++; return draw.apply(this, a); };
      for (let i = 0; i < 10; i++) render(); // (a piece or two painted a frame)
      ctx.drawImage = draw;
      out[name] = { cached: isGroundCached(), images: images > 0 };
    }
    return out;
  });
  expect(r).toEqual({ out: { cached: true, images: true }, in: { cached: true, images: true }, closest: { cached: true, images: true } });
  expect(errors).toEqual([]);
});

test('a crowd setting off at once searches for its ways a few at a time, not all in one tick (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    for (const list of [game.trees, game.boulders, game.naturalRocks, game.waterTiles]) list.length = 0;
    resetTileIndex(); invalidateAllPaths();
    const { makeSettler } = window.sim.helpers;
    settlers = Array.from({ length: 40 }, (_, i) => makeSettler(i + 1, townHall.x - 200 + (i % 10) * 20, townHall.y + 120 + Math.floor(i / 10) * 20));
    game.pathTick++;
    for (const s of settlers) moveEntityTowards(s, townHall.x + 600, townHall.y - 500, s.speed, false, 1 / 60);
    const first = settlers.filter(s => s.path && s.path.length).length;
    for (let tick = 0; tick < 6; tick++) { game.pathTick++; for (const s of settlers) moveEntityTowards(s, townHall.x + 600, townHall.y - 500, s.speed, false, 1 / 60); }
    const later = settlers.filter(s => s.path && s.path.length).length;
    return { first, later };
  });
  expect(r.first).toBeGreaterThan(0);
  expect(r.first).toBeLessThanOrEqual(10);
  expect(r.later).toBe(40); // (all of them have their way within a few ticks)
  expect(errors).toEqual([]);
});

test('the marks on resources show within a moment of being put on, and go with them (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const tree = trees.find(t => !t.isGrowing);
    camera.x = tree.x; camera.y = tree.y; setZoom(getMaxZoom() * 0.6);
    const strokes = () => { let n = 0; const s = ctx.strokeRect; ctx.strokeRect = function (...a) { if (ctx.strokeStyle === '#f1c40f') n++; return s.apply(this, a); }; render(); ctx.strokeRect = s; return n; };
    const before = strokes();
    tree.priority = 1;
    for (let i = 0; i < 8; i++) { game.pathTick++; }
    const marked = strokes();
    tree.priority = 0;
    for (let i = 0; i < 8; i++) { game.pathTick++; }
    const gone = strokes();
    return { before, marked, gone };
  });
  expect(r.before).toBe(0);
  expect(r.marked).toBeGreaterThanOrEqual(1);
  expect(r.gone).toBe(0);
  expect(errors).toEqual([]);
});
