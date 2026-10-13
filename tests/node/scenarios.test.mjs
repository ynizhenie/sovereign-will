// scenarios: the game's logic, run in Node (moved from tests/scenarios.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('scenario files in tests/scenarios are loaded next to tests/sim.js', async () => {
  const errors = [];
  const r = await sim.scenarioFilesLoad({});
  expect(r.settlers).toBe(1);
  expect(errors).toEqual([]);
});
