// idle settlers' pastimes (#199): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('an idle settler by a campfire: it stands by it and its morale rises past its usual', () => {
  expect(sim.idleCampfire({})).toEqual({ byFire: true, moraleAbove: true, activity: 'idleCampfire' });
});

test('idle settlers with nothing to do get together in a knot "talking"', () => {
  expect(sim.idleTalk({})).toEqual({ knot: true });
});

test('idle demons spar: a little health down, never below 70%, morale up', () => {
  expect(sim.idleSpar({})).toEqual({ hurt: true, notBelow: true, moraleUp: true, close: true });
});

test('an idle zombie stands where it is and sways', () => {
  expect(sim.idleSway({})).toEqual({ swaying: true, stood: true, activity: 'idleSway' });
});

test('dung lying in the base goes into the compost heap, carried by a farmer with a backpack, nobody by hand; no heap, nobody gathers it (#232)', () => {
  expect(sim.idleDungHeap({})).toEqual({ onGround: 0, inHeap: 1, activity: 'cleanDung' });
  expect(sim.idleDungHeap({ farmer: false })).toEqual({ onGround: 1, inHeap: 0, activity: null });
  expect(sim.idleDungHeap({ withHeap: false })).toEqual({ onGround: 1, inHeap: null, activity: null });
});
