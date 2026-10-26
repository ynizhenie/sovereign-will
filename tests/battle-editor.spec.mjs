import { test, expect } from './helpers.mjs';
import { openGame, started } from './helpers.mjs';

// Battles and the editor (#255, a comment on it): a battle's difficulty and orders; the editor's brush, its
// drag, undo and redo, clearing and playing a map
const openBattle = async page => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
};
const at = (gx, gy) => ({ x: gx * 30 + 15, y: gy * 30 + 15 });

test('a battle\'s difficulty: on Hard the red side is as strong as yours; Endless\'s choice comes back (#255)', async ({ page }) => {
  await openBattle(page);
  const place = () => page.evaluate(([p]) => { battle.category = 'units'; battle.preset = 'humans:sword'; battle.lineup = []; battleTap(p.x, p.y); return [enemies[0].maxHp, enemies[0].damage]; }, [at(30, 10)]);
  expect(await place()).toEqual([75, 50]);
  await page.click('[data-dock="battle-settings"]');
  await page.click('[data-battle-difficulty="hard"]');
  expect(await page.evaluate(() => [enemies[0].maxHp, enemies[0].damage])).toEqual([100, 50]); // (made again at once)
  await page.evaluate(() => { closeSheet(); setBattleCategory('units'); });
  expect(await page.locator('#battle-presets [data-preset="humans:sword"] .tile-cost').innerText()).toContain('100'); // (a tile shows the unit as one of yours, #326)
  expect(await page.evaluate(() => { leaveBattleMode(); return gameDifficulty; })).toBe('normal');
});

test('with the auto battle off yours hold and go at what they\'re told to (#255)', async ({ page }) => {
  await openBattle(page);
  const r = await page.evaluate(([a, b, c]) => {
    battle.preset = 'humans:sword'; battleTap(a.x, a.y); battleTap(b.x, b.y);
    battle.category = 'units'; battle.preset = 'humans:sword'; battleTap(c.x, c.y);
    battle.auto = false;
    startBattleFight();
    for (let f = 0; f < 120; f++) stepGame(1 / 60);
    const held = settlers.every(s => Math.hypot(s.x - s.orderSpot.x, s.y - s.orderSpot.y) < 12);
    const en = enemies[0];
    en.speed = 0; // (it waits for them)
    orderTap(en.x, en.y);
    const before = Math.hypot(settlers[0].x - en.x, settlers[0].y - en.y);
    for (let f = 0; f < 120; f++) stepGame(1 / 60);
    return { held, told: settlers.every(s => s.orderTarget === en || !enemies.includes(en)), closer: !enemies.includes(en) || Math.hypot(settlers[0].x - en.x, settlers[0].y - en.y) < before - 40 };
  }, [at(8, 6), at(8, 18), at(32, 12)]);
  expect(r).toEqual({ held: true, told: true, closer: true });
});

test('the editor: a 5×5 brush; a drag paints; undo and redo; clearing asks first (#255)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(([p, q]) => {
    startEditor({ cols: 40, rows: 40, generate: false });
    const trees = () => game.trees.length;
    editor.tool = 'tree'; editor.brush = 5;
    editorTap(p.x, p.y);
    const brushed = trees();
    undoEditor();
    const undone = trees();
    redoEditor();
    const redone = trees();
    // a drag with the brush (1) along a row
    editor.brush = 1; editor.dragPaint = true; editor.tool = 'rock';
    const rocks = naturalRocks.length;
    editorPaint('start', q.x, q.y);
    for (let i = 0; i <= 6; i++) editorPaint('move', q.x + i * 30, q.y);
    editorPaint('end', q.x + 180, q.y);
    const dragged = naturalRocks.length - rocks;
    const asked = clearEditorMap(), cleared = clearEditorMap();
    return { brushed, undone, redone, dragged, asked, cleared, left: trees() + naturalRocks.length };
  }, [at(10, 10), at(10, 25)]);
  expect(r).toEqual({ brushed: 25, undone: 0, redone: 25, dragged: 7, asked: false, cleared: true, left: 0 });
});

test('the editor\'s Play: saved, then Endless on that map (#255)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => localStorage.removeItem('sovereign-will-maps'));
  await page.evaluate(([p]) => {
    startEditor({ cols: 30, rows: 30, generate: false });
    editor.tool = 'boulder'; editorTap(p.x, p.y);
    document.getElementById('editor-name').value = 'Play test';
    playEditorMap();
  }, [at(8, 8)]);
  await started(page);
  const r = await page.evaluate(([p]) => {
    return { mode: gameMode, started: gameStarted, cols: COLS, boulder: boulders.some(b => b.x === p.x && b.y === p.y), settlers: settlers.length > 0 };
  }, [at(8, 8)]);
  expect(r).toEqual({ mode: 'endless', started: true, cols: 30, boulder: true, settlers: true });
  expect(errors).toEqual([]);
});
