import { test, expect } from '@playwright/test';

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
  await expect(page.locator('#mode-editor')).toBeDisabled();
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

test('difficulty changes how many enemies come and their hp (#39)', async ({ page }) => {
  await openFresh(page);
  await page.click('#mode-endless');
  const r = await page.evaluate(() => ['easy', 'normal', 'hard'].map(level => {
    document.querySelector(`.difficulty-option[data-difficulty="${level}"]`).click();
    document.getElementById('seed-input').value = 'difficulty-test';
    applySeedFromUI(); resetGame();
    waveNum = 11; startNextWave();
    const raider = enemies.find(e => e.enemyKey === 'raider');
    return { level, enemies: enemies.length, raiderHp: raider ? raider.maxHp : null };
  }));
  expect(r[1].raiderHp).toBe(70);
  expect(r[0].raiderHp).toBeLessThan(70);
  expect(r[2].raiderHp).toBeGreaterThan(70);
  expect(r[0].enemies).toBeLessThan(r[1].enemies);
  expect(r[2].enemies).toBeGreaterThan(r[1].enemies);
});

test('the game runs at the same speed whatever the frame rate (#39)', async ({ page }) => {
  await openFresh(page);
  // drive the real loop with fake frame times: 60 s of play at 30 fps and at 144 fps
  const ticks = await page.evaluate(() => [30, 144].map(fps => {
    let steps = 0;
    const original = update;
    window.update = dt => { steps++; };
    try {
      const start = performance.now() + 1000;
      lastTime = start; stepTime = 0;
      for (let i = 1; i <= 60 * fps; i++) gameLoop(start + i * 1000 / fps);
    } finally { window.update = original; }
    return steps;
  }));
  expect(ticks[0]).toBeGreaterThanOrEqual(3595);
  expect(ticks[0]).toBeLessThanOrEqual(3605);
  expect(ticks[1]).toBeGreaterThanOrEqual(3595);
  expect(ticks[1]).toBeLessThanOrEqual(3605);
});

test('the frame-rate setting is remembered (#39)', async ({ page }) => {
  await openFresh(page);
  await page.click('#open-settings');
  await page.click('.fps-option[data-fps="30"]');
  await page.reload();
  await page.click('#open-settings');
  await expect(page.locator('.fps-option[data-fps].active')).toHaveAttribute('data-fps', '30');
});
