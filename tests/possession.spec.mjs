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
    const possessed = s.isPossessed;
    const y0 = s.y;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    for (let f = 0; f < 30; f++) update(1 / 60);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 's' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    const still = s.isPossessed && settlers.filter(o => o.isPossessed).length === 1;
    document.getElementById('btn-possess').click();
    return { possessed, keysDidNothing: Math.abs(s.y - y0) < 1, still, left: !s.isPossessed };
  });
  expect(r).toEqual({ possessed: true, keysDidNothing: true, still: true, left: true });
});
