// farmer-fisher: the game's logic, run in Node (moved from tests/farmer-fisher.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a farmer with nothing to plant gathers grass (#106)', async () => {
  expect(await sim.idleFarmer({})).toEqual({ grassLeft: 0 });
});

test('a farmer with a watering can fills up at water and waters crops, which then grow twice as fast (#106)', async () => {
  const withCan = await sim.watering({ can: true });
  const without = await sim.watering({ can: false });
  expect(without.watered).toBe(0);
  expect(withCan.watered).toBe(4); // one trip to the water: 5 per fill
  expect(Math.max(...withCan.growth)).toBeGreaterThan(Math.max(...without.growth));
});

test('fishers take worms off old corpses (1, 2 off a big one) and fish with them first (#106)', async () => {
  const r = await sim.worms({});
  expect(r.wormsGathered).toBe(3);
  expect(r.freshUntouched).toBe(true);
  expect(r.wormsSpent).toBeGreaterThan(0);
  expect(r.caughtFish).toBe(true);
});

test('a harvested wheat plot always gives a seed back (#106)', async () => {
  expect(await (() => GAME_CONFIG.mapResources.farm.yield)()).toEqual({ wheat: 4, wheatSeeds: 1 });
});
