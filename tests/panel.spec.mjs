import { test, expect } from './helpers.mjs';
import { openGame, iconText } from './helpers.mjs';

test('wood and stone always show; worms are raw food and get eaten when food runs out (#119)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  expect(await page.locator('#resources-hud #resource-wood-txt').count()).toBe(1);
  expect(await page.locator('#resources-hud #resource-stone-txt').count()).toBe(1);
  const r = await page.evaluate(() => {
    stock.food = 1; stock.worms = 5;
    settlers.forEach(s => { s.hunger = 0.001; });
    update(1 / 60); // one meal each: 2 settlers, 1 food -> 1 worm
    return { food: stock.food, worms: stock.worms, rawGroup: GAME_CONFIG.resourceGroups.find(g => g.id === 'raw').members.includes('worms') };
  });
  expect(r).toEqual({ food: 0, worms: 4, rawGroup: true });
});

test('Tools and Weapons tiles count what settlers hold (#119)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    settlers = [
      makeSettler(1, 0, 0, { tool: 'axe', backpack: true }), makeSettler(2, 0, 0, { tool: 'axe' }),
      makeSettler(3, 0, 0, { tool: 'hoe', wateringCan: true }),
      makeSettler(4, 0, 0, { weapon: 'sword', role: 'soldier', armor: 'iron', shield: true }), makeSettler(5, 0, 0, { weapon: 'bow', role: 'archer' })
    ];
    updateUI();
  });
  await expect(page.locator('#group-toolsHeld-txt')).toHaveText('5'); // 2 axes, a hoe, a backpack, a watering can
  await expect(page.locator('#held-tools-axe-txt')).toHaveText('2');
  await expect(page.locator('#held-gear-backpack-txt')).toHaveText('1');
  await expect(page.locator('#group-weaponsHeld-txt')).toHaveText('4'); // sword, bow, armour, shield
  await expect(page.locator('#held-weapons-fist-txt')).toHaveCount(0);
});

test('gear is made where its iron says (a backpack at a workshop; armour, a shield, a watering can at a smithy); taking things off is on the selected settler, one button per thing it holds (#119, #232, #248)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  await expect(page.locator('#workshop-list [data-item="gear:backpack"]')).toHaveCount(1);
  for (const id of ['armor', 'shield', 'wateringCan']) await expect(page.locator(`#smithy-list [data-item="gear:${id}"]`)).toHaveCount(1);
  await expect(page.locator('#tab-tools .btn-disarm, #tab-weapons .btn-disarm')).toHaveCount(0); // none in the sheets
  await page.evaluate(() => { const s = settlers[0]; Object.assign(s, { weapon: 'sword', role: 'soldier', tool: 'none', armor: 'iron', backpack: true }); selectedSettler = s; isPaused = true; updateUI(); });
  const chips = page.locator('#selected-gear button');
  await expect(chips).toHaveCount(3);
  expect(await iconText(page, '#selected-gear button')).toEqual(['[[sword]] Меч [[no]]', '[[armor]] Броня [[no]]', '[[backpack]] Рюкзак [[no]]']);
  await page.evaluate(() => { isPaused = false; });
  await chips.nth(1).click();
  expect(await page.evaluate(() => settlers[0].targetEquipment)).toEqual({ gearOff: 'armor' });
  // a worker with nothing: no buttons
  await page.evaluate(() => { const s = settlers[1]; Object.assign(s, { weapon: 'fist', tool: 'none' }); selectedSettler = s; updateUI(); });
  await expect(page.locator('#selected-gear')).toBeHidden();
});

test('an item\'s card shows its cost against the stock, what\'s left after or what\'s short; pressing it short shows the card, no notice (#232)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  // paused: nobody brings wood in between (it raced on CI: 11/5)
  await page.evaluate(() => { isPaused = true; stock.wood = 10; stock.stone = 2; window.sim.helpers.placeWorkshop(); });
  await page.click('[data-arg="tab-tools"]');
  const axe = page.locator('#btn-axe');
  await axe.hover();
  await expect(page.locator('#info-card')).toContainText('10/5');
  await expect(page.locator('#info-card')).toContainText('2/5');
  await expect(page.locator('#info-card .info-cost.short').first()).toBeVisible();
  await expect(page.locator('#info-card')).toContainText('Не хватает');
  await page.mouse.move(5, 5);
  await axe.click();
  await expect(page.locator('#info-card')).toContainText('Не хватает');
  await expect(page.locator('#toast-notification')).not.toContainText('Не хватает');
  await page.evaluate(() => { stock.stone = 50; });
  await page.mouse.move(5, 5);
  await axe.hover();
  await expect(page.locator('#info-card')).toContainText('Останется');
});
