import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a worker clears what blocks a door before other work (#17)', async ({ page }) => {
  await openGame(page);
  expect((await sim(page, 'doorBlockerFirst', {})).first).toBe('door');
});

test('soldiers break trees and boulders blocking the only door out, not natural rock (#17)', async ({ page }) => {
  await openGame(page);
  for (const blocker of ['tree', 'boulder']) {
    expect([blocker, await sim(page, 'sealedBreakout', { blocker })]).toEqual([blocker, { sealedAtStart: true, cleared: true }]);
  }
  expect(await sim(page, 'sealedBreakout', { blocker: 'rock' })).toEqual({ sealedAtStart: true, cleared: false });
});
