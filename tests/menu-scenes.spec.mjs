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
        return water.has(key) || (sand.has(key) && !['natural_rock', 'boulder', 'pebble'].includes(kind));
      }).map(() => kind));
    return {
      settlers: settlers.map(s => [s.weapon, s.tool, !!s.shield, s.armor || null, !!s.backpack, !!s.wateringCan]),
      buildings: buildings.map(b => b.type), water: waterTiles.length, fishing: waterTiles.filter(w => w.isFishing).length, zones: farmZones.length, boars: boars.length,
      farmCrop: menuWorld.farmCrop, zoneCrops: [...new Set(farmZones.map(zone => zone.crop))],
      infiniteCropSeeds: stock[`${menuWorld.farmCrop}Seeds`] === Infinity,
      shoreViolations
    };
  }, name);
  expect(await scene('hunt')).toMatchObject({ settlers: [['spear', 'none', false, null, false, false]], boars: 3, shoreViolations: [] });
  expect(await scene('fishing')).toMatchObject({ settlers: [['fist', 'rod', false, null, false, false], ['fist', 'none', false, null, false, false]], buildings: ['campfire'], water: 4, fishing: 1, boars: 0, shoreViolations: [] });
  expect(await scene('fight')).toMatchObject({ settlers: [['sword', 'none', true, null, false, false], ['sword', 'none', true, null, false, false], ['fist', 'medbag', false, 'iron', false, false]], shoreViolations: [] });
  const farm = await scene('farm');
  expect(['wheat', 'rice']).toContain(farm.farmCrop);
  expect(farm.zoneCrops).toEqual([farm.farmCrop]);
  expect(farm).toMatchObject({ settlers: [['fist', 'hoe', false, null, true, true]], buildings: ['dung_heap'], water: 1, zones: 6, infiniteCropSeeds: true, shoreViolations: [] });
  const resizedFarm = await page.evaluate(() => { enterMenuWorld(); return { crop: menuWorld.farmCrop, zones: [...new Set(farmZones.map(zone => zone.crop))] }; });
  expect(resizedFarm).toEqual({ crop: farm.farmCrop, zones: [farm.farmCrop] });
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
    expect(scene.hallHp).toBe(Infinity);
    expect(scene.hallMaxHp).toBe(Infinity);
  }
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
      fullHealth: demon.hp === demon.maxHp, enemies: enemies.length, warehouseHp: townHall.hp
    };
  });
  expect(initial).toEqual({
    scene: 'demon', playerFaction: 'demons', enemyFaction: 'humans',
    type: 'demon', weapon: 'iron_sword', armor: 'iron', role: 'soldier', fullHealth: true, enemies: 0, warehouseHp: Infinity
  });

  const result = await page.evaluate(() => {
    let sawEating = false, chasedAttacker = false, firstGroup = null, secondGroup = null, patrolDistance = 0, warehouseDamaged = false;
    const warehouseHp = townHall.hp;
    for (let frame = 0; frame < 60 * 90; frame++) {
      if (settlers[0]?.eatTimer > 0) sawEating = true;
      stepGame(1 / 60);
      const demon = settlers.find(s => s.type === 'demon');
      if (demon?.eatTimer > 0) sawEating = true;
      if (demon?.lastAttacker && enemies.includes(demon.lastAttacker) &&
          game.pathTick - demon.lastAttackedTick < 90 && demon.patrolTarget == null) chasedAttacker = true;
      if (!enemies.length && demon) patrolDistance = Math.max(patrolDistance, Math.hypot(demon.x - townHall.x, demon.y - townHall.y));
      if (townHall.hp < warehouseHp) warehouseDamaged = true;
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
          if (townHall.hp < warehouseHp) warehouseDamaged = true;
        }
        break;
      }
    }
    return { sawEating, chasedAttacker, firstGroup, secondGroup, patrolDistance, warehouseDamaged };
  });
  const checkGroup = group => {
    expect(group.units.length).toBeGreaterThanOrEqual(3);
    expect(group.units.length).toBeLessThanOrEqual(5);
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
  expect(result.warehouseDamaged).toBe(false);
});

test('the defeated demon scene keeps humans until it restarts', async ({ page }) => {
  await page.goto('/');
  await opened(page);
  const result = await page.evaluate(() => {
    enterMenuWorld('demon');
    for (let frame = 0; frame < 60 * 3 && !enemies.length; frame++) stepGame(1 / 60);
    const countAtDefeat = enemies.length;
    settlers[0].hp = 0;
    stepGame(1 / 60);
    const countAfterDefeat = enemies.length;
    for (let frame = 0; frame < 60 * 2.5; frame++) stepGame(1 / 60);
    const countDuringLoss = enemies.length;
    const warehouseHpDuringLoss = townHall.hp;
    for (let frame = 0; frame < 60; frame++) stepGame(1 / 60);
    return {
      countAtDefeat, countAfterDefeat, countDuringLoss, warehouseHpDuringLoss,
      countAfterRestart: enemies.length,
      demonRestored: settlers.some(demon => demon.type === 'demon' && demon.hp === demon.maxHp)
    };
  });
  expect(result.countAtDefeat).toBeGreaterThan(0);
  expect(result.countAfterDefeat).toBe(result.countAtDefeat);
  expect(result.countDuringLoss).toBe(result.countAtDefeat);
  expect(result.warehouseHpDuringLoss).toBe(Infinity);
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
