// attack: the game's logic, run in Node (moved from tests/attack.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a blow hits only the enemy aimed at; a giant\'s hits everyone in reach (#144)', async () => {
  expect(await sim.oneBlow({ type: 'normal' })).toEqual([true, false]);
  expect(await sim.oneBlow({ type: 'big' })).toEqual([true, true]);
});

test('an enemy healer walks up to a hurt raider and heals it (#203)', async () => {
  expect(await sim.enemyHealer()).toEqual({ healed: true, holdsBag: true });
});

test('every faction\'s waves bring their new kinds: a healer, a zombie and an imp with swords; the demon carries a spear (#203)', async () => {
  const r = (() => {
    // the kinds in waves 4 to 12
    const kinds = faction => {
      sides.enemy.faction = faction;
      window.sim.start('kinds-' + faction);
      const seen = new Set();
      for (let wave = 4; wave <= 12; wave++) { waveNum = wave; enemies = []; startNextWave(); enemies.forEach(e => seen.add(e.enemyKey)); }
      sides.enemy.faction = 'humans';
      return [...seen];
    };
    return { humans: kinds('humans'), undead: kinds('undead'), demons: kinds('demons'), demonWeapon: GAME_CONFIG.enemies.demon_brute.weapon };
  })();
  expect(r.humans).toContain('raider_medic');
  expect(r.undead).toContain('undead_zombie_sword');
  expect(r.demons).toContain('demon_imp_sword');
  expect(r.demonWeapon).toBe('spear');
});

test('waves come in armour and with shields once the player has made them, more as the waves go; armour takes damage off (#203)', async () => {
  const r = (() => {
    const dressed = (gear, wave) => {
      window.sim.start('enemy-gear');
      playerGear = gear;
      waveNum = wave; enemies = []; startNextWave();
      return { armor: enemies.filter(e => e.armor === 'iron').length, shield: enemies.filter(e => e.shield).length, all: enemies.length };
    };
    const none = dressed({ armor: false, shield: false }, 14);
    const early = dressed({ armor: true, shield: true }, 2);
    const late = dressed({ armor: true, shield: true }, 14);
    const plain = createConfiguredEnemy({ x: 0, y: 0 }, 'raider'), armored = createConfiguredEnemy({ x: 0, y: 0 }, 'raider');
    armored.armor = 'iron'; armored.shield = true;
    damageEnemy(plain, 20); damageEnemy(armored, 20);
    return { none: none.armor + none.shield, early: early.armor + early.shield, late, lost: [plain.maxHp - plain.hp, Math.round(armored.maxHp - armored.hp)] };
  })();
  expect(r.none).toBe(0);
  expect(r.early).toBe(0);
  expect(r.late.armor).toBeGreaterThan(0);
  expect(r.late.shield).toBeGreaterThan(0);
  expect(r.late.armor).toBeLessThan(r.late.all);
  expect(r.lost).toEqual([20, 10]); // 20 x 0.65 x 0.75
});
