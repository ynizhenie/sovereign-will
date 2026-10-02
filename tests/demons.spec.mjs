import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('the demons: imps to start, their own units, a sacrificial circle and portals instead of tents (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'demonColony')).toEqual({
    startUnits: ['imp', 'imp'], hire: ['btn-hire-imp', 'btn-hire-demon', 'btn-hire-fire_imp', 'btn-upgrade'],
    tent: false, circle: true, portal: true, hellfireCraftable: false, fireImp: { weapon: 'hellfire', role: 'archer' }
  });
});

test('a wounded demon eats a corpse to heal (#43)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'eatsCorpse');
  expect(r.hp).toBe(r.maxHp);
  expect(r.corpses).toBe(0);
});

test('a settler sent into the sacrificial circle dies there and heals everyone (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'sacrifice')).toEqual({ sent: true, victimDead: true, healed: true });
});

test('settlers step through a pair of portals when it is quicker (#43)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'portals')).toEqual({ arrived: true, quicker: true, portals: ['portal', 'portal'] });
});

test('demon enemies come out of portals that open away from the base (#43)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'demonWave');
  expect(r).toMatchObject({ farFromBase: true, byPortals: true, demons: true });
  expect(r.portals).toBeGreaterThanOrEqual(1);
  expect(r.enemies).toBeGreaterThan(0);
});
