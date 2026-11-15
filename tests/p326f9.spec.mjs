import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326 (27.10), helmets in Endless and in Battles (27)

test('a helmet is made at a smithy, worn by anyone but a pet, takes part of a hit off a settler and an enemy; drawn (#326, 27.10, 27)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const { makeSettler } = window.sim.helpers;
    const tile = !!document.querySelector('#tab-craft [data-info="gear:helmet"]');
    const place = craftPlace('gear', 'helmet');
    const s = makeSettler(1, townHall.x - 60, townHall.y, { role: 'soldier', weapon: 'sword' });
    const bare = makeSettler(2, townHall.x - 90, townHall.y, { role: 'soldier', weapon: 'sword' });
    settlers = [s, bare];
    putOnGear(s, 'helmet');
    const wears = hasGear(s, 'helmet') && GEAR_RULES.helmet.canWear(s);
    damageSettler(s, 20); damageSettler(bare, 20);
    const settlerTook = [100 - s.hp, 100 - bare.hp];
    const en = createNormalEnemy({ x: townHall.x + 400, y: townHall.y }, 'raider'), en2 = createNormalEnemy({ x: townHall.x + 440, y: townHall.y }, 'raider');
    en.helmet = true; const hp = en.hp;
    damageEnemy(en, 20); damageEnemy(en2, 20);
    const enemyTook = [hp - en.hp, en2.maxHp - en2.hp];
    // its button on the settler's card takes it off
    takeOffGear(s, 'helmet');
    const off = !hasGear(s, 'helmet');
    putOnGear(s, 'helmet');
    // drawn on both
    enemies = [en, en2];
    camera.x = townHall.x; camera.y = townHall.y; setZoom(getMaxZoom());
    for (let i = 0; i < 3; i++) render();
    return { tile, place, wears, settlerTook, enemyTook, off };
  });
  expect(r.tile).toBe(true);
  expect(r.place).toBe('smithy');
  expect(r.wears).toBe(true);
  expect(r.settlerTook[0]).toBeCloseTo(17, 0);
  expect(r.settlerTook[1]).toBe(20);
  expect(r.enemyTook[0]).toBeCloseTo(17, 0);
  expect(r.enemyTook[1]).toBe(20);
  expect(r.off).toBe(true);
  expect(errors).toEqual([]);
});

test('in a battle the Helmet switch puts one on what is placed next, on either side, not on a pet (#326, 27.10, 27)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.click('#battle-play');
  const r = await page.evaluate(() => {
    const put = (id, gx, gy) => { battle.category = 'units'; battle.preset = id; battleTap(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15); };
    document.querySelector('[data-battle-gear="helmet"]').click();
    const on = battle.helmet && document.querySelector('[data-battle-gear="helmet"]').classList.contains('on');
    put('humans:sword', 6, 8); put('humans:pet', 6, 12); put('undead:bow', 30, 8);
    const mine = settlers.map(s => !!s.helmet), theirs = enemies.map(e => !!e.helmet);
    for (let i = 0; i < 3; i++) render();
    return { on, mine, theirs };
  });
  expect(r).toEqual({ on: true, mine: [true, false], theirs: [true] });
  expect(errors).toEqual([]);
});

test('bone armour and horned helmets keep their stats and variants', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    isPaused = true;
    const { makeSettler } = window.sim.helpers;
    const s = makeSettler(1, townHall.x - 60, townHall.y, { role: 'soldier', weapon: 'sword' });
    putOnGear(s, 'bone_armor');
    const boneHp = s.maxHp;
    damageSettler(s, 100);
    const boneDamage = boneHp - s.hp;
    const en = createNormalEnemy({ x: townHall.x + 400, y: townHall.y }, 'raider');
    putOnGear(en, 'horned_helmet');
    const helmetHp = en.hp;
    damageEnemy(en, 20);
    return {
      bone: { armor: s.armor, maxHp: boneHp, damage: boneDamage },
      helmet: { id: en.helmetGear, damage: helmetHp - en.hp },
      factions: [GAME_CONFIG.gear.bone_armor.factions, GAME_CONFIG.gear.horned_helmet.factions],
      boneCost: GAME_CONFIG.gear.bone_armor.cost
    };
  });
  expect(result).toEqual({
    bone: { armor: 'bone', maxHp: 115, damage: 88 },
    helmet: { id: 'horned_helmet', damage: 15 },
    factions: [['undead'], ['demons']],
    boneCost: { bones: 15, rope: 2 }
  });
  expect(errors).toEqual([]);
});

test('battle gear variants can be applied across factions', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-battles');
  await page.click('#battle-play');
  const result = await page.evaluate(() => {
    battle.category = 'units';
    battle.preset = 'humans:sword';
    battle.armor = 'bone';
    battle.helmet = 'horned_helmet';
    battleTap(6 * TILE_SIZE + 15, 8 * TILE_SIZE + 15);
    battle.preset = 'undead:bow';
    battleTap(30 * TILE_SIZE + 15, 8 * TILE_SIZE + 15);
    const gear = document.querySelector('.battle-gear');
    return {
      ally: [settlers[0]?.armor, settlers[0]?.helmetGear],
      enemy: [enemies[0]?.armor, enemies[0]?.helmetGear],
      panel: [getComputedStyle(gear).display, getComputedStyle(gear).gridTemplateColumns.split(' ').length]
    };
  });
  expect(result).toEqual({
    ally: ['bone', 'horned_helmet'],
    enemy: ['bone', 'horned_helmet'],
    panel: ['grid', 3]
  });
  expect(errors).toEqual([]);
});

test('undead and demon wave enemies use their faction armour and helmet variants', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(() => {
    const oldLeatherChance = GAME_CONFIG.waveGear.leather.endChance;
    const oldHelmetChance = GAME_CONFIG.waveGear.helmet.endChance;
    GAME_CONFIG.waveGear.leather.endChance = 1;
    GAME_CONFIG.waveGear.helmet.endChance = 1;
    game.armory = { 'gear:leather_armor': 1, 'gear:bone_armor': 1, 'gear:helmet': 1, 'gear:horned_helmet': 1 };
    game.unlocked = {};
    game.playerGear = {};
    game.settlers = [];
    game.buildings = [];
    game.plagueMode = false;
    setSideFaction('enemy', 'undead');
    const undead = createConfiguredEnemy({ x: townHall.x + 300, y: townHall.y }, presetEnemyKey('undead', 'bow'));
    dressForWave(undead, getEnemyDef(undead), 20);
    setSideFaction('enemy', 'demons');
    const demon = createConfiguredEnemy({ x: townHall.x + 340, y: townHall.y }, presetEnemyKey('demons', 'spear'));
    dressForWave(demon, getEnemyDef(demon), 20);
    GAME_CONFIG.waveGear.leather.endChance = oldLeatherChance;
    GAME_CONFIG.waveGear.helmet.endChance = oldHelmetChance;
    return {
      undead: [undead.armor, undead.helmetGear],
      demon: [demon.armor, demon.helmetGear],
      developmentItems: getPlayerDevelopment()
    };
  });
  expect(result).toEqual({ undead: ['bone', 'helmet'], demon: ['leather', 'horned_helmet'], developmentItems: 2 });
  expect(errors).toEqual([]);
});
