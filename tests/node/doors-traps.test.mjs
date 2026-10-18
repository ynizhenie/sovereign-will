// #248 (part two): doors on walls, the iron door, the iron trap: the game's logic, run in Node
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a door goes right on a wooden or stone wall, an iron door on that door; the old one stands till it\'s built, its refund back; not on a tent; settlers walk through (#248)', () => {
  for (const wall of ['wall_wood', 'wall_stone']) {
    const r = sim.doorOnWall({ wall });
    expect(r).toEqual({ placed: true, wallWhileBuilding: wall, door: 'door', refund: wall === 'wall_wood' ? 3 : 0, ironPlaced: true, ironDoor: 'iron_door', onTent: false, walkable: true });
  }
});

test('an iron trap: an enemy stepping on it is badly hurt and held, then free; settlers keep off it, enemies don\'t see it (#248)', () => {
  expect(sim.ironTrapEnemy({})).toEqual({ held: true, hurt: 60, stillHeld: true, freed: true, settlersKeepOff: true, enemiesDontSee: true });
});

test('a boar goes for an iron trap\'s bait: caught at its chance, or it eats the bait (#248)', () => {
  expect(sim.ironTrapBoar({ chance: 1 })).toEqual({ caught: true, atTrap: true, baitLeft: 0 });
  expect(sim.ironTrapBoar({ chance: 0 })).toMatchObject({ caught: false, baitLeft: 0 });
});

test('a worker with free hands brings an iron trap a piece of food as bait (#248)', () => {
  expect(sim.ironTrapBait({})).toEqual({ bait: 1, food: 4 });
});
