import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326: fights from the 26.10 list (21, 23) and the 30.10 list (4, 5, 6)

test('sent where it can\'t get to, a settler stops short, it isn\'t put there through the rock (#326, 30.10, 4)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources(); resetTileIndex();
    const g = getGridPos(townHall.x, townHall.y), at = (dx, dy) => ({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
    for (let dx = 5; dx <= 7; dx++) for (let dy = -1; dy <= 1; dy++) if (dx !== 6 || dy !== 0) addMapResource('natural_rock', at(dx, dy).x, at(dx, dy).y);
    resetTileIndex(); invalidateAllPaths();
    const s = window.sim.helpers.makeSettler(1, at(2, 3).x, at(2, 3).y, { weapon: 'sword', role: 'soldier' });
    settlers = [s]; game.selectedSettler = s; buildMode = 'interact';
    mouse.x = at(6, 0).x; mouse.y = at(6, 0).y; handleCanvasClick();
    let jump = 0, px = s.x, py = s.y;
    for (let f = 0; f < 60 * 12; f++) { waveTimer = 999; update(1 / 60); jump = Math.max(jump, Math.hypot(s.x - px, s.y - py)); px = s.x; py = s.y; }
    return { inside: Math.hypot(s.x - at(6, 0).x, s.y - at(6, 0).y) < 16, jump: jump < 10 };
  });
  expect(r).toEqual({ inside: false, jump: true });
  expect(errors).toEqual([]);
});

test('an archer with an enemy up close draws its dagger, in Battles too; at a tent it uses its dagger, no arrows (#326, 26.10, 21, 23)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources(); resetTileIndex();
    const { makeSettler } = window.sim.helpers;
    const a = makeSettler(1, townHall.x + 200, townHall.y + 120, { weapon: 'bow', role: 'archer', quiver: true, arrows: 20, quiverCapacity: 20 });
    settlers = [a];
    // an enemy right by it: the dagger, no arrow
    const en = createNormalEnemy({ x: a.x + 30, y: a.y }, 'raider'); en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4; enemies = [en];
    let dagger = false, enemyHurt = false;
    for (let f = 0; f < 120; f++) { waveTimer = 999; update(1 / 60); if (usesDagger(a)) dagger = true; if (en.hp < en.maxHp) enemyHurt = true; }
    const closeArrows = 20 - a.arrows;
    // far off: arrows again
    en.x = a.x + 160; en.hp = en.maxHp;
    for (let f = 0; f < 120; f++) { waveTimer = 999; update(1 / 60); }
    const farArrows = 20 - closeArrows - a.arrows;
    // a tent ordered: its dagger, no arrows
    enemies = [];
    const tent = { x: a.x + 120, y: a.y, hp: 200, maxHp: 200 }; enemyTents.push(tent);
    a.orderTarget = tent; a.arrows = 20;
    game.selectedSettler = a;
    for (let f = 0; f < 60 * 8; f++) { waveTimer = 999; update(1 / 60); }
    return { dagger, enemyHurt, closeArrows, farArrows: farArrows > 0, tentHit: tent.hp < 200, tentArrows: 20 - a.arrows };
  });
  expect(r).toEqual({ dagger: true, enemyHurt: true, closeArrows: 0, farArrows: true, tentHit: true, tentArrows: 0 });
  expect(errors).toEqual([]);
});

test('an enemy breaks a building blow by blow, not a little every step; an arrow is led ahead of a target on the move (#326, 30.10, 5, 6)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources(); resetTileIndex();
    settlers = [];
    // the hall walled in all round: an enemy outside has to break through
    const g = getGridPos(townHall.x, townHall.y), walls = [];
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === 4) walls.push(window.sim.helpers.placeBuilding('wall_wood', (g.gx + dx) * TILE_SIZE + 15, (g.gy + dy) * TILE_SIZE + 15));
    resetTileIndex(); invalidateAllPaths();
    const en = createNormalEnemy({ x: (g.gx + 7) * TILE_SIZE + 15, y: townHall.y }, 'raider'); enemies = [en];
    const total = () => walls.reduce((n, w) => n + Math.max(0, w.hp), 0);
    let drops = 0, last = total(), firstHit = -1, sizes = [];
    for (let f = 0; f < 60 * 20; f++) { waveTimer = 999; update(1 / 60); const t = total(); if (t < last - 1e-6) { drops++; sizes.push(last - t); if (firstHit < 0) firstHit = f; last = t; } if (firstHit >= 0 && f - firstHit >= 120) break; }
    // a lead: an archer at a raider walking across its line
    const { makeSettler } = window.sim.helpers;
    const a = makeSettler(1, townHall.x - 200, townHall.y + 200, { weapon: 'bow', role: 'archer', quiver: true, arrows: 20, quiverCapacity: 20 });
    settlers = [a]; enemies = [];
    const runner = createNormalEnemy({ x: a.x + 150, y: a.y - 60 }, 'raider'); runner.damage = 0;
    runner.motionX = 0; runner.motionY = 1.2;
    const aim = leadPoint(a, runner, GAME_CONFIG.weapons.bow.combat.projectileSpeed);
    const cooldown = enemyHitCooldown(GAME_CONFIG.enemies.raider);
    return { steps: drops > 0 && drops <= Math.ceil(2 / cooldown) + 1 && sizes.every(n => n > 2), ledDown: aim.y > runner.y + 5, still: leadPoint(a, { x: 10, y: 10 }, 4).y === 10 };
  });
  expect(r.steps).toBe(true);
  expect(r.ledDown).toBe(true);
  expect(r.still).toBe(true);
  expect(errors).toEqual([]);
});
