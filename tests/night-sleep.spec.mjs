import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('a settler sleeps within one tile of its shelter, avoiding an apple tree', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    document.getElementById('seed-input').value = 'sleep-spot-apple';
    applySeedFromUI();
    resetGame();
    gameStarted = true;
    isPaused = false;
    document.getElementById('main-menu').style.display = 'none';
    window.sim.helpers.clearResources();
    buildings = [];
    settlers = [];
    waveTimer = 999;
    const tent = window.sim.helpers.placeBuilding('tent', townHall.x + TILE_SIZE * 6, townHall.y);
    resetTileIndex();
    const s = window.sim.helpers.makeSettler(1, tent.x - TILE_SIZE * 2, tent.y);
    settlers = [s];
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    const home = getGridPos(tent.x, tent.y);
    trees.push({ x: (home.gx - 1) * TILE_SIZE + 15, y: home.gy * TILE_SIZE + 15, hp: 3, maxHp: 3, isGrowing: false, apple: true, applesReady: true });
    resetTileIndex();
    const tick = { dt: 1 / 60, isWaveActive: false, markedResources: [], resourceKind: new Map() };
    const step = () => { game.pathTick++; return sleepAtNight(s, tick); };
    step();
    for (let i = 0; i < 900 && !s.asleep; i++) step();
    const spot = s.sleepSpot, tile = spot && getGridPos(spot.x, spot.y);
    return {
      usesTent: s.sleepAt === tent,
      adjacentTile: !!tile && Math.abs(tile.gx - home.gx) <= 1 && Math.abs(tile.gy - home.gy) <= 1 && (tile.gx !== home.gx || tile.gy !== home.gy),
      open: !!tile && !isTileBlockedForSettler(tile.gx, tile.gy),
      asleep: !!s.asleep
    };
  });
  expect(result).toEqual({ usesTent: true, adjacentTile: true, open: true, asleep: true });
  expect(errors).toEqual([]);
});

test('if one shelter is full, a settler uses another; if all are full, it falls back to the town hall', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    document.getElementById('seed-input').value = 'sleep-shelter-capacity';
    applySeedFromUI();
    resetGame();
    gameStarted = true;
    isPaused = false;
    document.getElementById('main-menu').style.display = 'none';
    window.sim.helpers.clearResources();
    buildings = [];
    settlers = [];
    const near = window.sim.helpers.placeBuilding('tent', townHall.x + TILE_SIZE * 5, townHall.y);
    const far = window.sim.helpers.placeBuilding('tent', townHall.x - TILE_SIZE * 7, townHall.y);
    resetTileIndex();
    const s = window.sim.helpers.makeSettler(100, townHall.x + TILE_SIZE * 3, townHall.y);
    settlers = [s];
    const occupied = (home, idStart) => {
      const g = getGridPos(home.x, home.y);
      return [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]].map(([dx, dy], i) => {
        const o = window.sim.helpers.makeSettler(idStart + i, home.x, home.y);
        o.sleepAt = home;
        o.sleepSpot = { x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 };
        return o;
      });
    };
    settlers.push(...occupied(near, 200));
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    const tick = { dt: 1 / 60, isWaveActive: false, markedResources: [], resourceKind: new Map() };
    game.pathTick++;
    sleepAtNight(s, tick);
    const choseOtherShelter = s.sleepAt === far;

    settlers.push(...occupied(far, 300));
    game.pathTick++;
    sleepAtNight(s, tick);
    return { choseOtherShelter, townHallFallback: s.sleepAt === townHall };
  });
  expect(result).toEqual({ choseOtherShelter: true, townHallFallback: true });
  expect(errors).toEqual([]);
});

test('a settler changes its sleep destination when an obstacle appears on the reserved tile', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    document.getElementById('seed-input').value = 'sleep-spot-reroute';
    applySeedFromUI();
    resetGame();
    gameStarted = true;
    isPaused = false;
    document.getElementById('main-menu').style.display = 'none';
    window.sim.helpers.clearResources();
    buildings = [];
    waveTimer = 999;
    const s = window.sim.helpers.makeSettler(1, townHall.x + 150, townHall.y);
    settlers = [s];
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    const tick = { dt: 1 / 60, isWaveActive: false, markedResources: [], resourceKind: new Map() };
    game.pathTick++;
    sleepAtNight(s, tick);
    const previous = { ...s.sleepSpot };
    const tile = getGridPos(previous.x, previous.y);
    trees.push({ x: tile.gx * TILE_SIZE + 15, y: tile.gy * TILE_SIZE + 15, hp: 3, maxHp: 3, isGrowing: false, apple: true, applesReady: true });
    resetTileIndex();
    game.pathTick++;
    sleepAtNight(s, tick);
    const next = s.sleepSpot, nextTile = getGridPos(next.x, next.y);
    return {
      changed: next.x !== previous.x || next.y !== previous.y,
      open: !isTileBlockedForSettler(nextTile.gx, nextTile.gy)
    };
  });
  expect(result).toEqual({ changed: true, open: true });
  expect(errors).toEqual([]);
});

test('a sleeping settler wakes to receive equipment', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const s = window.sim.helpers.makeSettler(1, townHall.x, townHall.y);
    s.asleep = true;
    s.targetEquipment = { weapon: 'fist', tool: 'axe', role: 'worker' };
    settlers = [s];
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    waveTimer = 999;
    update(1 / 60);
    return { asleep: s.asleep, tool: s.tool, targetEquipment: s.targetEquipment };
  });
  expect(result).toEqual({ asleep: false, tool: 'axe', targetEquipment: null });
  expect(errors).toEqual([]);
});

test('a sleeping settler wakes for a craft order assigned to them', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const s = window.sim.helpers.makeSettler(1, townHall.x, townHall.y);
    s.asleep = true;
    settlers = [s];
    game.craftOrders = [{
      key: 'tools:axe', category: 'tools', id: 'axe', crafter: null, for: s,
      stage: 'waitResources', progress: 0, waitFor: { wood: 1 }
    }];
    stock.wood = 0;
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 5;
    waveTimer = 999;
    update(1 / 60);
    return { asleep: s.asleep, hasOrder: game.craftOrders.some(order => order.for === s) };
  });
  expect(result).toEqual({ asleep: false, hasOrder: true });
  expect(errors).toEqual([]);
});
