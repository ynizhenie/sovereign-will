// Point marks on resources (#232): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('Point on a resource marks it and again unmarks it, one kind of mark; up to two workers go to it', () => {
  expect(sim.pointMark({})).toEqual({ marks: [1, 0, 1], atMarked: 2 });
});
