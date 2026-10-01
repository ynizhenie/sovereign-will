import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('ahead of a wave soldiers form squads at posts: the door first, all within the base (#14)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'deployment', {})).toEqual({ squads: 3, firstPostByDoor: true, postsWithinBase: true, allAtPosts: true });
});

test('a squad holds its post until an enemy comes within 6 tiles, then fights (#14)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'holdAndEngage', {})).toEqual({ held: true, engaged: true });
});

test('ahead of a wave archers climb towers that have arrows (#14)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'archersManTowers', {})).toEqual({ manned: true });
});

test('during a wave workers keep working, within the base (#14)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'workersStayClose', {})).toEqual({ nearChopped: true, farStanding: true, withinBase: true });
});
