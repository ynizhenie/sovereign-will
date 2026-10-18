// The demons, stage two (#250): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('after a wave a soldier cuts the corpses up for raw meat, more off a big one; with a demon wounded one is left to be eaten first (#250)', () => {
  expect(sim.demonButcher({})).toEqual({ corpses: 0, meat: 9, inPit: null });
  // the wounded one eats the small one near it; whole, the big one is cut up
  expect(sim.demonButcher({ wounded: true })).toEqual({ corpses: 0, meat: 6, inPit: null });
});

test('corpses go into a corpse pit first, up to 3, the rest cut up; in the pit they keep (#250)', () => {
  expect(sim.demonButcher({ pit: true })).toEqual({ corpses: 0, meat: true, inPit: 3, kept: true }); // (the one left over cut up)
});

test('a wounded demon eats one out of a corpse pit (#250)', () => {
  expect(sim.demonEatFromPit({})).toEqual({ whole: true, leftInPit: 1 });
});

test('the den gives the demons room for 2 more; the sacrificial circle none, it\'s for sacrifices (#250)', () => {
  expect(sim.demonDen({})).toEqual({ circle: 0, den: 2 });
});

test('an enemy demon wave comes out of the portals a few at a time, and the portals open out of the base (#250)', () => {
  expect(sim.demonPortalBatches({})).toEqual({ first: true, queued: true, second: true, allOut: true, outOfBase: true });
});

test('at a wave\'s end a soldier catches the badly wounded enemy for the cage; left long it dies there; a wounded demon eats it (#250)', () => {
  expect(sim.demonCage({})).toEqual({ caught: true, inCage: true, enemyGone: true, died: true });
  expect(sim.demonCage({ eat: true })).toEqual({ caught: true, inCage: true, enemyGone: true, whole: true, cageFree: true });
});
