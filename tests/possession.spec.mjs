import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

// (#326) the possessed settler moves by taps: a tap on the ground walks it there, its order gone
test('a tap on the ground walks the possessed settler there, and takes its order off (#16, #326)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'possessMoveCancels', {})).toEqual({ hadOrder: true, walking: true, there: true, done: true, treeStands: true });
});

test('no joystick, no keys to steer, no eye button: possessing is in the selected settler\'s card (#326)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await expect(page.locator('#mobile-joystick')).toHaveCount(0);
  await expect(page.locator('[data-action="switchPossession"]:not(#btn-possess)')).toHaveCount(0);
  const r = await page.evaluate(() => {
    const s = settlers[0];
    selectedSettler = s; updateUI();
    document.getElementById('btn-possess').click();
    const possessed = {
      active: s.isPossessed,
      cardClosed: !document.getElementById('selected-bar').classList.contains('has-settler'),
      leaveButtonVisible: document.getElementById('btn-leave-unit').style.display !== 'none'
    };
    const y0 = s.y;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    for (let f = 0; f < 30; f++) update(1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 's' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    const still = s.isPossessed && settlers.filter(o => o.isPossessed).length === 1;
    document.getElementById('btn-leave-unit').click();
    return { possessed, keysDidNothing: Math.abs(s.y - y0) < 1, still, left: !s.isPossessed };
  });
  expect(r).toEqual({ possessed: { active: true, cardClosed: true, leaveButtonVisible: true }, keysDidNothing: true, still: true, left: true });
});

test('the camera pans smoothly to a newly possessed settler', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const settler = settlers[0];
    const from = { x: 0, y: 0 };
    const target = { x: game.WORLD_WIDTH * 0.75, y: game.WORLD_HEIGHT * 0.75 };
    camera.x = from.x;
    camera.y = from.y;
    settler.x = target.x;
    settler.y = target.y;
    selectedSettler = settler;
    switchPossession();
    isPaused = false;
    rememberPositions();
    update(1 / 60);
    const afterFirstStep = { x: camera.x, y: camera.y };
    let betweenSteps = null;
    drawBetweenSteps(0.5, () => { betweenSteps = { x: camera.x, y: camera.y }; });
    const afterDraw = { x: camera.x, y: camera.y };
    for (let frame = 0; frame < 60; frame++) {
      rememberPositions();
      update(1 / 60);
    }
    const final = { x: camera.x, y: camera.y };
    const trackingTarget = { x: settler.x + 100, y: settler.y + 60 };
    settler.x = trackingTarget.x;
    settler.y = trackingTarget.y;
    rememberPositions();
    update(1 / 60);
    const afterMovement = { x: camera.x, y: camera.y };
    let duringMovement = null;
    drawBetweenSteps(0.5, () => { duringMovement = { x: camera.x, y: camera.y }; });
    const afterMovementDraw = { x: camera.x, y: camera.y };
    return { from, target, afterFirstStep, betweenSteps, afterDraw, final, trackingTarget, afterMovement, duringMovement, afterMovementDraw };
  });
  const distance = point => Math.hypot(point.x - r.target.x, point.y - r.target.y);
  expect(distance(r.afterFirstStep)).toBeGreaterThan(0);
  expect(distance(r.afterFirstStep)).toBeLessThan(distance(r.from));
  expect(r.betweenSteps.x).toBeCloseTo((r.from.x + r.afterFirstStep.x) / 2, 5);
  expect(r.betweenSteps.y).toBeCloseTo((r.from.y + r.afterFirstStep.y) / 2, 5);
  expect(r.afterDraw).toEqual(r.afterFirstStep);
  expect(distance(r.final)).toBeLessThan(1);
  expect(r.afterMovement.x).toBeGreaterThan(r.final.x);
  expect(r.afterMovement.x).toBeLessThan(r.trackingTarget.x);
  expect(r.duringMovement.x).toBeCloseTo((r.final.x + r.afterMovement.x) / 2, 5);
  expect(r.afterMovementDraw).toEqual(r.afterMovement);
  expect(errors).toEqual([]);
});
