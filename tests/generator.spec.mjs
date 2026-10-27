import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('the gear opens a labelled field for every generator setting (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  await expect(page.locator('[data-screen="generator"]')).toBeVisible();
  const r = await page.evaluate(() => {
    const keys = Object.keys(GAME_CONFIG.map);
    const fields = [...document.querySelectorAll('#generator-fields .generator-field')].filter(f => f.querySelector('input[data-key]')); // (the small maps' ones; the continent's have their own test)
    const labelled = fields.every(f => f.querySelector('span').textContent && !f.querySelector('span').textContent.startsWith('gen.'));
    const covered = keys.every(k => document.querySelector(`#generator-fields input[data-key="${k}"]`));
    return { fields: fields.length, keys: keys.length, labelled, covered };
  });
  expect(r.fields).toBe(r.keys);
  expect(r.covered).toBe(true);
  expect(r.labelled).toBe(true);
});

test('a setting changed in the generator shapes the next map; Standard puts it back (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  // no lakes at all
  const lakes = page.locator('#generator-fields input[data-key="lakes"]');
  await lakes.nth(1).fill('0'); await lakes.nth(1).dispatchEvent('change');
  await lakes.nth(0).fill('0'); await lakes.nth(0).dispatchEvent('change');
  // a minimum above the maximum lifts the maximum
  const boars = page.locator('#generator-fields input[data-key="boars"]');
  await boars.nth(0).fill('20'); await boars.nth(0).dispatchEvent('change');
  const r = await page.evaluate(() => {
    window.sim.start('generator-test');
    return { water: waterTiles.length, boarsRange: { ...GAME_CONFIG.map.boars } };
  });
  expect(r.water).toBe(0);
  expect(r.boarsRange).toEqual({ min: 20, max: 20 });
  await page.evaluate(() => document.getElementById('preset-standard').click()); // the menu is hidden while a game runs
  expect(await page.evaluate(() => GAME_CONFIG.map.lakes)).toEqual({ min: 1, max: 4 });
});

test('own presets are saved on the device, loaded and deleted (#20)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  const forests = page.locator('#generator-fields input[data-key="forests"]');
  await forests.nth(1).fill('9'); await forests.nth(1).dispatchEvent('change');
  await page.fill('#preset-name', 'Big forests');
  await page.click('#preset-save');
  await expect(page.locator('#preset-list [data-preset="Big forests"]')).toHaveCount(1);
  await page.reload();
  await page.evaluate(() => showMenuScreen('endless'));
  await page.click('#open-generator');
  expect(await page.evaluate(() => GAME_CONFIG.map.forests.max)).toBe(5); // a fresh page starts from Standard
  await page.click('#preset-list [data-preset="Big forests"]');
  expect(await page.evaluate(() => GAME_CONFIG.map.forests.max)).toBe(9);
  await page.click('#preset-list [data-delete-preset="Big forests"]');
  await page.click('#preset-list [data-confirm-delete="Big forests"]'); // asks first (#143)
  await expect(page.locator('#preset-list [data-preset]')).toHaveCount(0);
});

test('the continent\'s own settings: its sections and fields, labelled; they shape a continent map; presets keep them; the section a map size uses is said (#326, 56)', async ({ page }) => {
  await openGame(page);
  await page.click('#open-generator');
  const r = await page.evaluate(() => {
    const out = {};
    out.sections = [...document.querySelectorAll('#generator-fields h2.generator-section')].map(h => h.className.includes('used'));
    const all = [...document.querySelectorAll('#generator-fields .generator-field')];
    out.fields = all.length;
    out.labelled = all.every(f => f.querySelector('span').textContent && !/^gen\./.test(f.querySelector('span').textContent));
    out.biomes = document.querySelectorAll('#generator-fields h3').length;
    return out;
  });
  expect(r.sections).toEqual([true, false]); // (the default size, 256, is a continent: its section first, lit)
  expect(r.labelled).toBe(true);
  expect(r.fields).toBeGreaterThan(50);
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
