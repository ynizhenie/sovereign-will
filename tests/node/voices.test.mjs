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

test('idle phrases match the weather and healing/necromancy actions have localized phrases', () => {
  expect(sim.voiceIdleWeatherContext({})).toEqual({
    neverAsksForRainWhileWet: true, acknowledgesRain: true, asksForRainWhenDry: true,
    hasHealingPhrases: true, hasUndeadRaisePhrases: true, actionsLocalized: true, storyIsTimeNeutral: true
  });
});

test('a ghost never speaks, including in its story by the fire', () => {
  expect(sim.voiceGhostSilent({})).toEqual({ spoke: false });
});

test('one just hired says so (#252)', () => {
  expect(sim.voiceHiredSays({})).toEqual({ said: true });
});
