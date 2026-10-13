import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

test('farmers plant apple trees in an apple zone (#103)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources, tileCenter } = window.sim.helpers;
    window.sim.start('apple-zone-test');
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const spots = [tileCenter(g.gx + 3, g.gy + 2), tileCenter(g.gx + 4, g.gy + 2)];
    for (const p of spots) toggleFarmZone(p.x, p.y, 'apple');
    stock.appleSaplings = 2;
    settlers = [makeSettler(1, townHall.x + 60, townHall.y, { tool: 'hoe' })];
    window.sim.run(20);
    return { appleTrees: trees.filter(t => t.apple).length, left: stock.appleSaplings, button: !!document.getElementById('btn-zone_apple') };
  });
  expect(r).toEqual({ appleTrees: 2, left: 0, button: true });
});
