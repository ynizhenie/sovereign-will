import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// The friend's batch of fixes (#279), part C2: the storage
test('what the full hall can\'t hold lies by it in packs of 10, 9 to a tile within a tile of it (#279, 7)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'packs', { extra: 300 });
  expect(r.total).toBeGreaterThanOrEqual(300);
  expect(r.biggest).toBeLessThanOrEqual(10);
  expect(r.mostOnATile).toBeLessThanOrEqual(9);
  expect(r.near).toBe(true);
});

test('once the tiles round it are full, packs go on top, then the packs take more (#279, 7)', async ({ page }) => {
  await openGame(page);
  const more = await sim(page, 'packs', { extra: 4000 });
  expect(more.layers).toEqual([0, 1]);
  expect(more.biggest).toBeGreaterThan(10);
  expect(more.near).toBe(true);
});

test('with two storages, what lies in the wrong one is carried to its own (#279, 7)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'sorting', {});
  expect(r.moved).toBeGreaterThanOrEqual(10);
});

test('settlers reach a warehouse or the town hall without oscillating at blocked targets', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'approachesStorage', {});
  expect(r.warehouseDelivered, JSON.stringify(r)).toBe(true);
  expect(r.townHallDelivered, JSON.stringify(r)).toBe(true);
});

test('a storage\'s card shows what\'s in it, by it, and what it keeps (#279, 7)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    const { placeBuilding, tileCenter } = window.sim.helpers;
    const g = getGridPos(townHall.x, townHall.y), w = tileCenter(g.gx + 4, g.gy);
    placeBuilding('warehouse', w.x, w.y);
    stock.wood += 400; keepStoresInStep(); isPaused = true;
    openBuildingCard(townHall); renderBuildingCard();
  });
  const lines = await page.locator('#card-store .card-store-line').allTextContents();
  expect(lines.length).toBe(3);
  expect(lines[0]).toContain('Внутри');
  expect(lines[1]).toContain('Рядом в пачках');
  expect(lines[2]).toContain('Здесь хранят');
});
