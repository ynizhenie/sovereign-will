import { test, expect } from '@playwright/test';

// The world behind the main menu (#193): a little Endless run by the game's own code
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-language', 'ru'); } catch (e) { /* none */ } });
});

// page coordinates of a world point, as the menu shows it
const toPage = (page, p) => page.evaluate(({ x, y }) => {
  const rect = canvas.getBoundingClientRect(), k = getViewScale() / screenPixelRatio;
  return { x: rect.left + rect.width / 2 + (x - camera.x) * k, y: rect.top + rect.height / 2 + (y - camera.y) * k };
}, p);

test('behind the menu the game runs a little world: a soldier with a spear, a warehouse, boars; no waves (#193)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({
    mode: gameMode, started: gameStarted, cls: document.body.classList.contains('menu-world'),
    soldiers: settlers.map(s => [s.weapon, s.role]), warehouse: buildings.filter(b => b.type === 'warehouse').length,
    boars: boars.length, panelHidden: getComputedStyle(document.getElementById('bottom-panel')).display === 'none'
  }));
  expect(r).toEqual({ mode: 'menu', started: false, cls: true, soldiers: [['spear', 'soldier']], warehouse: 1, boars: 3, panelHidden: true });
  // as the game loop runs it, for a while: no wave, no enemies
  const after = await page.evaluate(() => { for (let f = 0; f < 60 * 120; f++) stepGame(1 / 60); return { waveNum, enemies: enemies.length, mode: gameMode }; });
  expect(after).toEqual({ waveNum: 1, enemies: 0, mode: 'menu' });
  expect(errors).toEqual([]);
});

test('a tapped boar is marked and hunted, butchered and its meat carried to the warehouse; the soldier changes faction on a tap (#193)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);
  const boar = await page.evaluate(() => { const b = boars[0]; return { x: b.x, y: b.y }; });
  await page.mouse.click(...Object.values(await toPage(page, boar)));
  const marked = await page.evaluate(() => boars.findIndex(b => b.priority > 0));
  expect(marked).toBe(0);
  const hunt = await page.evaluate(() => {
    const target = boars[0];
    let butchered = false;
    for (let f = 0; f < 60 * 90 && stock.rawMeat === 0; f++) {
      update(1 / 60);
      if (target.isCarcass && target.butcher > 0) butchered = true;
    }
    return { butchered, meat: stock.rawMeat, gone: !boars.includes(target) };
  });
  expect(hunt.butchered).toBe(true);
  expect(hunt.gone).toBe(true);
  expect(hunt.meat).toBeGreaterThan(0);

  const soldier = await page.evaluate(() => ({ x: settlers[0].x, y: settlers[0].y, type: settlers[0].type }));
  await page.mouse.click(...Object.values(await toPage(page, soldier)));
  const after = await page.evaluate(() => ({ type: settlers[0].type, weapon: settlers[0].weapon, faction: getPlayerFaction().id, sides: sides.player.faction }));
  expect(after.type).not.toBe(soldier.type);
  expect(after.weapon).toBe('spear');
  expect(after.faction).not.toBe('humans');
  expect(after.sides).toBe('humans'); // the player's own choice for Endless stays
});

test('playing leaves the menu world for a real game, and the menu brings it back (#193)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);
  await page.click('#mode-endless');
  await page.click('#play-button');
  const game = await page.evaluate(() => ({ mode: gameMode, started: gameStarted, cls: document.body.classList.contains('menu-world'), settlers: settlers.length, waveTimer: Number.isFinite(waveTimer) }));
  expect(game).toEqual({ mode: 'endless', started: true, cls: false, settlers: 2, waveTimer: true });
  await expect(page.locator('#bottom-panel')).toBeVisible();
  await page.evaluate(() => exitToMainMenu());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => [gameMode, settlers.length, document.body.classList.contains('menu-world')])).toEqual(['menu', 1, true]);
});
