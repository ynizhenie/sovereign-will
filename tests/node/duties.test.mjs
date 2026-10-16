// soldiers' and necromancers' own between waves (#199): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a soldier on patrol walks round the base just past its edge', () => {
  expect(sim.dutyPatrol({})).toEqual({ roundTheEdge: true, turned: true, activity: 'idlePatrol' });
});

test('a soldier trains at a dummy: its damage grows a little', () => {
  expect(sim.dutyTrain({})).toEqual({ atDummy: true, trained: true, stronger: true, activity: 'idleTrain' });
});

test('an idle soldier guards a worker gathering far out of the base', () => {
  expect(sim.dutyGuard({})).toEqual({ byWorker: true, activity: 'escortGatherers', guarding: true });
});

test('between waves a necromancer takes the bones from a corpse; in a wave it raises it', () => {
  expect(sim.dutyBones({})).toEqual({ corpseGone: true, bones: 3, raised: false });
  expect(sim.dutyBones({ wave: true })).toMatchObject({ corpseGone: true, raised: true });
});

test('an enemy closing in: the colony\'s necromancer steps back towards the town hall', () => {
  expect(sim.dutyKeepBack({})).toEqual({ away: true, nearerHall: true });
});
