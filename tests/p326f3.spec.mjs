import { test, expect } from './helpers.mjs';

// The friend's #326 (27.10): one flag by Settings, no text arrows or emoji, every choice kept after a restart

test('by the Settings button one flag, the language\'s now; a tap is the next language (#326, 3)', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const box = document.getElementById('menu-flags');
    const before = { buttons: box.querySelectorAll('button').length, lang: currentLanguage, flag: box.innerHTML };
    box.querySelector('button').click();
    return { before, after: { buttons: box.querySelectorAll('button').length, lang: currentLanguage, flag: box.innerHTML } };
  });
  expect(r.before.buttons).toBe(1);
  expect(r.after.buttons).toBe(1);
  expect(r.after.lang).not.toBe(r.before.lang);
  expect(r.after.flag).not.toBe(r.before.flag);
});

test('no text arrows or emoji on the buttons: Back, the strip\'s more and a recipe\'s yield are drawn (#326, 3)', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}]/u;
    const texts = [...document.querySelectorAll('button, .strip-more, .tile-cost')].map(el => el.textContent || '').filter(text => emoji.test(text));
    return { found: texts.slice(0, 5), back: document.querySelector('.menu-back').innerHTML.includes('ic-back') || !!document.querySelector('.menu-back .icon, .menu-back svg, .menu-back [class*="ic-"]') };
  });
  expect(r.found).toEqual([]);
  expect(r.back).toBe(true);
});

test('what was picked on the Endless screen and in Settings is still picked after a restart (#326, 36)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    showMenuScreen('endless');
    for (const sel of ['[data-difficulty="hard"]', '[data-cards="on"]', '[data-wave-interval="240"]', '[data-map-size="512"]']) document.querySelector(sel).click();
    showMenuScreen('settings');
    for (const sel of ['[data-fps="60"]', '[data-show-fps="on"]', '[data-sound="off"]', '[data-vsync="off"]']) { const b = document.querySelector(sel); if (b) b.click(); }
  });
  await page.waitForTimeout(100);
  await page.reload();
  const r = await page.evaluate(() => {
    const on = sel => !!document.querySelector(`${sel}.active`);
    return {
      difficulty: on('[data-difficulty="hard"]'), cards: on('[data-cards="on"]'), wave: on('[data-wave-interval="240"]'), map: on('[data-map-size="512"]'),
      gameDifficulty: game.gameDifficulty, waveInterval: game.waveInterval, mapCols: game.mapSettings.cols,
      fps: on('[data-fps="60"]'), showFps: on('[data-show-fps="on"]'), sound: on('[data-sound="off"]'), vsync: on('[data-vsync="off"]')
    };
  });
  expect(r).toEqual({ difficulty: true, cards: true, wave: true, map: true, gameDifficulty: 'hard', waveInterval: 240, mapCols: 512, fps: true, showFps: true, sound: true, vsync: true });
});
