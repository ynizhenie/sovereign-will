import { test, expect } from './helpers.mjs';

// The main menu's scenes (#256)
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.addInitScript(() => { try { localStorage.setItem('sovereign-will-language', 'ru'); } catch (e) { /* none */ } });
});
const opened = page => page.waitForFunction(() => document.getElementById('main-menu').classList.contains('lifted'));

test('each scene: the hunt, fishing by a campfire, a fight, a farm; and no blur behind the menu (#256)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await opened(page);
  expect(await page.locator('#main-menu .main-menu-content[data-screen="home"]').evaluate(el => getComputedStyle(el).animationDelay)).toBe('0.2s');
  expect(await page.evaluate(() => MENU_SCENES)).not.toContain('archers');
  expect(await page.evaluate(() => MENU_SCENES.includes(menuWorld.scene))).toBe(true); // (one at random)
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('gameCanvas')).filter)).not.toContain('blur');
  const scene = name => page.evaluate(name => {
    enterMenuWorld(name);
    const water = new Set(waterTiles.map(tile => `${tile.x},${tile.y}`));
    const sand = new Set([...game.desertTiles, ...game.beachTiles].map(tile => `${tile.x},${tile.y}`));
    const shoreViolations = Object.entries(GAME_CONFIG.mapResources).flatMap(([kind, definition]) =>
      (game[definition.list] || []).filter(resource => {
        const key = `${resource.x},${resource.y}`;
        return water.has(key) || (sand.has(key) && !['natural_rock', 'cactus', 'boulder', 'pebble'].includes(kind));
      }).map(() => kind));
    return {
      settlers: settlers.map(s => [s.weapon, s.tool, !!s.shield, s.armor || null, !!s.backpack, !!s.wateringCan]),
      buildings: buildings.map(b => b.type), water: waterTiles.length, fishing: waterTiles.filter(w => w.isFishing).length, zones: farmZones.length, boars: boars.length,
      terrain: { biome: menuWorld.terrain, desert: game.desertTiles.length, savanna: game.savannaTiles.length, total: game.COLS * game.ROWS },
      farmCrop: menuWorld.farmCrop, zoneCrops: [...new Set(farmZones.map(zone => zone.crop))],
      infiniteCropSeeds: stock[`${menuWorld.farmCrop}Seeds`] === Infinity,
      shoreViolations
    };
  }, name);
  const hunt = await scene('hunt');
  expect(hunt).toMatchObject({ settlers: [['spear', 'none', false, null, false, false]], boars: 3, shoreViolations: [] });
  expect(['grassland', 'savanna']).toContain(hunt.terrain.biome);
  expect(hunt.terrain.desert).toBe(0);
  expect(await scene('fishing')).toMatchObject({ settlers: [['fist', 'rod', false, null, false, false], ['fist', 'none', false, null, false, false]], buildings: ['campfire'], water: 4, fishing: 1, boars: 0, shoreViolations: [] });
  expect(await scene('fight')).toMatchObject({ settlers: [['sword', 'none', true, null, false, false], ['sword', 'none', true, null, false, false], ['fist', 'medbag', false, 'iron', false, false]], shoreViolations: [] });
  const farm = await scene('farm');
  expect(['wheat', 'rice']).toContain(farm.farmCrop);
  expect(farm.zoneCrops).toEqual([farm.farmCrop]);
  expect(farm).toMatchObject({ settlers: [['fist', 'hoe', false, null, true, true]], buildings: ['dung_heap'], water: 1, zones: 6, infiniteCropSeeds: true, shoreViolations: [] });
  const resizedFarm = await page.evaluate(() => { enterMenuWorld(); return { crop: menuWorld.farmCrop, terrain: menuWorld.terrain, zones: [...new Set(farmZones.map(zone => zone.crop))] }; });
  expect(resizedFarm).toEqual({ crop: farm.farmCrop, terrain: farm.terrain.biome, zones: [farm.farmCrop] });
  const loadFarm = value => page.evaluate(value => {
    const random = Math.random;
    try {
      Math.random = () => value;
      enterMenuWorld('farm');
      return {
        crop: menuWorld.farmCrop, zones: [...new Set(farmZones.map(zone => zone.crop))],
        wheatSeeds: stock.wheatSeeds === Infinity, riceSeeds: stock.riceSeeds === Infinity
      };
    } finally { Math.random = random; }
  }, value);
  expect(await loadFarm(0.25)).toEqual({ crop: 'wheat', zones: ['wheat'], wheatSeeds: true, riceSeeds: false });
  expect(await loadFarm(0.75)).toEqual({ crop: 'rice', zones: ['rice'], wheatSeeds: false, riceSeeds: true });
  // the farm runs: the farmer plants
  const farmRun = await page.evaluate(() => { for (let f = 0; f < 60 * 30; f++) stepGame(1 / 60); return { planted: farmPlots.length + blueprints.filter(b => b.type === menuWorld.farmCrop).length, infiniteCropSeeds: stock[`${menuWorld.farmCrop}Seeds`] === Infinity }; });
  expect(farmRun.planted).toBeGreaterThan(0);
  expect(farmRun.infiniteCropSeeds).toBe(true);
  expect(errors).toEqual([]);
});

test('all menu scenes roll grassland or savanna and the farm remains unobstructed', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    const withRoll = (scene, value) => {
      const random = Math.random;
      try {
        Math.random = () => { Math.random = random; return value; };
        enterMenuWorld(scene);
        return menuWorld.terrain;
      } finally { Math.random = random; }
    };
    const rolls = [[0.25, 'grassland'], [0.75, 'savanna']];
    const choices = Object.fromEntries(MENU_SCENES.map(scene =>
      [scene, rolls.map(([value]) => withRoll(scene, value))]
    ));
    withRoll('farm', 0.75);
    const savanna = new Set(game.savannaTiles.map(tile => `${Math.floor(tile.x / TILE_SIZE)},${Math.floor(tile.y / TILE_SIZE)}`));
    const onSavanna = (x, y) => {
      const gx = Math.floor(x / TILE_SIZE), gy = Math.floor(y / TILE_SIZE);
      return savanna.has(`${gx},${gy}`);
    };
    const fieldClear = farmZones.every(zone => !Object.values(GAME_CONFIG.mapResources).some(definition =>
      (game[definition.list] || []).some(resource =>
        Math.floor(resource.x / TILE_SIZE) === Math.floor(zone.x / TILE_SIZE) &&
        Math.floor(resource.y / TILE_SIZE) === Math.floor(zone.y / TILE_SIZE)
      )
    ));
    return {
      choices,
      farm: {
        terrain: menuWorld.terrain,
        desertTiles: game.desertTiles.length,
        savannaTiles: game.savannaTiles.length,
        totalTiles: game.COLS * game.ROWS,
        waterOnSavanna: waterTiles.every(tile => onSavanna(tile.x, tile.y)),
        plotsOnSavanna: farmZones.every(zone => onSavanna(zone.x, zone.y)),
        warehouseOnSavanna: onSavanna(townHall.x, townHall.y),
        fieldClear
      }
    };
  });
  for (const scene of ['hunt', 'fishing', 'fight', 'farm', 'demon', 'graveyard']) {
    expect(result.choices[scene]).toEqual(['grassland', 'savanna']);
  }
  expect(result.farm).toEqual({
    terrain: 'savanna', desertTiles: 0, savannaTiles: result.farm.totalTiles, totalTiles: result.farm.totalTiles,
    waterOnSavanna: true, plotsOnSavanna: true, warehouseOnSavanna: true, fieldClear: true
  });
});

test('the menu farm keeps working when Endless is set to the undead', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    setSideFaction('player', 'undead');
    enterMenuWorld('farm');
    for (let f = 0; f < 60 * 30; f++) stepGame(1 / 60);
    const scene = {
      configuredFaction: sides.player.faction,
      sceneFaction: getPlayerFaction().id,
      planted: farmPlots.length + blueprints.filter(b => b.type === 'wheat').length,
      cropNeedsBones: !!GAME_CONFIG.buildings.wheat.cost.bones
    };
    resetGame();
    return {
      ...scene,
      newGameFaction: getPlayerFaction().id,
      newGameCropNeedsBones: !!GAME_CONFIG.buildings.wheat.cost.bones
    };
  });
  expect(result.configuredFaction).toBe('undead');
  expect(result.sceneFaction).toBe('humans');
  expect(result.planted).toBeGreaterThan(0);
  expect(result.cropNeedsBones).toBe(false);
  expect(result.newGameFaction).toBe('undead');
  expect(result.newGameCropNeedsBones).toBe(true);
});

test('menu hunt boars and fishing grass reappear faster', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('hunt');
    game.settlers.splice(0);
    game.boars.splice(0);
    game.boarRespawnTimer = 25;
    for (let frame = 0; frame < 60 * 9; frame++) stepGame(1 / 60);
    const boarsAfter = game.boars.length;

    enterMenuWorld('fishing');
    game.settlers.splice(0);
    game.grassList.splice(0);
    game.pendingRespawns.splice(0);
    scheduleRespawn('grass');
    const grassDelay = game.pendingRespawns[0].timer;
    for (let frame = 0; frame < 60 * 9; frame++) stepGame(1 / 60);
    return { boarsAfter, grassDelay, grassAfter: game.grassList.length };
  });
  expect(result.boarsAfter).toBeGreaterThan(0);
  expect(result.grassDelay).toBeLessThanOrEqual(8);
  expect(result.grassAfter).toBeGreaterThan(0);
});

test('graveyard menu scene has ghosts and a necromancer working its graves', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    const random = Math.random;
    try {
      Math.random = () => { Math.random = random; return 0.9; };
      enterMenuWorld('graveyard');
    } finally { Math.random = random; }
    const initial = {
      scene: menuWorld.scene,
      faction: getPlayerFaction().id,
      playerColorInPalette: GAME_CONFIG.factionColors.includes(menuWorld.playerColor),
      hall: getPlayerFaction().hall,
      desertTiles: game.desertTiles.length,
      savannaTiles: game.savannaTiles.length,
      totalTiles: game.COLS * game.ROWS,
      cacti: game.cacti.length,
      pebbles: game.pebbles.length,
      trees: game.trees.length,
      grass: game.grassList.length,
      graves: buildings.filter(building => building.type === 'grave').length,
      gravesHavePassages: buildings.filter(building => building.type === 'grave').every((grave, i, graves) =>
        graves.slice(i + 1).every(other =>
          Math.max(Math.abs(Math.floor(grave.x / TILE_SIZE) - Math.floor(other.x / TILE_SIZE)),
            Math.abs(Math.floor(grave.y / TILE_SIZE) - Math.floor(other.y / TILE_SIZE))) > 1
        )
      ),
      resourceOverlaps: buildings.filter(building => building.type === 'grave').flatMap(grave => {
        const gx = Math.floor(grave.x / TILE_SIZE), gy = Math.floor(grave.y / TILE_SIZE);
        return Object.values(GAME_CONFIG.mapResources).flatMap(definition =>
          (game[definition.list] || []).filter(resource =>
            Math.floor(resource.x / TILE_SIZE) === gx && Math.floor(resource.y / TILE_SIZE) === gy
          ).map(() => definition.list)
        );
      }),
      necromancers: settlers.filter(settler => settler.tool === 'necro_staff').length,
      necromancerType: settlers.find(settler => settler.tool === 'necro_staff')?.type,
      soulLantern: !!settlers.find(settler => settler.tool === 'necro_staff')?.soul_lantern,
      ghosts: settlers.filter(settler => settler.type === 'ghost').length,
      bones: stock.bones,
      rot: stock.rot
    };
    for (let frame = 0; frame < 60 * 30; frame++) stepGame(1 / 60);
    const necromancer = settlers.find(settler => settler.tool === 'necro_staff');
    const ghost = settlers.find(settler => settler.type === 'ghost');
    const restingGraves = buildings.filter(building => building.type === 'grave' && building.rest > 0).length;
    const graves = buildings.filter(building => building.type === 'grave');
    necromancer.graveTarget = null;
    necromancer.lastGraveTarget = graves[0];
    for (const grave of graves) grave.rest = 100;
    stepGame(1 / 60);
    return {
      ...initial,
      ghostEscortsNecromancer: ghost?.escort === necromancer,
      bonesAfter: stock.bones,
      rotAfter: stock.rot,
      restingGraves,
      worksRestingGrave: necromancer.graveTarget?.rest > 0,
      avoidsLastGrave: necromancer.graveTarget !== graves[0]
    };
  });
  expect(result).toMatchObject({
    scene: 'graveyard', faction: 'undead', playerColorInPalette: true,
    hall: 'graveyard', graves: 8, gravesHavePassages: true, resourceOverlaps: [],
    cacti: 0, pebbles: 0, trees: 7, grass: 7,
    necromancers: 1, necromancerType: 'zombie', soulLantern: true,
    ghosts: 1, ghostEscortsNecromancer: true, bones: 0, rot: 0,
    worksRestingGrave: true, avoidsLastGrave: true
  });
  expect(result.desertTiles).toBe(0);
  expect(result.savannaTiles).toBe(result.totalTiles);
  expect(result.bonesAfter).toBeGreaterThan(0);
  expect(result.rotAfter).toBeGreaterThan(0);
  expect(result.restingGraves).toBeGreaterThan(1);
});

test("graveyard outpost does not display the necromancer's stored resources", async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const drawnIcons = await page.evaluate(() => {
    enterMenuWorld('graveyard');
    stock.bones = 10;
    stock.rot = 10;
    const drawImage = ctx.drawImage;
    let count = 0;
    try {
      ctx.drawImage = () => { count++; };
      drawStoreContents();
      return count;
    } finally {
      ctx.drawImage = drawImage;
    }
  });
  expect(drawnIcons).toBe(0);
});

test('the fight: zombies keep coming; a tapped one falls; the squad gone, a new one comes (#256)', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  expect(await page.evaluate(() => { enterMenuWorld('fight'); return game.menuScene; })).toBe('fight');
  // (the most seen at once: the squad may just have cut down every one at the end, a race under load)
  expect(await page.evaluate(() => { let most = 0; for (let f = 0; f < 60 * 12; f++) { stepGame(1 / 60); most = Math.max(most, enemies.length); } return most; })).toBeGreaterThan(0);
  // a zombie tapped (one put under the tap)
  await page.evaluate(() => {
    isPaused = true;
    const en = enemies[0] || createConfiguredEnemy({ x: camera.x, y: camera.y }, 'undead_zombie');
    if (!enemies.includes(en)) enemies.push(en);
    en.x = camera.x; en.y = camera.y;
  });
  await page.evaluate(() => { menuWorldTap(...(() => { const rect = canvas.getBoundingClientRect(); return [rect.left + rect.width / 2, rect.top + rect.height / 2]; })()); });
  expect(await page.evaluate(() => enemies.filter(en => en.hp <= 0).length)).toBeGreaterThan(0);
  // all fall: a new squad a moment later, the dead cleared
  const back = await page.evaluate(() => {
    enterMenuWorld('fight'); // reset random combat casualties before checking the respawn
    isPaused = false;
    settlers.forEach(s => { s.hp = 0; });
    let gone = false;
    for (let f = 0; f < 60 * 5; f++) { stepGame(1 / 60); if (!settlers.length) gone = true; }
    return { gone, settlers: settlers.length, corpses: corpses.length };
  });
  expect(back).toEqual({ gone: true, settlers: 3, corpses: 0 });
});

test('menu fight squads grow with player levels and demon levels', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(async () => {
    const { setUnitExperience } = await import('/js/domains/colony/settlers/index.js');
    enterMenuWorld('fight');
    const spawnZombieGroup = () => {
      enemies = [];
      menuWorld.fight.next = 0;
      stepGame(1 / 60);
      return enemies.length;
    };
    setUnitExperience(settlers[0], 10, 'melee');
    const oneLevel = spawnZombieGroup();
    setUnitExperience(settlers[1], 10, 'melee');
    const twoLevels = spawnZombieGroup();
    setUnitExperience(settlers[0], 25, 'melee');
    const threeLevels = spawnZombieGroup();

    enterMenuWorld('demon');
    const demon = settlers[0];
    const spawnDemonGroup = () => {
      const random = Math.random;
      try {
        Math.random = () => 0;
        enemies = [];
        menuWorld.demonFight.awaitingMeal = false;
        menuWorld.demonFight.next = 0;
        stepGame(1 / 60);
        return enemies.length;
      } finally { Math.random = random; }
    };
    setUnitExperience(demon, 10, 'melee');
    const demonLevelTwo = spawnDemonGroup();
    setUnitExperience(demon, 25, 'melee');
    const demonLevelThree = spawnDemonGroup();
    return { oneLevel, twoLevels, threeLevels, demonLevelTwo, demonLevelThree };
  });
  expect(result).toEqual({ oneLevel: 2, twoLevels: 2, threeLevels: 3, demonLevelTwo: 5, demonLevelThree: 7 });
});

test('destroyed fight outpost is restored when the scene restarts', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('fight');
    settlers.length = 0;
    townHall.hp = 1;
    const attacker = createConfiguredEnemy({ x: townHall.x + 25, y: townHall.y }, 'undead_zombie');
    attacker.speed = 0;
    enemies.push(attacker);
    for (let frame = 0; frame < 60 * 2 && townHall.hp > 0; frame++) stepGame(1 / 60);
    const destroyed = townHall.hp <= 0;
    for (let frame = 0; frame < 60 * 4; frame++) stepGame(1 / 60);
    return { destroyed, hp: townHall.hp, maxHp: townHall.maxHp, settlers: settlers.length, enemies: enemies.length };
  });
  expect(result.destroyed).toBe(true);
  expect(result).toMatchObject({ hp: 300, maxHp: 300, settlers: 3, enemies: 0 });
});

test('damaged menu outpost has contained damage marks and a nearby health bar', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(async () => {
    const { drawDamage, drawMenuOutpostHealthBar } = await import('/js/domains/economy/building/building.draw.js');
    enterMenuWorld('fight');
    townHall.hp = townHall.maxHp / 2;
    const fills = [];
    const fillRect = ctx.fillRect;
    ctx.fillRect = function (x, y, width, height) {
      fills.push([x, y, width, height]);
      return fillRect.call(this, x, y, width, height);
    };
    try { drawMenuOutpostHealthBar(); }
    finally { ctx.fillRect = fillRect; }

    const path = [];
    let damageClip;
    const beginPath = ctx.beginPath, moveTo = ctx.moveTo, lineTo = ctx.lineTo, clip = ctx.clip;
    ctx.beginPath = function () { path.length = 0; return beginPath.call(this); };
    ctx.moveTo = function (x, y) { path.push([x, y]); return moveTo.call(this, x, y); };
    ctx.lineTo = function (x, y) { path.push([x, y]); return lineTo.call(this, x, y); };
    ctx.clip = function () { damageClip = path.slice(); return clip.call(this); };
    try { drawDamage(150, 130, 20, 0.2, 'outpost-human'); }
    finally {
      ctx.beginPath = beginPath; ctx.moveTo = moveTo; ctx.lineTo = lineTo; ctx.clip = clip;
    }
    return { fills, damageClip, x: townHall.x, y: townHall.y };
  });
  expect(result.fills).toEqual([
    [result.x - 24, result.y - 38, 48, 6],
    [result.x - 24, result.y - 38, 24, 6]
  ]);
  expect(result.damageClip).toEqual([[133, 117], [136, 113], [164, 113], [167, 117], [167, 144], [166, 146], [134, 146], [133, 144]]);
});

test('menu scenes use random distinct side colours and their fixed difficulties', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const { palette, baseHp, scenes } = await page.evaluate(() => ({
    palette: GAME_CONFIG.factionColors,
    baseHp: GAME_CONFIG.settlerTypes.normal.hp,
    scenes: MENU_SCENES.map(scene => {
      enterMenuWorld(scene);
      const enemy = createConfiguredEnemy({ x: townHall.x, y: townHall.y }, 'raider_archer');
      return {
        scene,
        playerColor: getSettlerColor(),
        enemyColor: getEnemyColor(null),
        enemyHp: enemy.maxHp,
        hallHp: townHall.hp,
        hallMaxHp: townHall.maxHp
      };
    })
  }));
  for (const scene of scenes) {
    expect(palette).toContain(scene.playerColor);
    expect(palette).toContain(scene.enemyColor);
    expect(scene.playerColor).not.toBe(scene.enemyColor);
    expect(scene.enemyHp).toBeCloseTo(baseHp * 0.75);
    const hp = scene.scene === 'fight' || scene.scene === 'demon' ? 300 : Infinity;
    expect(scene.hallHp).toBe(hp);
    expect(scene.hallMaxHp).toBe(hp);
  }
});

test('graveyard scene chooses its faction colour from the menu palette', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    const colorFor = value => {
      const random = Math.random;
      try {
        Math.random = () => value;
        enterMenuWorld('hunt');
        enterMenuWorld('graveyard');
        return menuWorld.playerColor;
      } finally { Math.random = random; }
    };
    return {
      palette: GAME_CONFIG.factionColors,
      first: colorFor(0.1),
      second: colorFor(0.9)
    };
  });
  expect(result.palette).toContain(result.first);
  expect(result.palette).toContain(result.second);
  expect(result.first).not.toBe(result.second);
});

test('only the zombie and demon scenes allow tapping enemies to defeat them', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    const tapEnemy = enemy => {
      enemy.x = camera.x;
      enemy.y = camera.y;
      const rect = canvas.getBoundingClientRect();
      menuWorldTap(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return enemy.hp;
    };
    enterMenuWorld('demon');
    const human = createConfiguredEnemy({ x: camera.x, y: camera.y }, 'raider');
    enemies.push(human);
    const humanAfterTap = tapEnemy(human);
    return { humanAfterTap };
  });
  expect(result.humanAfterTap).toBe(0);
});

test('the demon keeps fighting until all attackers are defeated', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('demon');
    const demon = settlers[0];
    const attackers = [
      createConfiguredEnemy({ x: demon.x + 140, y: demon.y }, 'raider'),
      createConfiguredEnemy({ x: demon.x + 300, y: demon.y }, 'raider_archer')
    ];
    attackers.forEach(enemy => {
      enemy.attackTarget = demon;
      enemy.menuThreat = true;
      enemy.speed = 0;
      enemy.damage = 0;
      enemy.attackCooldown = 1000;
      enemies.push(enemy);
    });
    let prematurePatrol = false;
    for (let frame = 0; frame < 60 * 30; frame++) {
      stepGame(1 / 60);
      if (attackers.some(enemy => enemy.hp > 0) && demon.patrolTarget) prematurePatrol = true;
      if (attackers.every(enemy => enemy.hp <= 0)) break;
    }
    return {
      allDefeated: attackers.every(enemy => enemy.hp <= 0),
      prematurePatrol,
      demonAlive: demon.hp > 0
    };
  });
  expect(result.allDefeated).toBe(true);
  expect(result.prematurePatrol).toBe(false);
  expect(result.demonAlive).toBe(true);
});

test('the demon waits near the outpost until the whole group enters view', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('demon');
    const demon = settlers[0];
    let sawStagedGroup = false, sawStagedOutsideView = false, maxDistanceWhileStaged = 0;
    let groupVisibleBeforeFight = false, allStayedInsideView = true;
    for (let frame = 0; frame < 60 * 30; frame++) {
      stepGame(1 / 60);
      const living = enemies.filter(enemy => enemy.hp > 0);
      if (living.length && living.some(enemy => enemy.menuStaged)) {
        sawStagedGroup = true;
        const width = canvas.width / screenPixelRatio / MENU_WORLD.cssScale;
        const height = canvas.height / screenPixelRatio / MENU_WORLD.cssScale;
        sawStagedOutsideView = sawStagedOutsideView || living.some(enemy => enemy.menuStaged &&
          (Math.abs(enemy.x - camera.x) > width / 2 || Math.abs(enemy.y - camera.y) > height / 2));
        maxDistanceWhileStaged = Math.max(maxDistanceWhileStaged, Math.hypot(demon.x - townHall.x, demon.y - townHall.y));
      }
      if (living.length && living.every(enemy => !enemy.menuStaged)) {
        const width = canvas.width / screenPixelRatio / MENU_WORLD.cssScale;
        const height = canvas.height / screenPixelRatio / MENU_WORLD.cssScale;
        const margin = unit => unit.radius + 24;
        groupVisibleBeforeFight = living.every(enemy =>
          Math.abs(enemy.x - camera.x) <= width / 2 - margin(enemy) &&
          Math.abs(enemy.y - camera.y) <= height / 2 - margin(enemy));
        for (let fightFrame = 0; fightFrame < 60 * 10; fightFrame++) {
          stepGame(1 / 60);
          const fighters = [...settlers, ...enemies].filter(unit => unit.hp > 0);
          allStayedInsideView = allStayedInsideView && fighters.every(unit =>
            Math.abs(unit.x - camera.x) <= width / 2 - margin(unit) &&
            Math.abs(unit.y - camera.y) <= height / 2 - margin(unit));
        }
        break;
      }
    }
    return { sawStagedGroup, sawStagedOutsideView, maxDistanceWhileStaged, groupVisibleBeforeFight, allStayedInsideView };
  });
  expect(result.sawStagedGroup).toBe(true);
  expect(result.sawStagedOutsideView).toBe(true);
  expect(result.maxDistanceWhileStaged).toBeLessThan(200);
  expect(result.groupVisibleBeforeFight).toBe(true);
  expect(result.allStayedInsideView).toBe(true);
});

test('demon reinforcements choose an entry tile clear of trees and stones', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('demon');
    menuWorld.demonFight.next = 0;
    const width = canvas.width / screenPixelRatio / MENU_WORLD.cssScale;
    const height = canvas.height / screenPixelRatio / MENU_WORLD.cssScale;
    const rawX = camera.x - width / 2 + 64;
    const rawY = camera.y - height / 2 + 64;
    const blockedX = Math.floor(rawX / 30), blockedY = Math.floor(rawY / 30);
    const blockedTiles = [{ x: blockedX, y: blockedY }, { x: blockedX, y: blockedY + 1 }];
    trees.push({ ...trees[0], x: blockedTiles[0].x * 30 + 15, y: blockedTiles[0].y * 30 + 15 });
    boulders.push({ ...boulders[0], x: blockedTiles[1].x * 30 + 15, y: blockedTiles[1].y * 30 + 15 });

    const random = Math.random;
    Math.random = () => 0;
    try { stepGame(1 / 60); } finally { Math.random = random; }
    return {
      groupSpawned: enemies.length > 0,
      blockedTiles,
      targets: enemies.map(enemy => enemy.menuEntryTarget && [Math.floor(enemy.menuEntryTarget.x / 30), Math.floor(enemy.menuEntryTarget.y / 30)]),
      targetsAvoidObjects: enemies.every(enemy => enemy.menuEntryTarget && blockedTiles.every(tile =>
        Math.floor(enemy.menuEntryTarget.x / 30) !== tile.x || Math.floor(enemy.menuEntryTarget.y / 30) !== tile.y))
    };
  });
  expect(result.groupSpawned).toBe(true);
  expect(result.targetsAvoidObjects, JSON.stringify(result)).toBe(true);
});

test('the demon menu scene: full health, varied human waves, and a meal before they return', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const initial = await page.evaluate(() => {
    enterMenuWorld('demon');
    const demon = settlers[0];
    return {
      scene: menuWorld.scene, playerFaction: getPlayerFaction().id, enemyFaction: getEnemyFaction().id,
      type: demon.type, weapon: demon.weapon, armor: demon.armor, role: demon.role,
      fullHealth: demon.hp === demon.maxHp, enemies: enemies.length, outpostHp: townHall.hp
    };
  });
  expect(initial).toEqual({
    scene: 'demon', playerFaction: 'demons', enemyFaction: 'humans',
    type: 'demon', weapon: 'iron_sword', armor: 'iron', role: 'soldier', fullHealth: true, enemies: 0, outpostHp: 300
  });

  const result = await page.evaluate(() => {
    let sawEating = false, chasedAttacker = false, firstGroup = null, secondGroup = null, patrolDistance = 0, outpostDamaged = false;
    const outpostHp = townHall.hp;
    for (let frame = 0; frame < 60 * 90; frame++) {
      if (settlers[0]?.eatTimer > 0) sawEating = true;
      stepGame(1 / 60);
      const demon = settlers.find(s => s.type === 'demon');
      if (demon?.eatTimer > 0) sawEating = true;
      if (demon?.lastAttacker && enemies.includes(demon.lastAttacker) &&
          game.pathTick - demon.lastAttackedTick < 90 && demon.patrolTarget == null) chasedAttacker = true;
      if (!enemies.length && demon) patrolDistance = Math.max(patrolDistance, Math.hypot(demon.x - townHall.x, demon.y - townHall.y));
      if (townHall.hp < outpostHp) outpostDamaged = true;
      const summarizeGroup = () => ({
        units: enemies.map(enemy => ({ enemyKey: enemy.enemyKey, weapon: enemy.weapon, armor: enemy.armor || null })),
        targetsDemon: enemies.every(enemy => enemy.attackTarget === demon),
        hp: demon.hp, maxHp: demon.maxHp
      });
      if (menuWorld.demonFight.groups === 1 && !firstGroup) firstGroup = summarizeGroup();
      if (menuWorld.demonFight.groups === 2) {
        secondGroup = summarizeGroup();
        for (let extraFrame = 0; extraFrame < 60 * 12; extraFrame++) {
          stepGame(1 / 60);
          if (townHall.hp < outpostHp) outpostDamaged = true;
        }
        break;
      }
    }
    return { sawEating, chasedAttacker, firstGroup, secondGroup, patrolDistance, outpostDamaged };
  });
  const checkGroup = group => {
    expect(group.units.length).toBeGreaterThanOrEqual(3);
    expect(group.units.length).toBeLessThanOrEqual(9);
    expect(group.units.filter(unit => unit.enemyKey === 'raider_medic_club').length).toBeGreaterThanOrEqual(1);
    expect(group.units.filter(unit => unit.enemyKey === 'raider_archer').length).toBeLessThanOrEqual(2);
    expect(group.units.every(unit => unit.weapon !== 'fist')).toBe(true);
    expect(group.units.some(unit => unit.armor === 'leather')).toBe(true);
  };
  expect(result.sawEating).toBe(true);
  expect(result.chasedAttacker).toBe(true);
  expect(result.patrolDistance).toBeGreaterThan(100);
  expect(result.firstGroup).not.toBeNull();
  checkGroup(result.firstGroup);
  expect(result.firstGroup.targetsDemon).toBe(true);
  expect(result.secondGroup).not.toBeNull();
  checkGroup(result.secondGroup);
  expect(result.secondGroup.hp).toBe(result.secondGroup.maxHp);
  expect(result.secondGroup.targetsDemon).toBe(true);
  expect(result.outpostDamaged).toBe(false);
});

test('the defeated demon scene keeps humans until it restarts', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('demon');
    for (let frame = 0; frame < 60 * 3 && !enemies.length; frame++) stepGame(1 / 60);
    const countAtDefeat = enemies.length;
    townHall.hp = 100;
    settlers[0].hp = 0;
    stepGame(1 / 60);
    const countAfterDefeat = enemies.length;
    for (let frame = 0; frame < 60 * 2.5; frame++) stepGame(1 / 60);
    const countDuringLoss = enemies.length;
    const outpostHpDuringLoss = townHall.hp;
    for (let frame = 0; frame < 60; frame++) stepGame(1 / 60);
    return {
      countAtDefeat, countAfterDefeat, countDuringLoss, outpostHpDuringLoss,
      outpostHpAfterRestart: townHall.hp,
      countAfterRestart: enemies.length,
      demonRestored: settlers.some(demon => demon.type === 'demon' && demon.hp === demon.maxHp)
    };
  });
  expect(result.countAtDefeat).toBeGreaterThan(0);
  expect(result.countAfterDefeat).toBe(result.countAtDefeat);
  expect(result.countDuringLoss).toBe(result.countAtDefeat);
  expect(result.outpostHpDuringLoss).toBe(100);
  expect(result.outpostHpAfterRestart).toBe(300);
  expect(result.countAfterRestart).toBe(0);
  expect(result.demonRestored).toBe(true);
});

test('the menu put away to watch, the scene changed there, the menu brought back (#256)', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  await page.evaluate(() => enterMenuWorld('hunt'));
  await expect(page.locator('#menu-eye-box #menu-hide')).toBeVisible();
  expect(await page.locator('#menu-hide').evaluate(button => button.parentElement.id)).toBe('menu-eye-box');
  expect(await page.locator('#menu-eye-box').evaluate(box => getComputedStyle(box).right)).toBe('12px');
  const controlSizes = await page.evaluate(() => {
    const bounds = selector => {
      const { width, height } = document.querySelector(selector).getBoundingClientRect();
      return { width, height };
    };
    return { eye: bounds('#menu-hide'), flag: bounds('#menu-flags .flag-button') };
  });
  expect(controlSizes.eye).toEqual(controlSizes.flag);
  await page.click('#menu-hide');
  await expect(page.locator('#main-menu .main-menu-content[data-screen="home"]')).toBeHidden();
  await expect(page.locator('#menu-scene-bar')).toBeVisible();
  await page.click('#menu-next-scene');
  expect(await page.evaluate(() => menuWorld.scene)).toBe('fishing');
  expect(await page.evaluate(() => chunkStats())).toMatchObject({ pending: 0, holes: 0 });
  await page.click('#menu-show');
  await expect(page.locator('#main-menu .main-menu-content[data-screen="home"]')).toBeVisible();
  await expect(page.locator('#menu-scene-bar')).toBeHidden();
});
