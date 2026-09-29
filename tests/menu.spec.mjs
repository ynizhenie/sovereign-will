import { test, expect } from '@playwright/test';
import { openGame } from './helpers.mjs';

test('the button next to the seed puts in a new random seed, which the game then uses (#39)', async ({ page }) => {
  const errors = await openGame(page);
  const input = page.locator('#seed-input');
  const before = await input.inputValue();
  await page.click('#seed-reroll');
  const after = await input.inputValue();
  expect(after).not.toBe(before);
  expect(after).not.toBe('');
  await page.click('#play-button');
  expect(await page.evaluate(() => worldSeed.value)).toBe(after);
  expect(errors).toEqual([]);
});
