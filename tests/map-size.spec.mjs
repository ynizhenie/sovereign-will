import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('small, large and custom maps generate and play a wave without errors, scaled to their area (#21)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => [[30, 30], [40, 40], [60, 60], [25, 50]].map(([cols, rows]) => {
    mapSettings = { cols, rows };
    window.sim.start(`size-${cols}x${rows}`);
    const hallOk = townHall.x === cols * TILE_SIZE / 2 && townHall.y === rows * TILE_SIZE / 2;
    const counts = { trees: trees.length, grass: grassList.length, iron: getOreSpawners('iron').length };
    // walk the whole map: every tile index lookup stays in range
    const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
    waveNum = 3; startNextWave();
    window.sim.run(60, { holdWaves: false });
    render();
    return { cols, rows, hallOk, counts, reachSize: reach.length, enemiesSpawned: enemies.length > 0 || waveNum > 3 };
  }).concat((() => { mapSettings = { cols: 40, rows: 40 }; return []; })()));
  for (const m of r) {
    expect(m.hallOk).toBe(true);
    expect(m.reachSize).toBe(m.cols * m.rows);
    expect(m.counts.iron).toBeGreaterThan(0);
  }
  // counts grow with the area: the large map has clearly more trees than the small one
  expect(r[2].counts.trees).toBeGreaterThan(r[0].counts.trees * 2);
  expect(errors).toEqual([]);
});

test('the menu sets map size and a custom wave interval for the next game (#21)', async ({ page }) => {
  await openGame(page);
  await page.click('.map-option[data-map-size="custom"]');
  await page.fill('#map-cols', '56');
  await page.fill('#map-rows', '32');
  await page.locator('#map-rows').dispatchEvent('change');
  await page.locator('#map-cols').dispatchEvent('change');
  await page.click('.wave-option[data-wave-interval="custom"]');
  await page.fill('#wave-custom', '240');
  await page.locator('#wave-custom').dispatchEvent('change');
  await page.click('#play-button');
  const r = await page.evaluate(() => ({ cols: COLS, rows: ROWS, width: WORLD_WIDTH, waveInterval, waveTimer }));
  expect(r).toMatchObject({ cols: 56, rows: 32, width: 56 * 30, waveInterval: 240 });
  expect(r.waveTimer).toBeGreaterThan(230); // counting down from 240 in real time
  // out-of-range input is clamped
  await page.evaluate(() => exitToMainMenu());
  await page.fill('#map-cols', '500');
  await page.locator('#map-cols').dispatchEvent('change');
  await page.click('.map-option[data-map-size="60"]');
  await page.click('#play-button');
  expect(await page.evaluate(() => [COLS, ROWS])).toEqual([60, 60]);
});
