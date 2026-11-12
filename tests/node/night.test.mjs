// Day and night (#257): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a day: morning (it starts in the morning), day, evening, night; dark at night, half dark half way through the morning; waves every 300 s by default (#257)', () => {
  expect(sim.nightPhases({})).toEqual({ start: 'morning', startTime: true, phases: ['morning', 'day', 'evening', 'night'], dark: { day: 0, night: 0.72, midMorning: 0.36 }, interval: 300, afterMorning: 'day' });
});

test('at night workers sleep at the tent, hunger standing still; half the soldiers keep watch; in the morning they wake up hungry (#257)', () => {
  expect(sim.nightSleep({})).toEqual({ workersAsleep: true, byTent: true, hungerStill: true, onWatch: 1, watchAsleep: 1, awake: true, hungry: true });
});

test('enemy camps do not keep player settlers awake at night', () => {
  const result = sim.nightSleepAtEnemyCamp({});
  expect(result.asleep).toBe(true);
  expect(result.guards).toBeGreaterThanOrEqual(6);
  expect(result.sleepingGuards).toBeGreaterThan(0);
  expect(result.keeperAwake).toBe(true);
});

test('a wave due at night: everyone is woken before it (#257)', () => {
  expect(sim.nightWoken({})).toEqual({ asleep: true, wokenAll: true });
});

test('a torch post is lit at dusk by a worker with a piece of firewood, and is out in the morning (#257)', () => {
  expect(sim.nightTorchPost({})).toEqual({ lit: true, firewood: 4, outInTheMorning: true });
});

test('at night a soldier out of the light fetches a crafted torch; without one, settlers keep to the base (#257)', () => {
  expect(sim.nightHandTorch({})).toEqual({ torch: true, torches: 0, reach: 'any' });
  expect(sim.nightHandTorch({ torches: 0 })).toEqual({ torch: false, torches: 0, reach: 'base' });
});

test('at night without torches, work reach follows the base edge in the target direction', () => {
  const { east, west } = sim.directionalNightReach({});
  expect(east).toBeGreaterThan(west + 30);
});

test('a night wave: some of its enemies carry torches; the town hall, a torch, a portal, a necromancer\'s staff give light (#257)', () => {
  expect(sim.nightWave({})).toEqual({ someTorches: true, notAll: true, farTorchesDark: true, lights: { hall: true, enemyTorch: true, portal: true, staff: true }, enemyTorchWithoutFog: true });
});

test('a fighter puts a lit torch aside for its weapon and takes it back at rest', () => {
  expect(sim.nightTorchSwitching()).toEqual({
    fightsWithWeapon: true,
    holdsTorchWhenIdle: true,
    keepsTorchInHandWithFists: true,
    putsTorchAsideAtWork: true
  });
});

test('no firewood at night: a woodcutter stays up to get some, guarded by the soldier on watch; the rest sleep (#257)', () => {
  expect(sim.nightFuelDuty({})).toEqual({ cutterUp: true, firewoodMade: true, otherAsleep: true });
});
