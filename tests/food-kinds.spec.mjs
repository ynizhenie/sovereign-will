import { test, expect } from '@playwright/test';
import { openGame, sim } from './helpers.mjs';

test('Food opens onto what it is made of; food without a kind tops up the scarcest; spending goes in order (#106, #169)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    stock.food = 0; foodMix = {};
    addFood('berries', 4); addFood('cookedMeat', 3);
    stock.food += 7; syncFoodMix(); // loot: no kind
    const after = { total: stock.food, ...foodMix };
    stock.food -= 6; // hired / eaten: berries first, then apples...
    syncFoodMix();
    updateUI();
    return { after, spent: { ...foodMix }, shown: document.getElementById('food-kind-cookedMeat-txt').innerText };
  });
  // 7 pieces to the scarcest kinds in turn: apples, bread, cooked fish up to 2 each (cooked meat has 3), then one more
  expect(r.after).toMatchObject({ total: 14, berries: 4, cookedMeat: 3 });
  expect(Object.values(r.after).slice(1).reduce((a, b) => a + b, 0)).toBe(14);
  expect(r.spent.berries).toBe(0);
  expect(r.shown).toBe(String(r.spent.cookedMeat));
  await page.click('#group-food');
  await expect(page.locator('#group-food-members')).toBeVisible();
  await expect(page.locator('#group-food-members div')).toHaveCount(5); // no Provisions any more (#169)
});

test('a new game starts with a random mix of food kinds, the same for the same seed (#169)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const mix = seed => { window.sim.start(seed); return { total: stock.food, mix: { ...foodMix } }; };
    return [mix('food-mix-a'), mix('food-mix-a'), mix('food-mix-b')];
  });
  const kinds = r[0].mix;
  expect(Object.values(kinds).reduce((a, b) => a + b, 0)).toBe(r[0].total);
  expect(Object.values(kinds).filter(n => n > 0).length).toBeGreaterThan(1);
  expect(r[1]).toEqual(r[0]);
  expect('provisions' in kinds).toBe(false);
});

test('cooking makes dishes, berries and apples come in as their kind (#106)', async ({ page }) => {
  await openGame(page);
  await sim(page, 'cookingRun', { food: 0, raw: { rawMeat: 2, rawFish: 1, wheat: 1 } });
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
