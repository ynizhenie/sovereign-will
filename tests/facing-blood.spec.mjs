import { test, expect } from './helpers.mjs';
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

test('blood on a weapon is drawn only when it holds one: a bare hand has no blade, blood in the air', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('weapon-blood-test');
    // what drawWeaponBlood puts on the blade (a rect), for blood it got from striking (bleed)
    const drawn = unit => {
      const found = [], original = ctx.fillRect;
      ctx.fillRect = function (x, y, w, h) { found.push([x, y, w, h]); return original.call(this, x, y, w, h); };
      try { drawWeaponBlood(unit); } finally { ctx.fillRect = original; }
      return found;
    };
    const hit = extra => makeSettler(1, 0, 0, { weaponBloodAge: 0, ...extra });
    return { bare: drawn(hit({})), armed: drawn(hit({ weapon: 'sword' })), tool: drawn(hit({ tool: 'axe' })) };
  });
  expect(r.bare).toEqual([]); // (a zombie striking with bare hands: nothing in them to bleed on)
  expect(r.armed).toEqual([[14, -2, 7, 4]]);
  expect(r.tool).toEqual([[14, -2, 7, 4]]);
  expect(errors).toEqual([]);
});
