// facing-blood: the game's logic, run in Node (moved from tests/facing-blood.spec.mjs; see tests/node/game.mjs)
import { test } from 'node:test';
import { expect } from './expect.mjs';
import { sim } from './game.mjs';

test('weapons point at what they strike, tools at what they work (#109)', async () => {
  const r = await (() => {
    const { makeSettler, clearResources, tileCenter } = window.sim.helpers;
    window.sim.start('facing-test');
    clearResources();
    const s = makeSettler(1, townHall.x + 100, townHall.y + 100, { weapon: 'sword', role: 'soldier', isPossessed: true });
    settlers = [s];
    performAttack(s, s.x - 30, s.y); // strike west
    const west = s.facing;
    s.attackCooldown = 0;
    performAttack(s, s.x, s.y + 30); // then south
    const south = s.facing;
    const g = getGridPos(townHall.x, townHall.y);
    const tree = tileCenter(g.gx + 5, g.gy - 3);
    trees.push({ ...tree, hp: 100, isGrowing: false, growProgress: 0 });
    invalidateAllPaths();
    const cutter = makeSettler(2, tree.x - 40, tree.y, { tool: 'axe' });
    settlers = [cutter];
    window.sim.run(6);
    const toTree = Math.atan2(tree.y - cutter.y, tree.x - cutter.x);
    const en = createConfiguredEnemy({ x: townHall.x - 200, y: townHall.y }, 'raider');
    const target = makeSettler(3, townHall.x - 180, townHall.y + 20, { hp: 1e6, maxHp: 1e6, isPossessed: true });
    settlers = [target]; enemies = [en];
    window.sim.run(2, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    const toTarget = Math.atan2(target.y - en.y, target.x - en.x);
    return { west, south, axeOff: Math.abs(cutter.facing - toTree), enemyOff: Math.abs(en.facing - toTarget) };
  })();
  expect(r.west).toBeCloseTo(Math.PI);
  expect(r.south).toBeCloseTo(Math.PI / 2);
  expect(r.axeOff).toBeLessThan(0.3);
  expect(r.enemyOff).toBeLessThan(0.3);
});
