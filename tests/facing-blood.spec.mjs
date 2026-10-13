import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

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
