// The friend's batch of fixes (#279), comment 1, part G4 (see tests/scenarios/g4279.js)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('packs lying by a full storage are carried into one with room, though the workers are busy (#279, c1.18)', () => {
  const r = sim.pilesIn({});
  expect(r.before).toBe(true);
  expect(r.inWarehouse).toBeGreaterThanOrEqual(100); // (filled: 120)
  expect(r.after).toBeLessThan(60); // (without them carried in: some 130 lying about)
  expect(r.chopped).toBe(true);
  expect(r.busy).toBe(true); // (trees left: they had work all the while)
});

test('settlers talking say real things: one tells of its day, the other answers (#279, c1.19)', () => {
  expect(sim.talkSays({})).toEqual({ a: true, b: true, story: true });
});
