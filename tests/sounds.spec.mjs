import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('sound starts with the first tap; menu music in the menu, the ambient in Endless, battle music while a wave is on (#174)', async ({ page }) => {
  const errors = await openGame(page);
  await page.mouse.click(5, 5); // the first gesture
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => ({ state: audio.ctx && audio.ctx.state, mix: musicMix(), steps: audio.layers.menu.step }));
  expect(menu.state).toBe('running');
  expect(menu.mix).toEqual({ menu: 1 });
  expect(menu.steps).toBeGreaterThan(0); // notes are being played

  await page.click('#play-button');
  const calm = await page.evaluate(() => { enemies = []; enemyTents = []; enemyTentBlueprints = []; return musicMix(); });
  expect(calm).toEqual({ ambient: 1 });
  // a wave: battle music until the last enemy and enemy tent are gone
  const r = await page.evaluate(() => {
    waveNum = 3; startNextWave();
    const during = musicMix();
    enemies = [];
    const tentsLeft = enemyTents.length + enemyTentBlueprints.length > 0 ? musicMix() : { battle: 1 };
    enemyTents = []; enemyTentBlueprints = [];
    return { during, tentsLeft, after: musicMix() };
  });
  expect(r).toEqual({ during: { battle: 1 }, tentsLeft: { battle: 1 }, after: { ambient: 1 } });
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('sounds play where things happen on screen, not far off it, and not too often; off in the Settings (#174)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const here = { x: camera.x, y: camera.y }, far = { x: camera.x + 1e5, y: camera.y };
    const played = name => audio.last[name];
    playSound('chop', here); const first = played('chop');
    playSound('chop', here); const throttled = played('chop') === first;
    playSound('mine', far); const offScreen = played('mine') === undefined;
    setSoundOn(false); playSound('hire'); const silent = played('hire') === undefined;
    setSoundOn(true);
    return { first: first !== undefined, throttled, offScreen, silent };
  });
  expect(r).toEqual({ first: true, throttled: true, offScreen: true, silent: true });

  // the Settings remember it
  await page.evaluate(() => { document.getElementById('main-menu').style.display = ''; showMenuScreen('settings'); });
  await page.click('[data-music="off"]');
  await page.click('[data-sound="off"]');
  expect(await page.evaluate(() => [loadSetting('music', 'on'), loadSetting('sound', 'on'), JSON.stringify(musicMix())])).toEqual(['off', 'off', '{}']);
  await page.click('[data-music="on"]');
  await page.click('[data-sound="on"]');
  expect(errors).toEqual([]);
});
