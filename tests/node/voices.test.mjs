// Voices (#252): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('every faction has phrases for every moment, in every language (#252)', () => {
  expect(sim.voicePhrasesEverywhere()).toEqual([]);
});

test('a settler says a phrase of its faction\'s in a bubble; not again straight away, nor another one at once (#252)', () => {
  expect(sim.voiceSpeaking({})).toEqual({ first: true, known: true, again: false, other: false });
});

test('one just hired says so (#252)', () => {
  expect(sim.voiceHiredSays({})).toEqual({ said: true });
});

test('dogs, hellhounds and ghosts do not speak, including at the campfire (#314)', () => {
  expect(sim.voicePetsSilent({})).toEqual({ playerPetsSilent: true, enemyPetsSilent: true });
});
