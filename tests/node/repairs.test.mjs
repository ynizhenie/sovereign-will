// repairs: the game's logic, run in Node (moved from tests/repairs.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a damaged wall is repaired only once ordered, a share of its cost per step (#24)', async () => {
  const r = await sim.wallRepair({});
  expect(r.stepCost).toEqual({ stone: 1 }); // 20% of 5 stone, rounded up
  expect(r.beforeOrder).toBe(0.5);
  expect(r.after).toBe(1);
  expect(r.stillOrdered).toBe(false);
  expect(r.stoneSpent).toBe(2); // two steps of 25% hp
});
