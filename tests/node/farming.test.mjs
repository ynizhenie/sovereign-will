// farming: the game's logic, run in Node (moved from tests/farming.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a farmer with a hoe plants the wheat and sapling zones, harvests and replants (#29)', async () => {
  const r = await sim.farmZonesPlanted({ farmer: true });
  expect(r).toMatchObject({ wheat: 3, saplings: 2, seedsSpent: 3, saplingsSpent: 2, harvestedFood: true, replanted: 3 });
});

test('only farmers plant the zones: a worker without a hoe leaves them (#29)', async () => {
  const r = await sim.farmZonesPlanted({ farmer: false });
  expect(r).toMatchObject({ wheat: 0, saplings: 0, seedsSpent: 0, saplingsSpent: 0 });
});

test('zone tiles are painted, switched, toggled off and cleared; never on water (#29)', async () => {
  expect(await sim.farmZonePainting({})).toEqual({
    afterWheat: ['wheat'], afterSapling: ['sapling'], afterToggleOff: 0, afterClear: 0, onWater: 0
  });
});
