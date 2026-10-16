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

test('an idle human sharpens its blade: the next blow that lands does half as much again, then it\'s blunt', () => {
  expect(sim.idleSharpen({})).toEqual({ sharpened: true, ratio: 1.5, bluntAfter: true });
});

test('idle demons spar: a little health down, never below 70%, morale up', () => {
  expect(sim.idleSpar({})).toEqual({ hurt: true, notBelow: true, moraleUp: true, close: true });
});

test('an idle zombie stands where it is and sways', () => {
  expect(sim.idleSway({})).toEqual({ swaying: true, stood: true, activity: 'idleSway' });
});

test('dung lying in the base goes into the compost heap, carried by a settler with nothing to do; no heap, nobody gathers it (#232)', () => {
  expect(sim.idleDungHeap({})).toEqual({ onGround: 0, inHeap: 1, activity: 'cleanDung' });
  expect(sim.idleDungHeap({ withHeap: false })).toEqual({ onGround: 1, inHeap: null, activity: null });
});
