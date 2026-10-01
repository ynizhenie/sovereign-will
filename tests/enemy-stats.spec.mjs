import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('every enemy has the hp, speed, size and damage of a settler with its body and weapon (#136)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'enemyStatsMatch');
  for (const stats of Object.values(r)) expect(stats).toEqual({ hp: true, speed: true, size: true, damage: true });
});

test('a swordsman and a sword raider trade the same blows, as often (#136)', async ({ page }) => {
  await openGame(page);
  const r = await sim(page, 'swordDuel');
  expect(r.settlerTook).toEqual([20]);
  expect(r.enemyTook).toEqual([20]);
  expect(Math.abs(r.settlerHits - r.enemyHits)).toBeLessThanOrEqual(1);
  expect(r.enemyHits).toBeGreaterThan(10); // 6 s at one blow per 0.4 s, minus walking up
});
