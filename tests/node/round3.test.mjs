// #232, the friend's third round: the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('waves grow smoothly: a few enemies at the first, no wave more than 1.6 times the one before', () => {
  const sizes = sim.r3WaveSizes();
  expect(sizes[0]).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < sizes.length; i++) expect(sizes[i] / sizes[i - 1]).toBeLessThan(1.6);
});

test('a thing ordered with nobody picked is made by the one it goes to', () => {
  expect(sim.r3MakerIsTaker({})).toEqual({ makers: [2], gotIt: 'axe' });
});

test('a wounded settler in a panic runs to a tent and heals there', () => {
  expect(sim.r3PanicToTent({})).toEqual({ atTent: true, healed: true });
});

test('marks: one with an axe picks marked apples when nobody with free hands is about; a miner takes marked pebbles while the free hands are busy', () => {
  expect(sim.r3MarksToTools({})).toEqual({ picked: true, minerOnIt: true });
});

test('an archer with no arrows guards nobody', () => {
  expect(sim.r3ArcherNoGuard({})).toEqual({ guarded: false });
});

test('nobody tries to repair a building they can\'t reach, nor a demon to eat a corpse it can\'t', () => {
  expect(sim.r3Unreachable({})).toEqual({ triedRepair: false, triedEat: false });
});

test('the only soldier, cooking, leaves the fire to hunt a boar the player marks', () => {
  expect(sim.r3SoldierLeavesFire({})).toEqual({ cookingBefore: true, hunted: true });
});

test('a fallen enemy drops its sword itself, never a bundle of its cost', () => {
  expect(sim.r3LootItself({})).toEqual({ swords: true, bundles: 0 });
});
