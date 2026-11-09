// Raids against the persistent enemy camp on the Endless map
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler } } = window.sim;
  const step = (seconds, each) => {
    for (let frame = 0; frame < seconds * 60; frame++) {
      update(1 / 60);
      if (each && each(frame)) return true;
    }
    return false;
  };
  const fundShelter = () => Object.assign(stock, { wood: 50, stone: 50, leather: 10, rope: 10, herbs: 10 });

  function campOpens({ seed = 'raid-test', soldiers = 4, gear = {} } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    settlers.push(...Array.from({ length: soldiers }, (_, i) =>
      makeSettler(500 + i, townHall.x - 40 + i * 20, townHall.y + 60, { weapon: 'iron_sword', role: 'soldier', ...gear })));
    const camp = { ...enemyCamp };
    const guards = enemies.filter(enemy => enemy.campGuard);
    const guardsBefore = guards.map(enemy => enemy.hp);
    step(1);
    const guardsPassive = guards.every((enemy, i) =>
      enemy.hp === guardsBefore[i] && !enemy.guardOff && !enemy.attackTarget);
    normalizeEnemyCamp();
    return {
      camp, duplicateStayedSingle: buildings.filter(building => building.enemyCampStructure && building.type === 'campfire').length === 1,
      guards: guards.length, guardsPassive, cols: COLS, hallX: townHall.x
    };
  }

  function campFogVisibility({ seed = 'camp-fog' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    game.fogEnabled = true;
    createEnemyCamp();
    const camp = enemyCamp;
    const dx = TILE_SIZE * 20;
    camp.x += dx;
    for (const building of buildings) if (building.enemyCampStructure) building.x += dx;
    for (const tent of enemyTents) if (tent.campStructure) tent.x += dx;
    camp.y = townHall.y;
    resetFog();
    const hiddenWithoutScout = !isVisible(camp.x, camp.y);
    const scout = settlers[0];
    startRaid([scout], true);
    scout.x = camp.x + (camp.radius + 1) * TILE_SIZE;
    scout.y = camp.y;
    tickFog(GAME_CONFIG.fog.everySeconds);
    const revealedByNearbyScout = isVisible(camp.x, camp.y);
    scout.raider = false;
    game.raidActive = true;
    tickFog(GAME_CONFIG.fog.everySeconds);
    const revealedByRaid = isVisible(camp.x, camp.y);
    game.raidActive = false;
    game.fogEnabled = false;
    const visibleWhenFogDisabled = isVisible(camp.x, camp.y);
    return { hiddenWithoutScout, revealedByNearbyScout, revealedByRaid, visibleWhenFogDisabled };
  }

  function enemyCampStructuresDontRevealFog({ seed = 'camp-structures-fog' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    game.fogEnabled = true;
    createEnemyCamp();
    const camp = enemyCamp;
    const dx = TILE_SIZE * 20;
    camp.x += dx;
    for (const building of buildings) if (building.enemyCampStructure) building.x += dx;
    for (const tent of enemyTents) if (tent.campStructure) tent.x += dx;
    const campTile = { x: camp.x, y: camp.y };
    const edgeTile = { x: camp.x + TILE_SIZE * (camp.radius + 1), y: camp.y };
    buildings.push(
      { type: 'campfire', side: 'red', enemyCampStructure: true, x: edgeTile.x, y: edgeTile.y, fuelLeft: 100 },
      { type: 'campfire', x: campTile.x, y: campTile.y, fuelLeft: 100 }
    );
    resetFog();
    tickFog(GAME_CONFIG.fog.everySeconds);
    return { enemyCampTileUnexplored: !isExplored(campTile.x, campTile.y), edgeTileUnexplored: !isExplored(edgeTile.x, edgeTile.y) };
  }

  function intoCamp(opts = {}) {
    const opened = campOpens(opts);
    const hallX = townHall.x, cols = COLS, timerBefore = waveTimer;
    const party = settlers.filter(settler => settler.id >= 500);
    fundShelter();
    const sent = startRaid(party);
    const arrived = step(60, () => raid.phase === 'staging' &&
      !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'));
    const waitingOutside = party.every(settler => !inEnemyTerritory(settler.x, settler.y));
    const guardsPassiveWhileWaiting = enemies.filter(enemy => enemy.campGuard).every(enemy => !enemy.guardOff);
    raidAction('attack');
    return {
      opened, sent, party: raid.raiders.length, arrived, waitingOutside, guardsPassiveWhileWaiting,
      noAutoButton: !document.querySelector('#raid-bar [data-raid-act="auto"]'),
      phase: raid.phase, raidActive,
      sameWorld: COLS === cols && townHall.x === hallX && !!enemyCamp,
      timerHeld: waveTimer === timerBefore, guards: enemies.filter(enemy => enemy.campGuard).length,
      outpost: enemyTents.filter(tent => tent.outpost && tent.campStructure).length,
      saveHidden: document.getElementById('save-game-button').hidden
    };
  }

  function raidOutcome({ win = true, seed = 'raid-test' } = {}) {
    const state = intoCamp({ seed, soldiers: win ? 8 : 2 });
    const party = raid.raiders.slice();
    if (win) {
      enemies.filter(enemy => enemy.campGuard).forEach(enemy => { enemy.hp = 0; });
      enemyTents.filter(tent => tent.campStructure).forEach(tent => { tent.hp = 0; });
    } else party.forEach(settler => { settler.hp = 0; });
    step(1);
    const result = { phase: raid.phase, campExists: !!enemyCamp, survivors: raid.raiders.length, waveTimer };
    if (win) step(60, () => { waveTimer = 999; return raid.phase === null; });
    return { state, result, ended: raid.phase === null, campDestroyed: enemyCampDestroyed };
  }

  function scoutTheCamp({ seed = 'scout-camp' } = {}) {
    const opened = campOpens({ seed, soldiers: 2 });
    const scout = settlers.find(settler => settler.id >= 500);
    waveTimer = 999;
    const sent = startRaid([scout], true);
    const timerBefore = waveTimer;
    let looked = false, outsideDuringLook = false, guardsPassiveBeforeThreat = true, guardChased = false;
    const arrived = step(150, () => {
      if (raid.phase === 'fight') {
        looked = true;
        outsideDuringLook = !inEnemyTerritory(scout.x, scout.y);
        if (!raid.scoutThreat || raid.scoutThreat.elapsed < 10) {
          guardsPassiveBeforeThreat = guardsPassiveBeforeThreat &&
            enemies.filter(enemy => enemy.campGuard).every(enemy => !enemy.guardOff);
        }
        guardChased = guardChased || enemies.some(enemy => enemy.campGuard && enemy.scoutChasing);
      }
      return looked && raid.phase === null;
    });
    return {
      opened, sent, arrived, looked, outsideDuringLook, guardsPassiveBeforeThreat, guardChased, phase: raid.phase, campStays: !!enemyCamp,
      raidActive, timerAdvanced: waveTimer < timerBefore
    };
  }

  function campInfrastructure({ seed = 'camp-infrastructure' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    const camp = { ...enemyCamp };
    const initialGuards = enemies.filter(enemy => enemy.campGuard && enemy.campId === camp.id);
    const developmentPresets = getWavePresetPool(getEnemyFaction().id, game.waveNum + 2);
    const developmentPool = new Set(developmentPresets.map(option => option.enemyKey));
    const initialRosterIsTwoLevelsAhead = initialGuards.every(enemy => developmentPool.has(enemy.enemyKey));
    const advancedPresetsAvailable = getWavePresetPool(getEnemyFaction().id, 5).some(option => {
      const def = GAME_CONFIG.enemies[option.enemyKey];
      return def.type === 'big';
    }) && getWavePresetPool(getEnemyFaction().id, 5).some(option => GAME_CONFIG.enemies[option.enemyKey].ranged);
    buildings.push(
      { type: 'warehouse', side: 'red', x: camp.x + TILE_SIZE * 2, y: camp.y, enemyCampStructure: true },
      { type: 'campfire', side: 'red', x: camp.x + TILE_SIZE * 3, y: camp.y, hp: 100, maxHp: 100, enemyCampStructure: true }
    );
    enemyTents.push({ x: camp.x, y: camp.y, hp: 100, maxHp: 100, campStructure: true });
    normalizeEnemyCamp();
    const fire = buildings.find(building => building.enemyCampStructure && building.type === 'campfire');
    const campBuildings = buildings.filter(building => building.enemyCampStructure);
    const outpost = enemyTents.find(tent => tent.campStructure && tent.outpost);
    const campHomes = enemyTents.filter(tent => tent.campStructure && !tent.outpost && !tent.wavePortal);
    const expectedHomeType = getEnemyFaction().id === 'undead' ? 'grave' : getEnemyFaction().id === 'demons' ? 'demon_den' : 'tent';
    const campBuildingsRed = campBuildings.every(building => building.side === 'red');
    const campInfrastructurePresent = !!outpost &&
      campBuildings.some(building => /^wall_/.test(building.type)) &&
      campBuildings.filter(building => building.type === 'torch').length >= 2 &&
      campHomes.length >= 2 && campHomes.every(tent => tent.campType === expectedHomeType);
    const noCampWarehouse = !campBuildings.some(building => building.type === 'warehouse');
    const keepers = enemies.filter(enemy => enemy.campGuard && enemy.campFireKeeper);
    const firewood = stock.firewood;
    const enemyStorage = { type: 'warehouse', side: 'red', x: camp.x, y: camp.y };
    buildings.push(enemyStorage);
    const storageExcluded = !getStorages().includes(enemyStorage);
    buildings.splice(buildings.indexOf(enemyStorage), 1);
    const zoneExcluded = !inTerritory(camp.x, camp.y);
    const angle = Math.atan2(camp.y - townHall.y, camp.x - townHall.x);
    const radiusWithCamp = baseRadiusToward(angle);
    const originalBuildings = game.buildings;
    game.buildings = originalBuildings.filter(building => !building.enemyCampStructure);
    const radiusWithoutCamp = baseRadiusToward(angle);
    game.buildings = originalBuildings;
    const soldierPatrolRadiusStable = radiusWithCamp === radiusWithoutCamp;

    const centreGrid = getGridPos(camp.x, camp.y), outpostGrid = getGridPos(outpost.x, outpost.y);
    const fireGrid = getGridPos(fire.x, fire.y);
    const outpostAtCenter = outpostGrid.gx === centreGrid.gx && outpostGrid.gy === centreGrid.gy;
    const fireDistance = Math.max(Math.abs(fireGrid.gx - outpostGrid.gx), Math.abs(fireGrid.gy - outpostGrid.gy));
    const fireBesideOutpost = fireDistance >= 2 && fireDistance <= 3;
    fire.fuelLeft = 29;
    step(2);
    const keeperWaitsUntilLow = keepers.length === 1 && keepers[0].campFuelLoad === undefined &&
      Math.hypot(keepers[0].x - keepers[0].guard.x, keepers[0].y - keepers[0].guard.y) <= 12;
    fire.fuelLeft = 0;
    step(30);
    const fireMaintained = fire.fuelLeft > 0 || fire.burning > 0;
    const keeperStaysByFire = keepers.length === 1 && Math.hypot(keepers[0].x - fire.x, keepers[0].y - fire.y) <= TILE_SIZE * Math.SQRT2 + 10;
    const keeperAtPost = keepers.length === 1 && keepers[0].guard &&
      Math.hypot(keepers[0].x - keepers[0].guard.x, keepers[0].y - keepers[0].guard.y) <= 12;
    const keeperNotCarryingFuel = keepers.length === 1 && !(keepers[0].campFuelLoad > 0);
    const infiniteOutpostFuel = !outpost.store || Object.keys(outpost.store).length === 0;
    const playerFuelUnchanged = stock.firewood === firewood;
    return {
      campExists: !!enemyCamp, campBuildingsRed, campInfrastructurePresent, noCampWarehouse, oneKeeper: keepers.length === 1,
      legacyCampCleaned: campInfrastructurePresent && noCampWarehouse,
      campHomes: campHomes.length, campHomeType: expectedHomeType,
      initialGuardCount: initialGuards.length, initialRosterIsTwoLevelsAhead,
      initialGuardTypeCount: new Set(initialGuards.map(enemy => enemy.enemyKey)).size, advancedPresetsAvailable,
      outpostAtCenter, fireBesideOutpost, infiniteOutpostFuel, keeperWaitsUntilLow,
      fireMaintained, keeperStaysByFire, keeperAtPost, keeperNotCarryingFuel, zoneExcluded, storageExcluded, soldierPatrolRadiusStable, playerFuelUnchanged
    };
  }

  function campRoutine({ seed = 'camp-routine' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    // (the guards as they are each frame: the camp arms them better as it goes, a guard swapped for a better one)
    const campGuards = () => enemies.filter(enemy => enemy.campGuard && enemy.campId === enemyCamp.id && enemy.hp > 0);
    let guards = campGuards();
    const last = new Map(guards.map(guard => [guard, { x: guard.x, y: guard.y }]));
    const still = new Map(guards.map(guard => [guard, 0]));
    const guardCount = guards.length;
    let moved = false, paused = false, talkedFaceToFace = false, patrolRadius = 0;
    const talkers = new Set();
    const lastSay = new Map();
    let phraseCount = 0, maxDistanceFromPost = 0, avoidedCampBuildings = true;
    const campStructureTiles = [
      ...buildings.filter(building => building.enemyCampStructure),
      ...enemyTents.filter(tent => tent.campStructure)
    ].map(structure => getGridPos(structure.x, structure.y));
    const centre = getGridPos(enemyCamp.x, enemyCamp.y);
    const faces = (guard, other) => {
      const expected = Math.atan2(other.y - guard.y, other.x - guard.x);
      const difference = Math.atan2(Math.sin((guard.facing || 0) - expected), Math.cos((guard.facing || 0) - expected));
      return Math.abs(difference) < 0.6;
    };
    for (let frame = 0; frame < 90 * 60; frame++) {
      update(1 / 60);
      guards = campGuards();
      for (const guard of guards) {
        if (!last.has(guard)) { last.set(guard, { x: guard.x, y: guard.y }); still.set(guard, 0); }
        maxDistanceFromPost = Math.max(maxDistanceFromPost,
          Math.hypot(guard.x - guard.guard.x, guard.y - guard.guard.y));
        const guardGrid = getGridPos(guard.x, guard.y);
        avoidedCampBuildings = avoidedCampBuildings &&
          !campStructureTiles.some(tile => tile.gx === guardGrid.gx && tile.gy === guardGrid.gy);
        const patrol = guard.campPatrolTarget || guard;
        const grid = getGridPos(patrol.x, patrol.y);
        patrolRadius = Math.max(patrolRadius, Math.abs(grid.gx - centre.gx), Math.abs(grid.gy - centre.gy));
        const previous = last.get(guard);
        const distance = Math.hypot(guard.x - previous.x, guard.y - previous.y);
        if (distance > 2) { moved = true; still.set(guard, 0); }
        else {
          still.set(guard, still.get(guard) + 1);
          if (still.get(guard) >= 120) paused = true;
        }
        last.set(guard, { x: guard.x, y: guard.y });
        if (!guard.say || guard.say.until < game.pathTick) continue;
        const previousSay = lastSay.get(guard);
        if (!previousSay || previousSay.until !== guard.say.until) phraseCount++;
        lastSay.set(guard, guard.say);
        talkers.add(guard.name);
        // (the one it's talking with, else the nearest: another standing by isn't the one it turns to)
        const partner = guards.find(other => other !== guard && other.name === guard.campTalkPartnerName) ||
          guards.find(other => other !== guard && Math.hypot(other.x - guard.x, other.y - guard.y) < TILE_SIZE * 4);
        if (partner && faces(guard, partner) && faces(partner, guard)) talkedFaceToFace = true;
      }
    }
    return {
      guards: guardCount, moved, paused, talkedFaceToFace, patrolRadius, talkers: talkers.size,
      phraseCount, maxDistanceFromPost, avoidedCampBuildings
    };
  }

  function sleepingCampGuard({ seed = 'sleeping-camp-guard' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    game.dayTime = timeOfPhase('night');
    step(35);
    const sleeper = enemies.find(enemy => enemy.campGuard && enemy.asleep);
    if (!sleeper) return { sleepers: 0, sleepMarks: 0 };
    const previous = ctx.fillText;
    let sleepMarks = 0;
    ctx.fillText = function (text, ...args) {
      if (text === 'z') sleepMarks++;
      return previous.call(this, text, ...args);
    };
    try { drawEnemy(sleeper); } finally { ctx.fillText = previous; }
    return {
      sleepers: enemies.filter(enemy => enemy.campGuard && enemy.asleep).length,
      sleepMarks
    };
  }

  function campOutpostVisuals() {
    const canvas = ctx.canvas;
    if (canvas.width < 140 || canvas.height < 80) throw new Error('The game canvas is too small for the outpost art test');
    const x = Math.min(canvas.width - 70, Math.max(70, Math.floor(canvas.width / 2)));
    const y = Math.max(40, Math.floor(canvas.height / 2));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x - 68, y - 28, 136, 56);
    const centres = [x - 45, x, x + 45];
    ['humans', 'undead', 'demons'].forEach((faction, index) =>
      drawEnemyCampOutpostArt(centres[index], y, faction));
    const signatures = centres.map(centre => {
      const pixels = ctx.getImageData(centre - 22, y - 26, 44, 52).data;
      let signature = 0;
      for (let i = 0; i < pixels.length; i++) signature = (Math.imul(signature, 31) + pixels[i]) | 0;
      return signature;
    });
    ctx.restore();
    return { distinct: new Set(signatures).size === 3, signatures };
  }

  function campActivity({ seed = 'camp-activity' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    const camp = createEnemyCamp();
    const passive = createSettlerTick(1 / 60);
    game.raidCampId = camp.id;
    game.raidActive = true;
    const raiding = createSettlerTick(1 / 60);
    game.raidActive = false;
    enemies.push({ hp: 100, fromWave: true });
    const wave = createSettlerTick(1 / 60);
    return {
      guards: enemies.filter(enemy => enemy.campGuard).length,
      passiveWave: passive.isWaveActive, passiveTentAssault: passive.tentAssault,
      raidWave: raiding.isWaveActive, waveDetected: wave.isWaveActive
    };
  }

  function campBoars({ seed = 'camp-boars' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    const camp = { ...enemyCamp };
    const hp = GAME_CONFIG.mapResources.boar.hp;
    boars.push({ x: camp.x, y: camp.y, hp, maxHp: hp, targetX: camp.x, targetY: camp.y });
    normalizeEnemyCamp();
    const afterNormalize = boars.every(boar => !inEnemyTerritory(boar.x, boar.y));
    const countBeforeSpawn = boars.length;
    spawnResource('boar', camp.x, camp.y, 0);
    return {
      existingBoarRemoved: afterNormalize,
      noBoarRespawnedInside: boars.length === countBeforeSpawn &&
        boars.every(boar => !inEnemyTerritory(boar.x, boar.y))
    };
  }

  function campResourceRegrowth({ seed = 'camp-resource-regrowth' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    const camp = { ...enemyCamp };
    const countResources = () => trees.length + cacti.length + boulders.length + grassList.length +
      berryBushes.length + sticks.length + pebbles.length + ironOres.length + coalOres.length + naturalRocks.length + boars.length;
    const before = countResources();
    pendingRespawns.length = 0;
    for (let i = 0; i < 20; i++) {
      pendingRespawns.push({ type: 'berry_bush', nearX: camp.x, nearY: camp.y, stump: null, timer: 0 });
    }
    updatePendingRespawns(1);
    const resources = [
      ...trees, ...cacti, ...boulders, ...grassList, ...berryBushes, ...sticks, ...pebbles,
      ...ironOres, ...coalOres, ...naturalRocks, ...boars
    ];
    return {
      resourcesRegrew: countResources() > before,
      noneInsideCamp: resources.every(resource => !inEnemyTerritory(resource.x, resource.y))
    };
  }

  function retreatFromStaging({ seed = 'raid-staging-retreat' } = {}) {
    campOpens({ seed, soldiers: 2 });
    const party = settlers.filter(settler => settler.id >= 500);
    fundShelter();
    const sent = startRaid(party);
    const arrived = step(60, () => raid.phase === 'staging' &&
      !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'));
    const outside = party.every(settler => !inEnemyTerritory(settler.x, settler.y));
    raidAction('retreat');
    const returned = step(120, () => raid.phase === null);
    return {
      sent, arrived, outside, retreated: raid.phase === null,
      home: party.every(settler => settlers.includes(settler) && Math.hypot(settler.x - townHall.x, settler.y - townHall.y) < townHall.radius + 120),
      raidActive, returned
    };
  }

  function raidPetAndCargo({ seed = 'raid-pet-cargo' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    fundShelter();
    const pet = makeSettler(550, townHall.x + 45, townHall.y, { type: 'dog', hp: 70, maxHp: 70 });
    const carrier = makeSettler(551, townHall.x - 45, townHall.y, { carrying: { type: 'wood', amount: 3 } });
    settlers.push(pet, carrier);
    const woodBefore = stock.wood;
    const sent = startRaid([pet, carrier]);
    const waitedToUnload = raid.phase === 'loading';
    const delivered = step(45, () => raid.phase === 'march');
    step(5);
    return {
      sent, waitedToUnload, delivered, cargoReturned: !carrier.carrying && stock.wood >= woodBefore + 3,
      petJoined: pet.raider && raid.raiders.includes(pet), petMoved: Math.hypot(pet.x - (townHall.x + 45), pet.y - townHall.y) > 10
    };
  }

  function stagingShelterPayment({ seed = 'raid-staging-shelter' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    fundShelter();
    const cost = GAME_CONFIG.buildings[shelterType()].cost;
    const before = Object.fromEntries(Object.keys(cost).map(resource => [resource, stock[resource]]));
    const pet = makeSettler(560, townHall.x + 45, townHall.y, { type: 'dog', hp: 70, maxHp: 70 });
    const builder = makeSettler(561, townHall.x - 45, townHall.y);
    settlers.push(pet, builder);
    const sent = startRaid([pet, builder]);
    for (const settler of raid.raiders) {
      settler.x = raid.gather.x;
      settler.y = raid.gather.y;
    }
    raid.timer = GAME_CONFIG.raid.marchSeconds;
    tickRaid(0.1);
    const petDidNotBuild = !!raid.stagingShelter && raid.stagingShelter.builderId === builder.id;
    for (let frame = 0; frame < 20 && raid.stagingShelter && !raid.stagingShelter.built; frame++) {
      builder.x = raid.stagingShelter.x;
      builder.y = raid.stagingShelter.y;
      raidOrders(builder, { dt: 1 });
    }
    const builtBeforeAttack = !!raid.stagingShelter && raid.stagingShelter.built;
    const costUnchangedBeforeAttack = Object.keys(cost).every(resource => stock[resource] === before[resource]);
    for (const settler of raid.raiders) {
      settler.x = settler.raidSpot.x;
      settler.y = settler.raidSpot.y;
    }
    tickRaid(0.1);
    raidAction('attack');
    const costPaidOnAttack = Object.keys(cost).every(resource => stock[resource] === before[resource] - cost[resource]);
    const attackStarted = raid.phase === 'fight';
    leaveCamp(false);
    const shelterRemoved = !game.buildings.some(building => building.raidShelter) &&
      !game.blueprints.some(blueprint => blueprint.raidShelter);
    return { sent, petDidNotBuild, builtBeforeAttack, costUnchangedBeforeAttack, costPaidOnAttack, attackStarted, shelterRemoved };
  }

  function raidAutoDemolition({ seed = 'raid-auto-demolition' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    const camp = createEnemyCamp();
    game.raidCampId = camp.id;
    game.raidActive = true;
    const outpost = enemyTents.find(tent => tent.campStructure && tent.outpost && tent.campId === camp.id);
    const raider = makeSettler(600, outpost.x + 20, outpost.y, { weapon: 'iron_sword', role: 'soldier' });
    raider.raider = true;
    settlers.push(raider);
    enemies = [];
    const hpBefore = outpost.hp;
    for (let frame = 0; frame < 60 && outpost.hp === hpBefore; frame++) fightByOrders(raider, 1 / 60, true);
    return { structureDamaged: outpost.hp < hpBefore };
  }

  function demonRaidPortalPlacement({ seed = 'demon-raid-portals' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    sides.player.faction = 'demons';
    const camp = createEnemyCamp();
    const raider = makeSettler(650, townHall.x + 45, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers.push(raider);
    const sent = startRaid([raider]);
    const homePortalCreated = !!raid.homePortal && !raid.exitPortal;
    raider.x = raid.rally.x;
    raider.y = raid.rally.y;
    tickRaid(0.1);
    const staged = raid.phase === 'staging';
    raidAction('portal');
    let portalSpot = null;
    const centre = getGridPos(camp.x, camp.y);
    for (let radius = 1; radius <= camp.radius + 2 && !portalSpot; radius++) {
      for (let dy = -radius; dy <= radius && !portalSpot; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = (centre.gx + dx) * TILE_SIZE + 15, y = (centre.gy + dy) * TILE_SIZE + 15;
        const point = { x, y };
        if (!isTileBlockedForSettler(centre.gx + dx, centre.gy + dy) &&
          !inTerritory(x, y) && !buildings.some(building => Math.hypot(building.x - x, building.y - y) < 30) &&
          !enemyTents.some(tent => Math.hypot(tent.x - x, tent.y - y) < 30) &&
          !enemies.some(enemy => enemy.hp > 0 && Math.hypot(enemy.x - x, enemy.y - y) < 60)) portalSpot = point;
      }
    }
    if (portalSpot) raidTap(portalSpot.x, portalSpot.y);
    const exitPortalPlaced = !!raid.exitPortal;
    if (exitPortalPlaced) raidAction('attack');
    const entered = raid.phase === 'fight';
    leaveCamp(false);
    raidOrders(raider, { dt: 1 / 60 });
    const returnedThroughPortal = !!raider.returnedViaPortal;
    tickRaid(1 / 60);
    return {
      sent, homePortalCreated, staged, exitPortalPlaced, entered, returnedThroughPortal,
      portalsCleaned: !buildings.some(building => building.raidPortal)
    };
  }

  function undeadCampNoFire({ seed = 'undead-camp-no-fire' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    sides.enemy.faction = 'undead';
    const camp = createEnemyCamp();
    normalizeEnemyCamp();
    const campBuildings = buildings.filter(building => building.enemyCampStructure && building.campId === camp.id);
    return {
      noCampfire: !campBuildings.some(building => building.type === 'campfire'),
      noFireKeeper: !enemies.some(enemy => enemy.campGuard && enemy.campId === camp.id && enemy.campFireKeeper)
    };
  }

  function scoutThreatAndBaseWork({ seed = 'scout-threat-work' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    const camp = createEnemyCamp();
    const scout = makeSettler(700, camp.x + (camp.radius + 1) * TILE_SIZE, camp.y);
    const worker = settlers[0];
    settlers.push(scout);
    startRaid([scout], true);
    raid.phase = 'fight';
    raid.scoutThreat = { elapsed: 10 };
    game.raidActive = false;
    tickRaid(1 / 60);
    const guard = raid.scoutThreat && raid.scoutThreat.guard;
    const targetAssigned = !!guard && guard.attackTarget === scout && guard.scoutChasing;
    if (guard) {
      guard.x = scout.x - TILE_SIZE;
      guard.y = scout.y;
    }
    tickRaid(1 / 60);
    const scoutFled = raid.phase === 'return' && raid.scouting;
    const baseContinues = !restWhileRaid(worker, { dt: 1 / 60 });
    return { targetAssigned, scoutFled, baseContinues };
  }

  function raidWithoutCampAndScoutSelection({ seed = 'raid-without-camp' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    const archer = makeSettler(710, townHall.x + 45, townHall.y, { weapon: 'bow', role: 'archer' });
    const medic = makeSettler(711, townHall.x + 65, townHall.y, { tool: 'medbag', role: 'worker' });
    settlers = [archer, medic];
    Object.assign(stock, { wood: 80, stone: 80, arrows: 30, herbs: 20 });
    openRaidPicker();
    const buildCamp = document.querySelector('#raid-picker [data-raid="build-camp"]');
    buildCamp.checked = false;
    buildCamp.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector(`#raid-picker [data-unit="${medic.id}"]`).click();
    document.querySelector('#raid-picker [data-raid="go"]').click();
    const sent = raid.phase === 'march';
    const noSuppliesTaken = raid.arrows === 0 && stock.arrows === 30 && stock.herbs === 20 && medic.bagHerbs === 0;
    const resourcesBefore = Object.fromEntries(['wood', 'stone', 'leather', 'rope', 'herbs', 'arrows']
      .map(key => [key, stock[key] || 0]));
    raid.timer = GAME_CONFIG.raid.marchSeconds;
    tickRaid(0.1);
    for (const settler of raid.raiders) {
      settler.x = settler.raidSpot.x;
      settler.y = settler.raidSpot.y;
    }
    const noShelter = raid.phase === 'staging' && !raid.stagingShelter &&
      !blueprints.some(blueprint => blueprint.raidShelter);
    updateRaidBar();
    const attackReady = !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])');
    raidAction('attack');
    const attackStarted = raid.phase === 'fight';
    const noCostPaid = Object.entries(resourcesBefore).every(([key, amount]) => (stock[key] || 0) === amount);
    leaveCamp(false);
    endRaid(false);

    const scout = archer;
    game.raidCampId = enemyCamp.id;
    const scoutSent = startRaid([scout], true);
    selectedSettler = scout;
    selectedGroup = [scout];
    buildMode = 'interact';
    mouse.x = scout.x;
    mouse.y = scout.y;
    handleCanvasClick();
    const scoutCannotBeSelected = selectedSettler === null && selectedGroup.length === 0;
    endRaid(false);
    sides.player.faction = 'demons';
    const demonSent = startRaid([archer], false, 0, false);
    const demonNoPortals = !raid.homePortal && !raid.exitPortal && !buildings.some(building => building.raidPortal);
    endRaid(false);
    return { sent, noSuppliesTaken, noShelter, attackReady, attackStarted, noCostPaid, scoutSent,
      scoutCannotBeSelected, demonSent, demonNoPortals };
  }

  function allCampTerritories({ seed = 'camp-territories' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    game.enemyCamps = [
      { id: 1, x: townHall.x - TILE_SIZE * 4, y: townHall.y, radius: 2 },
      { id: 2, x: townHall.x + TILE_SIZE * 4, y: townHall.y, radius: 2 }
    ];
    game.enemyCamp = game.enemyCamps[0];
    camera.x = townHall.x;
    camera.y = townHall.y;
    let redZones = 0;
    const stroke = ctx.stroke;
    ctx.stroke = function (...args) {
      if (ctx.strokeStyle === 'rgba(231, 76, 60, 0.35)') redZones++;
      return stroke.apply(ctx, args);
    };
    try { drawTerritory(); }
    finally { ctx.stroke = stroke; }
    return { campCount: game.enemyCamps.length, redZones };
  }

  return {
    campOpens, intoCamp, raidOutcome, scoutTheCamp, campFogVisibility, enemyCampStructuresDontRevealFog,
    campInfrastructure, campRoutine, sleepingCampGuard, campOutpostVisuals, campActivity, campBoars, campResourceRegrowth, retreatFromStaging,
    raidPetAndCargo, stagingShelterPayment, raidAutoDemolition, demonRaidPortalPlacement,
    undeadCampNoFire, scoutThreatAndBaseWork, raidWithoutCampAndScoutSelection, allCampTerritories
  };
})());
