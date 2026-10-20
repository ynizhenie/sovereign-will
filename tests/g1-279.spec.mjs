import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279), comment 1, part G1: one scroll in a sheet (8)
test('the Craft tab scrolls with its sheet, not a second scroll bar inside it (#279, c1.8)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.click('[data-dock="colony:tab-craft"]');
  await page.waitForTimeout(400);
  const scrollers = await page.evaluate(() => [...document.querySelectorAll('#sheet-frame, #sheet-frame *')]
    .filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).map(e => e.id || e.className));
  expect(scrollers).toEqual(['sheet-frame']);
});
