import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #261, the friend's fixes to the fixes: in the page

test('Point on a tile with several things: a menu picks which one gets marked (#261)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    isPaused = true;
    window.sim.helpers.clearResources(); // (the map is random: nothing else lying there, it raced on CI)
    const x = townHall.x + 150, y = townHall.y + 15;
    window.stick = addMapResource('stick', x, y);
    window.pebble = addMapResource('pebble', x + 6, y + 4);
    buildMode = 'interact'; mouse.x = x + 2; mouse.y = y + 1;
    handleCanvasClick();
  });
  const rows = page.locator('#pick-menu button');
  await expect(rows).toHaveCount(2);
  expect(await page.evaluate(() => [window.stick.priority, window.pebble.priority])).toEqual([0, 0]);
  await rows.filter({ hasText: 'Камешек' }).click();
  await expect(page.locator('#pick-menu')).toHaveCount(0);
  expect(await page.evaluate(() => [window.stick.priority, window.pebble.priority])).toEqual([0, 1]);
  // one thing there: marked at once, no menu
  await page.evaluate(() => { mouse.x = window.stick.x - 8; mouse.y = window.stick.y - 8; window.pebble.x += 40; handleCanvasClick(); });
  await expect(page.locator('#pick-menu')).toHaveCount(0);
  expect(await page.evaluate(() => window.stick.priority)).toBe(1);
});

test('Craft: Tools, Weapons and Gear as sub-tabs, each by where it\'s made; a tap on a tile makes one (#261)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { isPaused = true; Object.assign(stock, { wood: 50, stone: 50 }); window.sim.helpers.placeWorkshop(); });
  await page.click('[data-arg="tab-craft"]');
  await expect(page.locator('#craft-tools')).toBeVisible();
  await expect(page.locator('#craft-weapons')).toBeHidden();
  expect(await page.locator('#craft-tools .panel-heading').allTextContents()).toEqual(['Вручную (в ратуше)', 'В мастерской', 'В кузнице (железо)']);
  await page.click('#btn-axe');
  expect(await page.evaluate(() => craftOrders.map(o => o.key))).toEqual(['tools:axe']);
  await page.click('#craft-tab-weapons');
  await expect(page.locator('#craft-weapons')).toBeVisible();
  await expect(page.locator('#craft-tools')).toBeHidden();
  // stored: its count on the tile, and Give / Take apart under it
  await expect(page.locator('[data-item="weapons:club"] .tile-acts')).toBeHidden();
  await page.evaluate(() => { armory['weapons:club'] = 2; updateUI(); });
  await expect(page.locator('#btn-club .tile-count')).toHaveText('×2');
  await expect(page.locator('[data-item="weapons:club"] .tile-acts')).toBeVisible();
  await page.click('[data-item="weapons:club"] .row-apart');
  expect(await page.evaluate(() => armory['weapons:club'])).toBe(1);
});
