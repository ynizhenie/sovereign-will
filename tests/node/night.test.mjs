// Day and night (#257): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a day: morning (it starts in the morning), day, evening, night; dark at night, half dark half way through the morning; waves every 180 s by default (#257)', () => {
  expect(sim.nightPhases({})).toEqual({ start: 'morning', startTime: 0, phases: ['morning', 'day', 'evening', 'night'], dark: { day: 0, night: 0.72, midMorning: 0.36 }, interval: 180, afterMorning: 'day' });
});

test('at night workers sleep at the tent, hunger standing still; half the soldiers keep watch; in the morning they wake up hungry (#257)', () => {
  expect(sim.nightSleep({})).toEqual({ workersAsleep: true, byTent: true, hungerStill: true, onWatch: 1, watchAsleep: 1, awake: true, hungry: true });
});

test('a wave due at night: everyone is woken before it (#257)', () => {
  expect(sim.nightWoken({})).toEqual({ asleep: true, wokenAll: true });
});

test('a torch post is lit at dusk by a worker with a piece of firewood, and is out in the morning (#257)', () => {
  expect(sim.nightTorchPost({})).toEqual({ lit: true, firewood: 4, outInTheMorning: true });
});

test('at night a soldier out of the light takes a torch for the night; with no firewood for one, settlers keep to the base (#257)', () => {
  expect(sim.nightHandTorch({})).toEqual({ torch: true, firewood: 4, reach: 'any' });
  expect(sim.nightHandTorch({ firewood: 0 })).toEqual({ torch: false, firewood: 0, reach: 'base' });
});

test('a night wave: some of its enemies carry torches; the town hall, a torch, a portal, a necromancer\'s staff give light (#257)', () => {
  expect(sim.nightWave({})).toEqual({ someTorches: true, notAll: true, lights: { hall: true, enemyTorch: true, portal: true, staff: true } });
});

test('no firewood at night: a woodcutter stays up to get some, guarded by the soldier on watch; the rest sleep (#257)', () => {
  expect(sim.nightFuelDuty({})).toEqual({ cutterUp: true, firewoodMade: true, otherAsleep: true });
});
