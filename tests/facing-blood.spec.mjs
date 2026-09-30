import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('weapons point at what they strike, tools at what they work (#109)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
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
  });
  expect(r.west).toBeCloseTo(Math.PI);
  expect(r.south).toBeCloseTo(Math.PI / 2);
  expect(r.axeOff).toBeLessThan(0.3);
  expect(r.enemyOff).toBeLessThan(0.3);
});

test('blood on the hurt, the ground and the weapon; it dries after 10 s, except on the badly wounded (#108)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('blood-test');
    const hurt = makeSettler(1, townHall.x + 100, townHall.y, { isPossessed: true });
    const wounded = makeSettler(2, townHall.x - 100, townHall.y, { isPossessed: true });
    const en = createConfiguredEnemy({ x: townHall.x + 120, y: townHall.y }, 'raider');
    en.speed = 0; en.damage = 0;
    settlers = [hurt, wounded]; enemies = [en];
    damageSettler(hurt, 10, en);
    damageSettler(wounded, 85, null);
    const fresh = { body: bodyBloodAlpha(hurt), weapon: bloodAlpha(en.weaponBloodAge), splats: bloodSplats.length };
    render();
    // a second of steady melee damage leaves only a couple of splats
    for (let f = 0; f < 60; f++) { damageSettler(hurt, 0.1, en); window.sim.run(1 / 60); }
    const afterSteady = bloodSplats.length;
    window.sim.run(14, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    return { fresh, afterSteady, dried: { body: bodyBloodAlpha(hurt), weapon: bloodAlpha(en.weaponBloodAge), splats: bloodSplats.length },
      woundedStill: bodyBloodAlpha(wounded) };
  });
  expect(r.fresh).toEqual({ body: 1, weapon: 1, splats: 2 });
  expect(r.afterSteady).toBeLessThanOrEqual(5);
  expect(r.dried).toEqual({ body: 0, weapon: 0, splats: 0 });
  expect(r.woundedStill).toBe(1); // 15 hp of 100 left: its blood stays
  expect(errors).toEqual([]);
});
