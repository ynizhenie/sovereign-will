import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), 7: a Units tab with every settler and pet

test('the roster focuses units; its card button opens the selected unit card (#326, 27.10, 7)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    isPaused = true;
    const { makeSettler } = window.sim.helpers;
    settlers = [
      makeSettler(1, townHall.x - 60, townHall.y, { tool: 'axe' }),
      makeSettler(2, townHall.x + 300, townHall.y + 200, { weapon: 'sword', role: 'soldier' }),
      makeSettler(3, townHall.x + 60, townHall.y, { type: 'dog', role: 'pet' })
    ];
    putOnGear(settlers[1], 'shield');
    game.armory = { 'gear:helmet': 1 };
  });
  await page.click('#tab-btn-units');
  await expect(page.locator('#tab-units')).toBeVisible();
  const rows = page.locator('#tab-units .unit-tile');
  await expect(rows).toHaveCount(3);
  const r = await page.evaluate(() => ({
    order: [...document.querySelectorAll('#tab-units .unit-tile')].map(row => Number(row.dataset.unit)),
    states: [...document.querySelectorAll('#tab-units .unit-state')].map(e => e.textContent.length > 0),
    duplicatedGear: document.querySelector('#tab-units .unit-tile[data-unit="2"] .tile-name').innerHTML.includes('ic-shield')
  }));
  expect(r.order).toEqual([2, 1, 3]); // (soldiers first, the pet last)
  expect(r.states).toEqual([true, true, true]);
  expect(r.duplicatedGear).toBe(false);
  // a tap on the row focuses the unit without opening its card
  await page.click('#tab-units .unit-tile[data-unit="2"] .unit-main');
  const focused = await page.evaluate(() => ({ id: game.selectedSettler && game.selectedSettler.id, camera: Math.hypot(camera.x - settlers[1].x, camera.y - settlers[1].y) }));
  expect(focused.id).toBeNull();
  expect(focused.camera).toBeLessThan(40);
  await page.locator('#tab-units .unit-tile[data-unit="2"] .tile-act').nth(1).click();
  const picked = await page.evaluate(() => ({ id: game.selectedSettler && game.selectedSettler.id, camera: Math.hypot(camera.x - settlers[1].x, camera.y - settlers[1].y), sheetOpen: document.body.classList.contains('sheet-open') }));
  expect(picked.id).toBe(2);
  expect(picked.camera).toBeLessThan(40);
  expect(picked.sheetOpen).toBe(false);
  await expect(page.locator('#selected-bar')).toHaveClass(/has-settler/);
  await expect(page.locator('#selected-gear .gear-chip')).toHaveCount(2); // (the sword and the shield)
  // open the card's Give list: the helmet goes to the selected unit
  await page.click('#btn-give');
  await page.click('#give-list [data-give="gear:helmet"]');
  expect(await page.evaluate(() => settlers[1].targetEquipment && settlers[1].targetEquipment.gear)).toBe('helmet');
  // the shield off, into the store
  await page.evaluate(() => { settlers[1].targetEquipment = null; });
  await page.locator('#selected-gear .gear-chip').filter({ hasText: 'Щит' }).locator('.btn-store').click();
  expect(await page.evaluate(() => !!settlers[1].targetEquipment)).toBe(true);
  // the pet has a card too, but cannot be given equipment
  await page.click('#tab-btn-units');
  await page.locator('#tab-units .unit-tile[data-unit="3"] .tile-act').last().click();
  await expect(page.locator('#btn-give')).toBeHidden();
  expect(errors).toEqual([]);
});
