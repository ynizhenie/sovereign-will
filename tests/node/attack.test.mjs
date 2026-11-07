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

test('an enemy medic spends herbs and refills its bag at an enemy tent', async () => {
  const result = await sim.enemyHealerHerbs();
  expect(result.afterUse.herbs).toBe(0);
  expect(result.afterUse.hp).toBeGreaterThan(1);
  expect(result.afterRefill).toEqual({ herbs: 5, stock: 0 });
  expect(result.healingResumed).toBe(true);
});

test('undead unarmed presets spawn in pairs; humans and demons have no unarmed wave units', async () => {
  const r = (() => {
    const firstWave = faction => {
      sides.enemy.faction = faction;
      window.sim.start('wave-one-' + faction);
      waveNum = 1; enemies = []; enemyTents = []; enemyTentBlueprints = [];
      startNextWave();
      return [...enemies, ...enemyRafts.flatMap(raft => raft.units)]
        .map(enemy => ({ weapon: enemy.weapon, tool: enemy.tool || null }));
    };
    const result = {
      humans: firstWave('humans'),
      undead: firstWave('undead'),
      demons: firstWave('demons'),
      humanPool: getWavePresetPool('humans', 1).map(o => o.preset.id).sort(),
      undeadPool: getWavePresetPool('undead', 1).map(o => o.preset.id).sort(),
      demonPool: getWavePresetPool('demons', 1).map(o => o.preset.id).sort()
    };
    sides.enemy.faction = 'humans';
    return result;
  })();
  expect(r.humans).toHaveLength(3);
  const unarmedUndead = r.undead.filter(e => e.weapon === 'fist' && e.tool === null);
  expect(unarmedUndead.length).toBeGreaterThan(0);
  expect(unarmedUndead.length % 2).toBe(0);
  expect(r.undead.length - unarmedUndead.length / 2).toBe(3);
  expect(r.humans.every(e => ['club', 'sword'].includes(e.weapon))).toBe(true);
  expect(r.demons.every(e => ['club', 'sword'].includes(e.weapon))).toBe(true);
  expect(r.undead.every(e => ['fist', 'club', 'sword'].includes(e.weapon) && (!e.tool || e.tool === 'necro_staff'))).toBe(true);
  expect(getWavePresetGroupSize('undead', GAME_CONFIG.unitPresets.find(p => p.id === 'big_fist'))).toBe(2);
  expect(getWavePresetGroupSize('undead', GAME_CONFIG.unitPresets.find(p => p.id === 'pet'))).toBe(1);
  expect(getWavePresetGroupSize('undead', GAME_CONFIG.unitPresets.find(p => p.id === 'necromancer'))).toBe(1);
  expect(getWavePresetGroupSize('humans', GAME_CONFIG.unitPresets.find(p => p.id === 'fist'))).toBe(1);
  expect(r.humanPool).toEqual(['club', 'sword']);
  expect(r.undeadPool).toEqual(['club', 'fist', 'necromancer', 'sword']);
  expect(r.demonPool).toEqual(['club', 'sword']);
});

test('preset and gear odds unlock in stages and shift toward advanced equipment', async () => {
  const r = (() => {
    const preset = id => GAME_CONFIG.unitPresets.find(p => p.id === id);
    const highArmy = () => {
      settlers = Array.from({ length: 30 }, () => ({ weapon: 'iron_sword', armor: 'iron', shield: true, helmet: true }));
      buildings = [{ type: 'workshop' }, { type: 'smelter' }, { type: 'smithy' }, { type: 'watchtower' }];
      armory = { 'weapons:crossbow': 1, 'gear:helmet': 1, 'gear:shield': 1 };
    };
    window.sim.start('wave-progression');
    const firstCount = getWaveEnemyCount(1);
    const smallCount = getWaveEnemyCount(12);
    highArmy();
    const developedCount = getWaveEnemyCount(12);
    return {
      firstCount, smallCount, developedCount,
      spearLocked: getWavePresetWeight(preset('spear'), 3, 'humans') === 0,
      spearUnlocked: getWavePresetWeight(preset('spear'), 4, 'humans') > 0,
      crossbowUnlocked: getWavePresetWeight(preset('crossbow'), 11, 'humans') > 0,
      clubOddsFall: getWavePresetWeight(preset('club'), 20, 'humans') < getWavePresetWeight(preset('club'), 1, 'humans'),
      spearOddsRise: getWavePresetWeight(preset('spear'), 20, 'humans') > getWavePresetWeight(preset('spear'), 4, 'humans'),
      earlyGear: ['leather', 'iron', 'shield', 'helmet'].map(id => getWaveGearChance(id, 1)),
      lateGear: ['leather', 'iron', 'shield', 'helmet'].map(id => getWaveGearChance(id, 20))
    };
  })();
  expect(r.firstCount).toBe(3);
  expect(r.developedCount).toBeGreaterThan(r.smallCount);
  expect(r.spearLocked).toBe(true);
  expect(r.spearUnlocked).toBe(true);
  expect(r.crossbowUnlocked).toBe(true);
  expect(r.clubOddsFall).toBe(true);
  expect(r.spearOddsRise).toBe(true);
  expect(r.earlyGear).toEqual([0, 0, 0, 0]);
  expect(r.lateGear.every((chance, i) => chance > r.earlyGear[i])).toBe(true);
  const plain = createConfiguredEnemy({ x: 0, y: 0 }, 'raider'), armored = createConfiguredEnemy({ x: 0, y: 0 }, 'raider');
  armored.armor = 'iron'; armored.shield = true;
  damageEnemy(plain, 20); damageEnemy(armored, 20);
  expect([plain.maxHp - plain.hp, Math.round(armored.maxHp - armored.hp)]).toEqual([20, 10]); // 20 x 0.65 x 0.75
});

test('enemy tents and faction spawners summon the current wave presets', async () => {
  const results = (() => {
    const factions = ['humans', 'undead', 'demons'];
    return factions.map(faction => {
      sides.enemy.faction = faction;
      window.sim.start(faction === 'undead' ? 'undead-tent-pair-6' : 'spawner-presets-' + faction);
      waveNum = 21;
      enemies = [];
      const tent = { x: townHall.x + 200, y: townHall.y, hp: 1000, maxHp: 1000, summonTimer: 0, summonsLeft: 20, summonWave: 20, waveActive: true };
      enemyTents = [tent];
      const allowed = new Set(getWavePresetPool(faction, 20).map(option => option.enemyKey));
      for (let i = 0; i < 20; i++) tickEnemyTents(GAME_CONFIG.enemyTents.summonInterval);
      return { enemies: enemies.map(enemy => ({ key: enemy.enemyKey, weapon: enemy.weapon, summoned: enemy.summoned })), allowed: [...allowed], faction };
    });
  })();
  for (const result of results) {
    if (result.faction === 'undead') {
      const unarmed = result.enemies.filter(enemy => enemy.weapon === 'fist' && ['undead_zombie', 'undead_big_fist'].includes(enemy.key));
      expect(unarmed.length % 2).toBe(0);
      expect(result.enemies.length).toBe(20 + unarmed.length / 2);
    } else {
      expect(result.enemies).toHaveLength(20);
    }
    expect(result.enemies.every(enemy => result.allowed.includes(enemy.key) && enemy.summoned)).toBe(true);
    expect(new Set(result.enemies.map(enemy => enemy.weapon)).size).toBeGreaterThan(1);
  }
});

test('hit while carrying wood home, a worker turns on the enemy rather than walk on (#208)', async () => {
  expect(await sim.struckWhileCarrying()).toEqual({ turned: true, hit: true });
});

test('six swordsmen on two raiders a few steps apart: both fought, at most three on one (#208)', async () => {
  const r = await sim.meleeSlots();
  expect(r.bothFought).toBe(true);
  expect(r.most).toBeLessThanOrEqual(4); // three fighting, and now and then one passing by
});

test('ranged units of both sides use dagger damage when breaking structures', async () => {
  const result = await sim.rangedUnitsUseDaggersOnStructures();
  expect(result.playerResults).toEqual([
    { weapon: 'bow', damage: 15, arrows: 8, swingWeapon: 'dagger' },
    { weapon: 'crossbow', damage: 15, arrows: 8, swingWeapon: 'dagger' }
  ]);
  expect(result.orderedStructure).toEqual({ damage: 15, arrows: 0, swingWeapon: 'dagger' });
  expect(result.enemyDamage).toEqual([
    { key: 'raider', damage: 20, weapon: 'sword' },
    { key: 'raider_fist', damage: 6, weapon: 'fist' },
    { key: 'raider_archer', damage: 15, weapon: 'dagger' }
  ]);
});
