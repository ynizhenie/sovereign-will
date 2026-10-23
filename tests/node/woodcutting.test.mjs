// Woodcutting: the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a woodcutter collects reachable logs before starting another tree', () => {
  expect(sim.woodcutterLogsBeforeTrees({})).toBe(true);
});
