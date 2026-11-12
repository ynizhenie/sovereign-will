import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// (the loading screen and the page's first showing wait on the browser's frames: its own here, see helpers.mjs)
test.use({ frameMs: 0 });

// The friend's #326, point 35: the map editor's maps are Endless's, big ones, saved compactly; no Play from the editor

test('the editor\'s new maps are of Endless\'s sizes, one from the generator is a continent, and there is no Play button in it (#326, 35)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-maps'); showMenuScreen('home'); });
  expect(await page.locator('[data-editor-size]').evaluateAll(b => b.map(x => x.dataset.editorSize))).toEqual(['128', '192', '256', 'custom']);
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="128"]').click();
  await page.evaluate(() => {
    const fill = document.getElementById('loading-fill');
    window.loadingWidths = [];
    window.loadingObserver = new MutationObserver(() => window.loadingWidths.push(Number.parseFloat(fill.style.width)));
    window.loadingObserver.observe(fill, { attributes: true, attributeFilter: ['style'] });
  });
  await page.locator('#editor-new-generated').click();
  await expect(page.locator('#loading-screen')).toBeVisible();
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 30000 });
  const progress = await page.evaluate(() => {
    window.loadingObserver.disconnect();
    return window.loadingWidths;
  });
  expect(progress.length).toBeGreaterThan(3);
  expect(progress.at(-1)).toBe(100);
  expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true);
  const r = await page.evaluate(() => ({
    size: [COLS, ROWS], gameMode, water: waterTiles.length, savanna: savannaTiles.length, rocks: naturalRocks.length, trees: trees.length,
    play: !!document.getElementById('editor-play'), customMax: Number(document.getElementById('editor-map-cols').max), chunks: chunkStats()
  }));
  expect(r.size).toEqual([128, 128]);
  expect(r.gameMode).toBe('editor');
  expect(r.water).toBeGreaterThan(128 * 128 * 0.3); // (a continent in the sea, not a clearing)
  expect(r.savanna).toBeGreaterThan(0);
  expect(r.rocks).toBeGreaterThan(50);
  expect(r.play).toBe(false);
  expect(r.customMax).toBe(512);
  expect(r.chunks.pending).toBe(0);
  expect(r.chunks.holes).toBe(0);
  expect(errors).toEqual([]);
});

test('a big map is saved as runs, not tile by tile, and opens as it was; a map saved the old way still opens (#326, 35)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { localStorage.removeItem('sovereign-will-maps'); showMenuScreen('home'); });
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="128"]').click();
  await page.locator('#editor-new-generated').click();
  await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 30000 });
  const r = await page.evaluate(() => {
    document.getElementById('editor-name').value = 'Big one';
    saveEditorMap();
    const saved = loadSavedMaps()['Big one'];
    const before = { water: waterTiles.length, sand: desertTiles.length, savanna: savannaTiles.length, trees: trees.length, rocks: naturalRocks.length };
    const asRuns = JSON.stringify(saved.waterRuns).length;
    const oneByOne = JSON.stringify(waterTiles.map(w => [Math.floor(w.x / TILE_SIZE), Math.floor(w.y / TILE_SIZE)])).length;
    loadCustomMap(saved);
    const after = { water: waterTiles.length, sand: desertTiles.length, savanna: savannaTiles.length, trees: trees.length, rocks: naturalRocks.length };
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

test('map dimensions cannot be changed after opening it in the editor', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.locator('#mode-editor').click();
  await page.locator('[data-editor-size="128"]').click();
  await page.locator('#editor-new-empty').click();
  expect(await page.locator('[data-resize]').count()).toBe(0);
  expect(await page.locator('#editor-resize-panel').count()).toBe(0);
  expect(await page.locator('#editor-drag').count()).toBe(0);
  expect(await page.evaluate(() => [COLS, ROWS])).toEqual([128, 128]);
  expect(errors).toEqual([]);
});
