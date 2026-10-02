import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('wood goes to the nearest storage, a warehouse here; the stock has no limit (#36, #141)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'deliverToWarehouse')).toEqual({ wood: 1003, atWarehouse: true, atHall: false });
});

test('builders fetch materials at the nearest storage; promised materials are not spent twice (#36, #141)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'buildFromWarehouse')).toEqual({
    placed: 1, secondPlaced: false, woodRightAfter: 8, atWarehouse: true, atHall: false, wood: 3, built: true
  });
});

test('a broken warehouse takes no resources with it (#141)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'warehouseDestroyed')).toEqual({ same: true, gone: true });
});

test('a warehouse costs 5 wood, and tapping it shows no storage window (#141)', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => GAME_CONFIG.buildings.warehouse.cost)).toEqual({ wood: 5 });
  await expect(page.locator('#storage-popup')).toHaveCount(0);
});
