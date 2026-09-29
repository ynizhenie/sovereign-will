import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('fallen settlers and enemies leave grey corpses that disappear after a while (#42)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('corpse-test');
    const s = makeSettler(1, townHall.x + 90, townHall.y, { hp: 0 });
    const keep = makeSettler(2, townHall.x - 90, townHall.y, { isPossessed: true });
    settlers = [s, keep];
    const en = createConfiguredEnemy({ x: townHall.x + 200, y: townHall.y + 200 }, 'raider');
    en.hp = 0;
    enemies = [en];
    window.sim.run(0.1);
    const after = corpses.map(c => ({ side: c.side, kind: c.kind, x: Math.round(c.x), y: Math.round(c.y) }));
    render(); // draws them without errors
    window.sim.run(GAME_CONFIG.corpses.seconds - 1);
    const beforeLifetime = corpses.length;
    window.sim.run(2);
    return { after, where: { settler: [Math.round(s.x), Math.round(s.y)], enemy: [Math.round(en.x), Math.round(en.y)] },
      beforeLifetime, gone: corpses.length };
  });
  expect(r.after).toEqual([
    { side: 'settler', kind: 'normal', x: r.where.settler[0], y: r.where.settler[1] },
    { side: 'enemy', kind: 'raider', x: r.where.enemy[0], y: r.where.enemy[1] }
  ]);
  expect(r.beforeLifetime).toBe(2);
  expect(r.gone).toBe(0);
  expect(errors).toEqual([]);
});
