import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a possessed settler does nothing by itself: no work, no healing, no hitting back (#16)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'possessAiOff')).toEqual({ moved: false, gathered: false, hitBack: false });
});

test('tapping a tree sends a possessed woodcutter to chop it, tapping the hall hands the wood in (#16)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'possessChopAndDeliver');
  expect(r.ordered).toBe(true);
  expect(r.treeGone).toBe(true);
  expect(r.carried).toEqual({ type: 'wood', amount: 3 });
  expect(r.handedIn).toBe(3);
});

test('without the right tool a tapped resource is refused (#16)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'possessChopAndDeliver', { tool: 'pickaxe' });
  expect(r.ordered).toBe(false);
  expect(r.treeGone).toBe(false);
  expect(r.notes).toContain('❌ Нужен топор');
});

test('tapping an enemy sends the possessed soldier to fight it to the end (#16)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'possessAttack')).toEqual({ enemyDead: true, orderDone: true });
});

test('tapping a blueprint sends the possessed worker to build it (#16)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'possessBuild')).toEqual({ built: true, orderDone: true });
});

for (const by of ['keys', 'joystick']) {
  test(`moving the possessed settler by hand (${by}) cancels its order (#16)`, async ({ page }) => {
    await openGame(page);
    expect(await sim(page, 'possessMoveCancels', { by })).toEqual({ hadOrder: true, cancelled: true, movedDown: true, treeStands: true });
  });
}

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
});
