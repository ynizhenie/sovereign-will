// farm-zone-rules: the game's logic, run in Node (moved from tests/farm-zone-rules.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('farm zones go on grass and hand-gathered things, not on trees, boulders, sand or walls (#92)', async () => {
  expect(await sim.zonePlacement({})).toEqual({
    grass: true, grassTuft: true, stick: true, bush: true, tree: false, boulder: false, sand: false, wall: false
  });
});

test('a worker clears grass off a zone tile, then the farmer plants it (#92)', async () => {
  expect(await sim.zoneGetsCleared({})).toEqual({ grassGone: true, planted: true });
});
