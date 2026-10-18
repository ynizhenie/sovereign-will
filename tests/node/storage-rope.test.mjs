// #248 (part three): storage room, piles, rope, mining a spawner: the game's logic, run in Node
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('the stock lies in the town hall up to what it holds, the rest on a pile by it that counts all the same; spending takes off the pile first (#248)', () => {
  expect(sim.storeHallFull({})).toEqual({ startInHall: true, hallHolds: 300, onPile: true, pileByHall: true, stockKept: true, pileFirst: true, hallSame: true });
});

test('a worker with nothing to do carries a pile into a warehouse with room; a fallen warehouse leaves what it held on the ground; the stock never changes (#248)', () => {
  expect(sim.storeHaulAndFall({})).toEqual({ pileBefore: true, carried: true, pileLess: true, stockSame: true, warehouseFull: true, droppedWhereItStood: true, stockAfterFall: true });
});

test('a load brought home goes into the storage it\'s brought to (#248)', () => {
  expect(sim.storeDeliverInto({})).toEqual({ inWarehouse: 5 });
});

test('what lies where is saved and loaded (#248)', () => {
  expect(sim.storesSaved({})).toEqual({ same: true });
});

test('rope is twisted from two herbs by hand at the town hall (#248)', () => {
  expect(sim.ropeByHand({})).toEqual({ ordered: true, rope: 1, place: 'hand' });
});

test('an ore spawner marked with Point is mined for its ore and never used up; unmarked, nobody mines it (#248)', () => {
  expect(sim.mineSpawner({})).toEqual({ ore: true, standing: true });
  expect(sim.mineSpawner({ marked: false })).toEqual({ ore: false, standing: true });
});
