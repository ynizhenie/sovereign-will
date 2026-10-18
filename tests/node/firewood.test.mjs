// firewood, fish traps and worms in the grass (#199): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a woodcutter with nothing to fell chops firewood out of the wood (1 wood, 2 firewood); campfires burn firewood or coal, not wood', () => {
  expect(sim.firewoodChop({})).toEqual({ wood: 0, firewood: 10, fuel: ['coal', 'firewood'] });
});

test('a fish trap on the water: a fisher baits it with a worm, it catches by itself, the fisher empties it and takes the fish home; no bait, no fish (#248)', () => {
  expect(sim.firewoodFishTrap({})).toEqual({ baited: true, wormUsed: true, caught: true, emptied: true, fishHome: true });
  expect(sim.firewoodFishTrap({ bait: false })).toEqual({ baited: false, wormUsed: true, caught: false, emptied: true, fishHome: false });
});

test('a fish trap goes on water a fisher could fish from, not beside it or on dry land (#248)', () => {
  expect(sim.firewoodTrapPlacement({})).toEqual({ byWater: false, onWater: true, dryLand: false });
});

test('an idle fisher with no bait digs in the grass and now and then finds a worm', () => {
  expect(sim.firewoodDigWorms({})).toEqual({ dug: true, worms: true });
});
