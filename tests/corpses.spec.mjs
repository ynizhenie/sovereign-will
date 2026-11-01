import { test, expect } from './helpers.mjs';
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

test('corpses keep the fallen unit body type and faction visuals', async ({ page }) => {
  const errors = await openGame(page);
  const result = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('corpse-visual-test');
    const settler = makeSettler(1, townHall.x + 80, townHall.y, { weapon: 'spear', look: { female: true, style: 0, shade: 1 } });
    const enemy = createConfiguredEnemy({ x: townHall.x + 120, y: townHall.y }, 'demon_brute');
    addCorpse(settler, 'settler', settler.type);
    addCorpse(enemy, 'enemy', enemy.enemyKey);
    const [playerCorpse, enemyCorpse] = corpses;
    drawCorpses();
    return {
      player: { type: playerCorpse.type, weapon: playerCorpse.weapon, look: playerCorpse.look, kin: unitKin(playerCorpse) },
      enemy: { type: enemyCorpse.type, enemyKey: enemyCorpse.enemyKey, bigBody: enemyCorpse.bigBody, weapon: enemyCorpse.weapon, kin: unitKin(enemyCorpse) }
    };
  });
  expect(result.player).toMatchObject({ type: 'normal', weapon: 'spear', kin: 'humans', look: { female: true, style: 0, shade: 1 } });
  expect(result.enemy).toMatchObject({ enemyKey: 'demon_brute', bigBody: true, weapon: 'spear', kin: 'demons' });
  expect(errors).toEqual([]);
});

test('the worms on an old corpse crawl and wriggle as the game goes on', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('worm-test');
    const life = GAME_CONFIG.corpses.seconds;
    const wormy = { x: townHall.x + 60, y: townHall.y + 60, radius: 11, side: 'settler', kind: 'normal', age: life * 0.6, big: false, wormsTaken: false };
    const fresh = { ...wormy, x: townHall.x + 120, age: 0 };
    // every point of a worm's pink stroke, as drawCorpses draws it now
    const worms = () => {
      const points = [];
      const original = ctx.lineTo;
      ctx.lineTo = function (x, y) { if (String(ctx.strokeStyle) === '#e91e63') points.push([x, y]); return original.call(this, x, y); };
      try { drawCorpses(); } finally { ctx.lineTo = original; }
      return points;
    };
    const away = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    corpses = [wormy];
    pathTick = 600; const first = worms();
    pathTick = 630; const later = worms();
    corpses = [fresh]; pathTick = 660; const none = worms();
    return {
      drawn: first.length,
      wriggled: first.map((p, i) => away(p, later[i])), // how far each point of them moved on in half a second
      onTheCorpse: first.every(p => Math.hypot(p[0] - wormy.x, p[1] - wormy.y) < 13),
      noneOnAFreshOne: none.length
    };
  });
  expect(r.drawn).toBe(15); // (three worms, five segments each)
  expect(Math.min(...r.wriggled)).toBeGreaterThan(0.05); // every point of them moved on: they wriggle
  expect(r.onTheCorpse).toBe(true); // they crawl over it, not off it
  expect(r.noneOnAFreshOne).toBe(0);
  expect(errors).toEqual([]);
});
