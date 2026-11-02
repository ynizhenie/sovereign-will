import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, the 26.10 list, 11: necromancers in Battles, and the ghosts by them

async function openBattle(page) {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.evaluate(() => {
    const at = gx => gx * TILE_SIZE + 15;
    window.put = (id, gx, gy) => { battle.category = 'units'; battle.preset = id; battleTap(at(gx), at(gy)); };
  });
  return errors;
}

test('in a fight necromancers of both sides keep behind their soldiers, each behind its own, not all to one spot (#326, 26.10, 11)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.auto = true;
    put('undead:sword', 14, 6); put('undead:sword', 14, 18); put('undead:necromancer', 9, 11); put('undead:necromancer', 9, 13);
    put('undead:sword', 25, 6); put('undead:sword', 25, 18); put('undead:necromancer', 30, 11); put('undead:necromancer', 30, 13);
    startBattleFight();
    const gn = settlers.filter(s => s.tool === 'necro_staff'), rn = enemies.filter(e => getEnemyDef(e).necromancer);
    const start = gn.map(s => ({ x: s.x, y: s.y }));
    for (let f = 0; f < 60 * 2; f++) update(1 / 60);
    const apart = list => Math.abs(list[0].y - list[1].y);
    const mid = list => list.reduce((n, o) => n + o.x, 0) / list.length;
    return {
      greenMoved: gn.every((s, i) => Math.hypot(s.x - start[i].x, s.y - start[i].y) > 60),
      greenApart: apart(gn) > 5 * TILE_SIZE, redApart: apart(rn) > 5 * TILE_SIZE,
      greenBehind: gn.every(s => s.x < mid(settlers.filter(o => o.tool !== 'necro_staff'))),
      redBehind: rn.every(e => e.x > mid(enemies.filter(o => !getEnemyDef(o).necromancer)))
    };
  });
  expect(r).toEqual({ greenMoved: true, greenApart: true, redApart: true, greenBehind: true, redBehind: true });
  expect(errors).toEqual([]);
});

test('a red ghost keeps by its necromancer and flies into one of the player\'s that comes near (#326, 26.10, 11)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    battle.auto = true;
    put('undead:necromancer', 30, 12); put('undead:pet', 31, 4); put('undead:sword', 26, 12);
    put('humans:sword', 4, 12);
    startBattleFight();
    const ghost = enemies.find(e => getEnemyDef(e).pet === 'ghost'), necro = enemies.find(e => getEnemyDef(e).necromancer);
    const soldier = settlers[0]; soldier.speed = 0;
    for (let f = 0; f < 60 * 3; f++) update(1 / 60);
    const byNecro = Math.hypot(ghost.x - necro.x, ghost.y - necro.y) < 60 && ghost.escort === necro;
    // one of the player's comes near the necromancer: the ghost goes into it
    soldier.x = necro.x - 60; soldier.y = necro.y; soldier.morale = 100;
    let dived = false;
    for (let f = 0; f < 60 * 3 && !dived; f++) { update(1 / 60); if (soldier.panic || ghost.crumbled || !enemies.includes(ghost)) dived = true; }
    return { byNecro, dived };
  });
  expect(r).toEqual({ byNecro: true, dived: true });
  expect(errors).toEqual([]);
});
