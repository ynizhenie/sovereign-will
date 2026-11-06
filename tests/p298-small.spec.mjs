import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's #298, part 1: the small ones (2, 5, 6, 7)

test('no sharpening, smoking or wheat stalk among the pastimes any more (#298, 5)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('no-smokes');
    const { makeSettler, clearResources } = window.sim.helpers;
    clearResources();
    settlers = [makeSettler(1, townHall.x + 60, townHall.y + 60, { weapon: 'sword', role: 'soldier' }), makeSettler(2, townHall.x - 60, townHall.y + 60, { tool: 'hoe' }), makeSettler(3, townHall.x, townHall.y + 90)];
    const acts = new Set();
    for (let f = 0; f < 60 * 120; f++) { update(1 / 60); waveTimer = 999; settlers.forEach(s => { s.hunger = 999; if (s.idle) acts.add(s.idle.act); }); }
    return { acts: [...acts], listed: Object.keys(IDLE_ACTIVITIES) };
  });
  for (const gone of ['sharpen', 'smoke', 'straw']) { expect(r.acts).not.toContain(gone); expect(r.listed).not.toContain(gone); }
  expect(errors).toEqual([]);
});

test('soldier patrol distance follows buildings only on that side of the base', async ({ page }) => {
  const errors = await openGame(page);
  const radii = await page.evaluate(() => {
    window.sim.start('directional-patrol');
    const { makeSettler } = window.sim.helpers;
    game.buildings = [{ x: townHall.x + 10 * TILE_SIZE, y: townHall.y, type: 'wall_stone' }];
    const patrol = (id, angle) => {
      const s = makeSettler(id, townHall.x + Math.cos(angle) * 80, townHall.y + Math.sin(angle) * 80, { weapon: 'sword', role: 'soldier' });
      s.idle = { act: 'patrolEdge', left: 10, angle };
      idlePastime(s, { dt: 1 / 60 });
      return Math.hypot(s.pathTarget.x - townHall.x, s.pathTarget.y - townHall.y);
    };
    return { east: patrol(1, 0), north: patrol(2, -Math.PI / 2) };
  });
  expect(radii.east).toBeGreaterThan(10 * 30);
  expect(radii.north).toBeLessThan(6 * 30);
  expect(radii.east - radii.north).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('a patrol route stays on the reachable side of a sealed wall', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('reachable-patrol');
    const { makeSettler } = window.sim.helpers;
    const wallGx = getGridPos(townHall.x + 5 * TILE_SIZE).gx;
    const wallX = wallGx * TILE_SIZE + 15;
    game.buildings = [];
    for (let gy = 0; gy < game.ROWS; gy++) game.buildings.push({ type: 'wall_stone', x: wallX, y: gy * TILE_SIZE + 15 });
    const s = makeSettler(1, wallX - 4 * TILE_SIZE, townHall.y, { weapon: 'sword', role: 'soldier' });
    s.idle = { act: 'patrolEdge', left: 10, angle: 0 };
    settlers = [s];
    resetTileIndex();
    const before = { x: s.x, y: s.y };
    for (let i = 0; i < 120; i++) { game.pathTick++; idlePastime(s, { dt: 1 / 60 }); }
    const target = s.pathTarget;
    const g = target && getGridPos(target.x, target.y);
    return {
      moved: Math.hypot(s.x - before.x, s.y - before.y) > 10,
      targetOnReachableSide: !!target && target.x < wallX,
      targetReachable: !!g && getReachSteps(getSettlerReach(s), g.gx, g.gy) !== -1
    };
  });
  expect(result).toEqual({ moved: true, targetOnReachableSide: true, targetReachable: true });
  expect(errors).toEqual([]);
});

test('a patrol keeps its waypoint while making progress on a long route (#298)', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('patrol-progress');
    const { makeSettler } = window.sim.helpers;
    const s = makeSettler(1, townHall.x + 80, townHall.y + 80, { weapon: 'sword', role: 'soldier' });
    s.idle = { act: 'patrolEdge', left: 10, angle: 0 };
    settlers = [s];
    idlePastime(s, { dt: 1 / 60 });
    const angle = s.idle.angle;
    s.idle.onPoint = 7.99;
    s.x += 20;
    idlePastime(s, { dt: 1 / 60 });
    return { keptWaypoint: s.idle.angle === angle, resetTimer: s.idle.onPoint === 0 };
  });
  expect(result).toEqual({ keptWaypoint: true, resetTimer: true });
  expect(errors).toEqual([]);
});

test('night patrol does not get redirected to the town hall by the directional torch leash (#257)', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    window.sim.start('night-patrol-leash');
    setSideFaction('player', 'humans');
    const { makeSettler } = window.sim.helpers;
    const s = makeSettler(1, townHall.x - 6 * TILE_SIZE, townHall.y, { weapon: 'sword', role: 'soldier' });
    s.idle = { act: 'patrolEdge', left: 100, angle: -Math.PI / 2 };
    settlers = [s];
    stock.torches = 0;
    game.waveTimer = 99999;
    game.dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    game.pathTick++;
    const leash = nightReach(s);
    patrol(s, { dt: 1 / 60, isWaveActive: false });
    return {
      outsideDirectionalLeash: Math.hypot(s.x - townHall.x, s.y - townHall.y) > leash,
      keptPatrolling: !!s.idle && s.idle.act === 'patrolEdge' && !!s.pathTarget &&
        Math.hypot(s.pathTarget.x - townHall.x, s.pathTarget.y - townHall.y) > TILE_SIZE * 4
    };
  });
  expect(result.outsideDirectionalLeash).toBe(true);
  expect(result.keptPatrolling).toBe(true);
  expect(errors).toEqual([]);
});

test('the camp\'s enemies are the same whichever party comes (#298, 6)', async ({ page }) => {
  const errors = await openGame(page);
  await sim(page, 'campOpens', { soldiers: 4 });
  const r = await page.evaluate(() => {
    const step = (sec, until) => { for (let f = 0; f < sec * 60; f++) { update(1 / 60); waveTimer = 999; if (until && until()) return; } };
    const look = party => {
      startRaid(party);
      step(60, () => !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'));
      enterCamp();
      const sig = enemies.map(en => `${en.enemyKey}@${Math.round(en.x)},${Math.round(en.y)}`).sort().join(' ');
      const n = enemies.length;
      leaveCamp(false); endRaid(false);
      return { sig, n };
    };
    const soldiers = settlers.filter(s => s.role === 'soldier');
    const one = look([soldiers[0]]);
    const all = look(soldiers);
    return { one: one.n, all: all.n, same: one.sig === all.sig };
  });
  expect(r.one).toBeGreaterThan(0);
  expect(r).toEqual({ one: r.one, all: r.one, same: true });
  expect(errors).toEqual([]);
});

test('iron ore in its old silver-grey on the map, its icon the same colour; one relieving itself is censored (#298, 7, 2)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    drawIcon(x, 'ironOre', 16, 16, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    let silver = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xaa) < 6 && Math.abs(d[i + 1] - 0xb7) < 6 && Math.abs(d[i + 2] - 0xc3) < 6) silver++;
    const s = settlers[0]; s.needsRelief = true; s.reliefSpot = { x: s.x, y: s.y }; s.reliefTimer = 0.5;
    render();
    return { mapColour: ORE_COLORS.iron.body, silver };
  });
  expect(r.mapColour).toBe('#aab7c3');
  expect(r.silver).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
