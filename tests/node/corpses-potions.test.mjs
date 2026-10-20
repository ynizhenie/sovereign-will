// corpses out of the base and medics' herbs (#199, #232, #279): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('the corpses in the base are carried out to a heap past its edge; the undead keep theirs', () => {
  expect(sim.porterCorpses({})).toEqual({ corpses: 2, out: true });
  expect(sim.porterCorpses({ faction: 'undead' })).toMatchObject({ out: false }); // (one may rise on their blighted ground)
});

test('lots of corpses, three carriers: each corpse carried out once, none back and forth; rock where the heap would go: it goes elsewhere, out of the base; walled in: none carried (#261)', () => {
  expect(sim.manyCorpses({})).toEqual({ total: true, mostCarries: 1, carried: 12, out: true, heapOut: true });
  expect(sim.manyCorpses({ rocks: true })).toEqual({ total: true, mostCarries: 1, carried: 12, out: true, heapOut: true });
  expect(sim.manyCorpses({ walled: true })).toEqual({ total: true, mostCarries: 0, carried: 0, out: false, heapOut: null });
});

test('in a wave a medic heals with its herbs (30 hp each); with the wave beaten and a tent it keeps them (#279: no potions)', () => {
  expect(sim.medicHeal({})).toEqual({ hp: 40, herbsLeft: 1 });
  expect(sim.medicHeal({ waveOver: true })).toEqual({ hp: 10, herbsLeft: 2 });
});
