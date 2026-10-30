import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 list of 27.10, part five: locks in the Craft tab (20), soldiers hunting boars in the dark (6)

test('a Craft tile made at a workshop or a smithy not built shows a lock, one a card opens shows a card, one not affordable is greyed (#326, 27.10, 20)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    buildings = buildings.filter(b => !GAME_CONFIG.buildings[b.type] || !GAME_CONFIG.buildings[b.type].crafts);
    updateCraftLists(true);
    const tile = key => document.querySelector(`#tab-craft [data-info="${key}"]`);
    const marks = key => ({ lock: !!tile(key).querySelector('.tile-lock'), card: !!tile(key).querySelector('.tile-card'), greyed: tile(key).classList.contains('no-place') });
    const handKey = Object.values(GAME_CONFIG.tools).filter(i => craftPlace('tools', i.id) === 'hand').map(i => `tools:${i.id}`)[0];
    const before = { axe: marks('tools:axe'), sword: marks('weapons:iron_sword'), hand: handKey ? marks(handKey) : null };
    const { placeBuilding } = window.sim.helpers;
    placeBuilding('workshop', townHall.x + 120, townHall.y);
    updateCraftLists();
    const workshop = { axe: marks('tools:axe'), sword: marks('weapons:iron_sword') };
    // nothing in stock: greyed as can't afford
    for (const k of Object.keys(stock)) stock[k] = 0;
    updateCraftLists(); refreshAffordability(true);
    const broke = tile('tools:axe').classList.contains('cant-afford');
    // cards on: a locked one shows a card, and a lock too while where it's made isn't built
    cardMode = true; game.unlocked = {};
    refreshLocks();
    const lockedSword = isLocked('weapons', 'iron_sword') ? marks('weapons:iron_sword') : null;
    return { before, workshop, broke, lockedSword };
  });
  expect(r.before.axe).toEqual({ lock: true, card: false, greyed: true });
  expect(r.before.sword).toEqual({ lock: true, card: false, greyed: true });
  if (r.before.hand) expect(r.before.hand).toEqual({ lock: false, card: false, greyed: false });
  expect(r.workshop).toEqual({ axe: { lock: false, card: false, greyed: false }, sword: { lock: true, card: false, greyed: true } });
  expect(r.broke).toBe(true);
  expect(r.lockedSword).toEqual({ lock: true, card: true, greyed: true });
  expect(errors).toEqual([]);
});

test('a soldier goes looking for a boar in the dark on the base\'s land and finds it, a worker doesn\'t go for it; one that ran off the land is still hunted (#326, 27.10, 6)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = false;
    window.sim.helpers.clearResources();
    resetTileIndex();
    const { makeSettler } = window.sim.helpers;
    dayTime = GAME_CONFIG.daytime.morning + 20;
    const spot = { x: townHall.x + 18 * TILE_SIZE, y: townHall.y };
    const boar = { x: spot.x, y: spot.y, hp: 30, maxHp: 30, priority: 0, wanderTimer: 999, wanderInterval: 999, targetX: spot.x, targetY: spot.y };
    boars = [boar];
    // a worker with a spear handed to it for a while first: it doesn't go for one it can't see
    const worker = makeSettler(1, townHall.x - 40, townHall.y + 40, { weapon: 'spear', temporary: true });
    settlers = [worker];
    tickFog(10);
    const dark = !isVisible(spot.x, spot.y) && inTerritory(spot.x, spot.y);
    const workerFrom = Math.hypot(worker.x - spot.x, worker.y - spot.y);
    for (let f = 0; f < 180; f++) update(1 / 60);
    const workerStayed = Math.hypot(worker.x - spot.x, worker.y - spot.y) > workerFrom - 60;
    // a soldier: goes looking, sees it, hunts it
    const soldier = makeSettler(2, townHall.x - 40, townHall.y - 40, { weapon: 'spear', role: 'soldier' });
    settlers = [soldier];
    let seen = false, hit = false;
    for (let f = 0; f < 60 * 40 && !hit; f++) {
      update(1 / 60);
      if (isVisible(boar.x, boar.y)) seen = true;
      if (boar.hp < boar.maxHp || boar.isCarcass) hit = true;
    }
    // one that's been on the land and ran off it: still in the list; one never on it isn't
    const out = { x: getTerritoryBox().x1 + 4 * TILE_SIZE, y: townHall.y };
    const ranOff = { x: out.x, y: out.y, hp: 30, maxHp: 30, priority: 0, wanderTimer: 999, wanderInterval: 999, homeZone: true };
    const stranger = { x: out.x, y: out.y + TILE_SIZE, hp: 30, maxHp: 30, priority: 0, wanderTimer: 999, wanderInterval: 999 };
    boars = [ranOff, stranger];
    const listed = getWorkableResources();
    return { dark, workerStayed, seen, hit, ranOff: listed.includes(ranOff), stranger: listed.includes(stranger), outside: !inTerritory(out.x, out.y) };
  });
  expect(r).toEqual({ dark: true, workerStayed: true, seen: true, hit: true, ranOff: true, stranger: false, outside: true });
  expect(errors).toEqual([]);
});
