import { test, expect } from '@playwright/test';
import { openGame, iconText } from './helpers.mjs';

test('opening a resource group does not change the panel size (#119)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const panel = page.locator('#bottom-panel');
  const before = await panel.boundingBox();
  await page.click('#group-food');
  await expect(page.locator('#group-food-members')).toBeVisible();
  const after = await panel.boundingBox();
  expect(after.height).toBe(before.height);
  expect(after.y).toBe(before.y);
});

test('wood and stone always show; worms are raw food and get eaten when food runs out (#119)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const tiles = await iconText(page, '#resources-hud > div');
  expect(tiles.filter(text => text.startsWith('[[wood]] Дерево:'))).toHaveLength(1);
  expect(tiles.filter(text => text.startsWith('[[stone]] Камень:'))).toHaveLength(1);
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

test('armour/shield and backpack/watering can sit in their own block; removing says "Разобрать" (#119)', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#tab-weapons .gear-actions button')).toHaveCount(2);
  await expect(page.locator('#tab-tools .gear-actions button')).toHaveCount(2);
  expect((await iconText(page, '#tab-tools .action-row button'))[0]).toBe('[[no]] Разобрать рюкзак');
  expect((await iconText(page, '#tab-weapons .action-row button'))[0]).toBe('[[no]] Разобрать броню');
});
