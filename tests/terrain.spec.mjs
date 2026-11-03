import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('water and rock tiles join their own kind; rendering stays error-free (#79)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('terrain-test');
    const tiles = getTileIndex();
    // a lone tile is open on every side; a tile in a row of three is joined left and right
    const lone = openSides(new Set(['105,105']), 105, 105);
    const row = new Set(['75,105', '105,105', '135,105']);
    const middle = openSides(row, 105, 105);
    // rock joins ore: every ore tile is in the set rock tiles join
    const oreJoinsRock = [...ironOres, ...coalOres].every(o => tiles.rockAndOre.has(`${o.x},${o.y}`));
    for (const seed of ['maze-283', 'maze-137', 'shot']) { window.sim.start(seed); render(); }
    return { lone, middle, oreJoinsRock };
  });
  expect(r.lone).toMatchObject({ n: true, s: true, w: true, e: true }); // (and its corners, #307)
  expect(r.middle).toMatchObject({ n: true, s: true, w: false, e: false });
  expect(r.oreJoinsRock).toBe(true);
  expect(errors).toEqual([]);
});

test('ore seams and ore source rocks cast shadows', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const shadows = await page.evaluate(async () => {
    game.naturalRocks.length = 0;
    game.ironOres.length = 0;
    game.coalOres.length = 0;
    const source = { x: townHall.x + 120, y: townHall.y, oreSpawner: 'iron' };
    const ore = { x: townHall.x + 180, y: townHall.y, hp: 10, maxHp: 10 };
    game.naturalRocks.push(source);
    game.ironOres.push(ore);
    camera.x = townHall.x; camera.y = townHall.y;
    resetTileIndex();
    for (let frame = 0; frame < 8; frame++) render();
    const { drawNaturalRockShadows } = await import('/js/domains/world/world.draw.js');
    beginShadowFrame(ctx);
    const original = { ellipse: Path2D.prototype.ellipse, roundRect: Path2D.prototype.roundRect };
    let ellipses = 0, tiles = 0;
    Path2D.prototype.ellipse = function (...args) { ellipses++; return original.ellipse.apply(this, args); };
    Path2D.prototype.roundRect = function (...args) { tiles++; return original.roundRect.apply(this, args); };
    try {
      drawNaturalRockShadows();
      return { oreShadows: ellipses, sourceShadows: tiles };
    } finally {
      Path2D.prototype.ellipse = original.ellipse;
      Path2D.prototype.roundRect = original.roundRect;
    }
  });
  expect(shadows.oreShadows).toBe(0);
  expect(shadows.sourceShadows).toBe(4);
  expect(errors).toEqual([]);
});

test('rock, ore and spawner contours join without square diagonal patches', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const original = ctx.fillRect, patches = [];
    const originalMoveTo = ctx.moveTo, originalLineTo = ctx.lineTo, segments = [];
    let start = null;
    ctx.fillRect = function (x, y, width, height) {
      if (width === 2 && height === 2) patches.push([x, y]);
      return original.call(this, x, y, width, height);
    };
    ctx.moveTo = function (x, y) { start = [x, y]; return originalMoveTo.call(this, x, y); };
    ctx.lineTo = function (x, y) {
      if (start) segments.push([start, [x, y]]);
      start = [x, y];
      return originalLineTo.call(this, x, y);
    };
    try {
      drawJoinedTile(615, 615, {
        n: false, s: true, w: false, e: true,
        nw: true, ne: false, sw: false, se: false
      }, '#000', '#fff');
      drawJoinedTile(615, 615, {
        n: false, s: true, w: false, e: true,
        nw: false, ne: false, sw: false, se: false
      }, '#000', '#fff', true, { nw: true });
      return { patches, joinedCorner: segments.some(([[x0, y0], [x1, y1]]) => x0 === 601 && y0 === 600 && x1 === 600 && y1 === 601) };
    } finally {
      ctx.fillRect = original;
      ctx.moveTo = originalMoveTo;
      ctx.lineTo = originalLineTo;
    }
  });
  expect(result).toEqual({ patches: [], joinedCorner: true });
  expect(errors).toEqual([]);
});

test('joined terrain outlines stay at least one raster pixel wide in cached chunks', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const original = ctx.stroke, widths = [];
    ctx.save();
    ctx.setTransform(0.125, 0, 0, 0.125, 20, 20);
    ctx.stroke = function (...args) {
      widths.push({ width: this.lineWidth, cap: this.lineCap, join: this.lineJoin });
      return original.apply(this, args);
    };
    try {
      drawJoinedTile(120, 120, {
        n: false, s: true, w: false, e: true,
        nw: true, ne: false, sw: false, se: false
      }, '#000', '#fff');
      return widths;
    } finally {
      ctx.stroke = original;
      ctx.restore();
    }
  });
  expect(result).toEqual([{ width: 8, cap: 'round', join: 'round' }]);
  expect(errors).toEqual([]);
});

test('desert sand under a diagonal does not square off an isolated rock corner', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const radii = await page.evaluate(() => {
    game.naturalRocks.length = 0;
    game.ironOres.length = 0;
    game.coalOres.length = 0;
    game.waterTiles.length = 0;
    game.desertTiles.length = 0;
    game.beachTiles.length = 0;
    const x = townHall.x + 120, y = townHall.y + 120;
    game.naturalRocks.push({ x, y, hp: 10, maxHp: 10 });
    game.desertTiles.push({ x: x - TILE_SIZE, y: y - TILE_SIZE });
    resetTileIndex();
    const original = ctx.roundRect;
    let outerRadii;
    ctx.roundRect = function (x0, y0, width, height, cornerRadii) {
      if (!outerRadii && Array.isArray(cornerRadii)) outerRadii = [...cornerRadii];
      return original.call(this, x0, y0, width, height, cornerRadii);
    };
    try {
      drawRockTile(x, y, getTileIndex());
      return outerRadii;
    } finally {
      ctx.roundRect = original;
    }
  });
  expect(radii).toEqual([7, 7, 7, 7]);
  expect(errors).toEqual([]);
});
