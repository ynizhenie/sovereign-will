import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: a settler's search for a way that isn't there stops after a while and goes as near as it came

test('a way to a walled-in tile comes out short of it, quickly; a way that is there is whole (#322)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources();
    resetTileIndex();
    const hall = getGridPos(townHall.x, townHall.y);
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const start = at(hall.gx + 3, hall.gy + 4);
    const walled = at(hall.gx + 40, hall.gy + 40);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) naturalRocks.push(at(hall.gx + 40 + dx, hall.gy + 40 + dy));
    resetTileIndex();
    const open = at(hall.gx + 30, hall.gy + 5);
    const wayOpen = findPathAStar(start.x, start.y, open.x, open.y, false).path;
    const wayWalled = findPathAStar(start.x, start.y, walled.x, walled.y, false).path;
    const last = wayWalled[wayWalled.length - 1];
    const lastTile = last ? getGridPos(last.x, last.y) : null;
    return {
      openEnds: wayOpen.length > 0 && Math.hypot(wayOpen[wayOpen.length - 1].x - open.x, wayOpen[wayOpen.length - 1].y - open.y) < 1,
      walledGoes: wayWalled.length > 0,
      walledNear: !!lastTile && Math.hypot(lastTile.gx - (hall.gx + 40), lastTile.gy - (hall.gy + 40)) < 4
    };
  });
  expect(r).toEqual({ openEnds: true, walledGoes: true, walledNear: true });
  expect(errors).toEqual([]);
});
