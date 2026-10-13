// mechanics: the game's logic, run in Node (moved from tests/mechanics.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a killed boar bleeds, drops as a carcass and is butchered where it lies before the meat is carried (#172)', async () => {
  const r = await sim.butcherBoar({});
  expect(r).toMatchObject({ killed: true, worked: true, gone: true, bled: true, dung: true });
  expect(r.butcherSeconds).toBeGreaterThanOrEqual(1.9);
  expect(r.butcherSeconds).toBeLessThan(4);
});

test('every settler has its own hunger clock, and goes off after five meals (#178)', async () => {
  const r = await sim.ownHunger({});
  expect(r.distinct).toBe(4);
  expect(r.eaten).toBe(5);
  expect(r.needsAfter).toEqual([false, false, false, false, true]);
});

test('the first wave is lighter, and waves grow with the player army; never empty (#179)', async () => {
  const r = await sim.waveSizes({});
  expect(r.first).toBeLessThan(r.second);
  expect(r.small).toBeLessThan(r.second);
  expect(r.big).toBeGreaterThan(r.second);
  expect(r.firstTiny).toBeGreaterThanOrEqual(1);
});
