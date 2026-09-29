import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('a backpack goes to a worker, never an archer, and is put on at the town hall (#94)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'orderGearFor', { id: 'backpack' }))
    .toEqual({ who: 'worker', wornAtOnce: false, worn: true, maxHp: 100, paid: { iron: 0, leather: 5 } });
  // only an archer around: nobody gets it, and nothing is paid
  expect(await sim(page, 'orderGearFor', { id: 'backpack', only: ['archer'] }))
    .toMatchObject({ who: null, paid: { iron: 0, leather: 0 } });
});

test('armour goes to a melee soldier first, then anyone; +50 hp once put on (#94)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'orderGearFor', { id: 'armor' }))
    .toEqual({ who: 'soldier', wornAtOnce: false, worn: true, maxHp: 150, paid: { iron: 8, leather: 0 } });
  expect(await sim(page, 'orderGearFor', { id: 'armor', only: ['archer', 'worker'] }))
    .toMatchObject({ worn: true, maxHp: 150 });
});

test('disarming the weapon keeps armour; Take off armour hands it back at the town hall (#94)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'armorOff', {})).toEqual({
    afterDisarm: { armor: 'iron', maxHp: 150 }, armor: null, maxHp: 100, ironBack: 8
  });
});
