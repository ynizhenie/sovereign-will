import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('every weapon reaches a brute, not only spears and bows (#107)', async ({ page }) => {
  await openGame(page);
  for (const weapon of ['fist', 'club', 'sword', 'iron_sword', 'spear', 'bow']) {
    const dealt = await sim(page, 'meleeReach', { weapon });
    expect([weapon, dealt > 0]).toEqual([weapon, true]);
  }
});

test('a big settler reaches normal enemies, and they reach it (#107)', async ({ page }) => {
  await openGame(page);
  for (const weapon of ['club', 'sword', 'spear']) {
    const dealt = await sim(page, 'meleeReach', { weapon, enemy: 'raider', big: true });
    expect([weapon, dealt > 0]).toEqual([weapon, true]);
  }
  expect(await sim(page, 'enemyReachesBig', {})).toBeGreaterThan(0);
});
