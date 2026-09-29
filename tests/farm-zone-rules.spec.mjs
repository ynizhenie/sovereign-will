import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('farm zones go on grass and hand-gathered things, not on trees, boulders, sand or walls (#92)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'zonePlacement', {})).toEqual({
    grass: true, grassTuft: true, stick: true, bush: true, tree: false, boulder: false, sand: false, wall: false
  });
});

test('a worker clears grass off a zone tile, then the farmer plants it (#92)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'zoneGetsCleared', {})).toEqual({ grassGone: true, planted: true });
});

test('nothing can be built on a farm zone until the zone is removed (#92)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.showNotification = () => {};
    const g = getGridPos(townHall.x, townHall.y);
    const { x: tx, y: ty } = window.sim.helpers.tileCenter(g.gx + 4, g.gy + 4);
    for (const list of [trees, cacti, boulders, grassList, berryBushes, sticks, pebbles, ironOres, coalOres, naturalRocks, waterTiles]) {
      const i = list.findIndex(o => o.x === tx && o.y === ty); if (i !== -1) list.splice(i, 1);
    }
    desertTiles = desertTiles.filter(d => d.x !== tx || d.y !== ty); beachTiles = beachTiles.filter(d => d.x !== tx || d.y !== ty); desertRegion = null;
    stock.wood = 100;
    toggleFarmZone(tx, ty, 'wheat');
    const zoned = farmZones.length;
    const tap = () => { mouse.x = tx; mouse.y = ty; handleCanvasClick(); };
    setMode('wall_wood'); tap();
    const blockedWhileZoned = blueprints.length === 0;
    setMode('zone_clear'); tap();
    setMode('wall_wood'); tap();
    return { zoned, blockedWhileZoned, builtAfterClearing: blueprints.length === 1 };
  });
  expect(r).toEqual({ zoned: 1, blockedWhileZoned: true, builtAfterClearing: true });
});
