import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('buildings and every kind of zone are kept one tile clear of the town hall', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const { clearResources, tileCenter } = window.sim.helpers;
    clearResources();
    isPaused = true;
    reliefZones.length = 0;
    postZones.length = 0;
    pathZones.length = 0;
    farmZones.length = 0;
    blightZones.length = 0;

    const hall = getGridPos(townHall.x, townHall.y);
    const near = tileCenter(hall.gx + 1, hall.gy + 1);
    const justOutside = tileCenter(hall.gx + 2, hall.gy);
    buildMode = 'wall_wood';
    mouse.x = near.x;
    mouse.y = near.y;
    handleCanvasClick();

    toggleZone(near.x, near.y, 'relief');
    toggleZone(near.x, near.y, 'post');
    toggleZone(near.x, near.y, 'path');
    toggleFarmZone(near.x, near.y, 'wheat');
    toggleBlightZone(near.x, near.y, hall.gx + 1, hall.gy + 1, false);

    const blockedRegion = [];
    for (let gy = hall.gy - 2; gy <= hall.gy + 1; gy++) {
      for (let gx = hall.gx - 2; gx <= hall.gx + 1; gx++) {
        const point = tileCenter(gx, gy);
        blockedRegion.push(isWithinTownHallBuffer(point.x, point.y));
      }
    }
    const outsideZoneTiles = Array.from({ length: 5 }, (_, i) => tileCenter(hall.gx + 2, hall.gy + i));
    toggleZone(outsideZoneTiles[0].x, outsideZoneTiles[0].y, 'relief');
    toggleZone(outsideZoneTiles[1].x, outsideZoneTiles[1].y, 'post');
    toggleZone(outsideZoneTiles[2].x, outsideZoneTiles[2].y, 'path');
    toggleFarmZone(outsideZoneTiles[3].x, outsideZoneTiles[3].y, 'wheat');
    toggleBlightZone(outsideZoneTiles[4].x, outsideZoneTiles[4].y, hall.gx + 2, hall.gy + 4, false);

    return {
      buildBlocked: blueprints.length === 0,
      zones: [reliefZones.length, postZones.length, pathZones.length, farmZones.length, blightZones.length],
      regionIsFourByFour: blockedRegion.length === 16 && blockedRegion.every(Boolean),
      outsideBuffer: !isWithinTownHallBuffer(justOutside.x, justOutside.y),
      outsideBuildAllowed: isBuildLocationAllowed(justOutside.x, justOutside.y),
      outsideZonesAllowed: [reliefZones.length, postZones.length, pathZones.length, farmZones.length, blightZones.length]
    };
  });
  expect(result).toEqual({
    buildBlocked: true, zones: [0, 0, 0, 0, 0], regionIsFourByFour: true,
    outsideBuffer: true, outsideBuildAllowed: true, outsideZonesAllowed: [1, 1, 1, 1, 1]
  });
  expect(errors).toEqual([]);
});

test('raid outposts block settlers and enemies but can still be approached as targets', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const { clearResources, tileCenter } = window.sim.helpers;
    clearResources();
    buildings.length = 0;
    enemyTents.length = 0;
    const hall = getGridPos(townHall.x, townHall.y);
    const start = tileCenter(hall.gx + 4, hall.gy);
    const target = tileCenter(hall.gx + 8, hall.gy);
    const hallCollision = collidesWithWall(townHall.x, townHall.y, 11);
    const outpost = { ...target, outpost: true, hp: 100, maxHp: 100 };
    const before = getTileIndex().signature;
    enemyTents.push(outpost);
    resetTileIndex();
    const blockedSettler = isTileBlockedForSettler(hall.gx + 8, hall.gy);
    const blockedEnemy = isTileBlockedForEnemyStrict(hall.gx + 8, hall.gy);
    const blockedEnemyFallback = isTileBlockedForEnemyPermissive(hall.gx + 8, hall.gy);
    const outpostCollision = collidesWithWall(target.x, target.y, 11);
    const path = findPathAStar(start.x, start.y, target.x, target.y).path;
    const enemyPath = findPathAStar(start.x, start.y, target.x, target.y, true).path;
    const afterAdd = getTileIndex().signature;
    enemyTents.splice(enemyTents.indexOf(outpost), 1);
    resetTileIndex();
    const removed = !isTileBlockedForSettler(hall.gx + 8, hall.gy);
    const afterRemove = getTileIndex().signature;
    buildings.push({ type: 'warehouse', ...target, hp: 50, maxHp: 50 });
    resetTileIndex();
    const warehouseBlocked = isTileBlockedForSettler(hall.gx + 8, hall.gy) &&
      isTileBlockedForEnemyStrict(hall.gx + 8, hall.gy) && collidesWithWall(target.x, target.y, 11);
    buildings.length = 0;
    resetTileIndex();
    enemyTents.push({ ...target, portal: true });
    resetTileIndex();
    const portalWalkable = !isTileBlockedForSettler(hall.gx + 8, hall.gy);
    return {
      blockedSettler, blockedEnemy, blockedEnemyFallback, outpostCollision,
      pathToAttack: path.length > 0, enemyPathToAttack: enemyPath.length > 0,
      hallCollision, warehouseBlocked, updatedOnAdd: before !== afterAdd, updatedOnRemove: afterAdd !== afterRemove,
      removed, portalWalkable
    };
  });
  expect(result).toEqual({
    blockedSettler: true, blockedEnemy: true, blockedEnemyFallback: true, outpostCollision: true,
    pathToAttack: true, enemyPathToAttack: true,
    hallCollision: true, warehouseBlocked: true, updatedOnAdd: true, updatedOnRemove: true, removed: true, portalWalkable: true
  });
  expect(errors).toEqual([]);
});
