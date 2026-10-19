import { test, expect } from './helpers.mjs';

// The main menu's scenes (#256)
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-language', 'ru'); } catch (e) { /* none */ } });
});
const opened = page => page.waitForFunction(() => document.getElementById('main-menu').classList.contains('lifted'));

test('each scene: the hunt, fishing by a campfire, a fight, a farm; and no blur behind the menu (#256)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await opened(page);
  expect(await page.evaluate(() => MENU_SCENES.includes(menuWorld.scene))).toBe(true); // (one at random)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('gameCanvas')).filter)).not.toContain('blur');
  const scene = name => page.evaluate(name => {
    enterMenuWorld(name);
    return {
      settlers: settlers.map(s => [s.weapon, s.tool, !!s.shield, s.armor || null, !!s.backpack, !!s.wateringCan]),
      buildings: buildings.map(b => b.type), water: waterTiles.length, fishing: waterTiles.filter(w => w.isFishing).length, zones: farmZones.length, boars: boars.length
    };
  }, name);
  expect(await scene('hunt')).toMatchObject({ settlers: [['spear', 'none', false, null, false, false]], boars: 3 });
  expect(await scene('fishing')).toMatchObject({ settlers: [['fist', 'rod', false, null, false, false], ['fist', 'none', false, null, false, false]], buildings: ['campfire'], water: 4, fishing: 1, boars: 0 });
  expect(await scene('fight')).toMatchObject({ settlers: [['sword', 'none', true, null, false, false], ['sword', 'none', true, null, false, false], ['fist', 'medbag', false, 'iron', false, false]] });
  expect(await scene('farm')).toMatchObject({ settlers: [['fist', 'hoe', false, null, true, true]], buildings: ['dung_heap'], water: 1, zones: 6 });
  // the farm runs: the farmer plants
  const planted = await page.evaluate(() => { for (let f = 0; f < 60 * 30; f++) stepGame(1 / 60); return farmPlots.length + blueprints.filter(b => b.type === 'wheat').length; });
  expect(planted).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('the fight: zombies keep coming; a tapped one falls; the squad gone, a new one comes (#256)', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  await page.evaluate(() => enterMenuWorld('fight'));
  expect(await page.evaluate(() => { for (let f = 0; f < 60 * 12; f++) stepGame(1 / 60); return enemies.length; })).toBeGreaterThan(0);
  // a zombie tapped
  const z = await page.evaluate(() => { isPaused = true; const en = enemies[0]; en.x = camera.x; en.y = camera.y; return { id: enemies.indexOf(en) }; });
  void z;
  await page.evaluate(() => { menuWorldTap(...(() => { const rect = canvas.getBoundingClientRect(); return [rect.left + rect.width / 2, rect.top + rect.height / 2]; })()); });
  expect(await page.evaluate(() => enemies.filter(en => en.hp <= 0).length)).toBeGreaterThan(0);
  // all fall: a new squad a moment later, the dead cleared
  const back = await page.evaluate(() => {
    isPaused = false;
    settlers.forEach(s => { s.hp = 0; });
    let gone = false;
    for (let f = 0; f < 60 * 5; f++) { stepGame(1 / 60); if (!settlers.length) gone = true; }
    return { gone, settlers: settlers.length, corpses: corpses.length };
  });
  expect(back).toEqual({ gone: true, settlers: 3, corpses: 0 });
});

test('the menu put away to watch, the scene changed there, the menu brought back (#256)', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  await page.evaluate(() => enterMenuWorld('hunt'));
  await page.click('#menu-hide');
  await expect(page.locator('#main-menu .main-menu-content[data-screen="home"]')).toBeHidden();
  await expect(page.locator('#menu-scene-bar')).toBeVisible();
  await page.click('#menu-next-scene');
  expect(await page.evaluate(() => menuWorld.scene)).toBe('fishing');
  await page.click('#menu-show');
  await expect(page.locator('#main-menu .main-menu-content[data-screen="home"]')).toBeVisible();
  await expect(page.locator('#menu-scene-bar')).toBeHidden();
});
