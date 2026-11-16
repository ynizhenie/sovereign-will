import { test, expect, openGame } from './helpers.mjs';

test('selected settler can open all progression tracks and return to the details card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  const errors = await openGame(page);
  await page.click('#play-button');
  const initialCardHeight = await page.evaluate(() => {
    const settler = settlers[0];
    settler.progression = {};
    selectedSettler = settler;
    updateUI();
    return document.getElementById('selected-bar').getBoundingClientRect().height;
  });

  const rows = page.locator('#selected-info .progression-row');
  const open = page.locator('#selected-info .progression-button');
  await expect(page.locator('#btn-all-soldiers')).toHaveCount(0);
  await expect(page.locator('#btn-add-more')).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(open).toBeVisible();

  await open.click();
  await expect(rows).toHaveCount(9);
  await expect(page.locator('#selected-info')).toHaveAttribute('data-view', 'progression');
  await expect(page.locator('#selected-info .progression-view-title')).toBeVisible();
  await expect.poll(() => page.locator('#selected-bar').evaluate(card => card.getBoundingClientRect().height)).toBe(initialCardHeight);
  const pinnedHeader = await page.evaluate(() => {
    const header = document.querySelector('.sel-head');
    const content = document.querySelector('.selected-unit-content');
    const card = document.getElementById('selected-bar');
    const before = header.getBoundingClientRect().top;
    content.scrollTop = content.scrollHeight;
    return {
      hasOverflow: content.scrollHeight > content.clientHeight,
      stayedVisible: Math.abs(header.getBoundingClientRect().top - before) < 1,
      scrollAreaReachesRightEdge: Math.abs(content.getBoundingClientRect().right - card.getBoundingClientRect().right) < 1,
    };
  });
  expect(pinnedHeader).toEqual({ hasOverflow: true, stayedVisible: true, scrollAreaReachesRightEdge: true });

  await page.locator('#selected-info .progression-button').click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator('#selected-info')).toHaveAttribute('data-view', 'details');
  await expect.poll(() => page.locator('#selected-bar').evaluate(card => card.getBoundingClientRect().height)).toBe(initialCardHeight);
  expect(errors).toEqual([]);
});
