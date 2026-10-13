import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

test('editor screens: new map, tools, save by name, open and delete saved maps (#37, #39)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-maps'); showMenuScreen('home'); });
  await page.locator('#mode-editor').click();
  await expect(page.locator('#editor-map-list')).toContainText('Сохранённых карт пока нет');
  await page.locator('[data-editor-size="30"]').click();
  await page.locator('#editor-new-empty').click();
  await expect(page.locator('[data-editor-category="terrain"]')).toBeVisible(); // the editor's dock
  await expect(page.locator('[data-arg="tab-build"]')).toBeHidden();
  await page.locator('[data-editor-category="terrain"]').click(); // its sheet
  await expect(page.locator('#editor-panel')).toBeVisible();
  await expect.poll(() => iconText(page, '#editor-tools [data-tool="water"]')).toEqual(['[[water]] Вода']);
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

  await page.locator('[data-dock="editor-map"]').click(); // the map's sheet: its name, size, save
  await page.locator('#editor-save').click();
  await expect.poll(() => iconText(page, '#toast-notification')).toEqual(['[[warn]] Сначала назовите карту']);
  await page.locator('#editor-name').fill('Озерцо');
  await page.locator('#editor-save').click();
  await expect.poll(() => iconText(page, '#toast-notification')).toEqual(['[[ok]] Карта сохранена: Озерцо']);

  await page.locator('#btn-pause-toggle').click(); // the Menu is the pause button at the top (#145)
  await page.locator('#exit-to-menu-button').click();
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#editor-map-list [data-map="Озерцо"]')).toHaveText('Озерцо · 30×30');

  // open it again: the water is still there
  await page.locator('#editor-map-list [data-map="Озерцо"]').click();
  expect(await page.evaluate(() => [waterTiles.length, COLS])).toEqual([1, 30]);
  await page.locator('#btn-pause-toggle').click(); // the Menu is the pause button at the top (#145)
  await page.locator('#exit-to-menu-button').click();

  // Endless: Custom map lists it, and hides the map size and generator
  await page.locator('[data-screen="editor"] [data-back]').click();
  await page.locator('#mode-endless').click();
  await expect(page.locator('#custom-map-list')).toBeHidden();
  await page.locator('[data-map-source="custom"]').click();
  await expect(page.locator('#custom-map-list [data-map="Озерцо"]')).toHaveClass(/active/);
  await expect(page.locator('#open-generator')).toBeHidden();
  await page.locator('#play-button').click();
  expect(await page.evaluate(() => [COLS, waterTiles.length, gameMode])).toEqual([30, 1, 'endless']);

  // delete it in the editor
  await page.evaluate(() => exitToMainMenu());
  await page.locator('[data-screen="home"] #mode-editor').click();
  // delete asks first: No keeps it, Yes deletes it (#143)
  await page.locator('#editor-map-list [data-delete-map="Озерцо"]').click();
  await expect(page.locator('#editor-map-list')).toContainText('Удалить «Озерцо · 30×30»?');
  await page.locator('#editor-map-list [data-cancel-delete="Озерцо"]').click();
  await expect(page.locator('#editor-map-list [data-map="Озерцо"]')).toHaveCount(1);
  await page.locator('#editor-map-list [data-delete-map="Озерцо"]').click();
  await page.locator('#editor-map-list [data-confirm-delete="Озерцо"]').click();
  await expect(page.locator('#editor-map-list')).toContainText('Сохранённых карт пока нет');
});

