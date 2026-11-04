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

test('settlers hold behind a wall while an enemy is breaking through it', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'holdsBehindBreachedWall', {});
  expect(r).toEqual({ heldPosition: true, enemyTouchesWall: true });
  expect(errors).toEqual([]);
});
