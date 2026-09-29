import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a soldier catches and kills a boar, in the open and by the map edge (#77)', async ({ page }) => {
  await openGame(page);
  for (const where of ['open', 'edge']) {
    const r = await sim(page, 'boarChase', { where });
    expect([where, r.downAt]).not.toEqual([where, null]);
    expect(r.downAt).toBeLessThan(20);
  }
});
