import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('everyone moves at twice the base speed per step, the pace the game was tuned at (#123)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources } = window.sim.helpers;
    window.sim.start('speed-test');
    clearResources();
    const s = makeSettler(1, townHall.x + 100, townHall.y + 100);
    const x0 = s.x, y0 = s.y;
    moveEntityTowards(s, s.x + 30, s.y, s.speed);
    return { scale: GAME_CONFIG.movementScale, stepped: Math.round(Math.hypot(s.x - x0, s.y - y0) * 100) / 100 };
  });
  expect(r.scale).toBe(2);
  expect(r.stepped).toBeCloseTo(2, 1); // speed 1 x scale 2 per step
});

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
  expect(await page.evaluate(() => frameRateSetting)).toBe('display');
});
