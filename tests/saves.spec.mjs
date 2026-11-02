import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// Saves (#156, #254; #326, 30.10, 3: as many as there's room for, screens of their own, files)

const clearSaves = page => page.evaluate(async () => {
  localStorage.removeItem('sovereign-will-saves');
  await new Promise(done => { const req = indexedDB.deleteDatabase('sovereign-will'); req.onsuccess = req.onerror = req.onblocked = () => done(); });
});

test('Save opens the saves screen: a new save each time, several of one world, its info shown; carried on from the Endless menu, or deleted (#156, #254; #326, 30.10, 3)', async ({ page }) => {
  await openGame(page);
  await clearSaves(page);
  await page.click('#play-button');
  // paused first: a worker bringing in stone between setting it and saving made it 124 (a slow CI runner)
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => { stock.stone = 123; waveNum = 4; });
  await page.click('#save-game-button');
  await expect(page.locator('[data-screen="saves"]')).toBeVisible();
  await expect(page.locator('#saves-title')).toHaveText('Сохранить игру');
  await page.click('#saves-new');
  await expect(page.locator('#saves-note')).toContainText('Сохранено');
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(1);
  // the same world again: a second save, not over the first (no slot a world any more)
  await page.evaluate(() => { waveNum = 5; });
  await page.click('#saves-new');
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(2);
  const tile = page.locator('#saves-list [data-save]').first();
  await expect(tile).toContainText(/Мир .*Волна 5 · День \d+ · Жителей: \d+/); // (its world, wave, day, people...)
  // back to the pause menu
  await page.click('#saves-back');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.click('#exit-to-menu-button');
  await page.evaluate(() => { resetGame(); }); // the stock's gone back to the start
  await page.click('#mode-endless');
  await expect(page.locator('#open-saves')).toContainText('Сохранения (2)');
  await page.click('#open-saves');
  await expect(page.locator('#saves-title')).toHaveText('Загрузить игру');
  await expect(page.locator('#saves-new')).toBeHidden();
  await page.locator('#saves-list [data-save]').last().click(); // (the older: wave 4)
  await expect.poll(() => page.evaluate(() => [stock.stone, waveNum, gameStarted])).toEqual([123, 4, true]);
  // delete one, asked first
  await page.evaluate(() => exitToMainMenu());
  await page.click('#mode-endless');
  await page.click('#open-saves');
  await page.locator('#saves-list [data-delete-save]').first().click();
  await page.locator('#saves-list [data-confirm-delete]').first().click();
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(1);
  await page.click('#saves-back');
  await expect(page.locator('#open-saves')).toContainText('Сохранения (1)');
});

test('the pause menu loads any save from the list; saving can go over one (asked first); twelve and more fit; a battle has no saving or loading (#254; #326, 30.10, 3)', async ({ page }) => {
  await openGame(page);
  await clearSaves(page);
  await page.click('#play-button');
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => { stock.stone = 77; });
  await page.click('#save-game-button');
  await page.click('#saves-new');
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(1);
  // over it: asked first, then the one save holds the new game
  await page.evaluate(() => { stock.stone = 55; });
  await page.locator('#saves-list [data-save]').click();
  await page.locator('#saves-list [data-confirm-over]').click();
  await expect(page.locator('#saves-note')).toContainText('Сохранено');
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(1);
  await page.click('#saves-back');
  await page.evaluate(() => { stock.stone = 1; });
  // load
  await page.click('#load-game-button');
  await page.click('#saves-list [data-save]');
  await expect.poll(() => page.evaluate(() => [stock.stone, isPaused])).toEqual([55, false]);
  // no limit: twelve more saves, all kept
  const count = await page.evaluate(async () => { for (let i = 0; i < 12; i++) { waveNum = 10 + i; await saveCurrentGame(); } return Object.keys(loadSaves()).length; });
  expect(count).toBe(13);
  // a battle: no Save, no Load in its pause menu
  await page.evaluate(() => { exitToMainMenu(); showMenuScreen('home'); });
  await page.click('#mode-battles');
  await expect(page.locator('[data-battle-category="units"]')).toBeVisible();
  await page.click('#btn-pause-toggle');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(page.locator('#save-game-button')).toBeHidden();
  await expect(page.locator('#load-game-button')).toBeHidden();
});

test('a save is written to a file and read back from one as a new save; a file that isn\'t one is refused; an old save in the list still loads (#326, 30.10, 3)', async ({ page }) => {
  await openGame(page);
  await clearSaves(page);
  await page.click('#play-button');
  await page.click('#btn-pause-toggle');
  await page.evaluate(() => { stock.stone = 31; waveNum = 7; });
  await page.click('#save-game-button');
  await page.click('#saves-new');
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(1);
  // to a file: downloaded
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saves-list [data-export-save]')]);
  expect(download.suggestedFilename()).toMatch(/-wave7\.swsave$/);
  const path = await download.path();
  // back from it: a second save, the same game
  await page.setInputFiles('#saves-import-file', path);
  await expect(page.locator('#saves-note')).toContainText('Сохранение добавлено');
  await expect(page.locator('#saves-list [data-save]')).toHaveCount(2);
  // not a save file
  await page.setInputFiles('#saves-import-file', { name: 'x.swsave', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('#saves-note')).toContainText('не файл сохранения');
  // the imported one loads
  const r = await page.evaluate(async () => {
    const newest = Object.values(loadSaves()).sort((a, b) => b.savedAt - a.savedAt);
    const imported = newest.find(s => s.id !== newest[newest.length - 1].id) || newest[0];
    const data = await saveDataOf(imported);
    return { stone: data.stock.stone, wave: data.clocks.waveNum };
  });
  expect(r).toEqual({ stone: 31, wave: 7 });
  // an old save (its game in the list itself, from before) still loads
  const old = await page.evaluate(async () => {
    const data = await saveDataOf(latestSave());
    const saves = loadSaves(); saves['world:old'] = { name: 'old', savedAt: 1, seed: 'old', wave: 2, data }; storeSaves(saves);
    const back = await saveDataOf(loadSaves()['world:old']);
    return back.stock.stone;
  });
  expect(old).toBe(31);
});
