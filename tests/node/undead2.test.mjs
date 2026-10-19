// The undead, stage two (#253): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a necromancer works a grave for bones and rot, then the grave rests; with a corpse lying by it, no rest (#253)', () => {
  expect(sim.undeadGraveWork({})).toEqual({ works: 1, rested: true });
  expect(sim.undeadGraveWork({ corpse: true })).toMatchObject({ works: 3 });
});

test('the undead start with a necromancer, a third with the staff (#253)', () => {
  expect(sim.undeadStartNecromancer({})).toEqual({ settlers: 3, staffs: 1 });
});

test('a necromancer leaves a boar be unless the player points at it (#253)', () => {
  expect(sim.undeadBoarLeftBe({})).toEqual({ went: false });
  expect(sim.undeadBoarLeftBe({ marked: true })).toEqual({ went: true });
});

test('blight spreading by itself: a necromancer blights the ground nearest the base, spending rot; with none left the switch goes off for good (#253)', () => {
  expect(sim.undeadAutoBlight({})).toEqual({ blighted: true, nearBase: true, rotSpent: true });
  expect(sim.undeadAutoBlight({ allDone: true })).toEqual({ on: false, doneForGood: true });
});

test('undead workers carry the corpses about to a grave, two by it at most (#253)', () => {
  expect(sim.undeadCorpsesToGraves({})).toEqual({ byGrave: 2, total: 3 });
});
