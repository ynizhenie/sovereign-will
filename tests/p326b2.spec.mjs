import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, Battles part two: each side's buildings, portals and platforms; the battle's look

async function openBattle(page) {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    window.put = (kind, id, gx, gy) => {
      if (kind === 'b') { battle.category = 'buildings'; battle.building = id; } else { battle.category = 'units'; battle.preset = id; }
      battleTap(at(gx, gy).x, at(gx, gy).y);
    };
    window.ring = (gx, gy, door) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) window.put('b', door && dx === -1 && dy === 0 ? 'door' : 'wall_stone', gx + dx, gy + dy); };
    window.fight = (seconds, each) => {
      startBattleFight();
      for (let f = 0; f < 60 * seconds && battle.phase === 'fight'; f++) { update(1 / 60); if (each && each(f)) break; }
    };
  });
  return errors;
}

test('the red side never breaks its own walls; the green breaks into them; the red goes out through its own door (#326)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.lineup = [];
    ring(30, 12, false); put('u', 'humans:sword', 30, 12); put('u', 'humans:sword', 10, 12);
    fight(40);
    const walledIn = { walls: buildings.filter(b => b.type === 'wall_stone').length, winner: battle.winner, red: buildings.filter(b => b.type === 'wall_stone').every(b => b.side === 'red') };
    battle.phase = 'setup'; battle.lineup = [];
    ring(30, 12, true); put('u', 'humans:sword', 30, 12); put('u', 'humans:sword', 6, 12);
    let out = false;
    fight(20, () => (out = enemies[0] && enemies[0].x < 28 * TILE_SIZE));
    const door = buildings.find(b => b.type === 'door');
    return { walledIn, out, door: door && door.hp === door.maxHp, walls: buildings.filter(b => b.type === 'wall_stone').length };
  });
  expect(r.walledIn.red).toBe(true);
  expect(r.walledIn.walls).toBe(7); // (one broken, by the green)
  expect(r.walledIn.winner).toBe('green');
  expect(r).toMatchObject({ out: true, door: true, walls: 7 });
  expect(errors).toEqual([]);
});

test('spikes: the other side\'s walked straight over, a side\'s own walked round (#326)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    const run = setup => {
      battle.phase = 'setup'; battle.lineup = []; setup();
      let onSpikes = 0;
      fight(20, () => { if (enemies[0] && enemies[0].spikeTile) onSpikes++; });
      return onSpikes;
    };
    const green = run(() => { for (let gy = 4; gy <= 20; gy++) put('b', 'spikes', 15, gy); put('u', 'humans:sword', 25, 12); put('u', 'humans:sword', 6, 12); });
    const red = run(() => { for (let gy = 9; gy <= 15; gy++) put('b', 'spikes', 22, gy); put('u', 'humans:sword', 25, 12); put('u', 'humans:sword', 6, 12); });
    return { green, red };
  });
  expect(r.green).toBeGreaterThan(0);
  expect(r.red).toBe(0);
});

test('a red archer goes up its side\'s platform and shoots from it; the red go through their own portals (#326)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(() => {
    battle.lineup = [];
    put('b', 'watchtower', 28, 12); put('u', 'humans:bow', 30, 12); put('u', 'humans:sword', 8, 12);
    let up = false, shot = false;
    fight(15, () => {
      const en = enemies[0];
      up = up || (!!en && !!en.platform && Math.hypot(en.x - en.platform.x, en.y - en.platform.y) < 1);
      shot = shot || projectiles.some(p => p.fromEnemy && p.fromTower);
      return up && shot;
    });
    battle.phase = 'setup'; battle.lineup = [];
    put('b', 'portal', 33, 21); put('b', 'portal', 21, 12); put('u', 'humans:sword', 34, 21); put('u', 'humans:sword', 8, 12);
    let through = false;
    fight(5, () => (through = !!enemies[0] && Math.hypot(enemies[0].x - (21 * TILE_SIZE + 15), enemies[0].y - (12 * TILE_SIZE + 15)) < 50));
    return { up, shot, through };
  });
  expect(r).toEqual({ up: true, shot: true, through: true });
});

test('a battle\'s settings: night and rain are only to look at; blight is unavailable; torches given lit in the dark (#326)', async ({ page }) => {
  const errors = await openBattle(page);
  await page.click('[data-dock="battle-settings"]');
  await page.click('[data-battle-look="time"][data-value="night"]');
  await page.click('[data-battle-look="weather"][data-value="rain"]');
  await expect(page.locator('[data-battle-look="blight"]')).toHaveCount(0);
  const r = await page.evaluate(() => {
    closeSheet();
    battle.lineup = []; battle.torch = true;
    put('u', 'humans:sword', 12, 12); put('u', 'humans:sword', 28, 12); put('u', 'humans:pet', 12, 14); put('b', 'torch', 20, 6);
    const t0 = dayTime;
    for (let f = 0; f < 60; f++) update(1 / 60);
    const dog = settlers.find(s => s.role === 'pet');
    return {
      dark: getDarkness() > 0.5, rain: getWeather().kind, still: dayTime === t0, night: isNight(),
      blighted: isBlighted(20 * TILE_SIZE + 15, 12 * TILE_SIZE + 15), torches: [settlers[0].torchInHand, !!enemies[0].torch, !!dog.torchInHand],
      post: buildings.find(b => b.type === 'torch').lit, asleep: settlers.some(s => s.asleep)
    };
  });
  expect(r).toEqual({ dark: true, rain: 'rain', still: true, night: false, blighted: false, torches: [true, true, false], post: true, asleep: false });
  // Endless after it: its own day and weather, nothing of the battle's
  expect(await page.evaluate(() => { leaveBattleMode(); showMenuScreen('home'); return 1; })).toBe(1);
  await page.click('#mode-endless');
  await page.click('#play-button');
  expect(await page.evaluate(() => [getWeather().kind, getDayPhase()])).toEqual(['clear', 'morning']);
  expect(errors).toEqual([]);
});
