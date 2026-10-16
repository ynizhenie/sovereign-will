// Point marks on resources (#232): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('Point on a resource marks it and again unmarks it, one kind of mark; up to two workers go to it', () => {
  expect(sim.pointMark({})).toEqual({ marks: [1, 0, 1], atMarked: 2 });
});

test('five marked rocks and two miners: each works a rock of its own, both at once, and they finish them all', () => {
  expect(sim.marksSpread({})).toEqual({ together: true, allDone: true });
});

test('an archer with an empty quiver and a wave coming fetches arrows from the stock before its post', () => {
  expect(sim.archerRestock({})).toEqual({ arrows: 12, stock: 18 });
});
