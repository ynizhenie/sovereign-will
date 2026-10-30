// morale and panic (#207): the game's logic, run in Node (see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a wave that has lost most of its number panics: to its tent to heal, or off the map with no reward', async () => {
  expect(await sim.moraleRout({ tent: true })).toMatchObject({ panicked: true, atTent: true, healed: true });
  expect(await sim.moraleRout({ tent: false })).toMatchObject({ panicked: true, gone: true, noReward: true });
});

test('a wave that has lost seven of ten still fights: it runs only with a fifth or less left (#232)', async () => {
  expect(await sim.moraleHoldOn({})).toEqual({ routed: false, panicked: false });
});

test('the undead never panic, their necromancer near or not (#326, 27.10)', async () => {
  expect(await sim.moraleUndead({})).toEqual({ panic: false });
  expect(await sim.moraleUndead({ necromancer: true })).toEqual({ panic: false });
});

test('each faction\'s morale: the humans lower against demons and the undead, demons high, the undead at the edge', async () => {
  const r = await sim.moraleBases();
  expect(r.humansVsDemons).toBeLessThan(r.humansVsHumans);
  expect(r.demons).toBeGreaterThan(r.humansVsHumans);
  expect(r.undead).toBe(30);
});

test('a badly hurt demon in a panic heals on an ally next to it, never to the ally\'s death', async () => {
  expect(await sim.moraleDemonBite({})).toEqual({ healed: true, allyAlive: true });
});

test('the enemy necromancer doesn\'t run from a settler that comes for it: it fights (#261)', async () => {
  expect(await sim.moraleNecromancerBack({})).toEqual({ stayed: true, hitBack: true });
});

test('a boar in a panic keeps running from the settler near it', async () => {
  expect(await sim.moraleBoar({})).toEqual({ panic: true, running: true });
});
