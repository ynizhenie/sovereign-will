import { test, expect } from './helpers.mjs';
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
  await expect(page.locator('#pause-menu #hud-seed')).not.toHaveText('-'); // the seed, in the pause menu now
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
  expect(await page.locator('#craft-tools .panel-heading').count()).toBeGreaterThan(0);
  expect(await page.locator('#craft-weapons .panel-heading').count()).toBeGreaterThan(0);
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

test('maps are faction-independent, the editor shows every faction building, and Endless keeps the chosen faction', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    localStorage.removeItem('sovereign-will-maps');
    showMenuScreen('editor');
    await startEditor({ cols: 30, rows: 30, generate: false });
    sides.player.faction = 'humans';
    document.querySelector('.top-editor').click();
    const hallFactionButtons = document.querySelectorAll('#editor-hall-faction [data-hall-faction]').length;
    const hallFactionPickerVisible = !!document.getElementById('editor-hall-faction').getClientRects().length;
    document.querySelector('#editor-hall-faction [data-hall-faction="demons"]').click();
    const previewFaction = getTownHallFaction().id;
    const playerFactionAfterPreviewChange = getPlayerFaction().id;
    editor.category = 'buildings';
    renderEditorPanel();
    const tools = [...document.querySelectorAll('#editor-tools [data-tool]')].map(b => b.dataset.tool);
    const buildingSections = [...document.querySelectorAll('#editor-tools .panel-heading')].map(h => h.textContent);
    const hasHealth = !!document.querySelector('#editor-tools .tile-cost');
    document.getElementById('editor-name').value = 'Кладбище';
    saveEditorMap();
    leaveEditor();
    const saved = loadSavedMaps()['Кладбище'];
    sides.player.faction = 'humans';
    showMenuScreen('endless');
    setMapSource('custom');
    const played = sides.player.faction;
    setSideFaction('player', 'undead');
    const selected = sides.player.faction;
    const humansDisabled = document.querySelector('#faction-player [data-faction="humans"]').disabled;
    setMapSource('random');
    return {
      buildings: ['town_hall', 'outpost', 'tent', 'grave', 'demon_den'].every(id => tools.includes(id)),
      sections: ['Ратуша и аванпост', 'Общие', 'Люди', 'Демоны', 'Нежить'].every(name => buildingSections.includes(name)),
      landmarksAboveCommon: buildingSections.indexOf('Ратуша и аванпост') < buildingSections.indexOf('Общие'),
      editorFactionChoice: !!document.querySelector('#editor-faction'),
      hallFactionButtons,
      hallFactionPickerVisible,
      hallFactionAffectsOnlyPreview: previewFaction === 'demons' && playerFactionAfterPreviewChange === 'humans',
      hasHealth,
      savedHasFaction: Object.prototype.hasOwnProperty.call(saved, 'faction'),
      savedHasHallFaction: Object.prototype.hasOwnProperty.call(saved, 'hallFaction'),
      played,
      selected,
      humansDisabled
    };
  });
  expect(r).toEqual({
    buildings: true,
    sections: true,
    landmarksAboveCommon: true,
    editorFactionChoice: false,
    hallFactionButtons: 3,
    hallFactionPickerVisible: true,
    hallFactionAffectsOnlyPreview: true,
    hasHealth: false,
    savedHasFaction: false,
    savedHasHallFaction: false,
    played: 'humans',
    selected: 'undead',
    humansDisabled: false
  });
});
