// The friend's #298, its comment (see tests/scenarios/p298more.js)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('what the player marked comes before the chores: the tree before cooking with food low (#298, c.3)', () => {
  const r = sim.marksFirst({});
  expect(r.toTree).toBe(true);
  expect(r.felled).toBe(true);
});

test('the censor shows only while it\'s at it, not stuck on it once called away (#298, c.2)', () => {
  expect(sim.censorOff({})).toEqual({ on: true, offAfter: true, stillNeeds: true });
});

test('demons out of their portals gather by them, not at the map\'s edge (#298, c.4)', () => {
  expect(sim.demonsMuster({})).toEqual({ some: true, byPortal: true });
});
