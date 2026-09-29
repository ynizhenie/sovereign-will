// Regression tests: the real game in Chromium, driven through tests/sim.js on fixed seeds.
// Thresholds come from measurements after the pathfinding fixes (#1, #2); a failure here usually means
// enemies or settlers got stuck again, or a change made the simulation much slower.
import { test, expect } from '@playwright/test';

// Rock-heavy seeds: large natural rock masses with narrow corridors
const ROCK_SEEDS = ['maze-283', 'maze-137', 'maze-69'];

async function openGame(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.addScriptTag({ path: 'tests/sim.js' });
  return errors;
}

const sim = (page, fn, arg) => page.evaluate(([fn, arg]) => window.sim[fn](arg), [fn, arg]);

test('menu loads and a game runs without errors', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#play-button')).toBeVisible();
  await expect(page.locator('#build-actions button')).toHaveCount(6);
  await expect(page.locator('#farming-actions button')).toHaveCount(2);
  await expect(page.locator('#tool-actions button')).toHaveCount(5);
  await expect(page.locator('#weapon-actions button')).toHaveCount(6);

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
  await page.click('#play-button');
  await expect(page.locator('#main-menu')).toBeHidden();
  expect(await page.evaluate(() => [gameStarted, isPaused])).toEqual([true, false]);
  expect(errors).toEqual([]);
});

test('the defeat screen restart button works with the camera moved and zoomed (#47)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  // lose the game with the camera away from the centre and zoomed in, as after possessing a settler
  const button = await page.evaluate(() => {
    settlers = [];
    camera.zoom = 2; camera.x = 300; camera.y = 900; clampCamera();
    render();
    // the button's centre in canvas pixels -> page coordinates
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const offX = (rect.width - canvas.width * scale) / 2, offY = (rect.height - canvas.height * scale) / 2;
    return { x: rect.left + offX + (canvas.width / 2) * scale, y: rect.top + offY + (canvas.height / 2 + 72) * scale };
  });
  await page.mouse.click(button.x, button.y);
  expect(await page.evaluate(() => settlers.length)).toBe(2);
  expect(errors).toEqual([]);
});

test('hire, upgrade and craft buttons show their cost from the config (#45)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#btn-hire-normal')).toHaveText('👨‍🌾 Рабочий (15🍞)');
  await expect(page.locator('#btn-hire-big')).toHaveText('🧌 Богатырь (30🍞 15🪵)');
  await expect(page.locator('#btn-upgrade')).toHaveText('🧌 Улучшить (15🍞 15🪵)');
  await expect(page.locator('#btn-craft-arrows')).toHaveText('🏹 Стрелы (3🪵 1🪨 → 6)');
  await expect(page.locator('#btn-craft-armor')).toHaveText('🛡️ Броня (8🔩)');
  // change a price in the config and the button follows
  await page.evaluate(() => {
    GAME_CONFIG.settlerTypes.normal.hireCost = { food: 20, wood: 2 };
    document.getElementById('build-actions').innerHTML = '';
    document.getElementById('tool-actions').innerHTML = '';
    document.getElementById('weapon-actions').innerHTML = '';
    document.getElementById('resources-hud').innerHTML = '';
    renderConfigHud();
  });
  await expect(page.locator('#btn-hire-normal')).toHaveText('👨‍🌾 Рабочий (20🍞 2🪵)');
});

test('the same seed generates the same map', async ({ page }) => {
  await openGame(page);
  const [a, b, c] = await page.evaluate(() => {
    const sig = seed => { window.sim.start(seed); return window.sim.mapSignature(); };
    return [sig('determinism'), sig('determinism'), sig('something-else')];
  });
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('A* finds a way home from every reachable tile on a rock-heavy map', async ({ page }) => {
  await openGame(page);
  const settlers = await page.evaluate(() => window.sim.pathCoverage('maze-137', false));
  const enemies = await page.evaluate(() => window.sim.pathCoverage('maze-137', true));
  expect(settlers.found).toBe(settlers.tiles);
  expect(enemies.found).toBe(enemies.tiles);
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

test('enemies chop through a ring of trees', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'treeSiege', {});
  expect(r.left).toBeLessThan(r.ringTrees);
  expect(r.hallDamage).toBeGreaterThan(0);
});

test('enemies pressed against a wall damage it', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'wallContact', {});
  expect(r.wallsBroken).toBeGreaterThan(0);
  expect(r.secondsStuckAtWall).toBeLessThan(1);
});

test('enemies break into a walled-in player', async ({ page }) => {
  await openGame(page);
  // stone walls are 300 hp and the bunker can be far from the border, so give it two minutes
  const r = await sim(page, 'bunker', { seed: 'maze-283', seconds: 120 });
  expect(r.wallsBroken).toBeGreaterThan(0);
  expect(r.playerDamage).toBeGreaterThan(0);
});

test('settlers far out in a rock maze bring their load home', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'homecoming', { seed: 'maze-137' });
  expect(r.farthestSteps).toBeGreaterThan(50);
  expect(r.delivered).toBe(r.placed);
});

test('working settlers near the town hall do not get stuck', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'crowd', { seed: 'maze-137', count: 12 });
  expect(r.stuck).toEqual([]);
  expect(r.overlapping).toBeLessThanOrEqual(2);
});

test('settlers spread over a rock-heavy map do not get stuck', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'crowd', { seed: 'maze-283', count: 20, spread: true, seconds: 25 });
  expect(r.stuck).toEqual([]);
  expect(r.overlapping).toBeLessThanOrEqual(2);
});

test('a large late-game wave stays cheap to simulate', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'waveCost', { wave: 16, minEnemies: 45 });
  expect(r.spawned).toBeGreaterThanOrEqual(45);
  // measured ~20-40ms on a laptop; CI runners are slower, this only catches big regressions
  expect(r.msPerGameSecond).toBeLessThan(250);
});

test('every map has iron and coal spawners with an ore reachable from the town hall', async ({ page }) => {
  await openGame(page);
  // before spawners (#4) ~14% of maps had no iron and ~32% no coal
  const seeds = Array.from({ length: 150 }, (_, i) => `ore-${i}`).concat(ROCK_SEEDS);
  expect(await page.evaluate(seeds => window.sim.oreReport(seeds), seeds)).toEqual([]);
});

test('mined ores grow back around their spawner, and spawners cannot be mined', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'oreRespawn', 'maze-137');
  for (const kind of ['iron', 'coal']) {
    expect(r[kind].rightAfter).toBe(0);
    expect(r[kind].after).toBe(r[kind].before);
    expect(r[kind].allNearSpawner).toBe(true);
  }
  expect(r.spawnerSurvivesMining).toBe(true);
  expect(r.spawnerHarvestable).toBe(false);
});

test('a wounded soldier under fire fights back instead of running to heal (#10)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'woundedUnderFire', { hpShare: 0.6 });
  expect(r.went).toBe('archer');
  expect(r.archerHurt).toBe(true);
});

test('a badly wounded soldier (< 25% hp) retreats to heal (#10)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'woundedUnderFire', { hpShare: 0.2 });
  expect(r.went).toBe('tent');
});

test('each catch uses one seed as bait, and fishing stops without seeds (#18)', async ({ page }) => {
  await openGame(page);
  const withSeeds = await sim(page, 'fishing', { seeds: 3 });
  expect(withSeeds.catches).toBe(3);
  expect(withSeeds.seedsLeft).toBe(0);
  const noSeeds = await sim(page, 'fishing', { seeds: 0 });
  expect(noSeeds.catches).toBe(0);
});

test('the ground uses more than one grass shade, not one flat repeating fill (#61)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'grassTileVariety');
  expect(r.shadeCount).toBe(r.totalShades);
});

test('a boar takes the wielded weapon\'s hunt damage, not a fixed amount (#62)', async ({ page }) => {
  await openGame(page);
  const fistDmg = await sim(page, 'boarHuntDamage', { weapon: 'fist' });
  const swordDmg = await sim(page, 'boarHuntDamage', { weapon: 'sword' });
  expect(fistDmg).toBe(5);
  expect(swordDmg).toBe(32);
});

test('a boar flees a settler that gets close, even before being attacked (#62)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'boarFlee');
  expect(r.sawFlee).toBe(true);
  expect(r.hid).toBe(false);
  expect(r.movedAway).toBe(true);
});

test('harvested resources grow back after a delay, not at once (#11)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'treeRegrowth');
  expect(r.rightAfter).toBe(r.count0 - 1);
  expect(r.beforeMinDelay).toBe(r.count0 - 1);
  expect(r.afterMaxDelay).toBe(r.count0);
});

test('boulders also come in piles on touching tiles (#12)', async ({ page }) => {
  await openGame(page);
  const seeds = Array.from({ length: 30 }, (_, i) => `piles-${i}`);
  const largest = await page.evaluate(seeds => window.sim.largestBoulderPiles(seeds), seeds);
  // a pile can occasionally come out small if its spot is crowded
  expect(largest.filter(n => n >= 3).length).toBeGreaterThanOrEqual(27);
});

test('trees, grass, berries and sticks grow mostly in forests (#13)', async ({ page }) => {
  await openGame(page);
  const seeds = Array.from({ length: 30 }, (_, i) => `forest-${i}`);
  const r = await page.evaluate(seeds => window.sim.forestShares(seeds), seeds);
  expect(r.trees).toBeGreaterThan(0.7);
  expect(r.undergrowth).toBeGreaterThan(0.55);
});

test('armed settlers go for an enemy the player marked (#35)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'markedTarget', { mark: false })).toBe('nearHall');
  expect(await sim(page, 'markedTarget', { mark: true })).toBe('marked');
});

test('clicking an enemy with the Point tool marks and unmarks it (#35)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const at = await page.evaluate(() => {
    const e = createNormalEnemy({ x: townHall.x + 150, y: townHall.y + 90 }, 'raider');
    e.speed = 0;
    enemies = [e];
    isPaused = true;
    camera.zoom = 1; camera.x = canvas.width / 2; camera.y = canvas.height / 2;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const offX = (rect.width - canvas.width * scale) / 2, offY = (rect.height - canvas.height * scale) / 2;
    return { x: rect.left + offX + e.x * scale, y: rect.top + offY + e.y * scale };
  });
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => enemies[0].markedTarget)).toBe(true);
  await page.mouse.click(at.x, at.y);
  expect(await page.evaluate(() => enemies[0].markedTarget)).toBe(false);
});

test('a settler with nothing to do is flagged idle, a working one is not (#33)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'idleFlags', {})).toEqual({ idleWorker: true, busyWorker: false });
});

test('disarming refunds exactly what the item cost', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.sim.refundMismatches())).toEqual([]);
});

test('an enemy archer runs out of arrows and switches to a club without a tent (#55)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'archerQuiver', { withTent: false });
  expect(r.shots).toBe(12);
  expect(r.tentVisits).toBe(0);
  expect(r.weapon).toBe('club');
  expect(r.meleeDamage).toBeGreaterThan(0);
});

test('an enemy archer refills 6 arrows at a time from the tent stock, then clubs (#55)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'archerQuiver', { withTent: true, seconds: 120 });
  expect(r.shots).toBe(24); // 12 in the quiver + its 12 in the tents
  expect(r.tentVisits).toBe(2);
  expect(r.stockLeft).toBe(0);
  expect(r.weapon).toBe('club');
});

test('a resource added only in GAME_CONFIG is gathered, stocked and spent (#45)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'configOnlyResource', {});
  expect(r.atStart).toBe(0);
  expect(r.delivered).toBe(2);
  expect(r.canPay).toBe(true);
  expect(r.afterTool).toBe(0);
});

test('wheat and saplings are planted from the Farming tab (#64)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#farming-actions button')).toHaveText(['🌾 Пшеница (1🌾)', '🌱 Саженец (1🌱)']);
  await expect(page.locator('#build-actions #btn-wheat')).toHaveCount(0);
  await expect(page.locator('#build-actions #btn-sapling')).toHaveCount(0);
  // picking a crop keeps its placing mode, like the build tab does
  const mode = await page.evaluate(() => {
    switchTab(document.querySelector('.tab-btn[onclick*="tab-farming"]'), 'tab-farming');
    setMode('wheat');
    return buildMode;
  });
  expect(mode).toBe('wheat');
});

test('soldiers push through to enemy tents past summoned raiders; workers keep working (#65)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'tentAssault', {});
  expect(r.summoned).toBeGreaterThan(0);
  expect(r.destroyedAt).not.toBeNull();
  expect(r.fellBack).toBe(0);
  expect(r.workersAtTent).toBe(0);
});

test('a settler healing at a tent heals up fully while not attacked (#65)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'healUp', { hpShare: 0.2 });
  expect(r.reachedTent).toBe(true);
  expect(r.leftWith).toBe(1);
});

test('arrows stop at trees, rocks, bushes and buildings, and fly over grass, sticks, pebbles, water and crops (#23)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'arrowObstacles', {});
  const blocks = ['tree', 'boulder', 'rock', 'bush', 'tent'];
  const passes = ['grass', 'stick', 'pebble', 'water', 'wheat', 'sapling'];
  const overFromTower = ['wall', 'door'];
  for (const kind of blocks) expect([kind, r[kind]]).toEqual([kind, { ground: { clear: false, hit: false }, tower: { clear: false, hit: false } }]);
  for (const kind of passes) expect([kind, r[kind]]).toEqual([kind, { ground: { clear: true, hit: true }, tower: { clear: true, hit: true } }]);
  for (const kind of overFromTower) expect([kind, r[kind]]).toEqual([kind, { ground: { clear: false, hit: false }, tower: { clear: true, hit: true } }]);
});

test('an archer steps aside for a clear shot instead of shooting into a rock (#23)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'archerAroundObstacle', {});
  expect(r.hurt).toBe(true);
  expect(r.blockedShots).toBe(0);
});

test('soldiers and enemies fight without walking into each other (#15)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'meleeOverlap', {});
  expect(r.settlersHurt && r.enemiesHurt).toBe(true);
  expect(r.deepest).toBeLessThan(0.5);
});
