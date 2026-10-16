// a big one's blow hits at most three at once (#209): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a big settler\'s blow among five enemies hits three, the one it aims at among them', () => {
  expect(sim.splashBigSettler({})).toEqual({ hit: 3, aimedHit: true });
});

test('a brute among five settlers hurts three of them, not all five', () => {
  expect(sim.splashBigEnemy({})).toEqual({ hurt: 3 });
});
