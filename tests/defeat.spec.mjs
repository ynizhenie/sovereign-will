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

test('on a defeat the panel and possession go dead, the camera flies to the base and stays; restart or exit (#191)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    camera.zoom = 1; camera.x = 200; camera.y = 200; clampCamera();
    settlers[0].isPossessed = true;
    townHall.hp = 0;
  });
  await expect(page.locator('#defeat-overlay')).toBeVisible();
  await expect(page.locator('#defeat-restart')).toBeVisible();
  await expect(page.locator('#defeat-exit')).toBeVisible();
  await page.waitForTimeout(1500); // the flight to the base
  const r = await page.evaluate(() => {
    const at = [camera.x, camera.y, camera.zoom];
    switchPossession();
    const possessed = !!getPossessed();
    return {
      onBase: Math.hypot(camera.x - townHall.x, camera.y - townHall.y) < 1, zoomedIn: camera.zoom > 1, at, possessed,
      panel: getComputedStyle(document.getElementById('bottom-panel')).pointerEvents
    };
  });
  expect(r).toMatchObject({ onBase: true, zoomedIn: true, possessed: false, panel: 'none' });
  // dragging and the wheel don't move it
  const box = await page.locator('#gameCanvas').boundingBox();
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.wheel(0, 400);
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => [camera.x, camera.y, camera.zoom])).toEqual(r.at);

  await page.click('#defeat-exit');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#defeat-overlay')).toBeHidden();
  expect(errors).toEqual([]);
});
