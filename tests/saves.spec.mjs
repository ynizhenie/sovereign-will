import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('save from the pause menu, then carry on from the Endless menu, or delete the save (#156)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await page.click('#play-button');
  // paused first: a worker bringing in stone between setting it and saving made it 124 (a slow CI runner)
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => { stock.stone = 123; waveNum = 4; });
  await page.click('#save-game-button');
  // said on the button itself, not in a notice behind the pause menu (#254)
  await expect(page.locator('#save-game-button')).toContainText('Сохранено');
  // the same world again: its one slot, saved over (#254)
  await page.evaluate(() => { waveNum = 4; });
  await page.click('#save-game-button');
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sovereign-will-saves'))).length)).toBe(1);
  await page.click('#exit-to-menu-button');
  await page.evaluate(() => { resetGame(); }); // the stock's gone back to the start
  await page.click('#mode-endless');
  await expect(page.locator('#save-settings')).toBeVisible();
  const save = page.locator('#save-list [data-save]');
  await expect(save).toHaveCount(1);
  await expect(save).toContainText(/^Волна 4 · .* · мир /);
  await save.click();
  expect(await page.evaluate(() => [stock.stone, waveNum, gameStarted])).toEqual([123, 4, true]);
  // delete it, asked first
  await page.evaluate(() => exitToMainMenu());
  await page.click('#mode-endless');
  await page.click('#save-list [data-delete-save]');
  await page.click('#save-list [data-confirm-delete]');
  await expect(page.locator('#save-settings')).toBeHidden();
});

test('the pause menu loads a save and opens the settings, Back returns to it; ten slots at most (#254)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await page.click('#play-button');
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => { stock.stone = 77; });
  await page.click('#save-game-button');
  await page.evaluate(() => { stock.stone = 1; });
  // load
  await page.click('#load-game-button');
  await expect(page.locator('#pause-load-list [data-save]')).toHaveCount(1);
  await page.click('#pause-load-list [data-save]');
  expect(await page.evaluate(() => [stock.stone, isPaused])).toEqual([77, false]);
  // settings and back
  await page.click('#btn-pause-toggle');
  await page.click('#pause-settings-button');
  await expect(page.locator('#main-menu [data-screen="settings"]')).toBeVisible();
  await page.click('#main-menu [data-screen="settings"] [data-back]');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(page.locator('#main-menu')).toBeHidden();
  // ten worlds saved: an eleventh doesn't fit
  await page.evaluate(() => {
    const saves = JSON.parse(localStorage.getItem('sovereign-will-saves'));
    for (let i = 0; i < 9; i++) saves['world:other-' + i] = { name: 'other ' + i, savedAt: i, data: { seed: { value: 'other-' + i } } };
    localStorage.setItem('sovereign-will-saves', JSON.stringify(saves));
    worldSeed.value = 'a-new-world';
  });
  await page.click('#save-game-button');
  await expect(page.locator('#save-game-button')).toContainText('слотов заняты');
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sovereign-will-saves'))).length)).toBe(10);
});
