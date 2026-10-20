import { test, expect } from './helpers.mjs';
import { openGame, sim } from './helpers.mjs';

test('a backpack goes to a worker, never an archer, and is put on at the town hall (#94)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'orderGearFor', { id: 'backpack' }))
    .toEqual({ who: 'worker', wornAtOnce: false, worn: true, maxHp: 100, paid: { iron: 0, leather: 4 }, stored: 0 }); // (and grass, #248, #279)
  // only an archer around: it's made all the same (#211), and waits in the armory
  expect(await sim(page, 'orderGearFor', { id: 'backpack', only: ['archer'] }))
    .toMatchObject({ who: null, stored: 1 });
});

test('armour goes to a melee soldier first, then anyone; +50 hp once put on (#94)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'orderGearFor', { id: 'armor' }))
    .toEqual({ who: 'soldier', wornAtOnce: false, worn: true, maxHp: 150, paid: { iron: 8, leather: 0 }, stored: 0 });
  expect(await sim(page, 'orderGearFor', { id: 'armor', only: ['archer', 'worker'] }))
    .toMatchObject({ worn: true, maxHp: 150 });
});

