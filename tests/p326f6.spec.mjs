import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), battles: a shield for a big one, any unit big but a pet, names as the humans' (32);
// each side's count by its broom, either side of the phase (33)

async function openBattle(page) {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    window.put = (id, gx, gy) => { battle.category = 'units'; battle.preset = id; battleTap(at(gx, gy).x, at(gx, gy).y); };
  });
  return errors;
}

test('any unit but a pet can be big, on either side; a big one gets a shield; every faction\'s named as the humans\' (#326, 27.10, 32)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    const factions = Object.values(GAME_CONFIG.factions).filter(f => f.ready).map(f => f.id);
    // every unit but a pet has its big one
    const noBig = BATTLE_PRESETS.filter(p => p.size === 'normal' && !bigPresetOf(p)).map(p => p.id);
    const petBig = BATTLE_PRESETS.filter(p => p.size === 'pet' && bigPresetOf(p)).map(p => p.id);
    // placed with Big and Shield on: a big archer, medic and swordsman each side
    battle.big = true; battle.shield = true;
    put('humans:bow', 6, 8); put('humans:medic', 6, 12); put('humans:sword', 6, 16);
    put('undead:bow', 30, 8); put('undead:necromancer', 30, 12); put('demons:sword', 30, 16);
    const mine = settlers.map(s => ({ big: isBigBody(s), role: s.role, shield: !!s.shield }));
    const theirs = enemies.map(e => ({ big: isBigBody(e), archer: e.type === 'archer', necro: !!getEnemyDef(e).necromancer, shield: !!e.shield }));
    // names: the humans' for all (an archer, not "Imp, bow"); a big one with its big kind first
    const label = id => battlePresetLabel(getBattlePreset(id));
    const names = factions.map(f => label(`${f}:bow`));
    const bigName = label('demons:big_sword'), humanBig = label('humans:big_club');
    return { noBig, petBig, mine, theirs, names, bigName, humanBig, necro: label('undead:necromancer') };
  });
  expect(r.noBig).toEqual([]);
  expect(r.petBig).toEqual([]);
  expect(r.mine).toEqual([{ big: true, role: 'archer', shield: false }, { big: true, role: 'worker', shield: false }, { big: true, role: 'soldier', shield: true }]);
  expect(r.theirs).toEqual([{ big: true, archer: true, necro: false, shield: false }, { big: true, archer: false, necro: true, shield: false }, { big: true, archer: false, necro: false, shield: true }]);
  expect(new Set(r.names)).toEqual(new Set(['Лучник']));
  expect(r.bigName).toMatch(/, меч$/);
  expect(r.humanBig).toBe('Богатырь, дубина');
  expect(r.necro).toBe('Некромант');
  expect(errors).toEqual([]);
});

test('each side\'s count stands by its broom, either side of the phase (#326, 27.10, 33)', async ({ page }) => {
  const errors = await openBattle(page);
  const r = await page.evaluate(() => {
    put('humans:sword', 6, 8); put('humans:sword', 6, 10); put('humans:sword', 30, 8);
    updateBattleTop();
    const order = [...document.querySelectorAll('.top-battle > *')].map(el => el.id);
    const x = id => document.getElementById(id).getBoundingClientRect().left;
    return { order, green: document.getElementById('battle-count-green').textContent, red: document.getElementById('battle-count-red').textContent,
      leftToRight: x('battle-count-green') < x('battle-clear-green') && x('battle-clear-green') < x('battle-phase-label') && x('battle-phase-label') < x('battle-clear-red') && x('battle-clear-red') < x('battle-count-red') };
  });
  expect(r).toEqual({ order: ['battle-count-green', 'battle-clear-green', 'battle-phase-label', 'battle-clear-red', 'battle-count-red'], green: '2', red: '1', leftToRight: true });
  expect(errors).toEqual([]);
});
