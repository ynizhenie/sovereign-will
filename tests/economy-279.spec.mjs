import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's batch of fixes (#279), part C1: the economy
test('a fallen settler\'s things drop as an enemy\'s do: lying there by chance, not paid back (#279, 19)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const out = {};
    for (const chance of [1, 0]) {
      GAME_CONFIG.loot.itemChance = chance;
      loot = [];
      const s = settlers[0];
      Object.assign(s, { weapon: 'sword', armor: 'iron', backpack: true, hp: 0, deadProcessed: false });
      const wood = stock.wood;
      removeDeadSettlers();
      out[chance] = { items: loot.flatMap(l => l.items).sort(), woodBack: stock.wood - wood };
      settlers.push(window.sim.helpers.makeSettler(900 + chance, townHall.x + 40, townHall.y));
    }
    GAME_CONFIG.loot.itemChance = 0.35;
    return out;
  });
  expect(r[1]).toEqual({ items: ['gear:armor', 'gear:backpack', 'weapons:sword'], woodBack: 0 });
  expect(r[0]).toEqual({ items: [], woodBack: 0 });
});

test('no potions, but rope is back as a supply; a tent houses two (#279, 26, 29, 306)', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => ({
    potions: !!GAME_CONFIG.resources.potions, rope: !!GAME_CONFIG.resources.rope, ropeRecipe: !!GAME_CONFIG.recipes.rope,
    anyRope: JSON.stringify([GAME_CONFIG.buildings, GAME_CONFIG.tools, GAME_CONFIG.weapons, GAME_CONFIG.gear]).includes('"rope"'),
    bow: GAME_CONFIG.weapons.bow.cost, tent: GAME_CONFIG.buildings.tent.population,
    brew: SETTLER_BEHAVIOURS.some(b => b.name === 'brewPotion')
  }));
  expect(r).toEqual({ potions: false, rope: true, ropeRecipe: true, anyRope: true, bow: { wood: 15, leather: 3, rope: 2 }, tent: 2, brew: false });
});
