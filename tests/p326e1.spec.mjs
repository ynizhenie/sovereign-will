import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, "corrections of corrections": in the page

test('the Big switch: a unit placed is the faction\'s big one with the same weapon, on either side; not a pet (an archer and a medic too, 27.10, 32); the big ones are not in the list (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => startBattleMode());
  const r = await page.evaluate(() => {
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const placed = [];
    battle.category = 'units'; battle.big = true;
    for (const [i, id] of ['humans:fist', 'humans:iron_sword', 'humans:iron_spear', 'undead:sword', 'demons:spear', 'humans:medic', 'humans:pet', 'humans:bow'].entries()) {
      battle.lineup = []; battle.preset = id;
      battleTap(at(8, 6 + i).x, at(8, 6 + i).y); battleTap(at(30, 6 + i).x, at(30, 6 + i).y);
      const s = settlers[0], en = enemies[0];
      placed.push([id, s.type, s.weapon, enemyPlayerUnit(getEnemyDef(en)).type]);
    }
    battle.big = false;
    return { placed, listed: BATTLE_PRESETS.filter(p => p.size !== 'big').length, all: BATTLE_PRESETS.length };
  });
  expect(r.placed).toEqual([
    ['humans:fist', 'big', 'fist', 'big'], ['humans:iron_sword', 'big', 'iron_sword', 'big'], ['humans:iron_spear', 'big', 'iron_spear', 'big'],
    ['undead:sword', 'big_zombie', 'sword', 'big_zombie'], ['demons:spear', 'demon', 'spear', 'demon'],
    ['humans:medic', 'big', 'fist', 'big'], ['humans:pet', 'dog', 'fist', 'dog'], ['humans:bow', 'big', 'bow', 'big']
  ]);
  expect(r.all).toBeGreaterThan(r.listed);
  expect(errors).toEqual([]);
});

test('the arrow\'s fletching is its side\'s colour; a fight\'s winner is named in the middle of the field by colour (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => startBattleMode());
  const r = await page.evaluate(() => {
    const fills = [];
    const set = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle').set;
    Object.defineProperty(ctx, 'fillStyle', { configurable: true, get() { return this._fs; }, set(v) { this._fs = v; fills.push(v); set.call(this, v); } });
    drawArrow({ x: 100, y: 100, vx: 5, vy: 0, fromEnemy: false });
    const mine = fills.slice();
    fills.length = 0;
    drawArrow({ x: 100, y: 100, vx: 5, vy: 0, fromEnemy: true });
    const theirs = fills.slice();
    delete ctx.fillStyle;
    battle.winner = 'green'; const green = battleWinnerText(); battle.winner = 'red'; const red = battleWinnerText(); battle.winner = 'draw';
    return { mine: mine[mine.length - 1], theirs: theirs[theirs.length - 1], mineIs: getSettlerColor(null), theirsIs: getEnemyColor(null), green, red, draw: battleWinnerText() };
  });
  expect(r.mine).toBe(r.mineIs);
  expect(r.theirs).toBe(r.theirsIs);
  expect(r.mine).not.toBe(r.theirs);
  expect([r.green, r.red, r.draw]).toEqual(['Победили зелёные!', 'Победили красные!', 'Ничья!']);
  expect(errors).toEqual([]);
});

test('Battles: blight over the strip outside the red line too; the fog\'s dark a tile past the map\'s edge; enemy demons start red, the colours in one row (#326)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    startBattleMode(); battle.blight = true; setBattleLook('blight', true);
    const outside = [isBlighted(15, 15), isBlighted((COLS - 1) * TILE_SIZE + 15, (ROWS - 1) * TILE_SIZE + 15), isBlighted(20 * TILE_SIZE + 15, 12 * TILE_SIZE + 15)];
    return { outside, enemyDemons: GAME_CONFIG.factions.demons.color, enemyStart: sides.enemy.color, redSide: sides.battle.red };
  });
  expect(r.outside).toEqual([true, true, true]);
  expect([r.enemyDemons, r.enemyStart, r.redSide]).toEqual(['#c0392b', '#c0392b', '#c0392b']);
  const rows = await page.evaluate(() => { showMenuScreen('endless'); const tops = [...document.querySelectorAll('#colors-enemy .color-swatch')].map(s => Math.round(s.getBoundingClientRect().top)); return new Set(tops).size; });
  expect(rows).toBe(1);
  expect(errors).toEqual([]);
});

test('a possessed unit whose card is closed can still be left (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const { makeSettler } = window.sim.helpers;
    const s = makeSettler(1, townHall.x + 80, townHall.y + 60, {}); s.role = 'soldier'; s.weapon = 'sword';
    settlers = [s];
    game.selectedSettler = s; switchPossession(); updateUI();
    const withCard = document.getElementById('btn-leave-unit').style.display;
    deselectSettler(); updateUI();
    const closed = { possessed: !!getPossessed(), button: document.getElementById('btn-leave-unit').style.display };
    document.getElementById('btn-leave-unit').click();
    updateUI();
    return { withCard, closed, after: { possessed: !!getPossessed(), button: document.getElementById('btn-leave-unit').style.display } };
  });
  expect(r.withCard).toBe('none');
  expect(r.closed).toEqual({ possessed: true, button: '' });
  expect(r.after).toEqual({ possessed: false, button: 'none' });
  expect(errors).toEqual([]);
});
