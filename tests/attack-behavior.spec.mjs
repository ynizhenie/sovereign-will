import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('enemy camps are only attackable during a player-started raid', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'campProtection', {});
  expect(r).toEqual({
    markedTargetIgnored: true,
    campUntouchedOutsideRaid: true,
    campDamageAllowedInRaid: true
  });
  expect(errors).toEqual([]);
});

test('melee units break enemy buildings only inside their weapon reach', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'enemyBuildingWeaponRange', {});
  expect(r).toEqual({ noHitOutOfRange: true, hitInRange: true });
  expect(errors).toEqual([]);
});

test('ranged units of both sides use dagger damage when breaking structures', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'rangedUnitsUseDaggersOnStructures', {});
  expect(r.playerResults).toEqual([
    { weapon: 'bow', damage: 15, arrows: 8, swingWeapon: 'dagger' },
    { weapon: 'crossbow', damage: 15, arrows: 8, swingWeapon: 'dagger' }
  ]);
  expect(r.orderedStructure).toEqual({ damage: 15, arrows: 0, swingWeapon: 'dagger' });
  expect(r.enemyDamage).toEqual([
    { key: 'raider', damage: 20, weapon: 'sword' },
    { key: 'raider_fist', damage: 6, weapon: 'fist' },
    { key: 'raider_archer', damage: 15, weapon: 'dagger' }
  ]);
  expect(errors).toEqual([]);
});

test('settlers hold behind a wall while an enemy is breaking through it', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'holdsBehindBreachedWall', {});
  expect(r).toEqual({ heldPosition: true, enemyTouchesWall: true });
  expect(errors).toEqual([]);
});
