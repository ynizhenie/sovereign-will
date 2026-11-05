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
    let looked = false, outsideDuringLook = false, guardsPassiveDuringLook = false;
    const arrived = step(150, () => {
      if (raid.phase === 'fight') {
        looked = true;
        outsideDuringLook = !inEnemyTerritory(scout.x, scout.y);
        guardsPassiveDuringLook = enemies.filter(enemy => enemy.campGuard).every(enemy => !enemy.guardOff);
      }
      return looked && raid.phase === null;
    });
    return {
      opened, sent, arrived, looked, outsideDuringLook, guardsPassiveDuringLook, phase: raid.phase, campStays: !!enemyCamp,
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
    const fireBesideOutpost = Math.abs(fireGrid.gx - outpostGrid.gx) + Math.abs(fireGrid.gy - outpostGrid.gy) === 1;
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

  function retreatFromStaging({ seed = 'raid-staging-retreat' } = {}) {
    campOpens({ seed, soldiers: 2 });
    const party = settlers.filter(settler => settler.id >= 500);
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

  return { campOpens, intoCamp, raidOutcome, scoutTheCamp, campFogVisibility, enemyCampStructuresDontRevealFog, campInfrastructure, campOutpostVisuals, campActivity, campBoars, retreatFromStaging };
})());
