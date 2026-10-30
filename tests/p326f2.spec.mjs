import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), battles: the other side's traps, the nearest target, platforms, the armour button; taking a crossbow apart

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
    window.fight = (seconds, each) => {
      startBattleFight();
      for (let f = 0; f < 60 * seconds && battle.phase === 'fight'; f++) { update(1 / 60); if (each && each(f)) break; }
    };
  });
  return errors;
}

test('the red side\'s iron traps catch the player\'s own, who walk onto them as the enemies do onto the player\'s (#326, 14)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.auto = true;
    // red traps right in the way, the red one standing behind them
    for (let gx = 22; gx <= 25; gx++) for (let gy = 11; gy <= 13; gy++) put('b', 'iron_trap', gx, gy);
    put('u', 'humans:sword', 8, 12); put('u', 'humans:sword', 27, 12);
    let caught = false, redCaught = false;
    fight(25, () => { for (const e of enemies) { e.speed = 0; e.damage = 0; } if (settlers.some(s => s.trapped)) caught = true; if (enemies.some(e => e.trapped)) redCaught = true; return caught; });
    return { caught, redCaught };
  });
  expect(r).toEqual({ caught: true, redCaught: false });
  expect(errors).toEqual([]);
});

test('in a battle a unit goes for the nearest enemy (#326, 29)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.auto = true;
    put('u', 'humans:sword', 10, 12);
    put('u', 'humans:sword', 23, 12); put('u', 'humans:sword', 30, 3); put('u', 'humans:sword', 30, 21);
    let start = null, d = null;
    fight(2, f => {
      const s = settlers[0], near = enemies.find(e => Math.abs(e.y - 12 * TILE_SIZE - 15) < 30);
      for (const e of enemies) { e.speed = 0; e.damage = 0; }
      if (!s || !near) return true;
      if (f === 0) start = Math.hypot(s.x - near.x, s.y - near.y);
      d = Math.hypot(s.x - near.x, s.y - near.y);
      return false;
    });
    return { closer: d < start - 30 };
  });
  expect(r.closer).toBe(true);
  expect(errors).toEqual([]);
});

test('up its platform an archer shoots with its own bow, a third farther; never up the red side\'s; down when nothing\'s in reach (#326, 30-31)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.auto = true;
    // its own platform, an enemy in reach
    put('b', 'watchtower', 14, 12); put('u', 'humans:bow', 11, 12); put('u', 'humans:sword', 22, 12);
    let shot = null;
    fight(15, () => { shot = projectiles.find(p => p.fromTower && !p.fromEnemy) || null; return !!shot; });
    const bow = getDefinition('weapons', 'bow').combat;
    const fromBow = !!shot && Math.abs(shot.damage - bow.damage) < 0.01 && Math.abs(shot.life - bow.projectileLife * 1.35) < 3; // (a tick or two flown)
    // only the red side's platform near it: not climbed
    battle.phase = 'setup'; battle.lineup = [];
    put('b', 'watchtower', 22, 12); put('u', 'humans:bow', 16, 12); put('u', 'humans:sword', 32, 3);
    let upRed = false;
    fight(6, () => { if (settlers.some(s => s.towerAssignment && s.towerAssignment.side === 'red')) upRed = true; return upRed; });
    // its own platform, the enemy far out of reach (up the red side's, far off): down after a while
    battle.phase = 'setup'; battle.lineup = [];
    put('b', 'watchtower', 3, 12); put('u', 'humans:bow', 4, 13); put('b', 'watchtower', 28, 12); put('u', 'humans:bow', 27, 13);
    let wasUp = false, cameDown = false;
    fight(20, () => { const s = settlers[0]; if (!s) return true; for (const e of enemies) e.speed = 0; if (s.towerAssignment) wasUp = true; else if (wasUp) cameDown = true; return cameDown; });
    return { fromBow, upRed, wasUp, cameDown };
  });
  expect(r).toEqual({ fromBow: true, upRed: false, wasUp: true, cameDown: true });
  expect(errors).toEqual([]);
});

test('the armour button reads "No armour" with none (#326, 25)', async ({ page }) => {
  await openBattle(page);
  await page.evaluate(() => { battle.armor = false; updateUI(); });
  await expect(page.locator('[data-battle-gear="armor"]').first()).toContainText(/No armour|Без брони/);
});

test('a crossbow taken apart gives back what it cost to make (#326, 34)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const cost = getDefinition('weapons', 'crossbow').cost;
    game.armory['weapons:crossbow'] = 1;
    const before = { ...stock };
    const done = takeApartStored('weapons', 'crossbow');
    const back = Object.fromEntries(Object.keys(cost).map(k => [k, stock[k] - (before[k] || 0)]));
    return { done, back, cost, armory: game.armory['weapons:crossbow'] || 0 };
  });
  expect(r.done).toBe(true);
  expect(r.back).toEqual(r.cost);
  expect(r.armory).toBe(0);
  expect(errors).toEqual([]);
});
