import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a worker carries 1 load, 2 with a backpack; a big one 2, or 3 with a backpack (#26)', async ({ page }) => {
  await openGame(page);
  const cases = [
    { type: 'normal', backpack: false, loads: 1 },
    { type: 'normal', backpack: true, loads: 2 },
    { type: 'big', backpack: false, loads: 2 },
    { type: 'big', backpack: true, loads: 3 }
  ];
  for (const c of cases) {
    const r = await sim(page, 'carryTrips', { type: c.type, backpack: c.backpack, seconds: 90 });
    expect([c, r.capacity, r.firstTrip]).toEqual([c, c.loads, c.loads]);
    // a part-filled pack still comes home once the trees run out
    expect([c, r.treesLeft, r.allDelivered]).toEqual([c, 0, 5]);
  }
});

test('the backpack button gives a worker a backpack for its leather cost (#26)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.showNotification = () => {};
    stock.leather = 10;
    selectedSettler = settlers[0];
    document.getElementById('btn-backpack').click();
    return { hasBackpack: !!settlers[0].backpack, leather: stock.leather, label: document.getElementById('btn-backpack').innerText };
  });
  expect(r.hasBackpack).toBe(true);
  expect(r.leather).toBe(5);
  expect(r.label).toBe('🎒 Рюкзак (5🟫)');
});
