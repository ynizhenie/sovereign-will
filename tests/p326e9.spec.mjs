import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, point 35: the map editor's maps are Endless's, big ones, saved compactly; no Play from the editor

test('the editor\'s new maps are of Endless\'s sizes, one from the generator is a continent, and there is no Play button in it (#326, 35)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-maps'); showMenuScreen('home'); });
  expect(await page.locator('[data-editor-size]').evaluateAll(b => b.map(x => x.dataset.editorSize))).toEqual(['128', '256', '512']);
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="128"]').click();
  await page.locator('#editor-new-generated').click();
  const r = await page.evaluate(() => ({
    size: [COLS, ROWS], gameMode, water: waterTiles.length, rocks: naturalRocks.length, trees: trees.length,
    play: !!document.getElementById('editor-play'), limit: EDITOR_MAX_TILES
  }));
  expect(r.size).toEqual([128, 128]);
  expect(r.gameMode).toBe('editor');
  expect(r.water).toBeGreaterThan(128 * 128 * 0.3); // (a continent in the sea, not a clearing)
  expect(r.rocks).toBeGreaterThan(50);
  expect(r.play).toBe(false);
  expect(r.limit).toBe(512);
  expect(errors).toEqual([]);
});

test('a big map is saved as runs, not tile by tile, and opens as it was; a map saved the old way still opens (#326, 35)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-maps'); showMenuScreen('home'); });
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="128"]').click();
  await page.locator('#editor-new-generated').click();
  const r = await page.evaluate(() => {
    document.getElementById('editor-name').value = 'Big one';
    saveEditorMap();
    const saved = loadSavedMaps()['Big one'];
    const before = { water: waterTiles.length, sand: desertTiles.length, trees: trees.length, rocks: naturalRocks.length };
    const asRuns = JSON.stringify(saved.waterRuns).length;
    const oneByOne = JSON.stringify(waterTiles.map(w => [Math.floor(w.x / TILE_SIZE), Math.floor(w.y / TILE_SIZE)])).length;
    loadCustomMap(saved);
    const after = { water: waterTiles.length, sand: desertTiles.length, trees: trees.length, rocks: naturalRocks.length };
    // the old way: `water` and `sand` as tiles
    const old = { ...saved, waterRuns: undefined, sandRuns: undefined, water: [[3, 3], [4, 3], [9, 9]], sand: [[5, 5]] };
    loadCustomMap(old);
    return { before, after, smaller: asRuns < oneByOne / 3, old: [waterTiles.length, desertTiles.length] };
  });
  expect(r.after).toEqual(r.before);
  expect(r.smaller).toBe(true);
  expect(r.old).toEqual([3, 1]);
  expect(errors).toEqual([]);
});

test('a side of the map can be moved ten tiles at once (#326, 35)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="128"]').click();
  await page.locator('#editor-new-empty').click();
  const r = await page.evaluate(() => {
    resizeEditorMap('right', 10); resizeEditorMap('bottom', -10);
    return [COLS, ROWS];
  });
  expect(r).toEqual([138, 118]);
  expect(await page.locator('[data-resize]').count()).toBe(16);
  expect(errors).toEqual([]);
});
