// The friend's #298, part 2 (see tests/scenarios/p298play.js)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a lit campfire burns its fuel down by itself; four at most sit by one, one to a side (#298, 4)', () => {
  const r = sim.campfire298({});
  expect(r.burnt).toBe(1); // (6 s, a unit each fuelSeconds)
  expect(r.lit).toBe(true);
  expect(r.most).toBeGreaterThanOrEqual(2);
  expect(r.most).toBeLessThanOrEqual(4);
  expect(r.clash).toBe(false);
});

test('leather armour: weaker than iron; iron over it puts it in the armory; waves wear it once it\'s been made (#298, 8)', () => {
  const r = sim.leather298({});
  expect(r.leatherHp).toBe(25);
  expect(r.kind).toBe('leather');
  expect(r.leatherTaken).toBe(82); // (100 less 18%)
  expect(r.swapped).toEqual({ armor: 'iron', hp: 50, stored: 1 });
  expect(r.waveLeather).toBe(true);
  expect(r.waveIron).toBe(false);
});

test('up at night for an order, it does that only: the wall built, nothing cooked (#298, 11)', () => {
  const r = sim.nightOnlyOrder({});
  expect(r.built).toBe(true);
  expect(r.cooked).toBe(false);
});
