// drops: the game's logic, run in Node (moved from tests/drops.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('grass always gives herbs and seeds half the time; trees and apple trees drop their own saplings half the time (#103)', async () => {
  const r = await (() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('drops-test');
    const s = makeSettler(1, 0, 0, { tool: 'axe' });
    const count = (kind, make, n = 400) => {
      const before = { ...stock };
      let carried = {};
      for (let i = 0; i < n; i++) {
        const r = make(); game[GAME_CONFIG.mapResources[kind].list].push(r);
        s.carrying = null;
        finishHarvest(s, r, kind);
        if (r.fallen) finishHarvest(s, r, kind); // (a tree: felled, then its log cut up, #279)
        if (s.carrying) for (const item of s.carrying.items || [s.carrying]) carried[item.type] = (carried[item.type] || 0) + item.amount;
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
  })();
  expect(r.grass.carried).toEqual({ herbs: 400 });
  expect(r.grass.bonus.wheatSeeds).toBeGreaterThan(0.4);
  expect(r.grass.bonus.wheatSeeds).toBeLessThan(0.6);
  expect(r.tree.bonus.saplings).toBeGreaterThan(0.4);
  expect(r.tree.bonus.saplings).toBeLessThan(0.6);
  expect(r.apple.bonus.appleSaplings).toBeGreaterThan(0.4);
  expect(r.apple.bonus.appleSaplings).toBeLessThan(0.6);
  expect(r.apple.bonus.saplings).toBeUndefined();
});

test('a felled tree falls first, then its log is cut into two pieces lying there, its wood shared between them (#279, #298)', async () => {
  const r = await (() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('fell-in-two');
    const s = makeSettler(1, 0, 0, { tool: 'axe' });
    const tree = { x: 40, y: 0, hp: 3, isGrowing: false };
    trees.push(tree);
    logs.length = 0;
    finishHarvest(s, tree, 'tree');
    const fell = { fallen: !!tree.fallen, standing: trees.includes(tree), carrying: s.carrying, hp: tree.hp };
    finishHarvest(s, tree, 'tree');
    return { fell, gone: !trees.includes(tree), carrying: s.carrying, pieces: logs.map(l => l.yield.wood).sort() };
  })();
  expect(r.fell).toEqual({ fallen: true, standing: true, carrying: null, hp: 3 * 0.6 });
  expect(r.gone).toBe(true);
  expect(r.carrying).toBe(null);
  expect(r.pieces).toEqual([1, 2]);
});
