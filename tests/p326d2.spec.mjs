import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, visuals part two: in the page

test('an archer trains at a dummy from a few tiles off, the dummy keeps at most 5 arrows and he takes them back (#326, 39)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false; game.isPaused = false;
    const { makeSettler, clearResources } = window.sim.helpers;
    clearResources && clearResources();
    // open ground all round (a random map's tree or lake in the line of fire would make it differ from run to run)
    for (const list of [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.ironOres, game.coalOres, game.boars, game.naturalRocks, game.waterTiles, game.desertTiles, game.beachTiles]) list.length = 0;
    resetTileIndex(); invalidateAllPaths();
    const g = getGridPos(townHall.x, townHall.y);
    const dummy = createBuildingBlueprint('dummy', (g.gx + 4) * TILE_SIZE + 15, (g.gy + 4) * TILE_SIZE + 15); delete dummy.progress; delete dummy.maxProgress;
    buildings = [dummy];
    const s = makeSettler(1, dummy.x - 70, dummy.y, {}); s.role = 'archer'; s.weapon = 'bow'; s.quiver = true; s.arrows = 12; s.hunger = 999;
    settlers = [s];
    s.idle = { act: 'train', left: 60, spot: { x: dummy.x, y: dummy.y }, partnerId: null };
    let most = 0, farthest = 0, tookBack = false;
    for (let f = 0; f < 60 * 40; f++) {
      update(1 / 60); waveTimer = 999; s.hunger = 999;
      const n = (dummy.arrowsStuck || []).length;
      most = Math.max(most, n);
      farthest = Math.max(farthest, Math.hypot(s.x - dummy.x, s.y - dummy.y));
      if (most >= 5 && n === 0 && s.arrows >= 12) tookBack = true; // all 5 shot, all taken back
      if (tookBack) break;
      if (s.idle && s.idle.act !== 'train') break;
    }
    return { most, farthest, tookBack, trained: s.trained || 0, flying: game.projectiles.length, lying: game.stuckArrows.length };
  });
  expect(r.most).toBeGreaterThan(0);
  expect(r.most).toBeLessThanOrEqual(5);
  expect(r.farthest).toBeGreaterThan(60);
  expect(r.trained).toBeGreaterThan(0);
  expect(r.tookBack).toBe(true);
  expect(errors).toEqual([]);
});

test('an arrow stays where it hit: in a unit, on in its corpse till it is gone, on the ground where it fell, fading (#326, 39)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const fire = (x, y, tx, ty, fromEnemy) => game.projectiles.push({ x, y, vx: (tx - x) / 10, vy: (ty - y) / 10, damage: 1, life: 60, fromEnemy, owner: null });
    // into the open: it lies where it fell
    fire(townHall.x + 300, townHall.y + 300, townHall.x + 500, townHall.y + 300, false);
    for (let f = 0; f < 80; f++) tickProjectiles();
    const lying = game.stuckArrows.length;
    // into an enemy: it stays in it, and in its corpse, which takes it away when it goes
    const en = createNormalEnemy({ x: townHall.x + 60, y: townHall.y + 90 }, 'raider'); en.speed = 0; en.hp = en.maxHp = 1000; enemies = [en];
    fire(en.x - 40, en.y, en.x, en.y, false);
    for (let f = 0; f < 15; f++) tickProjectiles();
    const inIt = (en.stuck || []).length;
    en.x += 20; en.y += 10; // the arrow goes with it
    addCorpse(en, 'enemy', 'raider');
    const corpse = game.corpses[game.corpses.length - 1];
    const inCorpse = (corpse.stuck || []).length;
    // lying ones fade after their time
    ageStuckArrows(GAME_CONFIG.stuckArrows.seconds + 1);
    return { lying, inIt, inCorpse, gone: game.stuckArrows.length };
  });
  expect(r).toEqual({ lying: 1, inIt: 1, inCorpse: 1, gone: 0 });
  expect(errors).toEqual([]);
});

test('the loading screen: a bar over the menu scene while a world is made, the game standing still, gone when it is done (#326, 46)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(async () => {
    const screen = document.getElementById('loading-screen'), fill = document.getElementById('loading-fill');
    const seen = [];
    await runLoading('loading.world', (function* () {
      yield 0.3; seen.push({ shown: !screen.hidden, loading: game.loading, width: fill.style.width,
        background: getComputedStyle(screen).backgroundColor, zIndex: getComputedStyle(screen).zIndex,
        flag: getComputedStyle(document.getElementById('menu-flags')).display,
        title: getComputedStyle(document.getElementById('loading-title')).color });
      yield 0.8; seen.push({ shown: !screen.hidden, loading: game.loading, width: fill.style.width,
        background: getComputedStyle(screen).backgroundColor, zIndex: getComputedStyle(screen).zIndex,
        flag: getComputedStyle(document.getElementById('menu-flags')).display,
        title: getComputedStyle(document.getElementById('loading-title')).color });
    })());
    // the game's own start goes through it too: the world is made in steps
    let steps = 0;
    for (const share of resetGameSteps()) { steps++; if (share > 1) steps = -1e9; }
    return { seen, after: { shown: !screen.hidden, loading: game.loading }, steps, text: document.getElementById('loading-title').textContent };
  });
  expect(r.seen).toEqual([
    { shown: true, loading: true, width: '30%', background: 'rgb(0, 0, 0)', zIndex: '20000', flag: 'none', title: 'rgb(255, 255, 255)' },
    { shown: true, loading: true, width: '80%', background: 'rgb(0, 0, 0)', zIndex: '20000', flag: 'none', title: 'rgb(255, 255, 255)' }
  ]);
  expect(r.after).toEqual({ shown: false, loading: false });
  expect(r.steps).toBeGreaterThan(5);
  expect(r.text).not.toBe('loading.world');
  expect(errors).toEqual([]);
});

test('walls and doors join (a run, corners, a T, a cross, a lone post) and a door opens as someone comes to it and shuts after (#326, 43, 65)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(async () => {
    isPaused = true;
    const g = getGridPos(townHall.x, townHall.y);
    buildings = [];
    const add = (type, dx, dy) => { const b = createBuildingBlueprint(type, (g.gx + dx) * TILE_SIZE + 15, (g.gy + dy) * TILE_SIZE + 15); delete b.progress; delete b.maxProgress; buildings.push(b); return b; };
    for (let i = 0; i < 5; i++) add(i % 2 ? 'wall_stone' : 'wall_wood', 4 + i, 4); // a run
    for (let j = 1; j < 4; j++) add('wall_wood', 4, 4 + j); // a corner
    add('wall_stone', 7, 5); // a T
    add('wall_wood', 12, 8); // a lone post
    const door = add('door', 6, 4), iron = add('iron_door', 4, 6);
    settlers = []; enemies = [];
    const open = [];
    camera.x = door.x; camera.y = door.y; setZoom(getMaxZoom() * 0.9);
    render();
    open.push(door.openness);
    const { makeSettler } = window.sim.helpers;
    const walker = makeSettler(1, door.x, door.y + 8, {}); settlers = [walker];
    const frames = async n => { for (let f = 0; f < n; f++) { await new Promise(res => setTimeout(res, 100)); render(); } }; // (the animation runs by the clock)
    await frames(12);
    const opened = door.openness;
    settlers = [];
    await frames(12);
    return { start: open[0], opened, shut: door.openness, ironShut: iron.openness };
  });
  expect(r.start).toBe(0);
  expect(r.opened).toBeGreaterThan(0.9);
  expect(r.shut).toBe(0);
  expect(r.ironShut).toBe(0);
  expect(errors).toEqual([]);
});

test('connected walls and doors cast one combined angular shadow', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const originals = {
      rect: Path2D.prototype.rect,
      roundRect: Path2D.prototype.roundRect,
      ellipse: Path2D.prototype.ellipse,
      fill: ctx.fill
    };
    const fills = [];
    let rectangles = 0, ellipses = 0;
    Path2D.prototype.rect = function (...args) {
      rectangles++;
      return originals.rect.apply(this, args);
    };
    Path2D.prototype.roundRect = function (...args) {
      rectangles++;
      return originals.roundRect.apply(this, args);
    };
    Path2D.prototype.ellipse = function (...args) {
      ellipses++;
      return originals.ellipse.apply(this, args);
    };
    ctx.fill = function (...args) {
      fills.push(args.length);
      return originals.fill.apply(this, args);
    };
    try {
      drawWallShadows([
        { x: 300, y: 300, type: 'wall_wood', mask: 2 },
        { x: 330, y: 300, type: 'wall_stone', mask: 10 },
        { x: 360, y: 300, type: 'door', mask: 10, open: 0, swing: { x: 0, y: 1 } }
      ]);
      return { rectangles, ellipses, combinedPasses: fills.length };
    } finally {
      Path2D.prototype.rect = originals.rect;
      Path2D.prototype.roundRect = originals.roundRect;
      Path2D.prototype.ellipse = originals.ellipse;
      ctx.fill = originals.fill;
    }
  });
  expect(result.rectangles).toBeGreaterThan(0);
  expect(result.ellipses).toBe(0);
  expect(result.combinedPasses).toBe(1);
  expect(errors).toEqual([]);
});

test('doors draw above the wall and their fence gate rotates with the opening', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const g = getGridPos(townHall.x, townHall.y);
    const wall = createBuildingBlueprint('wall_wood', (g.gx + 5) * TILE_SIZE + 15, (g.gy + 4) * TILE_SIZE + 15);
    const door = createBuildingBlueprint('door', wall.x - TILE_SIZE, wall.y);
    delete wall.progress; delete wall.maxProgress;
    delete door.progress; delete door.maxProgress;
    game.buildings = [door, wall];
    const original = ctx.fillRect, order = [];
    ctx.fillRect = function (...args) {
      if (this.fillStyle === '#7a4a20') order.push('wall');
      if (this.fillStyle === '#f39c12') order.push('door');
      return original.apply(this, args);
    };
    try {
      drawBuildings();
      const lastWall = order.lastIndexOf('wall'), doorHandle = order.lastIndexOf('door');
      const transforms = [];
      const fill = ctx.fillRect;
      ctx.fillRect = function (...args) {
        if (this.fillStyle === '#9b6633') {
          const matrix = this.getTransform();
          transforms.push([matrix.a, matrix.b, matrix.c, matrix.d]);
        }
        return fill.apply(this, args);
      };
      drawDoorArt(300, 300, false, LINK.n | LINK.s, 0, { x: 1, y: 0 });
      ctx.fillRect = fill;
      return { doorAboveWall: doorHandle > lastWall, turnedGate: transforms.some(([a, b, c, d]) => Math.abs(b) > 0.9 || Math.abs(c) > 0.9) };
    } finally {
      ctx.fillRect = original;
    }
  });
  expect(result.doorAboveWall).toBe(true);
  expect(result.turnedGate).toBe(true);
  expect(errors).toEqual([]);
});

test('a wood wall arm stops before the frame of a connected door', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const original = ctx.fillRect, connectedLogs = [];
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect = function (x, y, width, height) {
      if (width === 5.5 && height === 25) connectedLogs.push(x);
      return original.call(this, x, y, width, height);
    };
    try {
      drawWoodWall(100, 100, LINK.e);
      const withoutDoor = connectedLogs.length;
      connectedLogs.length = 0;
      drawWoodWall(100, 100, LINK.e, LINK.e);
      return { withoutDoor, withDoor: connectedLogs.length };
    } finally {
      ctx.fillRect = original;
      ctx.restore();
    }
  });
  expect(result).toEqual({ withoutDoor: 3, withDoor: 2 });
  expect(errors).toEqual([]);
});

test('buildings higher on the map are drawn behind buildings lower on the map', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const fills = await page.evaluate(() => {
    const g = getGridPos(townHall.x, townHall.y);
    const upper = createBuildingBlueprint('wall_wood', (g.gx + 5) * TILE_SIZE + 15, (g.gy + 3) * TILE_SIZE + 15);
    const lower = createBuildingBlueprint('wall_stone', (g.gx + 5) * TILE_SIZE + 15, (g.gy + 4) * TILE_SIZE + 15);
    delete upper.progress; delete upper.maxProgress;
    delete lower.progress; delete lower.maxProgress;
    game.buildings = [lower, upper];

    const fillRect = ctx.fillRect, order = [];
    ctx.fillRect = function (...args) {
      if (this.fillStyle === '#7a4a20' || this.fillStyle === '#52616a') order.push(this.fillStyle);
      return fillRect.apply(this, args);
    };
    try {
      drawBuildings();
    } finally {
      ctx.fillRect = fillRect;
    }
    return order;
  });
  expect(fills.indexOf('#7a4a20')).toBeGreaterThanOrEqual(0);
  expect(fills.indexOf('#52616a')).toBeGreaterThan(fills.indexOf('#7a4a20'));
  expect(errors).toEqual([]);
});

test('stone walls use the wooden wall post-and-arm shape with masonry detail', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const shapes = await page.evaluate(() => {
    const fillRect = ctx.fillRect, drawn = [];
    ctx.fillRect = function (x, y, w, h) {
      drawn.push({ x, y, w, h, fill: this.fillStyle });
      return fillRect.call(this, x, y, w, h);
    };
    try {
      drawStoneWall(300, 300, 15);
    } finally {
      ctx.fillRect = fillRect;
    }
    return drawn;
  });
  expect(shapes).toEqual(expect.arrayContaining([
    expect.objectContaining({ x: 293, y: 289, w: 14, h: 24, fill: '#52616a' }),
    expect.objectContaining({ x: 293, y: 287.5, w: 14, h: 7, fill: '#71818a' }),
    expect.objectContaining({ x: 289.25, y: 288, w: 5.5, h: 25, fill: '#71818a' })
  ]));
  expect(shapes.some(shape => shape.fill === '#87969a')).toBe(true);
  expect(errors).toEqual([]);
});

test('stone wall shadow follows its stone post and connected arms without round shapes', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const shadows = await page.evaluate(() => {
    const rect = Path2D.prototype.rect, shapes = [];
    Path2D.prototype.rect = function (...args) {
      shapes.push(args);
      return rect.apply(this, args);
    };
    try {
      drawWallShadows([{ x: 300, y: 300, type: 'wall_stone', mask: LINK.e | LINK.s }]);
      return shapes;
    } finally {
      Path2D.prototype.rect = rect;
    }
  });
  expect(shadows).toContainEqual([-7, -11, 14, 24]);
  expect(shadows).toContainEqual([5.25, -12, 5.5, 25]);
  expect(shadows).toContainEqual([-7, 5.5, 14, 7]);
  expect(errors).toEqual([]);
});

test('overlapping shadows in the world are no darker than one', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const red = await page.evaluate(() => {
    game.isPaused = true;
    const shadow = new Path2D();
    shadow.rect(100, 100, 40, 40);
    const frame = shadows => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 300);
      beginShadowFrame(ctx); beginShadowFrame(ctx); // (none kept from the frame before)
      drawShadowLayer(() => {}, () => { for (let i = 0; i < shadows; i++) drawShadowPath(ctx, shadow, getSun().alpha); });
      endShadowFrame();
      const value = ctx.getImageData(120, 120, 1, 1).data[0];
      ctx.restore();
      return value;
    };
    return [frame(1), frame(2)];
  });
  expect(red[0]).toBeLessThan(250);
  expect(red[1]).toBe(red[0]);
  expect(errors).toEqual([]);
});

test('imperceptibly faint shadows are skipped while brighter shadows still render', async ({ page }) => {
  const errors = await openGame(page);
  const alpha = await page.evaluate(() => {
    const surface = document.createElement('canvas');
    surface.width = surface.height = 64;
    const shadowContext = surface.getContext('2d');
    beginShadowFrame(shadowContext);
    const shadow = new Path2D();
    shadow.rect(12, 12, 32, 32);
    drawShadowPath(shadowContext, shadow, 0.08);
    const faint = shadowContext.getImageData(24, 24, 1, 1).data[3];
    drawShadowPath(shadowContext, shadow, 0.12);
    return [faint, shadowContext.getImageData(24, 24, 1, 1).data[3]];
  });
  expect(alpha[0]).toBe(0);
  expect(alpha[1]).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a frame\'s shadows are laid on the ground once, a picture half the screen\'s size', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const laid = await page.evaluate(() => {
    game.isPaused = true;
    const original = ctx.drawImage, half = [Math.ceil(canvas.width / 2), Math.ceil(canvas.height / 2)], seen = [];
    ctx.drawImage = function (source, ...args) {
      if (source instanceof HTMLCanvasElement && source.width === half[0] && source.height === half[1]) seen.push([source.width, source.height]);
      return original.call(this, source, ...args);
    };
    try { render(); } finally { ctx.drawImage = original; }
    return { seen, half };
  });
  expect(laid.seen).toEqual([laid.half]);
  expect(errors).toEqual([]);
});
