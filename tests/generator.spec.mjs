import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('the gear opens a labelled field for every generator setting (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  await expect(page.locator('[data-screen="generator"]')).toBeVisible();
  const r = await page.evaluate(() => {
    const keys = Object.keys(GAME_CONFIG.map);
    const fields = [...document.querySelectorAll('#generator-fields .generator-field')];
    const labelled = fields.every(f => f.querySelector('span').textContent && !f.querySelector('span').textContent.startsWith('gen.'));
    const covered = keys.every(k => document.querySelector(`#generator-fields input[data-key="${k}"]`));
    return { fields: fields.length, keys: keys.length, labelled, covered };
  });
  expect(r.fields).toBe(r.keys);
  expect(r.covered).toBe(true);
  expect(r.labelled).toBe(true);
});

test('a setting changed in the generator shapes the next map; Standard puts it back (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  // no lakes at all
  const lakes = page.locator('#generator-fields input[data-key="lakes"]');
  await lakes.nth(1).fill('0'); await lakes.nth(1).dispatchEvent('change');
  await lakes.nth(0).fill('0'); await lakes.nth(0).dispatchEvent('change');
  // a minimum above the maximum lifts the maximum
  const boars = page.locator('#generator-fields input[data-key="boars"]');
  await boars.nth(0).fill('20'); await boars.nth(0).dispatchEvent('change');
  const r = await page.evaluate(() => {
    window.sim.start('generator-test');
    return { water: waterTiles.length, boarsRange: { ...GAME_CONFIG.map.boars } };
  });
  expect(r.water).toBe(0);
  expect(r.boarsRange).toEqual({ min: 20, max: 20 });
  await page.evaluate(() => document.getElementById('preset-standard').click()); // the menu is hidden while a game runs
  expect(await page.evaluate(() => GAME_CONFIG.map.lakes)).toEqual({ min: 1, max: 4 });
});

test('own presets are saved on the device, loaded and deleted (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  const forests = page.locator('#generator-fields input[data-key="forests"]');
  await forests.nth(1).fill('9'); await forests.nth(1).dispatchEvent('change');
  await page.fill('#preset-name', 'Big forests');
  await page.click('#preset-save');
  await expect(page.locator('#preset-list [data-preset="Big forests"]')).toHaveCount(1);
  await page.reload();
  await page.evaluate(() => showMenuScreen('endless'));
  await page.click('#open-generator');
  expect(await page.evaluate(() => GAME_CONFIG.map.forests.max)).toBe(5); // a fresh page starts from Standard
  await page.click('#preset-list [data-preset="Big forests"]');
  expect(await page.evaluate(() => GAME_CONFIG.map.forests.max)).toBe(9);
  await page.click('#preset-list [data-delete-preset="Big forests"]');
  await expect(page.locator('#preset-list [data-preset]')).toHaveCount(0);
});
