import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

for (const by of ['keys', 'joystick']) {
  test(`moving the possessed settler by hand (${by}) cancels its order (#16)`, async ({ page }) => {
    await openGame(page);
    expect(await sim(page, 'possessMoveCancels', { by })).toEqual({ hadOrder: true, cancelled: true, movedDown: true, treeStands: true });
  });
}

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });
test('the joystick shows while possessing and steers with a drag (#16)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.sim.start('possess-joystick'); settlers[0].isPossessed = true; });
  const stick = page.locator('#mobile-joystick');
  await expect(stick).toBeVisible();
  const box = await stick.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy, { steps: 4 });
  expect(await page.evaluate(() => ({ x: joystick.x, y: joystick.y }))).toEqual({ x: 1, y: 0 });
  await page.mouse.up();
  expect(await page.evaluate(() => ({ x: joystick.x, y: joystick.y }))).toEqual({ x: 0, y: 0 });
  await page.evaluate(() => { settlers.forEach(s => s.isPossessed = false); });
  await expect(stick).toBeHidden();
});});

test('on a computer (no touch screen) the joystick stays hidden while possessing; keys steer (playtest)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => { window.sim.start('possess-no-stick'); settlers[0].isPossessed = true; });
  await page.waitForTimeout(200);
  await expect(page.locator('#mobile-joystick')).toBeHidden();
});
