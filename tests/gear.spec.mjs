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

test('crafts that need rope stay affordable when the rope can be made; only the medic bag still needs herbs', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    Object.assign(stock, { wood: 100, stone: 100, iron: 100, leather: 100, herbs: 100, rope: 0 });
    updateUI();
    refreshAffordability(true);
    const ropeUsers = [
      'tools:rod', 'weapons:bow', 'gear:backpack', 'gear:whistle', 'gear:banner', 'recipes:torch'
    ];
    const affordable = ropeUsers.map(key => {
      const button = document.querySelector(`[data-info="${key}"]`);
      return !button.classList.contains('cant-afford');
    });
    stock.herbs = 0;
    stock.rope = 100;
    updateUI();
    refreshAffordability(true);
    const medbag = document.querySelector('[data-info="tools:medbag"]');
    const ropeCosts = [
      GAME_CONFIG.tools.rod.cost.rope === 1, GAME_CONFIG.weapons.bow.cost.rope === 2,
      GAME_CONFIG.gear.backpack.cost.rope === 2, GAME_CONFIG.gear.whistle.cost.rope === 2,
      GAME_CONFIG.gear.banner.cost.rope === 2, GAME_CONFIG.recipes.torch.cost.rope === 1
    ];
    return { affordable, ropeCosts, medbagNeedsHerbs: GAME_CONFIG.tools.medbag.cost.herbs === 2, medbagUnavailable: medbag.classList.contains('cant-afford') };
  });
  expect(r).toEqual({ affordable: [true, true, true, true, true, true], ropeCosts: [true, true, true, true, true, true], medbagNeedsHerbs: true, medbagUnavailable: true });
});

test('a torch post can be placed while its torch is queued for crafting', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    sim.helpers.clearResources();
    for (const id of Object.keys(stock)) stock[id] = 0;
    Object.assign(stock, { wood: 1, herbs: 2 });
    const hall = getGridPos(townHall.x, townHall.y);
    const spot = sim.helpers.tileCenter(hall.gx + 6, hall.gy + 6);
    buildMode = 'torch';
    mouse.x = spot.x; mouse.y = spot.y;
    handleCanvasClick();
    const blueprint = blueprints[0];
    const queued = {
      placed: blueprint?.type,
      needs: { ...blueprint?.needs },
      orders: craftOrders.map(order => ({ id: order.id, stage: order.stage, yields: order.yields })),
      stock: { wood: stock.wood, herbs: stock.herbs, rope: stock.rope, torches: stock.torches }
    };
    sim.run(20);
    return { queued, built: buildings.some(building => building.type === 'torch') };
  });
  expect(result).toEqual({
    queued: {
      placed: 'torch',
      needs: { torches: 1 },
      orders: [
        { id: 'rope', stage: 'fetch', yields: { rope: 2 } },
        { id: 'torch', stage: 'waitResources', yields: { torches: 1 } }
      ],
      stock: { wood: 0, herbs: 0, rope: 0, torches: 0 }
    },
    built: true
  });
});

test('a fish trap queues enough rope recipes when its cost exceeds one recipe yield', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const water = waterTiles.find(w => isWaterReachable(w) && inTerritory(w.x, w.y));
    if (!water) return null;
    for (const id of Object.keys(stock)) stock[id] = 0;
    Object.assign(stock, { wood: 3, herbs: 4 });
    buildMode = 'fish_trap';
    mouse.x = water.x; mouse.y = water.y;
    handleCanvasClick();
    return {
      blueprint: blueprints[0]?.type,
      ropeOrders: craftOrders.filter(order => order.id === 'rope').length,
      herbs: stock.herbs
    };
  });
  expect(result).toEqual({ blueprint: 'fish_trap', ropeOrders: 2, herbs: 0 });
});

test('buildings that can afford their missing rope recipe stay active', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const tile = id => document.querySelector(`[data-info="buildings:${id}"]`);
    Object.assign(stock, { wood: 10, stone: 5, herbs: 2, rope: 0 });
    refreshAffordability(true);
    const platformWithHerbs = tile('watchtower').classList.contains('cant-afford');
    stock.herbs = 0;
    refreshAffordability(true);
    return {
      platformWithHerbs,
      platformWithoutHerbs: tile('watchtower').classList.contains('cant-afford')
    };
  });
  expect(result).toEqual({ platformWithHerbs: false, platformWithoutHerbs: true });
});

test('armour goes to a melee soldier first, then anyone; +50 hp once put on (#94)', async ({ page }) => {
  await openGame(page);
  expect(await sim(page, 'orderGearFor', { id: 'armor' }))
    .toEqual({ who: 'soldier', wornAtOnce: false, worn: true, maxHp: 150, paid: { iron: 8, leather: 0 }, stored: 0 });
  expect(await sim(page, 'orderGearFor', { id: 'armor', only: ['archer', 'worker'] }))
    .toMatchObject({ worn: true, maxHp: 150 });
});
