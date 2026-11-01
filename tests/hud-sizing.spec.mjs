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
    game.isPaused = true;
    closeSheet();
    switchTab(null, 'tab-units');
  });
  const unitTile = page.locator('#tab-units .unit-main');
  await expect(unitTile).toBeVisible();
  const before = await unitTile.evaluate(element => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });
  await page.evaluate(() => {
    settlers[0].activity = 'harvestMarked';
    updateUnitsTab(true);
  });
  await expect(unitTile).toBeVisible();
  const after = await unitTile.evaluate(element => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);
  expect(errors).toEqual([]);
});
