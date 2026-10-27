import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the fog: what's seen and what's known (19, 32, 33, N8, N9)


test('night sight is smaller, lit things and a torch in hand see as by day, a pet sees farther night or day (#326, 32)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    for (const list of [game.trees, game.cacti, game.boulders, game.naturalRocks, game.waterTiles, game.ironOres, game.coalOres, game.berryBushes]) list.length = 0;
    resetTileIndex();
    const { makeSettler } = window.sim.helpers;
    const far = { x: townHall.x + 700, y: townHall.y + 700 }; // (off by itself: only its own sight counts)
    const seenAround = u => { let n = 0; for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) if (isVisible(u.x + dx * TILE_SIZE, u.y + dy * TILE_SIZE)) n++; return n; };
    const measure = (make, night) => {
      dayTime = night ? GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 20 : GAME_CONFIG.daytime.morning + 20;
      const u = make(); settlers = [u]; buildings = [];
      tickFog(10);
      return seenAround(u);
    };
    const plain = () => Object.assign(makeSettler(1, far.x, far.y), { tool: 'none' });
    const lit = () => Object.assign(plain(), { torchInHand: true });
    const dog = () => { const d = makeSettler(1, far.x, far.y); changeSettlerType(d, 'dog'); d.role = 'pet'; return d; };
    const day = measure(plain, false), night = measure(plain, true), torch = measure(lit, true), dogDay = measure(dog, false), dogNight = measure(dog, true);
    return { smallerAtNight: night < day, torchRestores: torch === day, petFarther: dogDay > day, petNight: dogNight === dogDay };
  });
  expect(r).toEqual({ smallerAtNight: true, torchRestores: true, petFarther: true, petNight: true });
  expect(errors).toEqual([]);
});

test('a boar in the dark isn\'t workable, in sight it is; an enemy in the fog sees a settler only close, else goes for the town hall; its torch gives no light unseen (#326, 19, N8, N9)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    game.isPaused = false;
    for (const list of [game.trees, game.cacti, game.boulders, game.naturalRocks, game.waterTiles, game.ironOres, game.coalOres, game.berryBushes]) list.length = 0;
    resetTileIndex();
    const { makeSettler } = window.sim.helpers;
    dayTime = GAME_CONFIG.daytime.morning + 20;
    settlers = [makeSettler(1, townHall.x - 40, townHall.y)];
    // the boar: out of the colony's sight, inside the base's land
    const spot = { x: townHall.x + 18 * TILE_SIZE, y: townHall.y };
    boars = [{ x: spot.x, y: spot.y, hp: 30, maxHp: 30, priority: 0, wanderTimer: 999, wanderInterval: 999 }];
    tickFog(10);
    const inLand = inTerritory(spot.x, spot.y);
    const dark = !isVisible(spot.x, spot.y);
    const hiddenBoar = !getWorkableResources().includes(boars[0]);
    // someone goes close: it's seen, and workable
    settlers[0].x = spot.x - 100; settlers[0].y = spot.y; tickFog(10);
    const seenBoar = getWorkableResources().includes(boars[0]);
    // the enemy
    const en = createNormalEnemy({ x: townHall.x + 900, y: townHall.y + 900 }, 'raider'); en.speed = 0; enemies = [en];
    const near = makeSettler(2, en.x - 90, en.y), afar = makeSettler(3, en.x - 400, en.y);
    settlers = [afar]; for (let f = 0; f < 3; f++) update(1 / 60); const sawFar = !!en.attackTarget && en.attackTarget === afar;
    en.attackTarget = null; settlers = [afar, near]; for (let f = 0; f < 3; f++) update(1 / 60); const sawNear = en.attackTarget === near;
    // its torch: lit only where it's seen
    en.torch = true; settlers = [near]; tickFog(10);
    const lightAt = () => getLights().some(l => l.x === en.x && l.y === en.y);
    const unseenLit = lightAt();
    return { inLand, dark, hiddenBoar, seenBoar, sawFar, sawNear, unseenLit };
  });
  expect(r).toEqual({ inLand: true, dark: true, hiddenBoar: true, seenBoar: true, sawFar: false, sawNear: true, unseenLit: true });
  expect(errors).toEqual([]);
});
