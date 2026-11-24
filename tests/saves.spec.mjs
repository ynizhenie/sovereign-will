import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('native exports write the file into Downloads; if that fails, to cache and the system share sheet (#420)', async ({ page }) => {
  await openGame(page);
  const runs = await page.evaluate(async () => {
    const { exportFile } = await import('/js/engine/platform/index.js');
    const run = async downloadsWork => {
      const calls = [];
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        value: {
          isNativePlatform: () => true,
          Plugins: {
            Filesystem: {
              checkPermissions: async () => ({ publicStorage: 'granted' }),
              requestPermissions: async () => calls.push({ kind: 'ask' }),
              writeFile: async options => {
                calls.push({ kind: 'write', options });
                if (options.directory === 'EXTERNAL_STORAGE' && !downloadsWork) throw new Error('no access');
                return { uri: `file:///${options.directory}/${options.path}` };
              }
            },
            Share: { share: async options => calls.push({ kind: 'share', options }) }
          }
        }
      });
      const exported = await exportFile('save.json', '{"version":1}');
      return { exported, calls };
    };
    return [await run(true), await run(false)];
  });
  const downloads = { path: 'Download/SovereignWill/save.json', data: '{"version":1}', directory: 'EXTERNAL_STORAGE', encoding: 'utf8', recursive: true };
  expect(runs[0]).toEqual({ exported: 'Download/SovereignWill/save.json', calls: [{ kind: 'write', options: downloads }] });
  expect(runs[1]).toEqual({
    exported: true,
    calls: [
      { kind: 'write', options: downloads },
      { kind: 'write', options: { path: 'exports/save.json', data: '{"version":1}', directory: 'CACHE', encoding: 'utf8', recursive: true } },
      { kind: 'share', options: { title: 'save.json', dialogTitle: 'save.json', files: ['file:///CACHE/exports/save.json'] } }
    ]
  });
});

test('mobile browser exports use Web Share for files when it is available', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(async () => {
    const { exportFile } = await import('/js/engine/platform/index.js');
    let shared;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: options => options.files?.[0] instanceof File
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async options => {
        shared = {
          title: options.title,
          name: options.files[0].name,
          data: await options.files[0].text(),
          type: options.files[0].type
        };
      }
    });
    const exported = await exportFile('save.json', '{"version":1}');
    return { exported, shared };
  });
  expect(result).toEqual({
    exported: true,
    shared: { title: 'save.json', name: 'save.json', data: '{"version":1}', type: 'application/json' }
  });
});

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
  await page.evaluate(() => showMenuScreen('modes')); await page.click('#mode-endless');
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
  await page.evaluate(() => showMenuScreen('modes')); await page.click('#mode-endless');
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
  await page.evaluate(() => showMenuScreen('modes')); await page.click('#mode-battles');
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

test('a choice tapped on a phone is kept: a random map after a custom one stays random (#420)', async ({ page }) => {
  await openGame(page);
  const saved = await page.evaluate(() => {
    const button = /** @type {HTMLElement} */ (document.querySelector('[data-map-source="random"]'));
    const touch = new Touch({ identifier: 1, target: button, clientX: 5, clientY: 5 });
    localStorage.setItem('sovereign-will-endlessChoices', JSON.stringify({ mapSource: 'custom', customMap: 'Island' }));
    button.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], changedTouches: [touch], bubbles: true }));
    button.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch], bubbles: true, cancelable: true }));
    return JSON.parse(localStorage.getItem('sovereign-will-endlessChoices') || '{}');
  });
  expect(saved.mapSource).toBe('random');
  expect(saved.customMap).toBeNull();
});
