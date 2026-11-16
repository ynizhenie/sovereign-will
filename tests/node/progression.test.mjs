import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('combat and noncombat progression use their respective thresholds', () => {
  expect(sim.progression()).toEqual([
    { level: 1, maxHp: 100, attackSpeed: 1 },
    { level: 2, maxHp: 125, attackSpeed: 1.1 },
    { level: 2, maxHp: 125, attackSpeed: 1.1 },
    { level: 3, maxHp: 150, attackSpeed: 1.2 }
  ]);
});

test('nine independent skills reach level 2 with their configured work bonuses', () => {
  const result = sim.progressionSkills();
  expect(result.levels).toEqual({
    ranged: 2, melee: 2, healing: 2, hunting: 2, fishing: 2, farming: 2, axe: 2, pickaxe: 2, building: 2
  });
  expect(result.speed).toEqual({
    healing: 1.1, fishing: 1.1, farming: 1.1, axe: 1.1, pickaxe: 1.1, building: 1.1
  });
  expect(result.huntingDamage).toBe(1.1);
  expect(result.meleeHealth).toBe(125);
});

test('hunting reaches levels 2 and 3 at 10 and 25 experience', () => {
  expect(sim.huntingProgression()).toEqual([1, 2, 2, 3]);
});

test('a demon cutting up a corpse shows its combat level, while a hunter butchering a boar shows hunting', () => {
  expect(sim.butcherProgression()).toEqual({
    demon: { track: 'melee', level: 3 },
    hunter: { track: 'hunting', level: 2 }
  });
});

test('progression increases attack speed without increasing attack damage', () => {
  expect(sim.progressionCombatStats()).toEqual({
    base: { damage: 6, cooldown: 0.7 },
    levelTwo: { damage: 6, cooldown: 0.7 / 1.1 }
  });
});

test('level 2+ archers lead moving targets while level 1 and melee units aim directly', () => {
  expect(sim.projectileLead()).toEqual({
    levelOne: { x: 100, y: 0 },
    levelTwo: { x: 125, y: 0 },
    melee: { x: 100, y: 0 }
  });
});

test('ghosts do not level up or gain a level attack speed bonus', () => {
  expect(sim.ghostProgression()).toEqual({
    ghost: { hasProgression: false, experience: false, level: false, attackSpeed: 1 },
    enemyGhost: { hasProgression: false, experience: false, level: false, attackSpeed: 1 }
  });
});

test('dogs and hellhounds use their standard bite damage', () => {
  expect(sim.petDamage()).toEqual({ dog: 12, hellhound: 15, enemyDog: 12, enemyHellhound: 15 });
});
