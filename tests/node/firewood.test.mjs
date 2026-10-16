// firewood, fish traps and worms in the grass (#199): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a woodcutter with nothing to fell chops firewood out of the wood (1 wood, 2 firewood); campfires burn firewood or coal, not wood', () => {
  expect(sim.firewoodChop({})).toEqual({ wood: 0, firewood: 10, fuel: ['coal', 'firewood'] });
});

test('a fish trap by the water catches by itself; a fisher empties it and takes the fish home', () => {
  expect(sim.firewoodFishTrap({})).toEqual({ caught: true, emptied: true, fishHome: true });
});

test('a fish trap goes only on a tile next to water', () => {
  expect(sim.firewoodTrapPlacement({})).toEqual({ byWater: true, dryLand: false });
});

test('an idle fisher with no bait digs in the grass and now and then finds a worm', () => {
  expect(sim.firewoodDigWorms({})).toEqual({ dug: true, worms: true });
});
