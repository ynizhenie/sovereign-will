// #261, the friend's fixes to the fixes: the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a woodcutter with nothing to do chops firewood without flickering between that and idle (#261)', () => {
  expect(sim.r4FirewoodSteady({})).toEqual({ flips: 0, chopped: true });
});

test('taking the tool off a swordsman gives back the tool\'s cost only; into the store, it\'s whole in the armory (#248, #261)', () => {
  expect(sim.r4TakeOff({})).toEqual({ weapon: 'sword', tool: 'none', back: { wood: 5, stone: 5 }, stored: 0 });
  expect(sim.r4TakeOff({ keep: true })).toEqual({ weapon: 'sword', tool: 'none', back: { wood: 0, stone: 0 }, stored: 1 });
});

test('armour taken off into the store: whole in the armory, no iron back (#248)', () => {
  expect(sim.r4ArmorToStore({})).toEqual({ armor: null, iron: 0, stored: 1 });
});

test('a club is made by hand at the town hall, no workshop; an axe still needs one (#261)', () => {
  expect(sim.r4ByHand({})).toEqual({ place: 'hand', ordered: true, atHall: true, stored: 1, axeNeedsWorkshop: false });
});

test('a soldier fights an enemy at the base, or one the player marked, before going for the enemy tents (#261)', () => {
  expect(sim.r4TentsWait({})).toEqual({ atFoe: true, tentWhole: true });
  expect(sim.r4TentsWait({ marked: true })).toEqual({ atFoe: true, tentWhole: true });
});
