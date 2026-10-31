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
      yield 0.3; seen.push({ shown: !screen.hidden, loading: game.loading, width: fill.style.width });
      yield 0.8; seen.push({ shown: !screen.hidden, loading: game.loading, width: fill.style.width });
    })());
    // the game's own start goes through it too: the world is made in steps
    let steps = 0;
    for (const share of resetGameSteps()) { steps++; if (share > 1) steps = -1e9; }
    return { seen, after: { shown: !screen.hidden, loading: game.loading }, steps, text: document.getElementById('loading-title').textContent };
  });
  expect(r.seen).toEqual([{ shown: true, loading: true, width: '30%' }, { shown: true, loading: true, width: '80%' }]);
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
    await frames(8);
    const opened = door.openness;
    settlers = [];
    await frames(8);
    return { start: open[0], opened, shut: door.openness, ironShut: iron.openness };
  });
  expect(r.start).toBe(0);
  expect(r.opened).toBeGreaterThan(0.9);
  expect(r.shut).toBe(0);
  expect(r.ironShut).toBe(0);
  expect(errors).toEqual([]);
});
