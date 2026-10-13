import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('Settings: show FPS on and off, remembered; no "no limit" frame rate (#123)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('settings'));
  await expect(page.locator('.fps-option[data-fps="unlimited"]')).toHaveCount(0);
  await expect(page.locator('#fps-counter')).toBeHidden();
  await page.click('[data-show-fps="on"]');
  await expect(page.locator('#fps-counter')).toBeVisible();
  await expect(page.locator('#fps-counter')).toHaveText(/\d+ FPS/, { timeout: 3000 });
  await page.reload();
  await expect(page.locator('#fps-counter')).toBeVisible();
  await page.evaluate(() => showMenuScreen('settings'));
  await page.click('[data-show-fps="off"]');
  await expect(page.locator('#fps-counter')).toBeHidden();
});

test('a saved "no limit" frame rate falls back to the screen rate (#123)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sovereign-will-fps', 'unlimited'));
  await page.goto('/');
  expect(await page.evaluate(() => loop.frameRate)).toBe('display');
});
