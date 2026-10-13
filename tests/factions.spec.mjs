import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('Endless: pick your faction and the enemy\'s, each with a colour the other side can\'t have (#43)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#faction-player [data-faction="humans"]')).toHaveClass(/active/);
  await expect(page.locator('#faction-player [data-faction="undead"]')).toBeEnabled();
  await expect(page.locator('#faction-player [data-faction="demons"]')).toBeEnabled();
  await expect(page.locator('#faction-player [data-faction="demons"]')).toHaveText('Демоны');
  // the enemy's colour can't be yours, and the other way round
  await expect(page.locator('#colors-player [data-color="#e8572a"]')).toBeDisabled();
  await expect(page.locator('#colors-enemy [data-color="#e9c46a"]')).toBeDisabled();
  await page.click('#colors-player [data-color="#3498db"]');
  await expect(page.locator('#colors-player [data-color="#3498db"]')).toHaveClass(/active/);
  await expect(page.locator('#colors-enemy [data-color="#3498db"]')).toBeDisabled();
  await expect(page.locator('#colors-enemy [data-color="#e9c46a"]')).toBeEnabled();
  // remembered on the device
  await page.reload();
  await page.evaluate(() => showMenuScreen('endless'));
  expect(await page.evaluate(() => sides.player.color)).toBe('#3498db');
});

