import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), 16: in battles the enemies fought better than the player's own with the same units

async function openBattle(page) {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    window.put = (id, gx, gy) => { battle.category = 'units'; battle.preset = id; battleTap(at(gx, gy).x, at(gx, gy).y); };
  });
  return errors;
}

test('a settler with a sword strikes from as far past the bodies as an enemy with one; an enemy no faster for stepping out of reach and back (#326, 27.10, 16)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    put('humans:sword', 18, 12); put('humans:sword', 22, 12);
    startBattleFight();
    const s = settlers[0], en = enemies[0];
    const sx = s.x, sy = s.y;
    const place = d => { s.x = sx; s.y = sy; en.x = sx + d; en.y = sy; };
    // 30 px apart (past its old 22, within the enemy's 33): the settler, standing, hits the held enemy
    s.speed = 0; en.trapped = true; en.hp = en.maxHp = 1e6;
    let settlerHits = 0;
    for (let f = 0; f < 60; f++) { place(30); const hp = en.hp; update(1 / 60); if (en.hp < hp) settlerHits++; }
    // the enemy, jostled in and out of its reach every other step for two seconds: no more blows than its cooldown allows
    en.trapped = false; en.speed = 0; s.isPossessed = true; s.attackCooldown = 999; s.hp = s.maxHp = 1e6;
    const reach = (s.visualRadius || s.radius) + en.radius + getEnemyDef(en).reach;
    let hits = 0;
    for (let f = 0; f < 120; f++) { const hp = s.hp; place(f % 2 ? reach + 3 : reach - 3); update(1 / 60); if (s.hp < hp) hits++; }
    const most = Math.ceil(2 / GAME_CONFIG.weapons.sword.combat.cooldown) + 1;
    return { settlerHits, hits, most };
  });
  expect(r.settlerHits).toBeGreaterThan(0);
  expect(r.hits).toBeGreaterThan(0);
  expect(r.hits).toBeLessThanOrEqual(r.most);
  expect(errors).toEqual([]);
});

test('six swordsmen against six on Normal (the red side weaker): the player\'s win; the undead on the green side don\'t panic (#326, 27.10, 16)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    const fight = id => {
      battle.lineup = []; battle.phase = 'setup';
      for (let i = 0; i < 6; i++) { put(id, 14 - (i % 2) * 2, 8 + i * 2); put(id, 25 + (i % 2) * 2, 8 + i * 2); }
      game.worldSeed = createWorldSeed('p326f10-battle-balance');
      startBattleFight();
      let panicked = false;
      for (let f = 0; f < 60 * 90 && battle.phase === 'fight'; f++) { update(1 / 60); if (settlers.some(s => s.panic)) panicked = true; }
      const winner = battle.winner;
      battle.phase = 'setup';
      return { winner, panicked };
    };
    setBattleDifficulty('normal');
    return { humans: fight('humans:sword'), undead: fight('undead:sword') };
  });
  expect(r.humans.winner).toBe('green');
  expect(r.undead.panicked).toBe(false);
  expect(errors).toEqual([]);
});
