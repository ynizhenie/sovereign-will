// The friend's batch of fixes (#279), comment 1, part G1 (see tests/scenarios/g1279.js)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('an order at night wakes one to do it, not everyone (#279, c1.10)', () => {
  expect(sim.nightOneUp({})).toEqual({ allAsleep: true, mostUp: 1 });
});

test('a meal is eaten in its time, and put away when it goes to sleep, not stuck at its mouth (#279, c1.9)', () => {
  expect(sim.eatThenSleep({})).toEqual({ putAway: true, eaten: true });
});

test('a foreman gives orders only within 5 tiles of it, and doesn\'t walk across the map to give them (#279, c1.12)', () => {
  expect(sim.foremanRange({})).toEqual({ near: true, far: false, stayed: true });
});

test('a temporary zombie crumbling drops what it held, like anyone (#279, c1.16)', () => {
  expect(sim.zombieDrops({})).toEqual({ gone: true, club: true });
});

test('a flute can be given to a settler, and it\'s quicker to make (#279, c1.21)', () => {
  expect(sim.fluteGiven({})).toEqual({ ordered: true, flute: true, craftSeconds: true });
});
