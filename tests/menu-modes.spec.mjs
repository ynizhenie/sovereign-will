import { test, expect } from './helpers.mjs';

async function openFresh(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  return errors;
}

test('the main menu shows the modes; Endless and Settings open their screens and come back (#39)', async ({ page }) => {
  const errors = await openFresh(page);
  const home = page.locator('[data-screen="home"]');
  await expect(home).toBeVisible();
  await expect(page.locator('#mode-battles')).toBeEnabled(); // #38
  await expect(page.locator('#mode-editor')).toBeEnabled(); // #37
  await expect(page.locator('#exit-app')).toBeHidden(); // a browser tab can't close itself
  await page.click('#mode-endless');
  await expect(page.locator('#play-button')).toBeVisible();
  await expect(home).toBeHidden();
  await page.click('[data-screen="endless"] [data-back]');
  await page.click('#open-settings');
  await expect(page.locator('#language-options')).toBeVisible();
  await expect(page.locator('#fps-options')).toBeVisible();
  expect(errors).toEqual([]);
});

test('shadows can be disabled in settings and the choice is remembered', async ({ page }) => {
  const errors = await openFresh(page);
  await page.click('#open-settings');
  await expect(page.locator('[data-shadows="on"]')).toHaveClass(/active/);
  await page.click('[data-shadows="off"]');
  await expect(page.locator('[data-shadows="off"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => areShadowsEnabled())).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('sovereign-will-shadows'))).toBe('off');

  const shadowCalls = await page.evaluate(() => {
    let fills = 0;
    const fill = ctx.fill;
    ctx.fill = function (...args) { fills++; return fill.apply(this, args); };
    try {
      const path = new Path2D(); path.rect(0, 0, 10, 10);
      drawShadowPath(ctx, path, 1);
      castShadow(ctx, 10, 10, 5, 3);
    } finally { ctx.fill = fill; }
    return fills;
  });
  expect(shadowCalls).toBe(0);

  await page.reload();
  await page.click('#open-settings');
  await expect(page.locator('[data-shadows="off"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => areShadowsEnabled())).toBe(false);
  await page.click('[data-shadows="on"]');
  expect(await page.evaluate(() => areShadowsEnabled())).toBe(true);
  expect(errors).toEqual([]);
});

test('two difficulties: on Hard enemies are as strong as the player\'s own units (#39, #255)', async ({ page }) => {
  await openFresh(page);
  await page.click('#mode-endless');
  expect(await page.locator('.difficulty-option').count()).toBe(2);
  const r = await page.evaluate(() => ['normal', 'hard'].map(level => {
    document.querySelector(`.difficulty-option[data-difficulty="${level}"]`).click();
    document.getElementById('seed-input').value = 'difficulty-test';
    applySeedFromUI(); resetGame();
    waveNum = 1; startNextWave();
    const enemy = enemies[0];
    return { enemies: enemies.length, key: enemy.enemyKey, maxHp: enemy.maxHp, damage: enemy.hitDamage, speed: enemy.speed, stats: enemyStats(enemy.enemyKey) };
  }));
  expect(r[0].maxHp).toBe(75);
  expect(r[0].stats.hp).toBe(75);
  // On Normal and Hard, a first-wave enemy uses the same battle preset and damage; only HP changes.
  expect(r[1].key).toBe(r[0].key);
  expect(r[1].maxHp).toBe(100);
  expect(r[1].stats.hp).toBe(100);
  expect(r[1].damage).toBe(r[0].damage);
  expect(r[1].speed).toBe(r[0].speed);
  expect(r[1].enemies).toBe(r[0].enemies);
});

test('the game runs at the same speed whatever the frame rate (#39)', async ({ page }) => {
  await openFresh(page);
  // drive the real loop with fake frame times: 20 s of play at 30 fps and at 144 fps (60 s drew the world 10000 times and took
  // most of the test timeout on a slow runner)
  // the steps counted by the game's own tick counter (the world behind the menu runs every step)
  const ticks = await page.evaluate(() => [30, 144].map(fps => {
    const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
    const oldRaf = window.requestAnimationFrame, oldRate = loop.frameRate;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 });
    window.requestAnimationFrame = () => 0;
    try {
      const before = pathTick, start = 1000;
      loop.frameRate = 0.001; // (simulation-speed check: don't draw thousands of frames on the synthetic clock)
      loop.lastTime = start; loop.stepTime = 0;
      for (let i = 1; i <= 20 * fps; i++) gameLoop(start + i * 1000 / fps);
      return pathTick - before;
    } finally {
      loop.frameRate = oldRate; window.requestAnimationFrame = oldRaf;
      if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor); else delete performance.now;
    }
  }));
  expect(ticks[0]).toBeGreaterThanOrEqual(1195);
  expect(ticks[0]).toBeLessThanOrEqual(1205);
  expect(ticks[1]).toBeGreaterThanOrEqual(1195);
  expect(ticks[1]).toBeLessThanOrEqual(1205);
});

test('the frame-rate setting is remembered (#39)', async ({ page }) => {
  await openFresh(page);
  await page.click('#open-settings');
  await page.click('.fps-option[data-fps="30"]');
  await page.reload();
  await page.click('#open-settings');
  await expect(page.locator('.fps-option[data-fps].active')).toHaveAttribute('data-fps', '30');
});
