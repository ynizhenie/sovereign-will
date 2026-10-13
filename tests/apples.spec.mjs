import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('picking apples shows a progress bar on the tree (#176)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'applePickBar')).toEqual({ shown: true, rising: true, picked: true });
});
