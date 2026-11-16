import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The Plague (#402), as #404 asked for it
async function startPlague(page) {
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-plague');
  await page.click('#plague-play');
  await page.waitForFunction(() => gameStarted && !loading && plagueMode, null, { timeout: 60000 });
  await page.evaluate(() => { isPaused = true; });
}

test('Plague defaults use a six-tile squad search, improved recovery and healing, with Play at the top', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-plague');
  const menuOrder = await page.locator('[data-screen="plague"]').evaluate(screen => {
    const children = [...screen.children];
    return children.indexOf(screen.querySelector('#plague-play')) < children.indexOf(screen.querySelector('.plague-spawn-settings')) &&
      children.indexOf(screen.querySelector('#plague-play')) < children.indexOf(screen.querySelector('[data-seed-slot="plague"]'));
  });
  expect(menuOrder).toBe(true);
  await page.click('#plague-play');
  await page.waitForFunction(() => gameStarted && !loading && plagueMode, null, { timeout: 60000 });
  const stats = await page.evaluate(() => {
    const hero = settlers.find(unit => unit.plagueHero);
    return {
      commandRange: plague.commandRange / TILE_SIZE,
      energyRegen: plague.energyRegen,
      healStrength: plague.healStrength,
      heroSpeed: hero.speed,
      zombieSpeed: GAME_CONFIG.settlerTypes.zombie.speed
    };
  });
  expect(stats).toEqual({ commandRange: 6, energyRegen: 0.25, healStrength: 2.5, heroSpeed: 0.85, zombieSpeed: 0.85 });
  expect(errors).toEqual([]);
});

test('Plague maps keep deserts inside savanna and cap each biome at half the map', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const terrain = await page.evaluate(() => ({
    total: game.COLS * game.ROWS,
    savanna: game.savannaTiles.length,
    desert: game.desertTiles.length,
    naturalRocks: game.naturalRocks.filter(rock => !rock.oreSpawner).length,
    unbufferedDesertEdges: game.desertTiles.reduce((total, desert) => {
      let missing = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = desert.x + dx * TILE_SIZE, y = desert.y + dy * TILE_SIZE;
        if (x < 15 || y < 15 || x >= game.WORLD_WIDTH - 15 || y >= game.WORLD_HEIGHT - 15 ||
            thingAt(game.waterTiles, x, y) || thingAt(game.desertTiles, x, y)) continue;
        if (!thingAt(game.savannaTiles, x, y)) missing++;
      }
      return total + missing;
    }, 0),
    separateSavanna: game.savannaTiles.some(tile =>
      ![-1, 0, 1].some(dy => [-1, 0, 1].some(dx =>
        (dx || dy) && thingAt(game.desertTiles, tile.x + dx * TILE_SIZE, tile.y + dy * TILE_SIZE))))
  }));
  expect(terrain.savanna).toBeLessThanOrEqual(terrain.total / 2);
  expect(terrain.desert).toBeLessThanOrEqual(terrain.total / 2);
  expect(terrain.savanna + terrain.desert).toBeLessThanOrEqual(terrain.total);
  expect(terrain.naturalRocks).toBeGreaterThan(0);
  if (terrain.desert > 0) {
    expect(terrain.savanna).toBeGreaterThan(0);
    expect(terrain.unbufferedDesertEdges, JSON.stringify(terrain)).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('Plague can generate no biomes or savanna alone, but never desert alone', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const biomes = await page.evaluate(async () => {
    const { generateMap } = await import('/js/domains/world/world.generator.js');
    const { createWorldSeed } = await import('/js/engine/world/rng.js');
    const originalMap = { ...GAME_CONFIG.map }, originalSeed = game.worldSeed;
    const results = [];
    const boundaryMisses = () => game.desertTiles.reduce((total, desert) => {
      let missing = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = desert.x + dx * TILE_SIZE, y = desert.y + dy * TILE_SIZE;
        if (x < 15 || y < 15 || x >= game.WORLD_WIDTH - 15 || y >= game.WORLD_HEIGHT - 15 ||
            thingAt(game.waterTiles, x, y) || thingAt(game.desertTiles, x, y)) continue;
        if (!thingAt(game.savannaTiles, x, y)) missing++;
      }
      return total + missing;
    }, 0);
    const generate = (deserts, savannas, seed) => {
      GAME_CONFIG.map.deserts = { min: deserts, max: deserts };
      GAME_CONFIG.map.savannas = { min: savannas, max: savannas };
      GAME_CONFIG.map.desertRadiusX = { min: 8, max: 8 };
      GAME_CONFIG.map.desertRadiusY = { min: 8, max: 8 };
      GAME_CONFIG.map.savannaRadiusX = { min: 8, max: 8 };
      GAME_CONFIG.map.savannaRadiusY = { min: 8, max: 8 };
      GAME_CONFIG.map.desertMaxShare = GAME_CONFIG.map.savannaMaxShare = 0.5;
      GAME_CONFIG.map.savannaAroundDesert = true;
      game.worldSeed = createWorldSeed(seed);
      generateMap();
      results.push({
        deserts: game.desertTiles.length,
        savannas: game.savannaTiles.length,
        unbufferedEdges: boundaryMisses()
      });
    };
    try {
      generate(0, 0, 'plague-empty-biomes');
      generate(0, 1, 'plague-savanna-only');
      generate(1, 0, 'plague-desert-with-savanna-ring');
      return results;
    } finally {
      for (const key of Object.keys(GAME_CONFIG.map)) if (!(key in originalMap)) delete GAME_CONFIG.map[key];
      Object.assign(GAME_CONFIG.map, originalMap);
      game.worldSeed = originalSeed;
    }
  });
  expect(biomes[0]).toMatchObject({ deserts: 0, savannas: 0 });
  expect(biomes[1].deserts).toBe(0);
  expect(biomes[1].savannas).toBeGreaterThan(0);
  expect(biomes[2].deserts).toBeGreaterThan(0);
  expect(biomes[2].savannas).toBeGreaterThan(0);
  expect(biomes[2].unbufferedEdges).toBe(0);
  expect(errors).toEqual([]);
});

test('Plague terrain does not overwrite the hero starting tiles', async ({ page }) => {
  await openGame(page);
  await startPlague(page);
  const overlaps = await page.evaluate(async () => {
    const { generateMap } = await import('/js/domains/world/world.generator.js');
    const { createWorldSeed } = await import('/js/engine/world/rng.js');
    const originalMap = { ...GAME_CONFIG.map }, originalSeed = game.worldSeed;
    const results = [];
    Object.assign(GAME_CONFIG.map, {
      deserts: { min: 2, max: 2 },
      desertRadiusX: { min: 12, max: 12 },
      desertRadiusY: { min: 12, max: 12 },
      desertMaxShare: 0.5,
      savannas: { min: 0, max: 0 },
      savannaAroundDesert: true
    });
    try {
      for (let i = 0; i < 24; i++) {
        game.worldSeed = createWorldSeed(`plague-start-biome-${i}`);
        generateMap();
        const underHero = tile => Math.abs(tile.x - townHall.x) <= TILE_SIZE / 2 &&
          Math.abs(tile.y - townHall.y) <= TILE_SIZE / 2;
        results.push({
          desert: game.desertTiles.some(underHero),
          savanna: game.savannaTiles.some(underHero)
        });
      }
      return results;
    } finally {
      for (const key of Object.keys(GAME_CONFIG.map)) if (!(key in originalMap)) delete GAME_CONFIG.map[key];
      Object.assign(GAME_CONFIG.map, originalMap);
      game.worldSeed = originalSeed;
    }
  });
  expect(overlaps.some(result => result.desert)).toBe(false);
  expect(overlaps.some(result => result.savanna)).toBe(false);
});

test('Plague does not accumulate resources for packs at the hidden town hall', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(async () => {
    const { makeBonesAndRot } = await import('/js/domains/factions/undead/index.js');
    const { keepStoresInStep } = await import('/js/domains/colony/storage/index.js');
    const bones = stock.bones, rot = stock.rot;
    game.piles = [];
    townHall.store = {};
    makeBonesAndRot(1200);
    keepStoresInStep();
    return {
      bonesUnchanged: stock.bones === bones,
      rotUnchanged: stock.rot === rot,
      piles: game.piles.length,
      hallStock: Object.values(townHall.store).reduce((total, amount) => total + amount, 0)
    };
  });
  expect(result).toEqual({ bonesUnchanged: true, rotUnchanged: true, piles: 0, hallStock: 0 });
  expect(errors).toEqual([]);
});

test('Plague bands come in on standable ground away from the hero, armed as Endless\'s waves, no crossbowmen (#404, 2, 3, 8)', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  expect(await page.evaluate(() => savannaTiles.length)).toBeGreaterThan(0);
  const r = await page.evaluate(() => {
    const hero = settlers.find(s => s.plagueHero);
    const seen = [];
    for (let i = 0; i < 40; i++) {
      enemies.length = 0;
      plague.groupTimer = 60; plague.bandCount = [1, 1];
      plague.groupSpawnQueue = [0];
      tickPlague(1 / 60);
      seen.push(enemies.map(en => ({ x: en.x, y: en.y, key: en.enemyKey, weapon: getEnemyDef(en).weapon })));
    }
    const all = seen.flat();
    const standable = en => { const g = getGridPos(en.x, en.y); return !isTileBlockedForEnemyStrict(g.gx, g.gy); };
    return {
      bands: seen.filter(band => band.length).length,
      sizes: [Math.min(...seen.map(b => b.length)), Math.max(...seen.map(b => b.length))],
      standable: all.every(standable),
      far: all.every(en => Math.hypot(en.x - hero.x, en.y - hero.y) >= 10 * TILE_SIZE),
      crossbows: all.filter(en => en.weapon === 'crossbow').length,
      humans: all.every(en => enemyFactionOf(en.key).id === 'humans')
    };
  });
  expect(r.bands).toBeGreaterThan(30);
  expect(r.sizes[0]).toBeGreaterThanOrEqual(3);
  expect(r.sizes[1]).toBeLessThanOrEqual(5); // (level 1: 3 to 5)
  expect(r).toMatchObject({ standable: true, far: true, crossbows: 0, humans: true });
  expect(errors).toEqual([]);
});

test('Plague groups in the same batch spawn within a five-second jitter window', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-plague');
  for (const [kind, value] of [['interval', 10], ['groups', 3]]) {
    const box = page.locator(`[data-plague-range="${kind}"]`);
    await box.locator('[data-plague-range-mode="custom"]').click();
    await box.locator('input').nth(0).fill(String(value));
    await box.locator('input').nth(1).fill(String(value));
    await box.locator('input').nth(1).dispatchEvent('change');
  }
  await page.click('#plague-play');
  await page.waitForFunction(() => gameStarted && !loading && plagueMode, null, { timeout: 60000 });
  await page.evaluate(() => { isPaused = true; });
  const schedule = await page.evaluate(() => ({
    interval: plague.bandInterval,
    count: plague.groupSpawnQueue.length,
    nominalTime: plague.groupTimer,
    spawnTimes: [...plague.groupSpawnQueue]
  }));
  const offsets = schedule.spawnTimes.map(time => time - schedule.nominalTime);
  expect(schedule.interval).toEqual([10, 10]);
  expect(schedule.count).toBe(3);
  expect(offsets.every(offset => offset >= -5 && offset <= 5)).toBe(true);
  expect(new Set(schedule.spawnTimes).size).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('Plague band size grows with level and caps at 30', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(async () => {
    const { plagueGroupMaxSize } = await import('/js/modes/plague/plague.rules.js');
    plague.upgrades = { growth: 100 };
    const sizes = [];
    for (let i = 0; i < 120; i++) {
      enemies.length = 0;
      plague.groups.length = 0;
      plague.groupTimer = 60;
      plague.bandCount = [1, 1];
      plague.groupSpawnQueue = [0];
      tickPlague(1 / 60);
      if (plague.groups.length) sizes.push(plague.groups[0].size);
    }
    return {
      sizes,
      milestones: [5, 10, 15, 20, 25, 30, 35, 40].map(plagueGroupMaxSize)
    };
  });
  expect(result.milestones).toEqual([5, 8, 12, 15, 19, 23, 26, 30]);
  expect(result.sizes).toContain(30);
  expect(Math.min(...result.sizes)).toBeGreaterThanOrEqual(3);
  expect(Math.max(...result.sizes)).toBe(30);
  expect(errors).toEqual([]);
});

test('Plague enemy armor progresses by band level without player gear unlocks', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(() => {
    const armor = [];
    for (let i = 0; i < 128; i++) {
      const enemy = createConfiguredEnemy({ x: townHall.x, y: townHall.y }, 'raider');
      dressForWave(enemy, GAME_CONFIG.enemies.raider, 20);
      if (enemy.armor) armor.push(enemy.armor);
    }
    return {
      hasGearUnlocks: ['gear:leather_armor', 'gear:armor'].some(key => game.armory[key] > 0 || game.unlocked[key]),
      earlyChance: getWaveGearChance('leather', 1),
      lateChance: getWaveGearChance('leather', 20),
      armoredEnemies: armor.length
    };
  });
  expect(result.hasGearUnlocks).toBe(false);
  expect(result.earlyChance).toBe(0);
  expect(result.lateChance).toBeGreaterThan(0);
  expect(result.armoredEnemies).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Plague: upgrade cards affect the hero and squad, while the menu shows only current stats (#404, 4, 5)', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const r = await page.evaluate(() => {
    const hero = settlers.find(s => s.plagueHero);
    const zombie = createSettler('zombie', 990, hero.x + 40, hero.y, { plagueUnit: true, masterId: hero.id });
    zombie.speed = GAME_CONFIG.settlerTypes.zombie.speed;
    settlers.push(zombie);
    plague.offer = ['speed', 'energy_capacity', 'squad_size'];
    applyPlagueCardOffer();
    const cards = [...document.querySelectorAll('#plague-card-offer .plague-upgrade-card')];
    const rows = cards.map(card => Math.round(card.getBoundingClientRect().top));
    cards[0].click();
    document.getElementById('plague-upgrades-toggle').click();
    const statRows = [...document.querySelectorAll('#plague-character-stats .plague-character-stat')];
    const stats = statRows.map(row => row.querySelector('b').textContent);
    const highlightedStats = statRows.filter(row => row.querySelector('b').classList.contains('raised'))
      .map(row => row.querySelector('span').textContent);
    const healthLabels = [...document.querySelectorAll('.plague-character-group')][0]
      .querySelectorAll('.plague-character-stat span');
    const groupCount = document.querySelectorAll('.plague-character-group-title').length;
    const statLabels = statRows.map(row => row.querySelector('span').textContent);
    const hasDisclosure = !!document.querySelector('#plague-character-stats details');
    const hasUpgradeList = !!document.querySelector('#plague-upgrades-list');
    document.getElementById('plague-upgrades-close').click();
    return {
      oneRow: new Set(rows).size === 1, speedFactor: plague.speedFactor, squadSpeed: +(zombie.speed / GAME_CONFIG.settlerTypes.zombie.speed).toFixed(2),
      currentOnly: stats.length === 14 && stats.every(text => !text.includes('→')),
      healthRowsTogether: [...healthLabels].map(label => label.textContent).join(' / ') === 'Здоровье / Здоровье зомби / большого зомби',
      highlightedStats,
      groupCount,
      showsRaiseCost: statLabels.some(label => label.includes('Энергия за воскрешение')), hasDisclosure,
      level: document.getElementById('plague-level').textContent, hasUpgradeList,
      standing: (() => { isPaused = false; update(1 / 60); isPaused = true; return { swaying: !!hero.swaying, idle: !!hero.isIdle }; })()
    };
  });
  expect(r.highlightedStats).toEqual(['Скорость']);
  expect(r).toMatchObject({
    oneRow: true, speedFactor: 1.1, squadSpeed: 1.1, currentOnly: true,
    healthRowsTogether: true, groupCount: 6, showsRaiseCost: false, hasDisclosure: false, hasUpgradeList: false
  });
  expect(r.standing).toEqual({ swaying: false, idle: false }); // (no sway, no "zZ" over it)
  expect(r.level).toContain('2');
  expect(errors).toEqual([]);
});

test('Plague grave work multiplies energy regeneration, but only while the Necromancer works there', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(async () => {
    const { tickSettlers } = await import('/js/domains/colony/settlers/index.js');
    const { tickPlague } = await import('/js/modes/plague/plague.rules.js');
    const hero = settlers.find(unit => unit.plagueHero);
    game.settlers = [hero];
    const grave = { type: 'grave', x: hero.x, y: hero.y, rest: 0 };
    game.buildings = [grave];
    game.corpses = [];
    plague.energy = 0;
    tickSettlers(1);
    const waitsForOrder = plague.energy === 0 && !hero.plagueGraveWorkActive;
    tickPlague(1);
    const normalGain = plague.energy;
    plague.energy = 0;
    mouse.x = grave.x; mouse.y = grave.y; handleCanvasClick();
    tickSettlers(1 / 60);
    const working = hero.activity === 'necromancy' && hero.plagueGraveWorkActive;
    tickPlague(1);
    const graveGain = plague.energy;
    plague.offer = ['grave_energy'];
    applyPlagueCardOffer();
    document.querySelector('#plague-card-offer .plague-upgrade-card').click();
    const upgradedMultiplier = plague.graveEnergyMultiplier;
    plague.energy = 0;
    tickPlague(1);
    const upgradedGain = plague.energy;
    mouse.x = hero.x + 100; mouse.y = hero.y + 100; handleCanvasClick();
    plague.energy = 0;
    tickPlague(1);
    const afterCancelGain = plague.energy;

    hero.x = grave.x; hero.y = grave.y;
    plague.energy = plague.maxEnergy - 0.1;
    mouse.x = grave.x; mouse.y = grave.y; handleCanvasClick();
    tickSettlers(1 / 60);
    tickPlague(1);
    const cappedEnergy = plague.energy;
    tickSettlers(1 / 60);
    document.getElementById('plague-upgrades-toggle').click();
    const graveStat = [...document.querySelectorAll('.plague-character-stat')]
      .find(row => row.querySelector('span').textContent === 'Из могилы');
    const graveStatValue = graveStat?.querySelector('b').textContent;
    document.getElementById('plague-upgrades-close').click();
    return {
      waitsForOrder, normalGain, working, graveGain, upgradedMultiplier, upgradedGain, afterCancelGain, cappedEnergy,
      maxEnergy: plague.maxEnergy, stoppedAtCapacity: hero.plagueGraveTarget === null, graveStatValue
    };
  });
  expect(result.waitsForOrder).toBe(true);
  expect(result.normalGain).toBe(0.25);
  expect(result.working).toBe(true);
  expect(result.graveGain).toBeCloseTo(0.275, 4);
  expect(result.upgradedMultiplier).toBeCloseTo(1.2, 4);
  expect(result.upgradedGain).toBeCloseTo(0.3, 4);
  expect(result.afterCancelGain).toBe(0.25);
  expect(result.cappedEnergy).toBe(result.maxEnergy);
  expect(result.stoppedAtCapacity).toBe(true);
  expect(result.graveStatValue).toBe('×1.20');
  expect(errors).toEqual([]);
});

test('Plague Necromancer stops grave work and follows a new map command', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(async () => {
    const { tickSettlers } = await import('/js/domains/colony/settlers/index.js');
    const hero = settlers.find(unit => unit.plagueHero);
    game.settlers = [hero];
    game.buildings = [{ type: 'grave', x: hero.x, y: hero.y, rest: 0 }];
    game.corpses = [];
    plague.energy = 0;
    const workSeconds = GAME_CONFIG.graveWork.seconds;
    mouse.x = game.buildings[0].x; mouse.y = game.buildings[0].y; handleCanvasClick();
    tickSettlers(workSeconds);
    const startedWorking = hero.plagueGraveWorkActive;
    const destination = { x: hero.x + 100, y: hero.y + 100 };
    mouse.x = destination.x; mouse.y = destination.y; handleCanvasClick();
    tickSettlers(workSeconds);
    return {
      startedWorking,
      stoppedWorking: !hero.plagueGraveWorkActive,
      cancelledGrave: hero.plagueGraveTarget === null,
      destination: hero.plagueMoveTarget,
      moving: hero.activity === 'plagueMove'
    };
  });
  expect(result.startedWorking).toBe(true);
  expect(result.stoppedWorking).toBe(true);
  expect(result.cancelledGrave).toBe(true);
  expect(result.destination).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  expect(result.moving).toBe(true);
  expect(errors).toEqual([]);
});

test('Plague revival shows a brief effect only after a successful resurrection', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(async () => {
    const { drawPlagueReviveEffects } = await import('/js/domains/factions/undead/index.js');
    const { tickPlague, updatePlagueHud } = await import('/js/modes/plague/plague.rules.js');
    const button = document.getElementById('plague-revive');
    const corpse = game.corpses.find(item => !item.pet);
    if (!corpse) throw new Error('Plague cemetery did not provide a corpse for the revival test');
    game.corpses = [];
    button.click();
    const failedReviveEffects = plague.reviveFx.length;
    corpse.x = settlers.find(unit => unit.plagueHero).x + 10;
    corpse.y = settlers.find(unit => unit.plagueHero).y;
    game.corpses = [corpse];
    plague.reviveTimer = 0;
    plague.energy = plague.maxEnergy;
    updatePlagueHud();
    button.click();
    let arcs = 0;
    const originalArc = ctx.arc;
    ctx.arc = function(...args) { arcs++; return originalArc.apply(this, args); };
    try { drawPlagueReviveEffects(); } finally { ctx.arc = originalArc; }
    const activeEffects = plague.reviveFx.length;
    tickPlague(0.3);
    const persistsDuringEffect = plague.reviveFx.length;
    tickPlague(0.4);
    return { failedReviveEffects, activeEffects, persistsDuringEffect, expiredEffects: plague.reviveFx.length, arcs };
  });
  expect(result.failedReviveEffects).toBe(0);
  expect(result.activeEffects).toBe(1);
  expect(result.persistsDuringEffect).toBe(1);
  expect(result.expiredEffects).toBe(0);
  expect(result.arcs).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Plague upgrade text fits on a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors = await openGame(page);
  await startPlague(page);
  await page.click('#plague-upgrades-toggle');
  const result = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.plague-character-stat')];
    return {
      viewportWidth: document.documentElement.clientWidth,
      overflowingRows: rows.filter(row => row.scrollWidth > row.clientWidth + 1).length,
      offscreenRows: rows.filter(row => row.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length
    };
  });
  expect(result).toEqual({ viewportWidth: 360, overflowingRows: 0, offscreenRows: 0 });
  expect(errors).toEqual([]);
});

test('Plague character stats close button stays intact on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 240, height: 800 });
  const errors = await openGame(page);
  await startPlague(page);
  await page.click('#plague-upgrades-toggle');
  const layout = await page.evaluate(() => {
    const title = document.querySelector('.plague-upgrades-heading h2').getBoundingClientRect();
    const close = document.getElementById('plague-upgrades-close').getBoundingClientRect();
    const icon = document.querySelector('#plague-upgrades-close .ic').getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      titleRight: title.right,
      closeLeft: close.left,
      closeRight: close.right,
      closeWidth: close.width,
      iconLeft: icon.left,
      iconRight: icon.right
    };
  });
  expect(layout.closeWidth).toBeGreaterThanOrEqual(36);
  expect(layout.titleRight).toBeLessThanOrEqual(layout.closeLeft);
  expect(layout.closeRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.iconLeft).toBeGreaterThanOrEqual(layout.closeLeft);
  expect(layout.iconRight).toBeLessThanOrEqual(layout.closeRight);
  expect(errors).toEqual([]);
});

test('Plague enemies switch from the Necromancer to a nearer squad member', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const switched = await page.evaluate(() => {
    const hero = settlers.find(unit => unit.plagueHero);
    const zombie = createSettler('zombie', 990, hero.x + 120, hero.y, { plagueUnit: true, masterId: hero.id });
    settlers.push(zombie);
    const group = { id: 990, aggroTarget: hero, aggroUntil: plague.elapsedTime + 8 };
    plague.groups.push(group);
    const enemy = { x: hero.x + 150, y: hero.y, plagueGroupId: group.id };
    return plagueEnemyTarget(enemy) === zombie;
  });
  expect(switched).toBe(true);
  expect(errors).toEqual([]);
});

test('Endless reapplies its selected wave and card settings after Plague', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('endless'));
  await page.click('[data-cards="off"]');
  await page.click('[data-wave-interval="custom"]');
  await page.locator('#wave-custom').fill('480');
  await page.locator('#wave-custom').dispatchEvent('change');
  await startPlague(page);
  await page.evaluate(() => exitToMainMenu());
  await page.click('#mode-endless');
  await page.click('#play-button');
  await page.waitForFunction(() => gameStarted && !loading && !plagueMode, null, { timeout: 60000 });
  const settings = await page.evaluate(() => ({ waveInterval, waveTimer, cardMode }));
  expect(settings).toMatchObject({ waveInterval: 480, cardMode: false });
  expect(settings.waveTimer).toBeGreaterThan(479.5);
  expect(errors).toEqual([]);
});

for (const viewport of [{ name: 'phone', width: 360, height: 800 }, { name: 'desktop', width: 1280, height: 800 }]) {
test(`Plague top stats show only icons and values on ${viewport.name}`, async ({ page }) => {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const errors = await openGame(page);
  await startPlague(page);
  const stats = await page.locator('.plague-stats').evaluate(panel => {
    const labels = [...panel.querySelectorAll('.plague-stat-label')];
    return {
      labelCount: labels.length,
      labelsRemainAccessible: labels.every(label => getComputedStyle(label).display !== 'none'),
      labelsTakeNoSpace: labels.every(label => label.getBoundingClientRect().width <= 1),
      energy: panel.querySelector('#plague-energy').textContent,
      values: [...panel.querySelectorAll('.plague-stat b')].slice(1).map(value => value.textContent),
      icons: panel.querySelectorAll('.plague-stat > .ic').length
    };
  });
  expect(stats).toEqual({
    labelCount: 3, labelsRemainAccessible: true, labelsTakeNoSpace: true,
    energy: expect.stringMatching(/^\d+\/30$/), values: ['0/8', '1', '0/5'], icons: 3
  });
  expect(errors).toEqual([]);
});
}

test('Plague keeps its own sides, midday and clear weather; Endless\'s come back after it (#404, 10, 11)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => { sides.player.faction = 'demons'; sides.enemy.faction = 'undead'; });
  await startPlague(page);
  const during = await page.evaluate(() => {
    isPaused = false;
    dayTime = 0; weather = { kind: 'rain', level: 1, left: 99, wind: 0, windTo: 0 };
    for (let f = 0; f < 120; f++) update(1 / 60);
    isPaused = true;
    return { player: sides.player.faction, enemy: sides.enemy.faction, night: isNight(), weather: getWeather().kind, hallBlight: isBlighted(townHall.x, townHall.y) };
  });
  expect(during).toEqual({ player: 'undead', enemy: 'humans', night: false, weather: 'clear', hallBlight: false });
  const after = await page.evaluate(() => { exitToMainMenu(); return { player: sides.player.faction, enemy: sides.enemy.faction }; });
  expect(after).toEqual({ player: 'demons', enemy: 'undead' });
  expect(errors).toEqual([]);
});

test('Plague menu: the default ranges or the player\'s own, kept to switch back and forth (#404, 13)', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => showMenuScreen('home'));
  await page.click('#mode-plague');
  const box = page.locator('[data-plague-range="interval"]');
  await expect(box.locator('.plague-range-fields')).toBeHidden();
  await box.locator('[data-plague-range-mode="custom"]').click();
  await expect(box.locator('.plague-range-fields')).toBeVisible();
  await box.locator('input').nth(0).fill('20');
  await box.locator('input').nth(1).fill('5'); // (the wrong way round: put right)
  await box.locator('input').nth(1).dispatchEvent('change');
  await box.locator('[data-plague-range-mode="default"]').click();
  await expect(box.locator('.plague-range-fields')).toBeHidden();
  const back = await page.evaluate(() => ({ ...plagueSettings.interval }));
  expect(back).toEqual({ custom: false, from: 5, to: 20 });
  await box.locator('[data-plague-range-mode="custom"]').click();
  expect(await box.locator('input').evaluateAll(inputs => inputs.map(i => i.value))).toEqual(['5', '20']);
  expect(errors).toEqual([]);
});

test('Plague saves are separate and available from its setup and pause menus', async ({ page }) => {
  const errors = await openGame(page);
  await page.evaluate(() => {
    localStorage.removeItem('sovereign-will-saves');
    localStorage.removeItem('sovereign-will-plagueSaves');
    showMenuScreen('home');
  });
  await page.click('#mode-plague');
  await expect(page.locator('#plague-open-saves')).toBeVisible();
  await page.click('#plague-open-saves');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(0);
  await page.click('[data-screen="saves"] [data-back]');
  await expect(page.locator('[data-screen="plague"]')).toBeVisible();

  await page.click('#plague-play');
  await page.waitForFunction(() => gameStarted && !loading && plagueMode, null, { timeout: 60000 });
  await page.click('#btn-pause-toggle');
  await expect(page.locator('#save-game-button')).toBeVisible();
  await page.evaluate(() => { game.plague.energy = 17; });
  await page.click('#save-game-button');
  await page.click('#save-new-button');
  await expect(page.locator('#save-status')).toContainText('Сохранено');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(1);
  expect(await page.evaluate(() => ({
    endless: localStorage.getItem('sovereign-will-saves'),
    plague: Object.keys(JSON.parse(localStorage.getItem('sovereign-will-plagueSaves'))).length
  }))).toEqual({ endless: null, plague: 1 });

  await page.click('[data-screen="saves"] [data-back]');
  await page.evaluate(() => { game.plague.energy = 2; });
  await page.click('#save-game-button');
  await page.click('#save-list [data-save]');
  await expect.poll(() => page.evaluate(() => [plagueMode, Math.floor(game.plague.energy), isPaused])).toEqual([true, 17, false]);
  await expect(page.locator('#card-offer')).toHaveCount(0);

  await page.click('#btn-pause-toggle');
  await page.click('#exit-to-menu-button');
  await page.click('#mode-plague');
  await page.click('#plague-open-saves');
  await expect(page.locator('#save-list [data-save]')).toHaveCount(1);
  await expect(page.locator('[data-screen="saves"] [data-back]')).toHaveAttribute('data-back-to', 'plague');
  await page.click('[data-screen="saves"] [data-back]');
  await expect(page.locator('[data-screen="plague"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Plague: the dead keep their weapons, a corpse shows its, arrows never run out, its own music by level (#404, 6, 7, 9, 14)', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const r = await page.evaluate(() => {
    const hero = settlers.find(s => s.plagueHero);
    const archer = createSettler('zombie', 991, hero.x + 30, hero.y, { plagueUnit: true, masterId: hero.id, weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers.push(archer);
    const en = createConfiguredEnemy({ x: hero.x + 200, y: hero.y }, 'raider'); enemies.push(en);
    archer.attackCooldown = 0;
    performAttack(archer, en.x, en.y);
    const lootBefore = loot.length;
    const swordsman = createSettler('zombie', 992, hero.x - 30, hero.y, { plagueUnit: true, role: 'soldier' });
    swordsman.weapon = 'iron_sword';
    dropSettlerLoot(swordsman);
    addCorpse(swordsman, 'settler', 'zombie');
    const original = ctx.drawImage;
    let drew = 0;
    ctx.drawImage = function (...args) { drew++; return original.apply(this, args); };
    try { drawCorpses(); } finally { ctx.drawImage = original; }
    const tracks = [1, 2, 6].map(cards => { plague.upgrades = { squad_size: cards - 1 }; return Object.keys(musicMix())[0]; });
    return { arrows: archer.arrows, loot: loot.length - lootBefore, corpseWeapon: corpses[corpses.length - 1].weapon, drew: drew > 0, tracks };
  });
  expect(r).toMatchObject({ arrows: 12, loot: 0, corpseWeapon: 'iron_sword', drew: true });
  expect(r.tracks).toEqual(['plague_jig', 'plague_waltz', 'plague_jig']);
  expect(errors).toEqual([]);
});

test('Plague cemetery corpses spawn on free cells around the grave', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(async () => {
    const { tickPlague } = await import('/js/modes/plague/plague.rules.js');
    const { isTileOccupied } = await import('/js/domains/economy/building/index.js');
    const cemetery = game.buildings.find(building => building.plagueCemetery);
    const initial = game.corpses.filter(corpse => corpse.plagueCemeteryId === cemetery.plagueCemeteryId);
    const initialCorpsesAreFree = initial.every(corpse => !isTileOccupied(corpse.x, corpse.y)) &&
      initial.every((corpse, i) => initial.slice(i + 1).every(other => Math.hypot(corpse.x - other.x, corpse.y - other.y) >= 22));
    game.corpses = game.corpses.filter(corpse => corpse.plagueCemeteryId !== cemetery.plagueCemeteryId ||
      corpse === initial[0]);
    const centre = getGridPos(cemetery.x, cemetery.y);
    const blockedRing = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = (centre.gx + dx) * TILE_SIZE + TILE_SIZE / 2;
      const y = (centre.gy + dy) * TILE_SIZE + TILE_SIZE / 2;
      if ((dx + dy) % 2) game.buildings.push({ type: 'wall_wood', x, y, hp: 100, maxHp: 100 });
      else game.waterTiles.push({ x, y });
      blockedRing.push({ x, y });
    }
    const adjacentRingIsBlocked = blockedRing.every(spot => isTileOccupied(spot.x, spot.y));
    cemetery.plagueCorpseTimer = 0;
    const before = new Set(game.corpses);
    tickPlague(1 / 60);
    const spawned = game.corpses.find(corpse => corpse.plagueCemeteryId === cemetery.plagueCemeteryId &&
      !before.has(corpse));
    const spawnedCell = spawned && getGridPos(spawned.x, spawned.y);
    return {
      initialCorpsesAreFree,
      adjacentRingIsBlocked,
      spawned: !!spawned,
      spawnedOnFreeCell: !!spawned && !isTileOccupied(spawned.x, spawned.y),
      spawnedOutsideBlockedRing: !!spawned && !blockedRing.some(spot => Math.hypot(spot.x - spawned.x, spot.y - spawned.y) < 22),
      withinFourCells: !!spawned && Math.max(Math.abs(spawnedCell.gx - centre.gx), Math.abs(spawnedCell.gy - centre.gy)) <= 4
    };
  });
  expect(result).toEqual({
    initialCorpsesAreFree: true,
    adjacentRingIsBlocked: true,
    spawned: true,
    spawnedOnFreeCell: true,
    spawnedOutsideBlockedRing: true,
    withinFourCells: true
  });
  expect(errors).toEqual([]);
});

test('Plague corpses fade away after their lifetime without worms', async ({ page }) => {
  const errors = await openGame(page);
  await startPlague(page);
  const result = await page.evaluate(() => {
    const life = GAME_CONFIG.corpses.seconds;
    const corpse = { x: townHall.x + 60, y: townHall.y + 60, radius: 11, side: 'settler', kind: 'zombie', age: life * 0.6, big: false, wormsTaken: false };
    corpses = [corpse];
    const original = ctx.lineTo;
    let wormLines = 0;
    ctx.lineTo = function (...args) {
      if (String(ctx.strokeStyle) === '#e91e63') wormLines++;
      return original.apply(this, args);
    };
    try { drawCorpses(); } finally { ctx.lineTo = original; }
    updateCorpses(life - corpse.age - 1);
    const remainsBeforeExpiry = corpses.length;
    updateCorpses(2);
    return { wormLines, remainsBeforeExpiry, remainsAfterExpiry: corpses.length };
  });
  expect(result).toEqual({ wormLines: 0, remainsBeforeExpiry: 1, remainsAfterExpiry: 0 });
  expect(errors).toEqual([]);
});
