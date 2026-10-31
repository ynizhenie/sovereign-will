import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('bottom sheets fit their contents and unit status does not resize its tile', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');

  const buildingSize = await page.evaluate(() => {
    openBuildingCard(townHall);
    const rect = document.getElementById('sheet-frame').getBoundingClientRect();
    return { width: rect.width, expectedWidth: Math.min(760, innerWidth), height: rect.height, maxHeight: innerHeight * 0.3 };
  });
  expect(buildingSize.width).toBe(buildingSize.expectedWidth);
  expect(buildingSize.height).toBeLessThan(buildingSize.maxHeight);

  await page.evaluate(() => {
    const unit = window.sim.helpers.makeSettler(1, townHall.x, townHall.y, {});
    unit.activity = 'patrol';
    settlers = [unit];
    updateUnitsTab(true);
  });
  await page.click('#tab-btn-units');
  const before = await page.locator('#tab-units .unit-main').boundingBox();
  await page.evaluate(() => {
    settlers[0].activity = 'harvestMarked';
    updateUnitsTab(true);
  });
  const after = await page.locator('#tab-units .unit-main').boundingBox();
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  expect(errors).toEqual([]);
});
