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

test('ranged lead ignores stale movement when a target is standing still', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(async () => {
    const { prepareSettler } = await import('/js/domains/colony/settlers/settlers.behaviours.js');
    const { tickEnemy } = await import('/js/domains/conflict/waves/waves.behaviours.js');
    const { getProjectileAimPoint } = await import('/js/domains/conflict/combat/combat.rules.js');
    const shooter = { type: 'normal', weapon: 'bow', progression: { ranged: 10 }, x: 0, y: 0 };
    const settlerTarget = createSettler('normal', 9001, 100, 0);
    settlerTarget.moveVx = 2;
    settlerTarget.moveVy = 1;
    prepareSettler(settlerTarget, 1 / 60);
    const enemyTarget = { hp: 1, menuThreat: true, x: 100, y: 0, moveVx: 2, moveVy: 1 };
    tickEnemy(enemyTarget, 1 / 60);
    return {
      settlerAim: getProjectileAimPoint(shooter, settlerTarget, 5, 80),
      settlerPosition: { x: settlerTarget.x, y: settlerTarget.y },
      settlerVelocity: { x: settlerTarget.aimVx, y: settlerTarget.aimVy },
      enemyAim: getProjectileAimPoint(shooter, enemyTarget, 5, 80)
    };
  });
  expect(result.settlerAim).toEqual(result.settlerPosition);
  expect(result.settlerVelocity).toEqual({ x: 0, y: 0 });
  expect(result.enemyAim).toEqual({ x: 100, y: 0 });
  expect(errors).toEqual([]);
});

test('enemy movement prediction stays in projectile-step units', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(async () => {
    const { isTileBlockedForEnemyStrict, moveEntityTowards } = await import('/js/engine/movement/index.js');
    const hall = getGridPos(townHall.x, townHall.y);
    let lane = null;
    for (let gy = 2; gy < game.ROWS - 2 && !lane; gy++) {
      for (let gx = 2; gx < game.COLS - 7 && !lane; gx++) {
        if (Math.abs(gx - hall.gx) <= 3 && Math.abs(gy - hall.gy) <= 3) continue;
        if (Array.from({ length: 6 }, (_, i) => gx + i).every(x => !isTileBlockedForEnemyStrict(x, gy))) lane = { gx, gy };
      }
    }
    if (!lane) throw new Error('No clear lane to check enemy movement prediction');
    const enemy = createConfiguredEnemy({ x: lane.gx * TILE_SIZE + 15, y: lane.gy * TILE_SIZE + 15 }, 'raider_archer');
    const startX = enemy.x, startY = enemy.y;
    moveEntityTowards(enemy, startX + TILE_SIZE * 5, startY, enemy.speed, true, 1 / 60);
    return { dx: enemy.x - startX, aimVx: enemy.aimVx, aimVy: enemy.aimVy };
  });
  expect(result.dx).toBeGreaterThan(0);
  expect(result.aimVx).toBeCloseTo(result.dx);
  expect(result.aimVy).toBeCloseTo(0);
});

test('settlers route around a wall while an enemy is breaking through it', async ({ page }) => {
  const errors = await openGame(page);
  const r = await sim(page, 'holdsBehindBreachedWall', {});
  expect(r).toEqual({ movedAroundWall: true, enemyTouchesWall: true });
  expect(errors).toEqual([]);
});

test('enemy building strikes play the swing sound', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await sim(page, 'enemyBuildingBreakSound', {});
  expect(r).toEqual({ buildingDamaged: true, soundPlayed: true });
  expect(errors).toEqual([]);
});
