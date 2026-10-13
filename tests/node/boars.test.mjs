// boars: the game's logic, run in Node (moved from tests/boars.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a soldier catches and kills a boar, in the open and by the map edge (#77)', async () => {
  for (const where of ['open', 'edge']) {
    const r = await sim.boarChase({ where });
    expect([where, r.downAt]).not.toEqual([where, null]);
    expect(r.downAt).toBeLessThan(20);
  }
});
