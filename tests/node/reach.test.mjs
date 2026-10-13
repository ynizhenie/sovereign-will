// reach: the game's logic, run in Node (moved from tests/reach.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('every weapon reaches a brute, not only spears and bows (#107)', async () => {
  for (const weapon of ['fist', 'club', 'sword', 'iron_sword', 'spear', 'bow']) {
    const dealt = await sim.meleeReach({ weapon });
    expect([weapon, dealt > 0]).toEqual([weapon, true]);
  }
});

test('a big settler reaches normal enemies, and they reach it (#107)', async () => {
  for (const weapon of ['club', 'sword', 'spear']) {
    const dealt = await sim.meleeReach({ weapon, enemy: 'raider', big: true });
    expect([weapon, dealt > 0]).toEqual([weapon, true]);
  }
  expect(await sim.enemyReachesBig({})).toBeGreaterThan(0);
});
