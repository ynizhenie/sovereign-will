import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279), part E1: what's held, held by the hand; strikes and work as they look
test('each weapon strikes its own way, a big one wider; work has its own (#279, 1, 3)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    const at = (extra, p) => { const u = makeSettler(1, 0, 0, { swingLen: 0.3, swingT: 0.3 * (1 - p), ...extra }); return getHeldItemPose(u); };
    const sweep = extra => Math.abs(at(extra, 0.95).angle - at(extra, 0.05).angle);
    const reach = extra => at(extra, 0.5).push;
    return {
      sword: sweep({ weapon: 'sword' }), club: sweep({ weapon: 'club' }), spearReach: reach({ weapon: 'spear' }), spearSweep: sweep({ weapon: 'spear' }),
      bigSword: sweep({ weapon: 'sword', visualRadius: 18 }), punch: reach({}),
      demonClaw: sweep({ enemyKey: 'demon_imp', radius: 10 }), undeadSwipe: sweep({ enemyKey: 'undead_zombie', radius: 10 }),
      build: getHeldItemPose(makeSettler(2, 0, 0, { working: 0.1, workKind: 'build' })), pick: getHeldItemPose(makeSettler(3, 0, 0, { working: 0.1, workKind: 'pick' }))
    };
  });
  expect(r.spearReach).toBeGreaterThan(8);
  expect(r.spearSweep).toBeLessThan(0.2);
  expect(r.club).toBeGreaterThan(r.sword * 0.8);
  expect(r.bigSword).toBeGreaterThan(r.sword);
  expect(r.punch).toBeGreaterThan(5);
  expect(r.demonClaw).toBeGreaterThan(r.undeadSwipe);
  expect(r.build.angle).toBeLessThan(0);
  expect(r.pick.push).toBeGreaterThanOrEqual(6);
});

test('every weapon and tool drawn in hand, at work and eating, with no error (#279, 1, 2, 4)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    isPaused = true;
    const kits = [...Object.keys(GAME_CONFIG.weapons).map(w => ({ weapon: w })), ...Object.keys(GAME_CONFIG.tools).map(tl => ({ tool: tl })),
      { working: 0.1, workKind: 'build' }, { working: 0.1, workKind: 'butcher' }, { working: 0.1, workKind: 'pick' }, { eating: { left: 2, icon: 'bread' } }, { crafting: { until: pathTick + 9, progress: 0.5, icon: 'axe' } }];
    settlers = kits.map((k, i) => makeSettler(10 + i, townHall.x - 200 + i * 20, townHall.y + 60, { ...k, swingT: i % 2 ? 0.1 : 0, swingLen: 0.3 }));
    enemies = Object.keys(GAME_CONFIG.enemies).map((k, i) => createConfiguredEnemy({ x: townHall.x - 200 + i * 20, y: townHall.y + 120 }, k));
    render();
  });
  expect(errors).toEqual([]);
});
