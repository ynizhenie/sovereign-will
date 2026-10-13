// buildings99: the game's logic, run in Node (moved from tests/buildings99.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a guard climbing down from a tower lands on a free tile the town hall can reach (#99)', async () => {
  expect(await sim.towerExit({})).toEqual({ inWall: false, reachable: true, besideTower: true });
});

test('one settler at a time carries to the smelter, which holds at most 6 ore, 6 coal and 6 iron (#99)', async () => {
  const r = await sim.smelterRush({});
  expect(r.maxCarriers).toBe(1);
  expect(r.maxOre).toBeLessThanOrEqual(6);
  expect(r.maxCoal).toBeLessThanOrEqual(6);
  expect(r.ironHome).toBeGreaterThan(0);
  // nobody takes the iron away: smelting stops at 6
  const full = await sim.smelterRush({ collect: false, seconds: 60 });
  expect(full.maxIron).toBe(6);
});
