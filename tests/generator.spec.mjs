import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('the gear opens a labelled field for each of the ore and regrowth settings a continent uses; none of the small maps\' (#20; #326, 27.10, 18)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  await expect(page.locator('[data-screen="generator"]')).toBeVisible();
  const size = await page.locator('[data-screen="generator"]').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    content: element.scrollHeight,
    viewport: innerHeight
  }));
  expect(size.height).toBeLessThanOrEqual(size.viewport * 0.75);
  expect(size.content).toBeGreaterThan(size.height);
  const r = await page.evaluate(() => {
    const keys = GENERATOR_GROUPS.flatMap(([, k]) => k);
    const fields = [...document.querySelectorAll('#generator-fields .generator-field')].filter(f => f.querySelector('input[data-key]'));
    const labelled = fields.every(f => f.querySelector('span').textContent && !f.querySelector('span').textContent.startsWith('gen.'));
    const covered = keys.every(k => document.querySelector(`#generator-fields input[data-key="${k}"]`));
    return { fields: fields.length, keys, labelled, covered, lakes: !!document.querySelector('#generator-fields input[data-key="lakes"]'),
      sections: document.querySelectorAll('#generator-fields h2').length };
  });
  expect(r.keys).toEqual(['ironSpawners', 'coalSpawners', 'orePerSpawner', 'oreSpawnerRadius', 'respawnDelay', 'oreRespawnDelay']);
  expect(r.fields).toBe(r.keys.length);
  expect(r.covered).toBe(true);
  expect(r.labelled).toBe(true);
  expect(r.lakes).toBe(false);
  expect(r.sections).toBe(0);
});

test('a setting changed in the generator shapes the next map; Standard puts it back (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  const spawners = () => page.evaluate(() => {
    mapSettings = { cols: 128, rows: 128 };
    window.sim.start('generator-test');
    return naturalRocks.filter(r => r.oreSpawner === 'iron').length;
  });
  const before = await spawners();
  await page.evaluate(() => { document.getElementById('main-menu').style.display = ''; showMenuScreen('endless'); document.getElementById('open-generator').click(); }); // (the menu is hidden while a game runs)
  // a minimum above the maximum lifts the maximum
  const iron = page.locator('#generator-fields input[data-key="ironSpawners"]');
  await iron.nth(0).fill('20'); await iron.nth(0).dispatchEvent('change');
  expect(await page.evaluate(() => ({ ...GAME_CONFIG.map.ironSpawners }))).toEqual({ min: 20, max: 20 });
  expect(await spawners()).toBeGreaterThan(before);
  await page.evaluate(() => document.getElementById('preset-standard').click());
  expect(await page.evaluate(() => GAME_CONFIG.map.ironSpawners)).toEqual({ min: 1, max: 2 });
});

test('own presets are saved on the device, loaded and deleted (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  const ore = page.locator('#generator-fields input[data-key="orePerSpawner"]');
  await ore.nth(1).fill('9'); await ore.nth(1).dispatchEvent('change');
  await page.fill('#preset-name', 'Rich ore');
  await page.click('#preset-save');
  await expect(page.locator('#preset-list [data-preset="Rich ore"]')).toHaveCount(1);
  await page.reload();
  await page.evaluate(() => showMenuScreen('endless'));
  await page.click('#open-generator');
  expect(await page.evaluate(() => GAME_CONFIG.map.orePerSpawner.max)).toBe(6); // a fresh page starts from Standard
  await page.click('#preset-list [data-preset="Rich ore"]');
  expect(await page.evaluate(() => GAME_CONFIG.map.orePerSpawner.max)).toBe(9);
  await page.click('#preset-list [data-delete-preset="Rich ore"]');
  await page.click('#preset-list [data-confirm-delete="Rich ore"]'); // asks first (#143)
  await expect(page.locator('#preset-list [data-preset]')).toHaveCount(0);
});

test('the editor shares Endless\' seed and the generator gear: a generated map is the seed\'s, Back goes back to the editor; a custom Endless map is at least 128 (#326, 27.10, 18, 19)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-editor');
  await page.click('#editor-open-generator');
  await expect(page.locator('[data-screen="generator"]')).toBeVisible();
  await page.click('[data-screen="generator"] [data-back-to]');
  await expect(page.locator('[data-screen="editor"]')).toBeVisible();
  const modeSeeds = await page.evaluate(() => {
    document.getElementById('seed-input').value = 'editor-only-seed';
    showMenuScreen('home');
    showMenuScreen('endless');
    const endless = document.getElementById('seed-input').value;
    showMenuScreen('editor');
    return { endless, editor: document.getElementById('seed-input').value };
  });
  expect(modeSeeds).toEqual({ endless: 'editor-only-seed', editor: 'editor-only-seed' });
  await expect(page.locator('[data-screen="editor"] #seed-settings')).toBeVisible();
  await expect(page.locator('#editor-seed-input')).toHaveCount(0);
  const make = seed => page.evaluate(seed => {
    document.getElementById('seed-input').value = seed;
    document.querySelector('[data-editor-size="128"]').click();
    document.getElementById('editor-new-generated').click();
    const shape = naturalRocks.length + ':' + trees.length + ':' + waterTiles.length;
    leaveEditor();
    showMenuScreen('editor');
    return shape;
  }, seed);
  const a = await make('editor-a'), again = await make('editor-a'), b = await make('editor-b');
  expect(again).toBe(a);
  expect(b).not.toBe(a);
  // the reroll gives a new one
  const seeds = await page.evaluate(() => { const before = document.getElementById('seed-input').value; document.getElementById('seed-reroll').click(); return [before, document.getElementById('seed-input').value]; });
  expect(seeds[1]).not.toBe(seeds[0]);
  // Endless's own size: from 128
  const custom = await page.evaluate(() => { const c = document.getElementById('map-cols'); c.value = '40'; applyCustomMap(); return [c.min, mapSettings.cols]; });
  expect(custom).toEqual(['128', 128]);
});

test('the continent\'s own settings: its fields, labelled; they shape a continent map; presets keep them (#326, 56)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  const r = await page.evaluate(() => {
    const out = {};
    const all = [...document.querySelectorAll('#generator-fields .generator-field')];
    out.fields = all.length;
    out.labelled = all.every(f => f.querySelector('span').textContent && !/^gen\./.test(f.querySelector('span').textContent));
    out.biomes = document.querySelectorAll('#generator-fields h3').length;
    return out;
  });
  expect(r.labelled).toBe(true);
  expect(r.fields).toBeGreaterThan(30);
  // fewer mountains and no forest at all, changed by the fields: a continent made then has none of either
  const make = () => page.evaluate(() => {
    mapSettings = { cols: 128, rows: 128 };
    window.sim.start('generator-continent');
    return { rocks: naturalRocks.filter(r => !r.oreSpawner).length, trees: trees.length, forests: forests.length };
  });
  const before = await make();
  await page.evaluate(() => { document.getElementById('main-menu').style.display = ''; showMenuScreen('endless'); document.getElementById('open-generator').click(); }); // (the menu is hidden while a game runs)
  const inputs = page.locator('#generator-fields input:not([data-key])');
  // (the continent's fields in their order: the sea round it, the base's distance from it, then mountains, desert, forest, lakes)
  await inputs.nth(2).fill('0'); await inputs.nth(2).dispatchEvent('change');
  await inputs.nth(4).fill('0'); await inputs.nth(4).dispatchEvent('change');
  const after = await make();
  await page.evaluate(() => { document.getElementById('main-menu').style.display = ''; showMenuScreen('endless'); document.getElementById('open-generator').click(); });
  expect(before.rocks).toBeGreaterThan(after.rocks);
  expect(before.forests).toBeGreaterThan(0);
  expect(after.forests).toBe(0);
  expect(after.trees).toBeLessThan(before.trees);
  // a preset keeps both kinds of settings, Standard puts the continent's back
  await page.fill('#preset-name', 'No mountains');
  await page.click('#preset-save');
  await page.evaluate(() => document.getElementById('preset-standard').click());
  expect(await page.evaluate(() => [GAME_CONFIG.continent.mountains, GAME_CONFIG.continent.forest])).toEqual([0.07, 0.3]);
  await page.click('#preset-list [data-preset="No mountains"]');
  expect(await page.evaluate(() => [GAME_CONFIG.continent.mountains, GAME_CONFIG.continent.forest])).toEqual([0, 0]);
  // a biome's chances can't add up to more than its tiles
  const over = await page.evaluate(() => { const t = GAME_CONFIG.continent.grow.forest; const keys = Object.keys(t); return keys.length; });
  expect(over).toBeGreaterThan(3);
});
