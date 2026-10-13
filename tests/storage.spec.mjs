import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a warehouse costs 5 wood, and tapping it shows no storage window (#141)', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => GAME_CONFIG.buildings.warehouse.cost)).toEqual({ wood: 5 });
  await expect(page.locator('#storage-popup')).toHaveCount(0);
});
