import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('strikes swing the weapon once, work keeps the tool moving, and both settle back (#25)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler, clearResources, tileCenter } = window.sim.helpers;
    window.sim.start('animation-test');
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const treeAt = tileCenter(g.gx + 4, g.gy + 2);
    trees.push({ ...treeAt, hp: 100, isGrowing: false, growProgress: 0 });
    invalidateAllPaths();
    const soldier = makeSettler(1, townHall.x - 80, townHall.y, { weapon: 'sword', role: 'soldier', isPossessed: true });
    const spear = makeSettler(2, townHall.x - 80, townHall.y + 40, { weapon: 'spear', role: 'soldier', isPossessed: true });
    const cutter = makeSettler(3, treeAt.x - 30, treeAt.y, { tool: 'axe' });
    settlers = [soldier, spear, cutter];
    const poses = { sword: [], spear: [], axe: [] };
    performAttack(soldier, soldier.x + 20, soldier.y);
    performAttack(spear, spear.x + 20, spear.y);
    for (let f = 0; f < 60; f++) {
      window.sim.run(1 / 60);
      poses.sword.push(getHeldItemPose(soldier));
      poses.spear.push(getHeldItemPose(spear));
      poses.axe.push(getHeldItemPose(cutter));
      if (f % 10 === 0) render();
    }
    const range = (list, key) => Math.max(...list.map(p => p[key])) - Math.min(...list.map(p => p[key]));
    return {
      swordArc: range(poses.sword, 'angle'), swordRestsAfter: poses.sword.at(-1),
      spearThrust: Math.max(...poses.spear.map(p => p.push)), spearAngle: range(poses.spear, 'angle'),
      axeMoving: range(poses.axe, 'angle') > 0.5, axeWorking: cutter.working > 0
    };
  });
  expect(r.swordArc).toBeGreaterThan(1);
  expect(r.swordRestsAfter).toEqual({ angle: 0, push: 0 });
  expect(r.spearThrust).toBeGreaterThan(5);
  expect(r.spearAngle).toBe(0);
  expect(r.axeMoving).toBe(true);
  expect(r.axeWorking).toBe(true);
  expect(errors).toEqual([]);
});
