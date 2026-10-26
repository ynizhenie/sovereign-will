import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #299: fog of war and the world map

test('fog of war: the start land explored, the rest dark; a settler going out explores round it, and what it left is dimmed, its enemies not shown (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(() => {
    mapSettings = { cols: 256, rows: 256 }; window.sim.start('fog-256');
    window.sim.run(1);
    const at = (dx, dy) => ({ x: townHall.x + dx * TILE_SIZE, y: townHall.y + dy * TILE_SIZE });
    const near = at(5, 0), edge = at(18, 18), far = at(60, 0);
    const start = { nearSeen: isVisible(near.x, near.y), edgeExplored: isExplored(edge.x, edge.y), edgeSeen: isVisible(edge.x, edge.y), farExplored: isExplored(far.x, far.y) };
    // a settler out there: it sees round it, and it's explored
    const s = settlers[0], home = { x: s.x, y: s.y };
    s.x = far.x; s.y = far.y; tickFog(1);
    const out = { farSeen: isVisible(far.x, far.y), besideSeen: isVisible(far.x + 4 * TILE_SIZE, far.y), pastSight: isVisible(far.x + 12 * TILE_SIZE, far.y) };
    // an enemy there is seen; it walks back: explored, no longer seen
    s.x = home.x; s.y = home.y; tickFog(1);
    const back = { farExplored: isExplored(far.x, far.y), farSeen: isVisible(far.x, far.y) };
    enemies = [createNormalEnemy(far, 'raider')];
    isPaused = true; render(); setZoom(0); render();
    return { start, out, back, hidden: !isVisible(enemies[0].x, enemies[0].y) };
  });
  expect(r.start).toEqual({ nearSeen: true, edgeExplored: true, edgeSeen: false, farExplored: false });
  expect(r.out).toEqual({ farSeen: true, besideSeen: true, pastSight: false });
  expect(r.back).toEqual({ farExplored: true, farSeen: false });
  expect(r.hidden).toBe(true);
  expect(errors).toEqual([]);
});

test('a watchtower sees farther than a building; what\'s explored is saved and loaded; Battles have no fog (#299)', async ({ page }) => {
  const errors = await openGame(page);
  const r = await page.evaluate(async () => {
    localStorage.clear();
    mapSettings = { cols: 128, rows: 128 }; window.sim.start('fog-tower');
    const spot = { x: townHall.x + 15 * TILE_SIZE + 0, y: townHall.y + 0 };
    const look = type => { buildings = [{ type, x: spot.x, y: spot.y, hp: 50, maxHp: 50 }]; settlers = []; tickFog(1); return isVisible(spot.x + 10 * TILE_SIZE, spot.y); };
    const store = look('warehouse'), tower = look('watchtower');
    buildings = []; // (a bare tower: not one to keep, the game ticking on while it saves)
    // far off, explored by a settler sent there; saved, loaded
    // (towards the map's middle: the hall may be anywhere on a continent)
    const toMiddle = (v, size) => (v < size / 2 ? 1 : -1);
    const far = { x: townHall.x + toMiddle(townHall.x, WORLD_WIDTH) * 45 * TILE_SIZE, y: townHall.y + toMiddle(townHall.y, WORLD_HEIGHT) * 35 * TILE_SIZE };
    settlers = [window.sim.helpers.makeSettler(1, far.x, far.y)]; tickFog(1);
    await saveCurrentGame();
    settlers = []; resetFog(); // (a new game's fog, on this same map, nobody out there)
    const afterReset = isExplored(far.x, far.y);
    await loadGame(await saveDataOf(loadSaves()[`world:${worldSeed.value}`]));
    const loaded = isExplored(far.x, far.y);
    mapSettings = { cols: 40, rows: 40 };
    return { store, tower, afterReset, loaded };
  });
  expect(r).toEqual({ store: false, tower: true, afterReset: false, loaded: true });
  await page.evaluate(() => { exitToMainMenu(); showMenuScreen('home'); });
  await page.click('#mode-battles');
  expect(await page.evaluate(() => [hasFog(), isVisible(0, 0)])).toEqual([false, true]);
  // (a page error first, if any: it failed now and then on CI, the HUD left on Endless's)
  expect(errors).toEqual([]);
  await expect(page.locator('body')).toHaveAttribute('data-hud', 'battle');
  await expect(page.locator('#btn-world-map')).toBeHidden();
});

test('the world map: the top bar\'s button or M opens it, the whole map with the fog on it; a tap takes the camera there; To the base back (#299)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('.map-option[data-map-size="128"]');
  await page.click('#play-button');
  await page.click('#btn-world-map');
  await expect(page.locator('#world-map')).toBeVisible();
  const size = await page.evaluate(() => { const c = document.getElementById('world-map-canvas'); return [c.width, c.height, COLS, ROWS]; });
  expect(size[0]).toBe(size[2]);
  expect(size[1]).toBe(size[3]);
  // the dark and the seen: the corner unexplored, the hall's tile lit
  const px = await page.evaluate(() => {
    const g = document.getElementById('world-map-canvas').getContext('2d');
    const corner = [...g.getImageData(2, 2, 1, 1).data], hall = [...g.getImageData(Math.floor(townHall.x / TILE_SIZE), Math.floor(townHall.y / TILE_SIZE), 1, 1).data];
    return { corner, hall };
  });
  expect(px.corner.slice(0, 3)).toEqual([11, 15, 20]);
  expect(px.hall[0]).toBeGreaterThan(200);
  // a tap a quarter of the way across and down: the camera there, the map shut
  const box = await page.locator('#world-map-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 4, box.y + box.height / 4);
  await expect(page.locator('#world-map')).toBeHidden();
  const cam = await page.evaluate(() => [camera.x / WORLD_WIDTH, camera.y / WORLD_HEIGHT]);
  expect(cam[0]).toBeCloseTo(0.25, 1);
  expect(cam[1]).toBeCloseTo(0.25, 1);
  // M opens it, To the base, M again shuts it
  await page.keyboard.press('m');
  await expect(page.locator('#world-map')).toBeVisible();
  await page.click('#world-map-home');
  await expect(page.locator('#world-map')).toBeHidden();
  expect(await page.evaluate(() => Math.hypot(camera.x - townHall.x, camera.y - townHall.y))).toBeLessThan(10 * 30);
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await expect(page.locator('#world-map')).toBeHidden();
  expect(errors).toEqual([]);
});
