import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText, started } from './helpers.mjs';

test('editor screens: new map, tools, save by name, open and delete saved maps (#37, #39)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-maps'); showMenuScreen('home'); });
  await page.locator('#mode-editor').click();
  await page.locator('#editor-open-maps').click();
  await expect(page.locator('#map-manager-list')).toContainText('Сохранённых карт пока нет');
  await page.locator('[data-screen="maps"] [data-back]').click();
  await expect(page.locator('.editor-start')).toContainText('Выберите карту для открытия в редакторе');
  await expect(page.locator('#editor-new-empty')).toHaveText('Пустая карта');
  await expect(page.locator('#editor-new-generated')).toHaveText('Сгенерировать карту');
  await expect(page.locator('.editor-start-options .menu-button-primary')).toHaveCount(2);
  await page.locator('[data-editor-size="128"]').click();
  await page.locator('#editor-new-empty').click();
  await expect(page.locator('#loading-screen')).toBeVisible();
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('[data-editor-category="terrain"]')).toBeVisible(); // the editor's dock
  await expect(page.locator('[data-arg="tab-build"]')).toBeHidden();
  expect(await page.evaluate(() => getDayPhase())).toBe('morning');
  expect(await page.evaluate(() => getDarkness())).toBe(0);
  await expect(page.locator('#editor-hide-time-weather-options [data-hide-time-weather="on"]')).toHaveClass(/active/);
  await page.locator('[data-editor-category="terrain"]').click(); // its sheet
  await expect(page.locator('#editor-panel')).toBeVisible();
  await expect.poll(() => iconText(page, '#editor-tools [data-tool="water"]')).toEqual(['[[water]] Вода']);
  await expect.poll(() => iconText(page, '#editor-tools [data-tool="savanna"]')).toEqual(['[[savanna]] Саванна']);
  await page.locator('[data-editor-category="buildings"]').click();
  await expect(page.locator('#editor-tools [data-tool="wall_stone"]')).toContainText('Каменная стена');

  // a tap on the map with the Water tool puts water there
  await page.locator('[data-editor-category="terrain"]').click();
  await page.locator('#editor-tools [data-tool="water"]').click();
  // where a tile 4 to the left of the town hall is on the screen
  const spot = await page.evaluate(() => {
    const rect = canvas.getBoundingClientRect();
    const x = townHall.x - 4 * TILE_SIZE + 15, y = townHall.y + 15;
    return { x: rect.left + ((x - camera.x) * getViewScale() + canvas.width / 2) * rect.width / canvas.width,
      y: rect.top + ((y - camera.y) * getViewScale() + canvas.height / 2) * rect.height / canvas.height };
  });
  await page.mouse.click(spot.x, spot.y);
  expect(await page.evaluate(() => waterTiles.length)).toBe(1);

  await page.locator('[data-editor-category="terrain"]').click();
  await page.locator('#editor-tools [data-tool="savanna"]').click();
  const savannaSpot = await page.evaluate(() => {
    const rect = canvas.getBoundingClientRect();
    const x = townHall.x + 12 * TILE_SIZE + 15, y = townHall.y + 12 * TILE_SIZE + 15;
    return { x: rect.left + ((x - camera.x) * getViewScale() + canvas.width / 2) * rect.width / canvas.width,
      y: rect.top + ((y - camera.y) * getViewScale() + canvas.height / 2) * rect.height / canvas.height };
  });
  await page.mouse.click(savannaSpot.x, savannaSpot.y);
  expect(await page.evaluate(() => savannaTiles.length)).toBe(1);

  await page.locator('[data-editor-category="terrain"]').click();
  await page.locator('[data-brush="3"]').click();
  const pond = await page.evaluate(() => {
    const rect = canvas.getBoundingClientRect();
    const x = townHall.x + 8 * TILE_SIZE + 15, y = townHall.y + 8 * TILE_SIZE + 15;
    return { x: rect.left + ((x - camera.x) * getViewScale() + canvas.width / 2) * rect.width / canvas.width,
      y: rect.top + ((y - camera.y) * getViewScale() + canvas.height / 2) * rect.height / canvas.height };
  });
  await page.mouse.click(pond.x, pond.y);
  expect(await page.evaluate(() => [waterTiles.length, isWaterReachable(waterTiles.find(w => w.x === townHall.x + 8 * TILE_SIZE + 15 && w.y === townHall.y + 8 * TILE_SIZE + 15))])).toEqual([10, false]);
  await page.locator('[data-editor-category="terrain"]').click();
  await page.locator('[data-brush="1"]').click();

  // Fish traps only sit on reachable water, and placing/removing one leaves water in place
  await page.locator('[data-editor-category="buildings"]').click();
  await page.locator('#editor-tools [data-tool="fish_trap"]').click();
  const landSpot = await page.evaluate(() => {
    const rect = canvas.getBoundingClientRect();
    const x = townHall.x + 5 * TILE_SIZE + 15, y = townHall.y + 15;
    return { x: rect.left + ((x - camera.x) * getViewScale() + canvas.width / 2) * rect.width / canvas.width,
      y: rect.top + ((y - camera.y) * getViewScale() + canvas.height / 2) * rect.height / canvas.height };
  });
  await page.mouse.click(landSpot.x, landSpot.y);
  expect(await page.evaluate(() => buildings.filter(b => b.type === 'fish_trap').length)).toBe(0);
  await page.mouse.click(pond.x, pond.y);
  expect(await page.evaluate(() => buildings.filter(b => b.type === 'fish_trap').length)).toBe(0);
  expect(await page.evaluate(() => getDayPhase())).toBe('morning');
  expect(await page.evaluate(() => isWaterReachable(waterTiles.find(w => w.x === townHall.x - 4 * TILE_SIZE + 15 && w.y === townHall.y + 15)))).toBe(true);
  await page.mouse.click(spot.x, spot.y);
  expect(await page.evaluate(() => [waterTiles.length, buildings.filter(b => b.type === 'fish_trap').length])).toEqual([10, 1]);
  await page.mouse.click(spot.x, spot.y);
  expect(await page.evaluate(() => [waterTiles.length, buildings.filter(b => b.type === 'fish_trap').length])).toEqual([10, 0]);

  await page.locator('[data-dock="editor-map"]').click();
  await page.locator('[data-editor-weather="fog"]').click();
  expect(await page.evaluate(() => getWeather().kind)).toBe('clear');
  await page.locator('[data-hide-time-weather="off"]').click();
  expect(await page.evaluate(() => getWeather().kind)).toBe('fog');
  await page.locator('[data-start-time="night"]').click();
  expect(await page.evaluate(() => getDayPhase())).toBe('night');
  expect(await page.evaluate(() => getWeather().kind)).toBe('fog');
  expect(await page.evaluate(() => getDarkness())).toBeGreaterThan(0);
  await page.locator('[data-hide-time-weather="on"]').click();
  expect(await page.evaluate(() => [getWeather().kind, getDarkness()])).toEqual(['clear', 0]);

  // the map sheet remains open for saving
  await page.locator('#editor-save').click();
  await expect.poll(() => iconText(page, '#toast-notification')).toEqual(['[[warn]] Сначала назовите карту']);
  await page.locator('#editor-name').fill('Озерцо');
  await page.locator('#editor-save').click();
  await expect.poll(() => iconText(page, '#toast-notification')).toEqual(['[[ok]] Карта сохранена: Озерцо']);

  await page.locator('#btn-pause-toggle').click(); // the Menu is the pause button at the top (#145)
  await page.locator('#exit-to-menu-button').click();
  await expect(page.locator('#main-menu')).toBeVisible();
  await page.locator('#editor-open-maps').click();
  await expect(page.locator('#map-manager-list [data-map="Озерцо"]')).toContainText('Озерцо');

  const mapName = page.locator('#map-manager-list [data-map-name]');
  await mapName.fill('Пруд');
  await mapName.press('Tab');
  await expect(page.locator('#map-manager-list [data-map="Пруд"]')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#map-manager-list [data-export-map="Пруд"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Пруд.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const mapFile = Buffer.concat(chunks);
  expect(JSON.parse(mapFile.toString()).format).toBe('sovereign-will-map');
  await page.locator('#map-import-file').setInputFiles({
    name: 'pond.json',
    mimeType: 'application/json',
    buffer: mapFile
  });
  await expect(page.locator('#map-manager-list [data-map]')).toHaveCount(2);
  await expect(page.locator('#map-manager-list [data-map="Пруд (2)"]')).toBeVisible();
  await page.locator('#map-manager-list [data-delete-map="Пруд (2)"]').click();
  await page.locator('#map-manager-list [data-cancel-delete="Пруд (2)"]').click();
  await expect(page.locator('#map-manager-list [data-map="Пруд (2)"]')).toBeVisible();
  await page.locator('#map-manager-list [data-delete-map="Пруд (2)"]').click();
  await page.locator('#map-manager-list [data-confirm-delete="Пруд (2)"]').click();
  await page.locator('#map-manager-list [data-map-name]').fill('Озерцо');
  await page.locator('#map-manager-list [data-map-name]').press('Tab');

  // open it again: the water is still there
  await page.locator('#map-manager-list [data-map="Озерцо"]').click();
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 30000 });
  expect(await page.evaluate(() => [waterTiles.length, savannaTiles.length, COLS])).toEqual([10, 1, 128]);
  expect(await page.evaluate(() => getDayPhase())).toBe('night');
  await page.locator('#btn-pause-toggle').click(); // the Menu is the pause button at the top (#145)
  await page.locator('#exit-to-menu-button').click();

  // Endless: Custom map lists it, and hides the map size and generator
  await page.locator('[data-screen="editor"] [data-back]').click();
  await page.locator('#mode-endless').click();
  await expect(page.locator('#endless-open-maps')).toBeHidden();
  await page.locator('[data-map-source="custom"]').click();
  await expect(page.locator('#endless-open-maps')).toBeVisible();
  await page.locator('#endless-open-maps').click();
  await expect(page.locator('#map-manager-list .save-tile-wrap.current [data-map="Озерцо"]')).toBeVisible();
  await expect(page.locator('#open-generator')).toBeHidden();
  await page.locator('#map-manager-list [data-map="Озерцо"]').click();
  await expect(page.locator('[data-screen="endless"]')).toBeVisible();
  await expect(page.locator('#endless-open-maps')).toHaveText('Озерцо');
  await page.locator('#play-button').click();
  await started(page);
  expect(await page.evaluate(() => [COLS, waterTiles.length, savannaTiles.length, gameMode])).toEqual([128, 10, 1, 'endless']);
  expect(await page.evaluate(() => [getWeather().kind, Number.isFinite(game.weather.left), getDarkness() > 0])).toEqual(['fog', true, true]);

  // delete it in the editor
  await page.evaluate(() => exitToMainMenu());
  await page.locator('[data-screen="home"] #mode-editor').click();
  // delete asks first: No keeps it, Yes deletes it (#143)
  await page.locator('#editor-open-maps').click();
  const exportHeight = await page.locator('#map-manager-list [data-export-map="Озерцо"]').evaluate(button => button.getBoundingClientRect().height);
  expect(exportHeight).toBeLessThan(60);
  await page.locator('#map-manager-list [data-delete-map="Озерцо"]').click();
  await expect(page.locator('#map-manager-list')).toContainText('Удалить «Озерцо · 128×128»?');
  await expect(page.locator('#map-manager-list [data-delete-map="Озерцо"]')).toBeHidden();
  await expect(page.locator('#map-manager-list [data-confirm-delete="Озерцо"]')).toHaveCount(1);
  await expect(page.locator('#map-manager-list [data-cancel-delete="Озерцо"]')).toHaveCount(1);
  await page.locator('#map-manager-list [data-cancel-delete="Озерцо"]').click();
  await expect(page.locator('#map-manager-list [data-map="Озерцо"]')).toBeVisible();
  await page.locator('#map-manager-list [data-delete-map="Озерцо"]').click();
  await page.locator('#map-manager-list [data-confirm-delete="Озерцо"]').click();
  await expect(page.locator('#map-manager-list')).toContainText('Сохранённых карт пока нет');
});
