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

test('two difficulties: on Hard enemies are as strong as the player\'s own units (#39, #255)', async ({ page }) => {
  await openFresh(page);
  await page.click('#mode-endless');
  expect(await page.locator('.difficulty-option').count()).toBe(2);
  const r = await page.evaluate(() => ['normal', 'hard'].map(level => {
    document.querySelector(`.difficulty-option[data-difficulty="${level}"]`).click();
    document.getElementById('seed-input').value = 'difficulty-test';
    applySeedFromUI(); resetGame();
    waveNum = 11; startNextWave();
    const raider = enemies.find(e => e.enemyKey === 'raider'), brute = enemies.find(e => e.enemyKey === 'brute');
    return { enemies: enemies.length, raider: raider && [raider.maxHp, raider.damage, raider.speed], brute: brute && brute.maxHp };
  }));
  expect(r[0].raider).toEqual([75, 50, 1]);
  // a settler's: 100 hp, a sword's 20 a hit every 0.4 s, at a settler's pace; a brute as a giant (250)
  expect(r[1].raider).toEqual([100, 50, 1]);
  if (r[1].brute) expect(r[1].brute).toBe(250);
  expect(r[1].enemies).toBe(r[0].enemies);
});

test('the game runs at the same speed whatever the frame rate (#39)', async ({ page }) => {
  await openFresh(page);
  // drive the real loop with fake frame times: 20 s of play at 30 fps and at 144 fps (60 s drew the world 10000 times and took
  // most of the test timeout on a slow runner)
  // the steps counted by the game's own tick counter (the world behind the menu runs every step)
  const ticks = await page.evaluate(() => [30, 144].map(fps => {
    const before = pathTick;
    const start = performance.now() + 1000;
    loop.lastTime = start; loop.stepTime = 0;
    for (let i = 1; i <= 20 * fps; i++) gameLoop(start + i * 1000 / fps);
    return pathTick - before;
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
