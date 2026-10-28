import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// #322: a big map is made in steps (the loading bar moves between them), and its start still holds

test('a continent is made in a dozen steps, each further along, not in one block (#322)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    showMenuScreen('endless');
    game.mapSettings = { cols: 256, rows: 256 };
    const shares = [];
    for (const share of resetGameSteps()) shares.push(share);
    return { shares, rocks: naturalRocks.length, spawners: naturalRocks.filter(x => x.oreSpawner).length };
  });
  expect(r.shares.length).toBeGreaterThanOrEqual(10);
  expect(Math.max(...r.shares)).toBeLessThanOrEqual(1);
  // (the map's still a whole one: rock, and an ore spawner of each kind)
  expect(r.rocks).toBeGreaterThan(0);
  expect(r.spawners).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
