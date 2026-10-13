// backpack: the game's logic, run in Node (moved from tests/backpack.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a worker carries 1 load, 2 with a backpack; a big one 2, or 3 with a backpack (#26)', async () => {
  const cases = [
    { type: 'normal', backpack: false, loads: 1 },
    { type: 'normal', backpack: true, loads: 2 },
    { type: 'big', backpack: false, loads: 2 },
    { type: 'big', backpack: true, loads: 3 }
  ];
  for (const c of cases) {
    const r = await sim.carryTrips({ type: c.type, backpack: c.backpack, seconds: 90 });
    expect([c, r.capacity, r.firstTrip]).toEqual([c, c.loads, c.loads]);
    // a part-filled pack still comes home once the trees run out
    expect([c, r.treesLeft, r.allDelivered]).toEqual([c, 0, 5]);
  }
});
