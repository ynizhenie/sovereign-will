import { test, expect } from '@playwright/test';
import { openGame, iconText } from './helpers.mjs';

test('the camera zooms closer on a big map and goes up to the map edge; no zoom buttons (#182)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    setZoom(1000);
    const cssScale = getViewScale() / screenPixelRatio;
    camera.x = -500; camera.y = WORLD_HEIGHT + 500; clampCamera();
    return { atLeast: camera.zoom >= MAX_ZOOM, cssScale, edge: [camera.x, camera.y], world: WORLD_HEIGHT };
  });
  expect(r.atLeast).toBe(true);
  expect(r.cssScale).toBeGreaterThanOrEqual(2.99);
  expect(r.edge).toEqual([0, r.world]);
  await expect(page.locator('#zoom-controls')).toHaveCount(0);
  await expect(page.locator('.hud-seed-box')).toBeVisible();
});

test('the Building tab is in sections, and the other tabs have headings (#181)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const headings = await page.$$eval('#build-actions .panel-heading', els => els.map(e => e.textContent));
  expect(headings).toHaveLength(3);
  const sections = await page.$$eval('#build-actions .panel-section', els => els.map(s => s.querySelectorAll('button').length));
  expect(sections.every(n => n > 0)).toBe(true);
  // a wall is in the first (defense) section, the warehouse in the last
  const where = await page.evaluate(() => {
    const sectionOf = id => [...document.querySelectorAll('#build-actions .panel-section')].findIndex(s => s.querySelector(`[data-id="${id}"], [data-mode="${id}"]`) || [...s.querySelectorAll('button')].some(b => b.textContent.includes(GAME_CONFIG.buildings[id].label)));
    return { wall: sectionOf('wall_wood'), warehouse: sectionOf('warehouse') };
  });
  expect(where).toEqual({ wall: 0, warehouse: 2 });
  expect(await page.locator('#tab-tools .panel-heading').count()).toBeGreaterThan(0);
  expect(await page.locator('#tab-weapons .panel-heading').count()).toBeGreaterThan(0);
});

test('the selected settler shows what it is doing, when it eats, and what it carries (#180)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    isPaused = true; // no tick in between: by the hall, it would hand the wood in at once
    const s = settlers[0];
    s.carrying = { type: 'wood', amount: 3 };
    s.activity = 'deliverCarrying';
    s.hunger = 12.2;
    selectedSettler = s;
    updateUI();
  });
  const info = await iconText(page, '#selected-info');
  expect(info[0]).toContain('13');
  expect(info[0]).toContain('3[[wood]]');
  expect(info[0]).not.toContain('activity.');
  // every behaviour has its text
  const missing = await page.evaluate(() => SETTLER_BEHAVIOURS.map(b => b.name).filter(n => t(`activity.${n}`) === `activity.${n}`));
  expect(missing).toEqual([]);
});

test('a map is made for a faction, and Endless plays it as that faction (#170)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    localStorage.removeItem(MAP_STORAGE_KEY);
    showMenuScreen('editor');
    renderEditorMapList();
    document.querySelector('#editor-faction [data-faction="undead"]').click();
    startEditor({ cols: 30, rows: 30, generate: false });
    editor.category = 'buildings';
    renderEditorPanel();
    const tools = [...document.querySelectorAll('#editor-tools [data-tool]')].map(b => b.dataset.tool);
    document.getElementById('editor-name').value = 'Кладбище';
    saveEditorMap();
    leaveEditor();
    const saved = loadSavedMaps()['Кладбище'].faction;
    sides.player.faction = 'humans';
    showMenuScreen('endless');
    setMapSource('custom');
    const played = sides.player.faction;
    setSideFaction('player', 'humans');
    const stillLocked = sides.player.faction;
    const humansDisabled = document.querySelector('#faction-player [data-faction="humans"]').disabled;
    setMapSource('random');
    return { tent: tools.includes('tent'), grave: tools.includes('grave'), saved, played, stillLocked, humansDisabled };
  });
  expect(r).toEqual({ tent: false, grave: true, saved: 'undead', played: 'undead', stillLocked: 'undead', humansDisabled: true });
});

test('the menu scene: on tiles, nothing behind the panel, taps change the faction and the target (#168)', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const onTile = p => (p.x - 15) % TILE_SIZE === 0 && (p.y - 15) % TILE_SIZE === 0;
    const placed = [menuScene.warehouse, ...menuScene.trees, ...menuScene.stones, ...menuScene.grass];
    for (let i = 0; i < 600; i++) updateMenuScene(1 / 30);
    const units = [menuScene.hunter, ...menuScene.boars.filter(b => b.state !== 'carcass')];
    return {
      onTiles: placed.every(onTile),
      clearOfPanel: [...placed, ...units].every(p => !inPanel(p)),
      distinct: new Set(placed.map(p => `${p.x},${p.y}`)).size === placed.length
    };
  });
  expect(r).toEqual({ onTiles: true, clearOfPanel: true, distinct: true });

  // a tap on the hunter: the next faction; a tap on a boar: the hunter's target
  const tap = await page.evaluate(() => {
    const h = menuScene.hunter, k = MENU_SCENE.scale;
    const before = h.faction;
    menuSceneTap(h.x * k, h.y * k);
    const boar = menuScene.boars.find(b => b.state !== 'carcass');
    menuSceneTap(boar.x * k, boar.y * k);
    return { before, after: h.faction, target: menuScene.target === boar };
  });
  expect(tap.before).toBe('humans');
  expect(tap.after).not.toBe('humans');
  expect(tap.target).toBe(true);

  // a kill is butchered beside the carcass for a while, then the meat goes to the warehouse
  const hunt = await page.evaluate(() => {
    const h = menuScene.hunter;
    const boar = menuScene.boars[0];
    Object.assign(boar, { state: 'carcass', hp: 0 });
    Object.assign(h, { x: boar.x + 16, y: boar.y, carrying: null, work: 0 });
    let steps = 0;
    while (!h.carrying && steps < 300) { updateMenuHunter(1 / 30); steps++; }
    const butchered = steps / 30;
    let back = 0;
    while (h.carrying && back < 3000) { updateMenuHunter(1 / 30); back++; }
    return { butchered, gone: !menuScene.boars.includes(boar), delivered: !h.carrying, byWarehouse: Math.hypot(h.x - menuScene.warehouse.x, h.y - menuScene.warehouse.y) < 30 };
  });
  expect(hunt.butchered).toBeGreaterThanOrEqual(1.9);
  expect(hunt).toMatchObject({ gone: true, delivered: true, byWarehouse: true });
});
