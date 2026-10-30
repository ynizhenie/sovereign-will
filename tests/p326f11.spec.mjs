import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), 7: a Units tab with every settler and pet

test('the Units tab lists every settler and pet with what it holds and does; a tap picks one and the camera goes to it; its row takes gear off and gives what the armory has (#326, 27.10, 7)', async ({ page }) => {
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
  const rows = page.locator('#tab-units .unit-row');
  await expect(rows).toHaveCount(3);
  const r = await page.evaluate(() => ({
    order: [...document.querySelectorAll('#tab-units .unit-row')].map(row => Number(row.dataset.unit)),
    states: [...document.querySelectorAll('#tab-units .unit-state')].map(e => e.textContent.length > 0),
    soldierIcons: document.querySelector('#tab-units .unit-row[data-unit="2"] .unit-name').innerHTML.includes('ic-shield')
  }));
  expect(r.order).toEqual([2, 1, 3]); // (soldiers first, the pet last)
  expect(r.states).toEqual([true, true, true]);
  expect(r.soldierIcons).toBe(true);
  // a tap on the soldier's row: picked, the camera on it, its row open
  await page.click('#tab-units .unit-row[data-unit="2"] .unit-head');
  const picked = await page.evaluate(() => ({ id: game.selectedSettler && game.selectedSettler.id, camera: Math.hypot(camera.x - settlers[1].x, camera.y - settlers[1].y) }));
  expect(picked.id).toBe(2);
  expect(picked.camera).toBeLessThan(40);
  const open = page.locator('#tab-units .unit-row[data-unit="2"]');
  await expect(open.locator('.gear-chip')).toHaveCount(2); // (the sword and the shield)
  // given the helmet from the armory: it goes for it
  await open.locator('[data-give="gear:helmet"]').click();
  expect(await page.evaluate(() => settlers[1].targetEquipment && settlers[1].targetEquipment.gear)).toBe('helmet');
  // the shield off, into the store
  await page.evaluate(() => { settlers[1].targetEquipment = null; });
  await page.evaluate(() => updateUnitsTab(true));
  await open.locator('.gear-chip').filter({ hasText: 'Щит' }).locator('.btn-store').click();
  expect(await page.evaluate(() => !!settlers[1].targetEquipment)).toBe(true);
  // the pet: no Give
  await page.click('#tab-units .unit-row[data-unit="3"] .unit-head');
  await expect(page.locator('#tab-units .unit-row[data-unit="3"] .unit-give')).toHaveCount(0);
  expect(errors).toEqual([]);
});
