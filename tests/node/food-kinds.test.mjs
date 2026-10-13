// food-kinds: the game's logic, run in Node (moved from tests/food-kinds.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a new game starts with a random mix of food kinds, the same for the same seed (#169)', async () => {
  const r = await (() => {
    const mix = seed => { window.sim.start(seed); return { total: stock.food, mix: { ...foodMix } }; };
    return [mix('food-mix-a'), mix('food-mix-a'), mix('food-mix-b')];
  })();
  const kinds = r[0].mix;
  expect(Object.values(kinds).reduce((a, b) => a + b, 0)).toBe(r[0].total);
  expect(Object.values(kinds).filter(n => n > 0).length).toBeGreaterThan(1);
  expect(r[1]).toEqual(r[0]);
  expect('provisions' in kinds).toBe(false);
});

test('cooking makes dishes, berries and apples come in as their kind (#106)', async () => {
  await sim.cookingRun({ food: 0, raw: { rawMeat: 2, rawFish: 1, wheat: 1 } });
  const mix = await (() => ({ ...foodMix }))();
  expect(mix).toMatchObject({ cookedMeat: 2, cookedFish: 1, bread: 1 });
});
