import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a blow hits only the enemy aimed at; a giant\'s hits everyone in reach (#144)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'oneBlow', { type: 'normal' })).toEqual([true, false]);
  expect(await sim(page, 'oneBlow', { type: 'big' })).toEqual([true, true]);
});
