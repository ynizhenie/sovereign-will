import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('hired settlers and pets spawn on separate free tiles around the town hall, reserved from building and zones', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'recruitSpawn', {})).toEqual({
    unitCount: 2,
    spawnDetails: [
      { reserved: true, outsideHall: true, buildBlocked: true, farmBlocked: true },
      { reserved: true, outsideHall: true, buildBlocked: true, farmBlocked: true }
    ],
    distinctSpawns: true,
    reservedCells: 12,
    allBuildBlocked: true,
    zoneCellsAdded: 0
  });
});
