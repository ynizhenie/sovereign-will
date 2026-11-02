import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10): firewood by an axe, taken apart; a captain holds morale; a medic's bag in a battle; the menu's own warehouse

test('firewood ordered in Craft is made by the one with an axe, not the other; taken apart it is wood again (#326, 9)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    window.sim.helpers.clearResources();
    stock.wood = 5; stock.firewood = 0; game.waveTimer = 99999; isPaused = false;
    const hands = makeSettler(1, townHall.x + 40, townHall.y), axe = makeSettler(2, townHall.x - 40, townHall.y, { tool: 'axe' });
    settlers.length = 0; settlers.push(hands, axe);
    craftRecipe('firewood');
    let crafter = null;
    for (let i = 0; i < 60 * 15 && !crafter; i++) { update(1 / 60); const o = game.craftOrders.find(c => c.id === 'firewood'); if (o && o.crafter) crafter = o.crafter.id; }
    stock.firewood = 2; const wood = stock.wood;
    const apart = takeApartRecipe('firewood');
    return { crafter, apart, woodBack: stock.wood - wood, firewoodLeft: stock.firewood };
  });
  expect(r).toEqual({ crafter: 2, apart: true, woodBack: 1, firewoodLeft: 0 });
  expect(errors).toEqual([]);
});

test('a soldier by a captain with a banner keeps its morale, one far off doesn\'t (#326, 12)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    const { makeSettler } = window.sim.helpers;
    const captain = makeSettler(1, townHall.x + 100, townHall.y, { weapon: 'sword', role: 'soldier', banner: true });
    const near = makeSettler(2, townHall.x + 140, townHall.y, { weapon: 'sword', role: 'soldier' });
    const far = makeSettler(3, townHall.x - 600, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers.length = 0; settlers.push(captain, near, far);
    for (const s of [near, far]) shakeMorale(s, 9999, 'settler', true);
    return { near: !!near.panic, far: !!far.panic };
  });
  expect(r).toEqual({ near: false, far: true });
  expect(errors).toEqual([]);
});

test('in a battle a medic starts with its bag full (#326, 17)', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  const r = await page.evaluate(() => {
    battle.category = 'units'; battle.preset = 'humans:medic'; battleTap(6 * TILE_SIZE + 15, 12 * TILE_SIZE + 15);
    startBattleFight();
    const medic = settlers.find(s => s.tool === 'medbag');
    return { bag: medic && medic.bagHerbs, size: GAME_CONFIG.medic.bagSize };
  });
  expect(r.bag).toBe(r.size);
});

test('menu scenes start with an empty warehouse and unlimited capacity; the fight keeps its enemy faction', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    setSideFaction('player', 'undead'); setSideFaction('enemy', 'demons');
    let acceptedOverOldLimit = false;
    let stayedEmptyDuringStartup = false;
    let restockedAfterStartup = false;
    let enemyColor;
    const scenes = MENU_SCENES.map(scene => {
      enterMenuWorld(scene);
      const state = {
        scene, empty: Object.values(stock).every(amount => amount === 0),
        capacity: storeCapacity(townHall), room: roomIn(townHall)
      };
      if (scene === 'hunt') {
        storeInto(townHall, 'wood', 500);
        acceptedOverOldLimit = townHall.store.wood === 500 && !game.piles.length;
      }
      if (scene === 'fight') {
        enemyColor = getEnemyFaction().color.toLowerCase();
      }
      if (scene === 'farm') {
        tickMenuScene(1);
        stayedEmptyDuringStartup = Object.values(stock).every(amount => amount === 0);
        tickMenuScene(1);
        restockedAfterStartup = stock.wheatSeeds >= 10;
      }
      return state;
    });
    leaveMenuWorld();
    return {
      scenes, normalCapacity: storeCapacity(townHall), acceptedOverOldLimit,
      stayedEmptyDuringStartup, restockedAfterStartup, enemyColor,
      expectedNormalCapacity: GAME_CONFIG.storage.capacity.hall,
      undead: GAME_CONFIG.factions.undead.color.toLowerCase()
    };
  });
  expect(r.scenes).toEqual(['hunt', 'fishing', 'fight', 'farm'].map(scene => ({ scene, empty: true, capacity: Infinity, room: Infinity })));
  expect(r.acceptedOverOldLimit).toBe(true);
  expect(r.stayedEmptyDuringStartup).toBe(true);
  expect(r.restockedAfterStartup).toBe(true);
  expect(r.normalCapacity).toBe(r.expectedNormalCapacity);
  expect(r.enemyColor).toBe(r.undead);
});
