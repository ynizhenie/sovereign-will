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

test('dung lying in the base goes to a heap by the farm plots, carried by a settler with nothing to do', () => {
  expect(sim.idleDungHeap({})).toEqual({ piles: 1, byPlots: true, activity: 'cleanDung' });
});
