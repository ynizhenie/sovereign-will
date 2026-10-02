import { test, expect } from '@playwright/test';
import { openGame, sim, iconText } from './helpers.mjs';

test('a saved game loads back exactly, pointers between things included, and goes on the same way (#156)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'saveRoundTrip')).toEqual({ same: true, pointers: true, sameAfterwards: true });
});

test('save from the pause menu, then carry on from the Endless menu, or delete the save (#156)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await page.click('#play-button');
  await page.evaluate(() => { stock.stone = 123; waveNum = 4; });
  await page.click('#btn-pause-toggle');
  await page.click('#save-game-button');
  await expect.poll(() => iconText(page, '#toast-notification')).toEqual([expect.stringMatching(/^\[\[save\]\] Сохранено: Волна 4 · /)]);
  await page.click('#exit-to-menu-button');
  await page.evaluate(() => { resetGame(); }); // the stock's gone back to the start
  await page.click('#mode-endless');
  await expect(page.locator('#save-settings')).toBeVisible();
  const save = page.locator('#save-list [data-save]');
  await expect(save).toHaveCount(1);
  await save.click();
  expect(await page.evaluate(() => [stock.stone, waveNum, gameStarted])).toEqual([123, 4, true]);
  // delete it, asked first
  await page.evaluate(() => exitToMainMenu());
  await page.click('#mode-endless');
  await page.click('#save-list [data-delete-save]');
  await page.click('#save-list [data-confirm-delete]');
  await expect(page.locator('#save-settings')).toBeHidden();
});
