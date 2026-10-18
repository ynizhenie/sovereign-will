// demons: the game's logic, run in Node (moved from tests/demons.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('a wounded demon eats a corpse to heal (#43)', async () => {
  const r = await sim.eatsCorpse();
  expect(r.hp).toBe(r.maxHp);
  expect(r.corpses).toBe(0);
});

test('a settler sent into the sacrificial circle dies there and heals everyone (#43)', async () => {
  expect(await sim.sacrifice()).toEqual({ sent: true, victimDead: true, healed: true });
});

test('settlers step through a pair of portals when it is quicker (#43)', async () => {
  expect(await sim.portals()).toEqual({ arrived: true, quicker: true, portals: ['portal', 'portal'] });
});

test('demon enemies come out of portals that open away from the base (#43)', async () => {
  const r = await sim.demonWave();
  expect(r).toMatchObject({ farFromBase: true, byPortals: true, demons: true });
  expect(r.portals).toBeGreaterThanOrEqual(1);
  expect(r.enemies).toBeGreaterThan(0);
});

test('demon enemies come out onto free tiles and get going; portals are no more than tents would be (#177)', async () => {
  const r = await sim.demonPortals();
  expect(r.onFreeTiles).toBe(true);
  expect(r.allMoved).toBe(true);
  expect(Math.max(...r.portals)).toBe(1); // the first five waves allow one tent
});

test('an enemy never comes out of a portal into a tree (#177)', async () => {
  expect(await sim.portalInThicket()).toEqual({ blocked: 0 });
});

test('the demons\' archer is an imp with a bow, as the humans\': its arrows hit, nothing set burning (#165, #249)', async () => {
  expect(await sim.fireArrows()).toEqual({ hit: true, burnt: false, keptBurning: false, arrowsLeft: 0, type: 'imp' });
});
