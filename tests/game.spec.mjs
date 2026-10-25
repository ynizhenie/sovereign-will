// Regression tests: the real game in Chromium, driven through tests/sim.js on fixed seeds.
// Thresholds come from measurements after the pathfinding fixes (#1, #2); a failure here usually means
// enemies or settlers got stuck again, or a change made the simulation much slower.
import { test, expect } from './helpers.mjs';
import { openGame, sim, iconText } from './helpers.mjs';

// Rock-heavy seeds: large natural rock masses with narrow corridors
const ROCK_SEEDS = ['maze-283', 'maze-137', 'maze-69'];

test('menu loads and a game runs without errors', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#play-button')).toBeVisible();
  await expect(page.locator('#build-actions button')).toHaveCount(16); // with the smithy (#211), the dummy and the fish trap (#199), the workshop, the iron door and the iron trap (#248), the torch (#257)
  await expect(page.locator('#farming-actions button')).toHaveCount(1); // the compost heap (#232; #279: crops only in zones)
  // what's made, a tile each (#261): tools, weapons (and arrows), gear; the weapons by hand, at a workshop,
  // at a smithy
  await expect(page.locator('#craft-tools .tile')).toHaveCount(7); // (#279: no rope)
  await expect(page.locator('#craft-weapons .tile')).toHaveCount(7);
  await expect(page.locator('#craft-gear .tile')).toHaveCount(7); // (the whistle and the banner, #248; leather armour, #298; the flute gone, #326)
  await expect(page.locator('#craft-weapons .panel-heading')).toHaveCount(3);

  await page.fill('#seed-input', 'smoke-test');
  await page.click('#play-button');
  await expect(page.locator('#main-menu')).toBeHidden();
  // two minutes of game time, including the first wave
  await page.evaluate(() => window.sim.run(120, { holdWaves: false }));
  expect(errors).toEqual([]);
});

test('pause opens a menu with Continue and Main menu (#19)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  await expect(page.locator('#pause-menu')).toBeHidden();

  await page.click('#btn-pause-toggle');
  await expect(page.locator('#pause-menu')).toBeVisible();
  expect(await page.evaluate(() => isPaused)).toBe(true);
  await page.click('#resume-button');
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(await page.evaluate(() => isPaused)).toBe(false);

  await page.keyboard.press('Space');
  await expect(page.locator('#pause-menu')).toBeVisible();
  await page.click('#exit-to-menu-button');
  await expect(page.locator('#pause-menu')).toBeHidden();
  await expect(page.locator('#main-menu')).toBeVisible();
  expect(await page.evaluate(() => gameStarted)).toBe(false);

  // Space in the main menu doesn't pause a game that isn't running; a new game starts unpaused
  await page.keyboard.press('Space');
  await expect(page.locator('#pause-menu')).toBeHidden();
  await page.click('#mode-endless'); // back to the modes screen first (#39)
  await page.click('#play-button');
  await expect(page.locator('#main-menu')).toBeHidden();
  expect(await page.evaluate(() => [gameStarted, isPaused])).toEqual([true, false]);
  expect(errors).toEqual([]);
});

test('the defeat screen restart button works with the camera moved and zoomed (#47, #191)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  // lose the game with the camera away from the centre and zoomed in, as after possessing a settler
  await page.evaluate(() => {
    settlers = [];
    camera.zoom = 2; camera.x = 300; camera.y = 900; clampCamera();
  });
  await page.click('#defeat-restart');
  expect(await page.evaluate(() => settlers.length)).toBe(2);
  await expect(page.locator('#defeat-overlay')).toBeHidden();
  expect(errors).toEqual([]);
});

test('hire, upgrade and craft buttons show their cost from the config (#45)', async ({ page }) => {
  await openGame(page);
  // (a tile, #261)
  const tile = id => iconText(page, `#${id}`);
  await expect.poll(() => tile('btn-hire-normal')).toEqual(['[[worker]] Рабочий 15[[food]]']);
  await expect.poll(() => tile('btn-hire-big')).toEqual(['[[giant]] Богатырь 30[[food]] 15[[wood]]']);
  await expect.poll(() => tile('btn-upgrade')).toEqual(['[[giant]] Улучшить: Богатырь 15[[food]] 15[[wood]]']);
  await expect.poll(() => tile('btn-arrows')).toEqual(['[[arrows]] Стрелы 3[[wood]] 1[[stone]] → 6']);
  await expect.poll(() => tile('btn-armor')).toEqual(['[[armor]] Броня 8[[iron]]']);
  // change a price in the config and the button follows
  await page.evaluate(() => {
    GAME_CONFIG.settlerTypes.normal.hireCost = { food: 20, wood: 2 };
    rebuildConfigHud();
  });
  await expect.poll(() => tile('btn-hire-normal')).toEqual(['[[worker]] Рабочий 20[[food]] 2[[wood]]']);
});

for (const seed of ROCK_SEEDS) {
  test(`every enemy reaches an open town hall on ${seed}`, async ({ page }) => {
    await openGame(page);
    const r = await sim(page, 'assault', { seed });
    expect(r.reached).toBe(r.total);
  });

  test(`no enemy gets stuck outside a walled town hall on ${seed}`, async ({ page }) => {
    await openGame(page);
    const r = await sim(page, 'assault', { seed, ring: 3 });
    expect(r.stuck).toBe(0);
    expect(r.reached + r.atWall).toBe(r.total);
  });
}

test('clicking an enemy with the Point tool marks and unmarks it (#35)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const at = await page.evaluate(async () => {
    // the panel below the map settles first (the fonts in, a frame or two fitted), so the canvas doesn't
    // move between working out where the enemy is on the page and the click
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const e = createNormalEnemy({ x: townHall.x + 150, y: townHall.y + 90 }, 'raider');
    e.speed = 0;
    enemies = [e];
    isPaused = true;
    camera.zoom = Math.max(1, COLS / 40); camera.x = townHall.x; camera.y = townHall.y; clampCamera(); // (as close as a default map's, #299)
    // world -> canvas pixels -> page coordinates
    const rect = canvas.getBoundingClientRect();
    const toPage = rect.width / canvas.width;
    return {
      x: rect.left + (canvas.width / 2 + (e.x - camera.x) * getViewScale()) * toPage,
      y: rect.top + (canvas.height / 2 + (e.y - camera.y) * getViewScale()) * toPage
    };
  });
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => enemies[0].markedTarget)).toBe(true);
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => enemies[0].markedTarget)).toBe(false);
});

test('the Zones tab: the farm only by its zones (no crops placed one by one), relief zones and soldiers\' posts (#64, #279)', async ({ page }) => {
  await openGame(page);
  await expect.poll(() => iconText(page, '#farming-actions button')).toEqual(['[[dung_heap]] Компостная куча 6[[wood]]']);
  await expect(page.locator('#btn-wheat')).toHaveCount(0);
  await expect(page.locator('#btn-sapling')).toHaveCount(0);
  for (const id of ['zone_wheat', 'zone_sapling', 'zone_apple', 'zone_relief', 'zone_post', 'zone_clear']) await expect(page.locator(`#btn-${id}`)).toHaveCount(1);
});

test('soldiers push through to enemy tents past summoned raiders; workers keep working (#65)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'tentAssault', {});
  expect(r.summoned).toBeGreaterThan(0);
  expect(r.destroyedAt).not.toBeNull();
  expect(r.fellBack).toBe(0);
  expect(r.workersAtTent).toBe(0);
});

