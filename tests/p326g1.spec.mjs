import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326: what was left of the 26.10 list (12, 13, 15, 16) and the 30.10 list (2, 7)

test('a dummy in Battles keeps its look when another building is placed (#326, 26.10, 13)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  const r = await page.evaluate(() => {
    const at = gx => gx * TILE_SIZE + 15;
    const build = (id, gx, gy) => { battle.category = 'buildings'; battle.building = id; battleTap(at(gx), at(gy)); };
    build('dummy', 8, 8); for (let i = 0; i < 2; i++) render();
    const looks = [buildings.find(b => b.type === 'dummy').variant];
    for (let k = 0; k < 6; k++) { build('wall_wood', 9 + k, 12); for (let i = 0; i < 2; i++) render(); looks.push(buildings.find(b => b.type === 'dummy').variant); }
    return { same: new Set(looks).size === 1 && !!looks[0] };
  });
  expect(r.same).toBe(true);
  expect(errors).toEqual([]);
});

test('a possessed ghost is let go after its dive into an enemy (#326, 26.10, 12)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const g = await page.evaluate(() => {
    const grave = { type: 'grave', x: townHall.x - 90, y: townHall.y + 60, hp: 100, maxHp: 100 };
    buildings.push(grave);
    const ghost = window.sim.helpers.makeSettler(5, townHall.x - 40, townHall.y, { type: 'ghost', role: 'pet' });
    settlers.push(ghost);
    const en = createNormalEnemy({ x: ghost.x + 10, y: ghost.y }, 'raider'); en.speed = 0; enemies = [en];
    game.selectedSettler = ghost; switchPossession();
    const was = !!ghost.isPossessed;
    haunt(ghost, en);
    return { was, now: !!ghost.isPossessed, gone: ghost.ghostGone > 0 };
  });
  expect(g).toEqual({ was: true, now: false, gone: true });
  expect(errors).toEqual([]);
});

test('a sleeping pet sent somewhere wakes and walks; a source with a mine on it can be marked and stays marked (#326, 30.10, 2, 7)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    const dog = window.sim.helpers.makeSettler(3, townHall.x - 60, townHall.y + 40, { type: 'dog', role: 'pet' });
    settlers = [dog];
    dog.petSleep = 30;
    dog.orderSpot = { x: dog.x + 120, y: dog.y }; // (as a tap on the ground orders it)
    const from = dog.x;
    for (let f = 0; f < 60; f++) { waveTimer = 999; update(1 / 60); }
    const woke = !(dog.petSleep > 0), walked = dog.x - from > 20;
    // a source: not markable bare, markable with a mine, still marked after its ore is mined
    const source = getOreSpawners('iron')[0];
    buildMode = 'interact';
    const tap = () => { mouse.x = source.x; mouse.y = source.y; handleCanvasClick(); };
    tap();
    const bare = source.priority || 0;
    buildings.push({ type: 'mine', x: source.x, y: source.y, hp: 150, maxHp: 150 });
    tap();
    const marked = source.priority || 0;
    return { woke, walked, bare, marked };
  });
  expect(r).toEqual({ woke: true, walked: true, bare: 0, marked: 1 });
  expect(errors).toEqual([]);
});
