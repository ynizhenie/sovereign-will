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
  const r = await sim(page, 'bunker', { seed: 'maze-283' });
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

test('disarming refunds exactly what the item cost', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.sim.refundMismatches())).toEqual([]);
});
