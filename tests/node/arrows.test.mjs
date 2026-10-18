// arrows are made by archers (#249): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('arrows are made, not conjured: three jobs of 2, by a worker with no archer about, by the archer with one', () => {
  expect(sim.arrowsMade({})).toEqual({ orders: 3, instant: 0, arrows: 6, makers: ['worker'] });
  expect(sim.arrowsMade({ archer: true })).toEqual({ orders: 3, instant: 0, arrows: 6, makers: ['archer'] });
});
