import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('Food opens onto what it is made of; spending takes provisions first (#106)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.food = 10; foodMix = {}; syncFoodMix(); // start food: provisions
    addFood('berries', 4); addFood('cookedMeat', 3);
    const after = { total: stock.food, ...foodMix };
    stock.food -= 12; // hired / eaten
    syncFoodMix();
    updateUI();
    return { after, spent: { ...foodMix }, shown: document.getElementById('food-kind-cookedMeat-txt').innerText };
  });
  expect(r.after).toMatchObject({ total: 17, provisions: 10, berries: 4, cookedMeat: 3 });
  expect(r.spent).toMatchObject({ provisions: 0, berries: 2, cookedMeat: 3 });
  expect(r.shown).toBe('3');
  await page.click('#group-food');
  await expect(page.locator('#group-food-members')).toBeVisible();
  await expect(page.locator('#group-food-members div')).toHaveCount(6);
});

test('cooking makes dishes, berries and apples come in as their kind (#106)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'cookingRun', { raw: { rawMeat: 2, rawFish: 1, wheat: 1 } });
  const mix = await page.evaluate(() => ({ ...foodMix }));
  expect(mix).toMatchObject({ cookedMeat: 2, cookedFish: 1, bread: 1 });
});

test('the watering can is given from the Tools tab, only to a farmer (#106)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#tab-tools #btn-wateringCan')).toHaveCount(1);
  await expect(page.locator('#tab-farming #btn-wateringCan')).toHaveCount(0);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('can-test');
    window.showNotification = () => {};
    const worker = makeSettler(1, townHall.x + 50, townHall.y), farmer = makeSettler(2, townHall.x - 50, townHall.y, { tool: 'hoe' });
    settlers = [worker, farmer];
    stock.wood = stock.iron = 10;
    orderGear('wateringCan');
    window.sim.run(5);
    return { worker: !!worker.wateringCan, farmer: !!farmer.wateringCan, charges: GAME_CONFIG.gear.wateringCan.charges };
  });
  expect(r).toEqual({ worker: false, farmer: true, charges: 5 });
});
