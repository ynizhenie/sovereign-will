// attack: the game's logic, run in Node (moved from tests/attack.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a blow hits only the enemy aimed at; a giant\'s hits everyone in reach (#144)', async () => {
  expect(await sim.oneBlow({ type: 'normal' })).toEqual([true, false]);
  expect(await sim.oneBlow({ type: 'big' })).toEqual([true, true]);
});
