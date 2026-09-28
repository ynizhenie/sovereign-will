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
  await expect(page.locator('#build-actions button')).toHaveCount(8);
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
  const r = await sim(page, 'waveCost', { wave: 16, waves: 2 });
  expect(r.spawned).toBeGreaterThan(40);
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
