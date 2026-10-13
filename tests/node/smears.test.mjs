// smears: the game's logic, run in Node (moved from tests/smears.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('walking through blood or dung leaves a few footprints after it (#124)', async () => {
  const blood = await sim.footprints({ source: 'blood' });
  expect(blood).toEqual({ trails: 6, color: 'blood', beyond: true });
  const dung = await sim.footprints({ source: 'dung' });
  expect(dung).toEqual({ trails: 6, color: 'dung', beyond: true });
});

test('whoever left the dung does not step in it before walking off (#124)', async () => {
  // starts on its own pile and walks off: no footprints; coming back across it later: footprints
  const r = await sim.footprints({ source: 'dung', by: 'self' });
  expect(r.trails).toBe(0);
  expect(r.later).toBe(6);
});

test('after five meals a settler relieves itself near grass, away from the buildings (#124)', async () => {
  expect(await sim.relief({})).toEqual({ needs: true, piles: 1, stillNeeds: false, meals: 0, awayFromBuildings: true, nearGrass: true });
});

test('a relief spot walled off on the way: the settler goes somewhere else it can get to (#200)', async () => {
  const r = await sim.relief({ walledOff: true, seconds: 40 });
  expect(r).toMatchObject({ needs: true, piles: 1, stillNeeds: false, elsewhere: true });
});
