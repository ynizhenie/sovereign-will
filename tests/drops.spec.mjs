import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('grass always gives herbs and seeds half the time; trees and apple trees drop their own saplings half the time (#103)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('drops-test');
    const s = makeSettler(1, 0, 0, { tool: 'axe' });
    const count = (kind, make, n = 400) => {
      const before = { ...stock };
      let carried = {};
      for (let i = 0; i < n; i++) {
        const r = make(); WORLD[GAME_CONFIG.mapResources[kind].list].push(r);
        s.carrying = null;
        finishHarvest(s, r, kind);
        for (const item of s.carrying.items || [s.carrying]) carried[item.type] = (carried[item.type] || 0) + item.amount;
      }
      const bonus = {};
      for (const k in stock) if (stock[k] !== before[k]) bonus[k] = (stock[k] - before[k]) / n;
      return { carried, bonus };
    };
    pendingRespawns.length = 0;
    const grass = count('grass', () => ({ x: 0, y: 0, hp: 1 }));
    const tree = count('tree', () => ({ x: 0, y: 0, hp: 3, isGrowing: false }));
    const apple = count('tree', () => makeAppleTree({ x: 0, y: 0, hp: 3, isGrowing: false }));
    return { grass, tree, apple };
  });
  expect(r.grass.carried).toEqual({ herbs: 400 });
  expect(r.grass.bonus.wheatSeeds).toBeGreaterThan(0.4);
  expect(r.grass.bonus.wheatSeeds).toBeLessThan(0.6);
  expect(r.tree.bonus.saplings).toBeGreaterThan(0.4);
  expect(r.tree.bonus.saplings).toBeLessThan(0.6);
  expect(r.apple.bonus.appleSaplings).toBeGreaterThan(0.4);
  expect(r.apple.bonus.appleSaplings).toBeLessThan(0.6);
  expect(r.apple.bonus.saplings).toBeUndefined();
});

test('farmers plant apple trees in an apple zone (#103)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources, tileCenter } = window.sim.helpers;
    window.sim.start('apple-zone-test');
    clearResources();
    window.showNotification = () => {};
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
