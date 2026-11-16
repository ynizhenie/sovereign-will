import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('save slots are independent, keep the seed as their default name, and live in the Endless saves screen', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await page.click('#play-button');
  // paused first: a worker bringing in stone between setting it and saving made it 124 (a slow CI runner)
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => {
    stock.stone = 123; waveNum = 4;
    game.savannaTiles = [{ x: townHall.x + 15, y: townHall.y + 15 }];
  });
  await page.click('#save-game-button');
  await expect(page.locator('[data-screen="saves"]')).toBeVisible();
  await expect(page.locator('#save-overwrite-button')).toBeHidden();
  await page.click('#save-new-button');
  await expect(page.locator('#save-status')).toContainText('Сохранено');
  await page.evaluate(() => { waveNum = 5; });
  await page.click('#save-new-button');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(2);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sovereign-will-saves'))).length)).toBe(2);
  await page.click('[data-screen="saves"] [data-back]');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.click('#exit-to-menu-button');
  await page.evaluate(() => { resetGame(); }); // the stock's gone back to the start
  await page.click('#mode-endless');
  await expect(page.locator('#open-saves')).toBeVisible();
  await expect(page.locator('#mode-saves')).toHaveCount(0);
  await page.click('#open-saves');
  await expect(page.locator('[data-screen="saves"]')).toBeVisible();
  const save = page.locator('#save-list [data-save]');
  await expect(save).toHaveCount(2);
  const seed = await page.evaluate(() => game.worldSeed.value);
  await expect(save.first().locator('.tile-name b')).toHaveText(seed);
  await expect(save.first()).toContainText('Волна 5');
  await save.first().click();
  // (#299: a save is squeezed, and opened again in a moment)
  await expect.poll(() => page.evaluate(() => [stock.stone, waveNum, gameStarted, savannaTiles.length])).toEqual([123, 5, true, 1]);
  // delete it, asked first
  await page.evaluate(() => exitToMainMenu());
  await page.click('#mode-endless');
  await page.click('#open-saves');
  for (let i = 0; i < 2; i++) {
    await page.click('#save-list [data-delete-save]');
    await page.click('#save-list [data-confirm-delete]');
  }
  await expect(page.locator('#save-list [data-save]')).toHaveCount(0);
});

test('the pause menu overwrites its current save by default, can save a new slot, and has no slot cap', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await page.click('#play-button');
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => { stock.stone = 77; });
  await page.click('#save-game-button');
  await page.click('#save-new-button');
  await expect(page.locator('#save-status')).toContainText('Сохранено');
  await expect(page.locator('#save-overwrite-button')).toBeVisible();
  await page.click('#save-overwrite-button');
  await expect(page.locator('#save-status')).toContainText('Сохранено');
  await page.evaluate(() => { waveNum = 2; });
  await page.click('#save-new-button');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(2);
  await page.click('[data-screen="saves"] [data-back]');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.evaluate(() => { stock.stone = 1; });
  // Load from the same menu as saving.
  await page.click('#save-game-button');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(2);
  await page.click('#save-list [data-save]');
  await expect.poll(() => page.evaluate(() => [stock.stone, isPaused])).toEqual([77, false]);
  // settings and back
  await page.click('#btn-pause-toggle');
  await page.click('#pause-settings-button');
  await expect(page.locator('#main-menu [data-screen="settings"]')).toBeVisible();
  await page.click('#main-menu [data-screen="settings"] [data-back]');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(page.locator('#main-menu')).toBeHidden();
  // More than the former ten-slot cap can be kept.
  await page.evaluate(() => {
    const saves = JSON.parse(localStorage.getItem('sovereign-will-saves'));
    for (let i = 0; i < 12; i++) saves['world:other-' + i] = { name: 'other ' + i, savedAt: i, seed: 'other-' + i, wave: i, data: { seed: { value: 'other-' + i } } };
    localStorage.setItem('sovereign-will-saves', JSON.stringify(saves));
    worldSeed.value = 'a-new-world';
  });
  await page.click('#save-game-button');
  await page.click('#save-new-button');
  await expect(page.locator('#save-status')).toContainText('Сохранено');
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sovereign-will-saves'))).length)).toBe(15);
});

test('the combined save menu lists saves from every world; Battles have no save menu (#254)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    localStorage.setItem('sovereign-will-saves', JSON.stringify({ 'world:elsewhere': { name: 'elsewhere', savedAt: 1, data: { seed: { value: 'elsewhere' }, clocks: { waveNum: 3 } } } }));
  });
  await page.click('#play-button');
  await page.click('#btn-pause-toggle');
  await page.click('#save-game-button');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(1);
  await expect(page.locator('#save-list [data-save]')).toContainText('elsewhere');
  await page.click('#save-new-button');
  await expect(page.locator('#save-status')).toContainText('Сохранено');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(2);
  await page.click('[data-screen="saves"] [data-back]');
  // A battle has no combined save menu in its pause screen.
  await page.evaluate(() => { exitToMainMenu(); showMenuScreen('home'); });
  await page.click('#mode-battles');
  await page.click('#battle-play'); // (#417: Battles opens its settings first)
  await expect(page.locator('[data-battle-category="units"]')).toBeVisible();
  await page.click('#btn-pause-toggle');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(page.locator('#save-game-button')).toBeHidden();
  await expect(page.locator('#load-game-button')).toHaveCount(0);
});

test('save names can be changed and a selected save can be exported then imported as a new slot', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-saves'));
  await page.click('#play-button');
  await page.click('#btn-pause-toggle');
  await page.click('#save-game-button');
  await page.click('#save-new-button');
  const row = page.locator('#save-list .save-tile-wrap').first();
  const nameInput = row.locator('[data-save-name]');
  await nameInput.fill('My colony');
  await nameInput.press('Tab');
  await expect(row.locator('.tile-name b')).toHaveText('My colony');

  const downloadPromise = page.waitForEvent('download');
  await row.locator('[data-export-save]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('My colony.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const file = Buffer.concat(chunks).toString();
  const imported = JSON.parse(file);
  expect(imported.format).toBe('sovereign-will-save');
  await page.locator('#import-save-file').setInputFiles({
    name: 'colony.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file)
  });
  await expect(page.locator('#save-list [data-save]')).toHaveCount(2);
  await expect(page.locator('#save-list .tile-name b').filter({ hasText: 'My colony' })).toHaveCount(2);
});
