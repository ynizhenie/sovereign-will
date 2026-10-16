import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The HUD: the top bar, the strip of the main stock, the dock and the sheets it opens; every way into a
// sheet and out of it
const body = page => page.evaluate(() => ({
  sheet: document.body.classList.contains('sheet-open'),
  placing: document.body.classList.contains('placing'),
  stock: document.body.classList.contains('resources-open')
}));
const esc = page => page.keyboard.press('Escape');

test('the bars slide in for a game and away for the menu', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#top-bar')).toBeHidden(); // the menu: no bars
  await expect(page.locator('#dock')).toBeHidden();
  await page.click('#play-button');
  await expect(page.locator('#top-bar')).toBeVisible();
  await expect(page.locator('#dock')).toBeVisible();
  await expect(page.locator('#resource-strip')).toBeVisible();
  await expect(page.locator('#sheet-frame')).toBeHidden(); // a game starts with the sheet closed
  await page.evaluate(() => exitToMainMenu());
  await expect(page.locator('#top-bar')).toBeHidden();
  await expect(page.locator('#dock')).toBeHidden();
});

test('a dock button opens its sheet and closes it again; another tab swaps it; Point, Esc and a map tap close it', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const build = page.locator('[data-arg="tab-build"]');
  await build.click();
  await expect(page.locator('#build-actions')).toBeVisible();
  await expect(build).toHaveClass(/active/);
  await build.click();
  await expect(page.locator('#sheet-frame')).toBeHidden();
  await expect(build).not.toHaveClass(/active/);

  await build.click();
  await page.click('[data-arg="tab-tools"]');
  await expect(page.locator('#tool-actions')).toBeVisible(); // tools in People (hiring is at the town hall, #211)
  await expect(page.locator('#build-actions')).toBeHidden();
  await page.click('#btn-interact');
  expect(await body(page)).toEqual({ sheet: false, placing: false, stock: false });

  await build.click();
  await esc(page);
  expect((await body(page)).sheet).toBe(false);

  await build.click();
  const box = await page.locator('#gameCanvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 80);
  expect((await body(page)).sheet).toBe(false);
});

test('picking a building puts the sheet away and shows its chip: a tap brings the sheet back, × or Esc puts it down', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.click('[data-arg="tab-build"]');
  await page.click('#btn-wall_wood');
  await expect(page.locator('#sheet-frame')).toBeHidden();
  await expect(page.locator('#placing-chip')).toBeVisible();
  await expect(page.locator('#placing-what')).toContainText('Деревянная стена');

  await page.click('#placing-what'); // back to the sheet, the wall still in hand
  await expect(page.locator('#build-actions')).toBeVisible();
  await expect(page.locator('#placing-chip')).toBeHidden();
  expect(await page.evaluate(() => buildMode)).toBe('wall_wood');
  await esc(page); // the wall goes first
  expect(await page.evaluate(() => buildMode)).toBe('interact');
  await esc(page); // then the sheet
  expect(await body(page)).toEqual({ sheet: false, placing: false, stock: false });

  await page.click('[data-arg="tab-build"]');
  await page.click('#btn-demolish');
  await expect(page.locator('#placing-chip')).toBeVisible();
  await page.click('#placing-close');
  await expect(page.locator('#placing-chip')).toBeHidden();
  expect(await page.evaluate(() => buildMode)).toBe('interact');
});

test('Esc with nothing open or picked leaves possession, as before', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => switchPossession());
  expect(await page.evaluate(() => !!getPossessed())).toBe(true);
  await page.click('[data-arg="tab-build"]');
  await esc(page); // the sheet first
  expect(await page.evaluate(() => !!getPossessed())).toBe(true);
  await esc(page);
  expect(await page.evaluate(() => !!getPossessed())).toBe(false);
});

test('the strip shows the main stock and drops down all of it; a sheet and the strip never show together', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { settlers = []; stock.wood = 77; updateUI(); }); // (nobody to bring wood in between)
  await expect(page.locator('#strip-wood')).toHaveText('77');
  await expect(page.locator('#strip-pop')).toHaveText(/\d+\/\d+/);
  await page.click('#resource-strip');
  await expect(page.locator('#resources-hud')).toBeVisible();
  await page.click('[data-arg="tab-build"]'); // a sheet closes the stock
  expect(await body(page)).toEqual({ sheet: true, placing: false, stock: false });
  await page.click('#resource-strip'); // and the stock the sheet
  expect(await body(page)).toEqual({ sheet: false, placing: false, stock: true });
  await esc(page);
  await expect(page.locator('#resources-hud')).toBeHidden();
});

test('the wave in the middle of the top bar: m:ss, a bar running down, the last seconds marked', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    waveTimer = 75.2; waveInterval = 90; updateUI();
    const time = document.getElementById('wave-timer').innerText;
    const bar = parseFloat(document.getElementById('wave-progress').style.width);
    waveTimer = 8; updateUI();
    return { time, bar: Math.round(bar), soon: document.getElementById('top-wave').classList.contains('soon') };
  });
  expect(r).toEqual({ time: '1:16', bar: 84, soon: true });
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });
  test('a building mode stays after placing, until its chip puts it down', async ({ page }) => {
    await openGame(page);
    await page.click('#play-button');
    const placed = await page.evaluate(() => {
      for (const list of [trees, grassList, sticks, pebbles, berryBushes, boulders, naturalRocks, waterTiles]) list.length = 0;
      resetTileIndex();
      stock.wood = 100;
      setMode('wall_wood');
      const rect = canvas.getBoundingClientRect();
      const screen = (x, y) => [rect.left + ((x - camera.x) * getViewScale() + canvas.width / 2) * rect.width / canvas.width,
        rect.top + ((y - camera.y) * getViewScale() + canvas.height / 2) * rect.height / canvas.height];
      processInteraction(...screen(townHall.x - 3 * TILE_SIZE, townHall.y - 3 * TILE_SIZE));
      processInteraction(...screen(townHall.x + 3 * TILE_SIZE, townHall.y - 3 * TILE_SIZE));
      return { blueprints: blueprints.length, mode: buildMode };
    });
    expect(placed).toEqual({ blueprints: 2, mode: 'wall_wood' });
    await page.click('#placing-close');
    expect(await page.evaluate(() => buildMode)).toBe('interact');
  });
});

test('battle: a category opens its sheet, picking a unit shows it on the chip; the top bar counts both sides', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await expect(page.locator('#placing-chip')).toBeVisible(); // what a tap places, from the start
  await page.click('[data-battle-category="enemy"]');
  await expect(page.locator('#battle-presets')).toBeVisible();
  await page.click('#battle-presets [data-preset="brute"]');
  await expect(page.locator('#sheet-frame')).toBeHidden();
  await expect(page.locator('#placing-what')).toContainText('Громила');
  await expect(page.locator('#placing-close')).toBeHidden(); // a battle always has something picked
  await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    battleTap(at(30, 10).x, at(30, 10).y);
    battle.preset = 'sword'; battleTap(at(10, 10).x, at(10, 10).y); battleTap(at(10, 12).x, at(10, 12).y);
    updateBattle(0);
  });
  await expect(page.locator('#battle-count-green')).toHaveText('2');
  await expect(page.locator('#battle-count-red')).toHaveText('1');
  await page.click('[data-dock="battle-clear"]');
  await expect(page.locator('#battle-clear-red')).toBeVisible();
  await page.click('#battle-fight');
  await expect(page.locator('#placing-chip')).toBeHidden();
  await expect(page.locator('#sheet-frame')).toBeHidden();
  await expect(page.locator('#battle-cancel')).toBeVisible();
  await expect(page.locator('#battle-phase-label')).toHaveText('Бой');
});

test('editor: a category opens its sheet, a tool or the eraser shows on the chip; the top bar has the map\'s name', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-editor');
  await page.click('#editor-new-empty');
  await expect(page.locator('#editor-map-label')).toHaveText('Новая карта');
  await page.click('[data-editor-category="nature"]');
  await page.click('#editor-tools [data-tool="tree"]');
  await expect(page.locator('#sheet-frame')).toBeHidden();
  await expect(page.locator('#placing-what')).toContainText('Дерево');
  await page.click('#editor-erase');
  await expect(page.locator('#placing-what')).toContainText('Ластик');
  await page.click('.top-editor'); // the map's sheet
  await page.fill('#editor-name', 'Остров');
  await expect(page.locator('#editor-map-label')).toHaveText('Остров');
});

test('the open sheet shows the stock of what its prices ask for, by the prices (the friend\'s playtest)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  // nobody about to bring wood in between (it raced on CI: 44)
  await page.evaluate(() => { settlers = []; stock.wood = 42; stock.leather = 3; updateUI(); });
  await page.click('[data-arg="tab-build"]');
  await expect(page.locator('#sheet-stock [data-res="wood"] b')).toHaveText('42');
  await expect(page.locator('#sheet-stock [data-res="leather"] b')).toHaveText('3'); // the tent
  await page.evaluate(() => { stock.wood = 7; updateUI(); });
  await expect(page.locator('#sheet-stock [data-res="wood"] b')).toHaveText('7');
  await page.click('[data-arg="tab-tools"]'); // People: tools take wood and stone
  await expect(page.locator('#sheet-stock [data-res="stone"]')).toBeVisible();
});

test('Point takes the selection off the settler (#232)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { selectedSettler = settlers[0]; updateUI(); });
  await expect(page.locator('#btn-deselect')).toBeVisible();
  await page.click('#btn-interact');
  expect(await page.evaluate(() => selectedSettler)).toBeNull();
});

test('a tap on the town hall opens its card with the hiring; a damaged building\'s card orders its repair (#211)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => { stock.food = 100; isPaused = true; mouse.x = townHall.x; mouse.y = townHall.y; buildMode = 'interact'; handleCanvasClick(); updateUI(); });
  await expect(page.locator('#building-card')).toBeVisible();
  await expect(page.locator('#card-title')).toContainText('Ратуша');
  const settlers0 = await page.evaluate(() => settlers.length);
  await page.click('#btn-hire-normal');
  expect(await page.evaluate(() => settlers.length)).toBe(settlers0 + 1);
  // a damaged wall: its card, its repair
  await page.evaluate(() => {
    const wall = window.sim.helpers.placeBuilding('wall_wood', townHall.x + 120 + 15 - ((townHall.x + 120) % 30), townHall.y + 15 - (townHall.y % 30));
    wall.hp = wall.maxHp / 2;
    mouse.x = wall.x; mouse.y = wall.y; handleCanvasClick(); updateUI();
  });
  await expect(page.locator('#card-title')).toContainText('Деревянная стена');
  await page.locator('#card-actions button', { hasText: 'Починить' }).click();
  expect(await page.evaluate(() => buildings.find(b => b.type === 'wall_wood').repairRequested)).toBe(true);
});
