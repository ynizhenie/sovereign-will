// #232, the friend's second round: the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('marked sticks go to the workers with free hands, not one with an axe', () => {
  expect(sim.r2FreeHandsFirst({})).toEqual({ axeOnStick: false, sticksLeft: 0 });
});

test('settlers talking in a knot stand apart round it, not in each other', () => {
  expect(sim.r2Knot({})).toEqual({ apart: true });
});

test('in a wave an archer with no arrows anywhere keeps to the town hall, not out at a post', () => {
  expect(sim.r2ArcherNoArrows({})).toEqual({ atHall: true });
});

test('an enemy necromancer leaves a corpse lying by a settler alone, no stepping in and back', () => {
  const r = sim.r2NecroGuardedCorpse({});
  expect(r.wentForIt).toBe(false);
  expect(r.turns).toBeLessThan(3);
});

test('the posts follow the base: farther out where its buildings reach farther', () => {
  expect(sim.r2PostsByShape({})).toEqual({ eastFarther: true });
});

test('the undead fight on in a panic, weaker, instead of running', () => {
  expect(sim.r2UndeadFightOn({})).toEqual({ ranToHall: false, fought: true, weaker: true });
});

test('an undead wave\'s necromancer keeps amid its own: most of them within its reach', () => {
  expect(sim.r2NecroAmid({}).inReach).toBeGreaterThanOrEqual(4);
});
