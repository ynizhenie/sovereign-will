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
    createEnemyCamp();
    return {
      camp, duplicateStayedSingle: buildings.filter(building => building.enemyCampStructure && building.type === 'campfire').length === 1,
      guards: guards.length, guardsPassive, cols: COLS, hallX: townHall.x
    };
  }

  function intoCamp(opts = {}) {
    const opened = campOpens(opts);
    const hallX = townHall.x, cols = COLS, timerBefore = waveTimer;
    const party = settlers.filter(settler => settler.id >= 500);
    const sent = startRaid(party);
    const arrived = step(60, () => raid.phase === 'fight');
    return {
      opened, sent, party: raid.raiders.length, arrived, phase: raid.phase, raidActive,
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
    const sent = startRaid([scout], true);
    const timerBefore = waveTimer;
    let looked = false;
    const arrived = step(150, () => {
      waveTimer = 999;
      if (raid.phase === 'fight') looked = true;
      return looked && raid.phase === null;
    });
    return {
      opened, sent, arrived, looked, phase: raid.phase, campStays: !!enemyCamp,
      raidActive, timerPaused: timerBefore === 999 || waveTimer === 999
    };
  }

  function campInfrastructure({ seed = 'camp-infrastructure' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    const camp = { ...enemyCamp };
    buildings.push(
      { type: 'warehouse', side: 'red', x: camp.x + TILE_SIZE * 2, y: camp.y, enemyCampStructure: true },
      { type: 'campfire', side: 'red', x: camp.x + TILE_SIZE * 3, y: camp.y, hp: 100, maxHp: 100, enemyCampStructure: true }
    );
    enemyTents.push({ x: camp.x, y: camp.y, hp: 100, maxHp: 100, campStructure: true });
    normalizeEnemyCamp();
    const fire = buildings.find(building => building.enemyCampStructure && building.type === 'campfire');
    const campBuildings = buildings.filter(building => building.enemyCampStructure);
    const campBuildingsRed = campBuildings.every(building => building.side === 'red');
    const onlyCampfire = campBuildings.length === 1 && campBuildings[0].type === 'campfire';
    const noCampTents = !enemyTents.some(tent => tent.campStructure);
    const keepers = enemies.filter(enemy => enemy.campGuard && enemy.campFireKeeper);
    const wood = stock.wood;
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

    step(20, () => { waveTimer = 999; });
    const fireMaintained = fire.fuelLeft > 0 || fire.burning > 0;
    const keeperStaysByFire = keepers.length === 1 && Math.hypot(keepers[0].x - fire.x, keepers[0].y - fire.y) <= TILE_SIZE + 10;
    const playerFuelUnchanged = stock.wood >= wood && stock.firewood === firewood;
    return {
      campExists: !!enemyCamp, campBuildingsRed, onlyCampfire, noCampTents, oneKeeper: keepers.length === 1,
      legacyCampCleaned: campBuildings.length === 1 && noCampTents,
      fireMaintained, keeperStaysByFire, zoneExcluded, storageExcluded, soldierPatrolRadiusStable, playerFuelUnchanged
    };
  }

  function campActivity({ seed = 'camp-activity' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    const passive = createSettlerTick(1 / 60);
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

  return { campOpens, intoCamp, raidOutcome, scoutTheCamp, campInfrastructure, campActivity };
})());
