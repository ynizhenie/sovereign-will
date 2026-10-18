import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// a finger drawn across a menu button (scrolling) doesn't press it; a tap in place does (#232)
test('a scroll over a menu button does not press it; a tap does', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('endless'));
  const touch = (selector, dy) => page.evaluate(({ selector, dy }) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    const at = (y) => new Touch({ identifier: 1, target: el, clientX: r.left + r.width / 2, clientY: y });
    const startY = r.top + r.height / 2;
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [at(startY)], changedTouches: [at(startY)], bubbles: true, cancelable: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [at(startY + dy)], bubbles: true, cancelable: true }));
    return gameDifficulty;
  }, { selector, dy });
  expect(await page.evaluate(() => gameDifficulty)).toBe('normal');
  expect(await touch('.difficulty-option[data-difficulty="hard"]', 60)).toBe('normal'); // a scroll
  expect(await touch('.difficulty-option[data-difficulty="hard"]', 2)).toBe('hard'); // a tap
});
