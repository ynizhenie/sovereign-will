// doors: the game's logic, run in Node (moved from tests/doors.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a worker clears what blocks a door before other work (#17)', async () => {
  expect((await sim.doorBlockerFirst({})).first).toBe('door');
});

test('soldiers break trees and boulders blocking the only door out, not natural rock (#17)', async () => {
  for (const blocker of ['tree', 'boulder']) {
    expect([blocker, await sim.sealedBreakout({ blocker })]).toEqual([blocker, { sealedAtStart: true, cleared: true }]);
  }
  expect(await sim.sealedBreakout({ blocker: 'rock' })).toEqual({ sealedAtStart: true, cleared: false });
});
