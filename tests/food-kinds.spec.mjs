import { test, expect } from './helpers.mjs';
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
  await page.click('#resource-strip'); // all of the stock, dropped down from the strip
  await page.click('#group-food');
  await expect(page.locator('#group-food-members')).toBeVisible();
  await expect(page.locator('#group-food-members div')).toHaveCount(5); // no Provisions any more (#169)
});

test('the watering can is given from the Tools tab, only to a farmer (#106)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#tab-tools #btn-wateringCan')).toHaveCount(1);
  await expect(page.locator('#tab-farming #btn-wateringCan')).toHaveCount(0);
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.start('can-test');
    const worker = makeSettler(1, townHall.x + 50, townHall.y), farmer = makeSettler(2, townHall.x - 50, townHall.y, { tool: 'hoe' });
    settlers = [worker, farmer];
    stock.wood = stock.iron = 10;
    orderGear('wateringCan');
    window.sim.run(5);
    return { worker: !!worker.wateringCan, farmer: !!farmer.wateringCan, charges: GAME_CONFIG.gear.wateringCan.charges };
  });
  expect(r).toEqual({ worker: false, farmer: true, charges: 5 });
});
