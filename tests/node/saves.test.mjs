// saves: the game's logic, run in Node (moved from tests/saves.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a saved game loads back exactly, pointers between things included, and goes on the same way (#156)', async () => {
  expect(await sim.saveRoundTrip()).toEqual({ same: true, pointers: true, sameAfterwards: true });
});
