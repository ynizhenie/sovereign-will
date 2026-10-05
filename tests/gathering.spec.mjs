import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

for (const faction of ['humans', 'undead', 'demons']) {
  test(`every faction's workers fell trees and break boulders: ${faction} (#163)`, async ({ page }) => {
    await openGame(page);
    const r = await sim(page, 'factionGathers', { faction });
    for (const [type, got] of Object.entries(r)) expect({ type, ...got }).toEqual({ type, tree: true, boulder: true });
  });
}

for (const faction of ['humans', 'undead', 'demons']) {
  test(`every faction gathers every kind of resource, hunts and fishes: ${faction} (#163)`, async ({ page }) => {
    await openGame(page);
    const r = await sim(page, 'factionGathersAll', { faction });
    expect(Object.entries(r).filter(([, ok]) => !ok).map(([kind]) => kind)).toEqual([]);
  });
}
