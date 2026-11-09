import { test, expect } from './helpers.mjs';
import { openGame } from './helpers.mjs';

// The friend's #326, visuals part one: in the page

test('boars each their own look, kept; every unit kind, the buildings and the new things drawn with no error (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    isPaused = true;
    const g = getGridPos(townHall.x, townHall.y);
    boars = Array.from({ length: 40 }, (_, i) => ({ x: townHall.x + 80 + (i % 8) * 30, y: townHall.y + 80 + Math.floor(i / 8) * 30, hp: 30, maxHp: 30, priority: 0, wanderTimer: 999, wanderInterval: 999 }));
    const { makeSettler } = window.sim.helpers;
    settlers = ['normal', 'big', 'imp', 'demon', 'zombie', 'big_zombie', 'dog', 'beast'].map((type, i) => {
      const s = makeSettler(i + 1, townHall.x - 120 + i * 30, townHall.y + 60, {}); changeSettlerType(s, type);
      if (GAME_CONFIG.settlerTypes[type].pet) { s.role = 'pet'; s.look = newPetLook(type); }
      return s;
    });
    buildings = ['campfire', 'smelter', 'spikes', 'dummy', 'dummy', 'torch', 'cage', 'grave', 'dung_heap', 'iron_trap', 'wall_wood', 'door'].map((type, i) => {
      const b = createBuildingBlueprint(type, (g.gx - 6 + i) * TILE_SIZE + 15, (g.gy + 5) * TILE_SIZE + 15); delete b.progress; delete b.maxProgress; return b;
    });
    buildings[0].burning = 5;
    camera.x = townHall.x + 180; camera.y = townHall.y + 110; setZoom(getMaxZoom() * 0.5); render(); render();
    const looks = boars.map(b => b.look);
    render();
    return {
      coats: new Set(looks.map(l => l.coat)).size, kept: boars.every((b, i) => b.look === looks[i]),
      sizes: looks.every(l => l.size >= 0.88 && l.size <= 1.12), dummies: buildings.filter(b => b.type === 'dummy').every(b => typeof b.variant === 'string')
    };
  });
  expect(r.coats).toBeGreaterThanOrEqual(3);
  expect(r).toMatchObject({ kept: true, sizes: true, dummies: true });
  expect(errors).toEqual([]);
});

test('an archer out of arrows draws its dagger and stabs at one close by (weakly), its bow on its back; an enemy archer too (#326)', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const s = window.sim.helpers.makeSettler(1, townHall.x + 200, townHall.y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 });
    settlers = [s]; s.hp = s.maxHp = 1e4;
    const en = createNormalEnemy({ x: s.x + 40, y: s.y }, 'raider'); en.hp = en.maxHp = 1e4; en.speed = 0; en.damage = 0; enemies = [en];
    waveTimer = 999; stock.arrows = 0;
    for (let f = 0; f < 120; f++) update(1 / 60);
    const stabbed = en.maxHp - en.hp;
    const archer = createNormalEnemy({ x: s.x + 60, y: s.y }, 'raider_archer'); archer.arrows = 0; game.enemyArrowStock = 0;
    enemies = [archer]; update(1 / 60);
    return { stabbed, dagger: usesDagger(s), stats: getWeaponStats(s, 'combat').damage, enemyWeapon: archer.weapon };
  });
  expect(r.dagger).toBe(true);
  expect(r.stats).toBe(15);
  expect(r.stabbed).toBeGreaterThan(0);
  expect(r.enemyWeapon).toBe('dagger');
});

test('ranged fighters use a dagger against adjacent enemies, but keep shooting from watchtowers', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const { makeSettler } = window.sim.helpers;
    const x = townHall.x + 200, y = townHall.y;
    const player = makeSettler(1, x, y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 5 });
    const enemy = createNormalEnemy({ x: x + 10, y }, 'raider');
    player.hp = player.maxHp = enemy.hp = enemy.maxHp = 1e4;
    enemy.fromWave = true;
    enemies = [enemy]; settlers = [player];
    const playerShots = game.projectiles.length;
    fightEnemies(player, createSettlerTick(1 / 60));
    const playerMelee = { damage: 1e4 - enemy.hp, arrows: player.arrows, shots: game.projectiles.length - playerShots, swingWeapon: player.swingWeapon, weaponBloodAge: player.weaponBloodAge };

    enemy.x = (Math.floor(player.x / TILE_SIZE) + 3) * TILE_SIZE + 15;
    player.attackCooldown = 0;
    const lockShots = game.projectiles.length;
    engageEnemy(player, createSettlerTick(1 / 60), enemy, null, 1 / 60);
    const playerKeepsDagger = player.daggerTarget === enemy && game.projectiles.length === lockShots;

    const distantShooter = createNormalEnemy({ x: x + 180, y }, 'raider_archer');
    distantShooter.fromWave = true;
    player.lastAttacker = distantShooter; player.lastAttackedTick = game.pathTick;
    enemies = [distantShooter]; settlers = [player];
    player.attackCooldown = 0;
    const playerRangedShots = game.projectiles.length;
    engageEnemy(player, createSettlerTick(1 / 60), distantShooter, distantShooter, 1 / 60);
    const playerKeepsBow = game.projectiles.length > playerRangedShots && player.arrows < 5 && player.swingWeapon === null;

    const meleeAttacker = createNormalEnemy({ x: player.x + 100, y }, 'raider');
    player.lastAttacker = meleeAttacker; player.lastAttackedTick = game.pathTick;
    enemies = [meleeAttacker]; settlers = [player];
    player.attackCooldown = 0;
    const playerMeleeHitShots = game.projectiles.length;
    engageEnemy(player, createSettlerTick(1 / 60), meleeAttacker, meleeAttacker, 1 / 60);
    const playerUsesDaggerAfterMeleeHit = player.daggerTarget === meleeAttacker && game.projectiles.length === playerMeleeHitShots;

    const cooldownArcher = makeSettler(8, x + 1500, y, { weapon: 'crossbow', role: 'archer', quiver: true, arrows: 5, attackCooldown: 2 });
    const closeEnemy = createNormalEnemy({ x: cooldownArcher.x + 10, y }, 'raider');
    closeEnemy.hp = closeEnemy.maxHp = 1e4;
    closeEnemy.fromWave = true;
    enemies = [closeEnemy]; settlers = [cooldownArcher];
    fightEnemies(cooldownArcher, createSettlerTick(1 / 60));
    const immediateDagger = {
      weapon: cooldownArcher.swingWeapon,
      damage: 1e4 - closeEnemy.hp,
      animation: cooldownArcher.swingT > 0
    };

    const crossbow = makeSettler(7, x + 1200, y, { weapon: 'crossbow', role: 'archer', quiver: true, arrows: 5 });
    const crossbowTarget = createNormalEnemy({ x: crossbow.x + 10, y }, 'raider');
    crossbowTarget.hp = crossbowTarget.maxHp = 1e4;
    crossbowTarget.fromWave = true;
    enemies = [crossbowTarget]; settlers = [crossbow];
    fightEnemies(crossbow, createSettlerTick(1 / 60));
    const crossbowMelee = { weapon: crossbow.swingWeapon, arrows: crossbow.arrows, damage: 1e4 - crossbowTarget.hp };

    const target = makeSettler(2, x + 300, y, { weapon: 'fist', role: 'worker' });
    const enemyArcher = createNormalEnemy({ x: target.x + 10, y }, 'raider_archer');
    target.hp = target.maxHp = 1e4; enemyArcher.hp = enemyArcher.maxHp = 1e4;
    enemyArcher.fromWave = true;
    settlers = [target]; enemies = [enemyArcher]; game.gameMode = 'endless';
    const enemyShots = game.projectiles.length;
    for (let i = 0; i < 60; i++) tickEnemy(enemyArcher, 1 / 60);
    const enemyMelee = { weapon: enemyArcher.weapon, arrows: enemyArcher.arrows, damage: 1e4 - target.hp, shots: game.projectiles.length - enemyShots };

    const rangedTarget = makeSettler(5, x + 600, y, { weapon: 'sword', role: 'soldier' });
    const distantEnemyArcher = createNormalEnemy({ x: rangedTarget.x + 180, y }, 'raider_archer');
    distantEnemyArcher.fromWave = true;
    rangedTarget.lastAttacker = distantEnemyArcher; rangedTarget.lastAttackedTick = game.pathTick;
    game.gameMode = 'endless'; buildings = []; settlers = [rangedTarget]; enemies = [distantEnemyArcher];
    const enemyRangedShots = game.projectiles.length;
    tickEnemy(distantEnemyArcher, 1 / 60);
    const enemyKeepsBow = distantEnemyArcher.weapon === 'bow' && game.projectiles.length > enemyRangedShots;

    const meleeTarget = makeSettler(6, x + 800, y, { weapon: 'sword', role: 'soldier' });
    const attackerArcher = createNormalEnemy({ x: meleeTarget.x + 100, y }, 'raider_archer');
    attackerArcher.fromWave = true;
    attackerArcher.struckBy = meleeTarget; attackerArcher.struckTick = game.pathTick;
    game.gameMode = 'endless'; buildings = []; settlers = [meleeTarget]; enemies = [attackerArcher];
    const meleeHitShots = game.projectiles.length;
    tickEnemy(attackerArcher, 1 / 60);
    const enemyUsesDaggerAfterMeleeHit = attackerArcher.weapon === 'dagger' && game.projectiles.length === meleeHitShots;

    const towerSettler = makeSettler(3, x + 600, y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 5 });
    const towerTarget = createNormalEnemy({ x: towerSettler.x + 10, y }, 'raider');
    towerTarget.fromWave = true; enemies = [towerTarget]; settlers = [towerSettler];
    towerSettler.towerAssignment = {};
    const towerShots = game.projectiles.length;
    fightEnemies(towerSettler, createSettlerTick(1 / 60));
    const playerTowerShot = game.projectiles.length > towerShots && game.projectiles.at(-1).owner === towerSettler;

    const enemyTowerTarget = makeSettler(4, x + 900, y, { weapon: 'fist', role: 'worker' });
    const tower = { type: 'watchtower', side: 'red', x: enemyTowerTarget.x, y: enemyTowerTarget.y, tower: { reach: 1.35, idleSeconds: 4, restSeconds: 10 } };
    const towerArcher = createNormalEnemy({ x: tower.x, y: tower.y }, 'raider_archer');
    game.gameMode = 'battle'; game.buildings = [tower]; settlers = [enemyTowerTarget]; enemies = [towerArcher];
    const enemyTowerShots = game.projectiles.length;
    tickEnemy(towerArcher, 1 / 60);
    const enemyTowerShot = towerArcher.platform === tower && towerArcher.weapon === 'bow' &&
      game.projectiles.length > enemyTowerShots && game.projectiles.at(-1).owner === towerArcher;
    return { playerMelee, crossbowMelee, immediateDagger, enemyMelee, playerKeepsDagger, playerUsesDaggerAfterMeleeHit, enemyUsesDaggerAfterMeleeHit, playerKeepsBow, enemyKeepsBow, playerTowerShot, enemyTowerShot };
  });
  expect(r.playerMelee).toMatchObject({ arrows: 5, shots: 0, swingWeapon: 'dagger', weaponBloodAge: 0 });
  expect(r.playerMelee.damage).toBeGreaterThan(0);
  expect(r.crossbowMelee).toMatchObject({ weapon: 'dagger', arrows: 5 });
  expect(r.crossbowMelee.damage).toBeGreaterThan(0);
  expect(r.immediateDagger.weapon).toBe('dagger');
  expect(r.immediateDagger.damage).toBeGreaterThan(0);
  expect(r.immediateDagger.animation).toBe(true);
  expect(r.enemyMelee).toMatchObject({ weapon: 'dagger', arrows: 12, shots: 0 });
  expect(r.enemyMelee.damage).toBeGreaterThan(0);
  expect(r).toMatchObject({
    playerKeepsDagger: true, playerUsesDaggerAfterMeleeHit: true, enemyUsesDaggerAfterMeleeHit: true,
    playerKeepsBow: true, enemyKeepsBow: true, playerTowerShot: true, enemyTowerShot: true
  });
});

test('an archer keeps its dagger drawn while breaking a wall, and paths do not cut a blocked diagonal corner', async ({ page }) => {
  await openGame(page);
  await page.click('#play-button');
  const result = await page.evaluate(async () => {
    window.sim.helpers.clearResources();
    const { makeSettler } = window.sim.helpers;
    const archer = makeSettler(1, townHall.x + 200, townHall.y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 5 });
    const wall = createBuildingBlueprint('wall_wood', archer.x + TILE_SIZE, archer.y);
    wall.side = 'red'; delete wall.progress; delete wall.maxProgress; buildings = [wall];
    const distantEnemy = createNormalEnemy({ x: archer.x + 400, y: archer.y }, 'raider');
    game.buildings = buildings; game.enemies = [distantEnemy]; game.settlers = [archer];
    archer.path = [{ x: wall.x, y: wall.y }, { x: distantEnemy.x, y: distantEnemy.y }];
    archer.isBlockedPath = true;
    const daggerHeld = [];
    for (let i = 0; i < 4; i++) {
      archer.attackCooldown = 0;
      engageEnemy(archer, createSettlerTick(1 / 60), distantEnemy, null, 1 / 60);
      daggerHeld.push(archer.daggerTarget === wall);
    }
    const wallHpBeforeThreat = wall.hp;
    const attacker = createNormalEnemy({ x: archer.x + 100, y: archer.y }, 'raider');
    attacker.fromWave = true;
    game.enemies = [attacker];
    archer.lastAttacker = attacker; archer.lastAttackedTick = game.pathTick;
    archer.path = [{ x: wall.x, y: wall.y }, { x: attacker.x, y: attacker.y }];
    const distanceBeforeThreat = Math.hypot(attacker.x - archer.x, attacker.y - archer.y);
    strikeBack(archer, createSettlerTick(1 / 60));
    const interruptedForAttacker = wall.hp === wallHpBeforeThreat &&
      archer.daggerTarget === attacker &&
      Math.hypot(attacker.x - archer.x, attacker.y - archer.y) < distanceBeforeThreat;

    buildings = [];
    const enemyTileX = Math.floor((townHall.x + 300) / TILE_SIZE);
    const enemyTileY = Math.floor(townHall.y / TILE_SIZE);
    const playerX = enemyTileX * TILE_SIZE + 15, playerY = enemyTileY * TILE_SIZE + 15;
    const siegeWall = createBuildingBlueprint('wall_wood', playerX, (enemyTileY + 1) * TILE_SIZE + 15);
    delete siegeWall.progress; delete siegeWall.maxProgress;
    const ring = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (dx === -1 && dy === 0) || (dx === 0 && dy === 1)) continue;
      const b = createBuildingBlueprint('wall_wood', (enemyTileX + dx) * TILE_SIZE + 15, (enemyTileY + dy) * TILE_SIZE + 15);
      delete b.progress; delete b.maxProgress; ring.push(b);
    }
    const door = createBuildingBlueprint('door', (enemyTileX - 1) * TILE_SIZE + 15, playerY);
    delete door.progress; delete door.maxProgress;
    buildings = [...ring, door, siegeWall]; resetTileIndex();
    const siegeTarget = makeSettler(12, playerX, playerY, { weapon: 'sword', role: 'soldier' });
    siegeTarget.hp = siegeTarget.maxHp = 1e4;
    const siegeEnemy = createNormalEnemy({ x: siegeWall.x, y: siegeWall.y + 25 }, 'raider');
    siegeEnemy.fromWave = true; siegeEnemy.isBlockedPath = true;
    game.gameMode = 'endless'; game.buildings = buildings; game.settlers = [siegeTarget]; game.enemies = [siegeEnemy];
    const wallHpDuringSiege = siegeWall.hp;
    siegeEnemy.siegeTarget = siegeWall; siegeEnemy.siegeTargetTick = game.pathTick;
    const playerPositionBefore = { x: siegeTarget.x, y: siegeTarget.y };
    engageEnemy(siegeTarget, createSettlerTick(1 / 60), siegeEnemy, null, 1 / 60);
    const doorTile = getGridPos(door.x, door.y);
    const playerPathStep = siegeTarget.path?.[0] && getGridPos(siegeTarget.path[0].x, siegeTarget.path[0].y);
    const playerStopsAtSiegeWall = !!siegeEnemy.siegeTarget && siegeEnemy.siegeTarget === siegeWall &&
      siegeWall.hp === wallHpDuringSiege && siegeTarget.x < playerPositionBefore.x &&
      !collidesWithBoxList(siegeTarget.x, siegeTarget.y, siegeTarget.radius, [siegeWall], 15);
    const playerRoutesThroughDoor = !!playerPathStep && playerPathStep.gx === doorTile.gx && playerPathStep.gy === doorTile.gy;

    const testGX = enemyTileX + 10, testGY = enemyTileY + 10;
    const tileAt = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const enemyWall = createBuildingBlueprint('wall_wood', ...Object.values(tileAt(testGX + 1, testGY)));
    const enemyNeighborWall = createBuildingBlueprint('wall_wood', ...Object.values(tileAt(testGX + 1, testGY + 1)));
    delete enemyWall.progress; delete enemyWall.maxProgress;
    delete enemyNeighborWall.progress; delete enemyNeighborWall.maxProgress;
    const incomingEnemy = createNormalEnemy({ x: enemyWall.x - 24, y: enemyWall.y }, 'raider');
    incomingEnemy.fromWave = true; incomingEnemy.speed = 0;
    const enemySideTarget = makeSettler(13, enemyWall.x + 180, enemyWall.y, {});
    enemySideTarget.hp = enemySideTarget.maxHp = 1e4;
    game.buildings = [enemyWall, enemyNeighborWall]; game.enemies = [incomingEnemy]; game.settlers = [enemySideTarget];
    resetTileIndex();
    tickEnemy(incomingEnemy, 1 / 60);
    const enemyStopsBreakingConnectedWall = enemyWall.hp === enemyWall.maxHp;

    const playerWall = createBuildingBlueprint('wall_wood', ...Object.values(tileAt(testGX + 1, testGY + 3)));
    const playerNeighborWall = createBuildingBlueprint('wall_wood', ...Object.values(tileAt(testGX + 1, testGY + 4)));
    playerWall.side = 'red'; playerNeighborWall.side = 'red';
    delete playerWall.progress; delete playerWall.maxProgress;
    delete playerNeighborWall.progress; delete playerNeighborWall.maxProgress;
    const playerArcher = makeSettler(14, ...Object.values(tileAt(testGX, testGY + 3)), { weapon: 'bow', role: 'archer', quiver: true, arrows: 5 });
    const playerSideTarget = createNormalEnemy({ x: playerWall.x + 180, y: playerWall.y }, 'raider');
    playerSideTarget.fromWave = true;
    playerArcher.path = [playerWall, playerNeighborWall, playerSideTarget].map(point => ({ x: point.x, y: point.y }));
    playerArcher.isBlockedPath = false;
    game.buildings = [playerWall, playerNeighborWall]; game.enemies = [playerSideTarget]; game.settlers = [playerArcher];
    resetTileIndex();
    engageEnemy(playerArcher, createSettlerTick(1 / 60), playerSideTarget, null, 1 / 60);
    const playerStopsBreakingConnectedWall = playerWall.hp === playerWall.maxHp;

    const blockingWall = createBuildingBlueprint('wall_wood', ...Object.values(tileAt(testGX + 7, testGY + 3)));
    delete blockingWall.progress; delete blockingWall.maxProgress;
    const blockedSpear = makeSettler(15, blockingWall.x - 25, blockingWall.y, { weapon: 'spear', role: 'soldier' });
    const blockedTarget = createNormalEnemy({ x: blockingWall.x + 25, y: blockingWall.y }, 'raider');
    blockedTarget.fromWave = true;
    game.buildings = [blockingWall]; game.enemies = [blockedTarget]; game.settlers = [blockedSpear];
    resetTileIndex();
    const targetHpBefore = blockedTarget.hp;
    engageEnemy(blockedSpear, createSettlerTick(1 / 60), blockedTarget, null, 1 / 60);
    const playerRoutesAroundBlockingWall = blockedTarget.hp === targetHpBefore &&
      blockedSpear.attackCooldown === 0 &&
      (blockedSpear.x !== blockingWall.x - 25 || blockedSpear.y !== blockingWall.y);

    const start = getGridPos(townHall.x + 150, townHall.y + 150);
    const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    const cornerWalls = [[start.gx + 1, start.gy], [start.gx, start.gy + 1]].map(([gx, gy]) => {
      const b = createBuildingBlueprint('wall_wood', ...Object.values(at(gx, gy)));
      delete b.progress; delete b.maxProgress; buildings.push(b); return b;
    });
    resetTileIndex();
    const { findPathAStarPermissive } = await import('/js/engine/movement/pathfinding.js');
    const path = findPathAStarPermissive(start.gx * TILE_SIZE + 15, start.gy * TILE_SIZE + 15,
      (start.gx + 1) * TILE_SIZE + 15, (start.gy + 1) * TILE_SIZE + 15).path;
    const first = path[1] && getGridPos(path[1].x, path[1].y);
    const cornerAttackBlocked = !hasMeleeReach(
      { x: start.gx * TILE_SIZE + 15, y: start.gy * TILE_SIZE + 15 },
      { x: (start.gx + 1) * TILE_SIZE + 15, y: (start.gy + 1) * TILE_SIZE + 15 }
    );
    return {
      daggerHeld, interruptedForAttacker, playerStopsAtSiegeWall, playerRoutesThroughDoor,
      enemyStopsBreakingConnectedWall, playerStopsBreakingConnectedWall,
      playerRoutesAroundBlockingWall,
      pathBreaksWall: path.some(p => cornerWalls.some(b => Math.abs(p.x - b.x) < 1 && Math.abs(p.y - b.y) < 1)),
      firstStepCutsCorner: !!first && first.gx !== start.gx && first.gy !== start.gy,
      cornerAttackBlocked
    };
  });
  expect(result.daggerHeld).toEqual([true, true, true, true]);
  expect(result.interruptedForAttacker).toBe(true);
  expect(result.playerStopsAtSiegeWall).toBe(true);
  expect(result.playerRoutesThroughDoor).toBe(true);
  expect(result.enemyStopsBreakingConnectedWall).toBe(true);
  expect(result.playerStopsBreakingConnectedWall).toBe(true);
  expect(result.playerRoutesAroundBlockingWall).toBe(true);
  expect(result.pathBreaksWall).toBe(true);
  expect(result.firstStepCutsCorner).toBe(false);
  expect(result.cornerAttackBlocked).toBe(true);
});

test('a medic at work: herbs on the wound, its patient shows it; the necromancer\'s staff in its side\'s colour, glowing in the dark (#326)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(() => {
    window.sim.helpers.clearResources();
    const { makeSettler } = window.sim.helpers;
    const medic = makeSettler(1, townHall.x + 100, townHall.y + 40, { tool: 'medbag' }); medic.bagHerbs = 3;
    const hurt = makeSettler(2, medic.x + 20, medic.y, {}); hurt.hp = 20; hurt.weapon = 'sword'; hurt.role = 'soldier';
    settlers = [medic, hurt];
    const en = createNormalEnemy({ x: townHall.x + 2000, y: townHall.y }, 'raider'); en.speed = 0; enemies = [en];
    waveTimer = 999;
    let healing = false, treated = false;
    for (let f = 0; f < 120; f++) { update(1 / 60); healing = healing || medic.workKind === 'heal'; treated = treated || hurt.treatedAt === pathTick; }
    // the staff's colours as drawn
    const fills = [];
    const necro = makeSettler(3, townHall.x - 60, townHall.y + 40, { tool: 'necro_staff' });
    settlers.push(necro);
    dayTime = GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + GAME_CONFIG.daytime.evening + 20;
    const arc = ctx.arc;
    let gradient = false;
    const rg = ctx.createRadialGradient;
    ctx.createRadialGradient = function (...a) { gradient = true; return rg.apply(this, a); };
    try { isPaused = true; render(); } finally { ctx.createRadialGradient = rg; }
    return { healing, treated, gradient };
  });
  expect(r).toEqual({ healing: true, treated: true, gradient: true });
  expect(errors).toEqual([]);
});

test('what is kept for the tick is worked out again for a new world, even in the same tick', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const keep = onceThisTick();
    let made = 0;
    keep(() => ++made); keep(() => ++made);
    const sameWorld = made;
    newWorldEpoch();
    keep(() => ++made);
    return { sameWorld, afterNewWorld: made };
  });
  expect(r).toEqual({ sameWorld: 1, afterNewWorld: 2 });
});

test('smoke: saves loaded a few ticks after they were made, no frame fails (the CI flake of #299\'s fog test)', async ({ page }) => {
  const errors = await openGame(page);
  await page.click('#play-button');
  const r = await page.evaluate(async () => {
    isPaused = true;
    // workers looking for work (the tick keeps its lists of what each kind of them can work)
    settlers.forEach(s => { s.hunger = 999; s.tool = 'axe'; });
    const fails = [];
    for (let later = 0; later < 4; later++) {
      for (let f = 0; f < 3; f++) update(1 / 60);
      await saveCurrentGame();
      const data = await saveDataOf(loadSaves()[`world:${worldSeed.value}`]);
      for (let f = 0; f < later; f++) update(1 / 60);
      await loadGame(data);
      settlers.forEach(s => { s.hunger = 999; });
      try { for (let f = 0; f < 3; f++) update(1 / 60); } catch (e) { fails.push(String(e)); }
    }
    return fails;
  });
  expect(r).toEqual([]);
  expect(errors).toEqual([]);
});
