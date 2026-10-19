import { test, expect } from './helpers.mjs';

// The world behind the main menu (#193): a little Endless run by the game's own code
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-language', 'ru'); } catch (e) { /* none */ } });
});

// page coordinates of a world point, as the menu shows it
// the game opening over: the curtain lifted
const opened = page => page.waitForFunction(() => document.getElementById('main-menu').classList.contains('lifted'));

const toPage = (page, p) => page.evaluate(({ x, y }) => {
  const rect = canvas.getBoundingClientRect(), k = getViewScale() / screenPixelRatio;
  return { x: rect.left + rect.width / 2 + (x - camera.x) * k, y: rect.top + rect.height / 2 + (y - camera.y) * k };
}, p);

test('behind the menu the game runs a little world: a soldier with a spear, a warehouse (the hall drawn as one, #200), boars; no waves (#193)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await opened(page);
  await page.evaluate(() => enterMenuWorld('hunt')); // (the boar hunt: one scene of the menu's, #256)
  const r = await page.evaluate(() => ({
    mode: gameMode, started: gameStarted, cls: document.body.classList.contains('menu-world'),
    soldiers: settlers.map(s => [s.weapon, s.role]), buildings: buildings.length,
    boars: boars.length, panelHidden: getComputedStyle(document.getElementById('bottom-panel')).display === 'none'
  }));
  expect(r).toEqual({ mode: 'menu', started: false, cls: true, soldiers: [['spear', 'soldier']], buildings: 0, boars: 3, panelHidden: true });
  // as the game loop runs it, for a while: no wave, no enemies
  const after = await page.evaluate(() => { for (let f = 0; f < 60 * 120; f++) stepGame(1 / 60); return { waveNum, enemies: enemies.length, mode: gameMode }; });
  expect(after).toEqual({ waveNum: 1, enemies: 0, mode: 'menu' });
  expect(errors).toEqual([]);
});

test('a tapped boar is marked and hunted, butchered and its meat carried to the warehouse; the soldier changes faction on a tap (#193)', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  await page.evaluate(() => enterMenuWorld('hunt')); // (the boar hunt: one scene of the menu's, #256)
  // the world stands still for the tap, and the boar tapped is one the menu's panel doesn't cover (the
  // world is a little different each time: a boar under the buttons took the tap); none free: one is put
  // where the menu shows the world
  const boar = await page.evaluate(() => {
    isPaused = true;
    const rect = canvas.getBoundingClientRect(), k = getViewScale() / screenPixelRatio;
    const onPage = p => ({ x: rect.left + rect.width / 2 + (p.x - camera.x) * k, y: rect.top + rect.height / 2 + (p.y - camera.y) * k });
    const open = p => { const q = onPage(p); const el = document.elementFromPoint(q.x, q.y); return !!el && el.id === 'main-menu'; };
    let i = boars.findIndex(b => !b.isCarcass && open(b));
    if (i < 0) {
      i = 0;
      for (let dx = -300; dx <= 300 && !open(boars[0]); dx += 30) for (let dy = -200; dy <= 200 && !open(boars[0]); dy += 30) Object.assign(boars[0], { x: camera.x + dx, y: camera.y + dy });
    }
    return { i, x: boars[i].x, y: boars[i].y };
  });
  await page.mouse.click(...Object.values(await toPage(page, boar)));
  const marked = await page.evaluate(() => { isPaused = false; return boars.findIndex(b => b.priority > 0); });
  expect(marked).toBe(boar.i);
  const hunt = await page.evaluate(i => {
    const target = boars[i];
    let butchered = false;
    for (let f = 0; f < 60 * 90 && stock.rawMeat === 0; f++) {
      update(1 / 60);
      if (target.isCarcass && target.butcher > 0) butchered = true;
    }
    return { butchered, meat: stock.rawMeat, gone: !boars.includes(target) };
  }, boar.i);
  expect(hunt.butchered).toBe(true);
  expect(hunt.gone).toBe(true);
  expect(hunt.meat).toBeGreaterThan(0);

  // the world stands still for the tap: otherwise the soldier walks on between reading where he is and the click
  const soldier = await page.evaluate(() => { isPaused = true; return { x: settlers[0].x, y: settlers[0].y, type: settlers[0].type }; });
  await page.mouse.click(...Object.values(await toPage(page, soldier)));
  const after = await page.evaluate(() => ({ type: settlers[0].type, weapon: settlers[0].weapon, faction: getPlayerFaction().id, sides: sides.player.faction }));
  expect(after.type).not.toBe(soldier.type);
  expect(after.weapon).toBe('spear');
  expect(after.faction).not.toBe('humans');
  expect(after.sides).toBe('humans'); // the player's own choice for Endless stays
});

test('playing leaves the menu world for a real game, and the menu brings it back (#193)', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  await page.evaluate(() => enterMenuWorld('hunt')); // (the boar hunt: one scene of the menu's, #256)
  await page.click('#mode-endless');
  await page.click('#play-button');
  const game = await page.evaluate(() => ({ mode: gameMode, started: gameStarted, cls: document.body.classList.contains('menu-world'), settlers: settlers.length, waveTimer: Number.isFinite(waveTimer) }));
  expect(game).toEqual({ mode: 'endless', started: true, cls: false, settlers: 2, waveTimer: true });
  await expect(page.locator('#dock')).toBeVisible();
  await page.evaluate(() => exitToMainMenu());
  await page.waitForTimeout(300);
  // (a scene again, one at random, #256)
  expect(await page.evaluate(() => [gameMode, MENU_SCENES.includes(menuWorld.scene), settlers.length > 0, document.body.classList.contains('menu-world')])).toEqual(['menu', true, true, true]);
});
