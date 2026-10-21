// Rope and torches: the game's crafting flow, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a rod order makes its missing rope first, and crafted torches can be dismantled', () => {
  expect(sim.supplies({})).toEqual({
    orderedRod: true, queuedRope: true, rodStored: true, leftoverRope: 1,
    torchCrafted: true, dismantled: true, torches: 0, rope: 1
  });
});

test('a torch can be ordered with herbs when there is no rope in stock', () => {
  expect(sim.torchFromHerbs({})).toEqual({ queuedRope: true, torchCrafted: true, ropeLeft: 1, herbsLeft: 8 });
});
