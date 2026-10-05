import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('after a defeat the game stops: no more waves counted on the defeat screen (#169)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    window.sim.start('defeat-stop');
    window.showNotification = () => {};
    settlers.forEach(s => { s.hp = 0; });
    stepGame(1 / 60); // the last settler dies
    const waves = waveNum;
    waveTimer = 0.01;
    for (let f = 0; f < 600; f++) stepGame(1 / 60); // as the game loop runs it
    return { over: isDefeated(), wavesBefore: waves, wavesAfter: waveNum };
  });
  expect(r.over).toBe(true);
  expect(r.wavesAfter).toBe(r.wavesBefore);
});

test('raw food comes right after Food in the panel; berry bushes have blue berries (#169)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const order = await page.evaluate(() => [...document.querySelectorAll('#resources-hud > div')].map(el => el.id).filter(Boolean));
  expect(order.indexOf('group-raw')).toBe(order.indexOf('group-food') + 1);
});
