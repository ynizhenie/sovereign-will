// cooking: the game's logic, run in Node (moved from tests/cooking.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a worker carries fuel to the campfire, cooks all the raw food and carries it home (#30, #106)', async () => {
  // 7 raw pieces -> 7 food; (#298) a firewood burns 30 s by itself, long enough for all 7 (1.5 s each): 1 trip
  expect(await sim.cookingRun({}))
    .toEqual({ food: 12, rawMeat: 0, rawFish: 0, wheat: 0, firewood: 1, coal: 0, maxCooks: 1, carriedFood: true, fuelTrips: 1, cooks: ['worker'] });
});

test('coal burns first (#30)', async () => {
  const r = await sim.cookingRun({ raw: { rawMeat: 8 }, fuel: { firewood: 3, coal: 1 } });
  expect(r).toMatchObject({ food: 13, rawMeat: 0, coal: 0, firewood: 3 }); // (the coal enough for all 8, #298)
});

test('all raw food gets cooked even with plenty of food; nothing without fuel (#106)', async () => {
  expect(await sim.cookingRun({ food: 100 })).toMatchObject({ food: 107, rawMeat: 0 });
  expect(await sim.cookingRun({ fuel: { firewood: 0, coal: 0 } })).toMatchObject({ food: 5, rawMeat: 3 });
});

test('one cook per campfire (#30)', async () => {
  expect((await sim.cookingRun({ workers: 3 })).maxCooks).toBe(1);
});

test('boars give raw meat, fishing raw fish, farms grain; berries stay ready food (#31)', async () => {
  const y = await (() => ({
    boar: GAME_CONFIG.mapResources.boar.yield, farm: GAME_CONFIG.mapResources.farm.yield,
    fish: GAME_CONFIG.fishing.catch, berry: GAME_CONFIG.mapResources.berry_bush.yield
  }))();
  expect(y).toEqual({ boar: { rawMeat: 6, leather: 2 }, farm: { wheat: 4, wheatSeeds: 1 }, fish: { rawFish: 2 }, berry: { berries: 2 } });
});

test('an idle soldier cooks before a worker does; with none, a worker with free hands (#200)', async () => {
  const both = await sim.cookingRun({ workers: 1, soldiers: 1 });
  expect(both).toMatchObject({ cooks: ['soldier'], carriedFood: true }); // (the soldier hunts boars too: more meat than fuel)
  expect((await sim.cookingRun({ workers: 1 })).cooks).toEqual(['worker']);
});
