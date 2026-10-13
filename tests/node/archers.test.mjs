// archers: the game's logic, run in Node (moved from tests/archers.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('an archer hunting only shoots with a clear line, not into stones (#173)', async () => {
  expect(await sim.huntClearShots()).toEqual({ shots: true, blind: 0 });
});

test('an archer climbs a tower walled in on three sides (#173)', async () => {
  expect(await sim.climbWalledTower()).toEqual({ up: true });
});

test('an archer comes down from a walled-in tower onto a free tile, not into a wall (#173)', async () => {
  expect(await sim.climbDownInPocket()).toEqual({ onFreeTile: true, offTower: true });
});
