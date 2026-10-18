// corpses out of the base and medics' potions (#199, #232): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('the corpses in the base are carried out to a heap past its edge; the undead keep theirs', () => {
  expect(sim.porterCorpses({})).toEqual({ corpses: 2, out: true });
  expect(sim.porterCorpses({ faction: 'undead' })).toMatchObject({ out: false }); // (one may rise on their blighted ground)
});

test('a medic brews potions between waves: two herbs, water, a campfire', () => {
  expect(sim.medicBrew({})).toEqual({ potions: 2, herbs: 0, atWater: true, atFire: true });
});

test('in a wave a medic heals with a potion first (75 hp); with the wave beaten and a tent it keeps its herbs', () => {
  expect(sim.medicHeal({})).toEqual({ hp: 85, potionsLeft: 0, herbsLeft: 1 });
  expect(sim.medicHeal({ waveOver: true })).toEqual({ hp: 10, potionsLeft: 1, herbsLeft: 1 });
});
