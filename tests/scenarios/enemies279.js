// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources } } = window.sim;
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); if (each && each(f)) return true; } return false; };

  // A wave gathers before it attacks (44), and a big one has a commander giving orders (45)
  function waveMusters({ seed = 'muster' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    createEnemyCamp();
    waveNum = 12; startNextWave(); waveTimer = 999;
    const wave = enemies.filter(en => en.fromWave);
    const from = wave.map(en => ({ x: en.x, y: en.y }));
    step(3, () => { waveTimer = 999; });
    const early = Math.max(...wave.filter(en => !en.buildTarget)
      .map(en => Math.hypot(en.x - from[wave.indexOf(en)].x, en.y - from[wave.indexOf(en)].y)));
    const captain = wave.find(en => en.captain);
    let ordered = 0;
    step(6, () => { waveTimer = 999; ordered = Math.max(ordered, enemies.filter(en => en.orderBubble && en.orderBubble.until > pathTick && !en.captain).length); });
    const later = Math.max(...wave.filter(en => enemies.includes(en)).map(en => Math.hypot(en.x - from[wave.indexOf(en)].x, en.y - from[wave.indexOf(en)].y)));
    return { size: wave.length, early, later, captain: !!captain, ordered };
  }

  function wavePreparationTiming({ seed = 'wave-preparation' } = {}) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x + 200, townHall.y, { weapon: 'fist', role: 'worker', speed: 0 });
    settlers = [s];
    const enemy = createConfiguredEnemy({ x: s.x + 10, y: s.y }, 'raider');
    enemy.fromWave = true;
    enemy.prepWave = game.waveNum;
    enemy.speed = 0;
    enemy.muster = { x: enemy.x, y: enemy.y };
    enemies = [enemy];
    enemyTents = [{
      x: s.x + 100, y: s.y, hp: 100, maxHp: 100,
      waveActive: true, summonsLeft: 1, summonTimer: GAME_CONFIG.enemyTents.summonInterval
    }];
    game.waveTimer = 20;
    game.wavePreparation = { wave: game.waveNum, stage: 'gather' };
    const hpBefore = s.hp;
    const prepTentAssault = createSettlerTick(1 / 60).tentAssault;
    const enemiesBeforeTentTick = enemies.length;
    tickEnemyTents(1 / 60);
    const tentHeldFire = enemies.length === enemiesBeforeTentTick;
    tickEnemy(enemy, 1 / 60);
    const enemyHeldFire = s.hp === hpBefore;
    game.wavePreparation = null;
    tickEnemyTents(1 / 60);
    const tentFiredAfterStart = enemies.length === enemiesBeforeTentTick + 1;
    game.waveTimer = 0;
    enemy.nextStrikeTick = 0;
    tickEnemy(enemy, 1 / 60);
    return {
      prepTentAssault,
      tentHeldFire,
      tentFiredAfterStart,
      enemyHeldFire,
      enemyAttackedAfterStart: s.hp < hpBefore,
      tentAssaultAfterStart: createSettlerTick(1 / 60).tentAssault
    };
  }

  function wavePreparationPathAvoidsPlayerTerritory({ seed = 'wave-safe-path' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    clearResources();
    const territory = getTerritoryBox();
    const startX = territory.x0 - TILE_SIZE * 4;
    const targetX = territory.x1 + TILE_SIZE * 4;
    const enemy = createConfiguredEnemy({ x: startX, y: townHall.y }, 'raider');
    enemy.fromWave = true;
    enemy.prepWave = game.waveNum;
    enemy.muster = { x: targetX, y: townHall.y };
    game.wavePreparation = { wave: game.waveNum, stage: 'gather' };
    enemies = [enemy];
    let enteredPlayerZone = false;
    for (let frame = 0; frame < 60 * 25; frame++) {
      game.pathTick++;
      tickEnemy(enemy, 1 / 60);
      if (inTerritory(enemy.x, enemy.y)) enteredPlayerZone = true;
    }
    return {
      enteredPlayerZone,
      movedTowardTarget: enemy.x > startX,
      stayedOutDuringPreparation: game.wavePreparation?.stage === 'gather'
    };
  }

  function waveBuilderStartsNearRally({ seed = 'wave-builder-rally' } = {}) {
    const previousFaction = sides.enemy.faction;
    try {
      const results = [];
      for (const faction of ['humans', 'undead']) {
        sides.enemy.faction = faction;
        for (const interval of [30, 10]) {
          game.mapSettings = { cols: 128, rows: 128 };
          start(`${seed}-${faction}-${interval}`);
          clearResources();
          createEnemyCamp();
          game.waveNum = 12;
          game.waveInterval = interval;
          game.waveTimer = interval + 0.01;
          tickWaveTimer(0.02);
          const builder = enemies.find(enemy => enemy.fromWave && enemy.waveTentBuilder);
          if (!builder) throw new Error(`The ${faction} ${interval}-second wave has no tent builder`);
          const preparationSeconds = Math.min(GAME_CONFIG.waveMuster.preparationSeconds, interval);
          const departure = Math.min(GAME_CONFIG.waveMuster.departureSeconds, preparationSeconds / 2);
          const gatherSeconds = interval > GAME_CONFIG.waveMuster.departureSeconds ? preparationSeconds - departure : 0;
          for (let frame = 0; frame < gatherSeconds * 60; frame++) {
            game.pathTick++;
            tickEnemy(builder, 1 / 60);
          }
          game.waveTimer = departure + 0.01;
          tickWaveTimer(0.02);
          const site = builder.tentBuildTarget;
          if (!site) throw new Error(`The ${faction} ${interval}-second wave builder has no construction site`);
          const marchSeconds = interval <= GAME_CONFIG.waveMuster.departureSeconds ? preparationSeconds : departure;
          for (let frame = 0; frame < marchSeconds * 60; frame++) {
            game.pathTick++;
            tickEnemy(builder, 1 / 60);
          }
          game.waveTimer = 0.01;
          tickWaveTimer(0.02);
          tickEnemy(builder, 1 / 60);
          const buildSite = builder.buildTarget;
          results.push({
            faction,
            interval,
            siteNearRally: !!buildSite && Math.hypot(buildSite.x - builder.muster.x, buildSite.y - builder.muster.y) <= TILE_SIZE * 5,
            beganBuilding: !!buildSite && buildSite.progress > 0,
            siteRemainsOutsidePlayerZone: !!buildSite && !inTerritory(buildSite.x, buildSite.y)
          });
        }
      }
      return results;
    } finally {
      sides.enemy.faction = previousFaction;
    }
  }

  function waveMustersOutsideCamp({ seed = 'wave-muster-outside-camp' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    clearResources();
    createEnemyCamp();
    const camp = { ...enemyCamp };
    game.wavePreparation = { wave: game.waveNum, stage: 'gather' };
    startNextWave(true);
    const wave = enemies.filter(enemy => enemy.fromWave);
    const spawnAtCamp = wave.every(enemy => inEnemyTerritory(enemy.x, enemy.y));
    const stagingOutsideCamp = wave.every(enemy =>
      Math.hypot(enemy.muster.x - camp.x, enemy.muster.y - camp.y) > (camp.radius + 1) * TILE_SIZE);
    const stagingOutsidePlayerBase = wave.every(enemy => !inTerritory(enemy.muster.x, enemy.muster.y));
    for (let frame = 0; frame < 300; frame++) {
      game.pathTick++;
      for (const enemy of wave) tickEnemy(enemy, 1 / 60);
    }
    return {
      count: wave.length,
      spawnAtCamp,
      stagingOutsideCamp,
      stagingOutsidePlayerBase,
      preparationKeepsEnemiesOut: wave.every(enemy => !inTerritory(enemy.x, enemy.y))
    };
  }

  function waveStagesAtPlayerBoundary({ seed = 'wave-player-boundary' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    clearResources();
    createEnemyCamp();
    const camp = { ...enemyCamp };
    const previousWaveEnemy = createConfiguredEnemy({ x: townHall.x - 200, y: townHall.y }, 'raider');
    previousWaveEnemy.fromWave = true;
    previousWaveEnemy.muster = { x: previousWaveEnemy.x - 40, y: previousWaveEnemy.y + 20 };
    enemies.push(previousWaveEnemy);
    const previousMuster = { ...previousWaveEnemy.muster };
    game.waveTimer = 30.01;
    tickWaveTimer(0.02);
    const wave = enemies.filter(enemy => enemy.fromWave && enemy.hp > 0 && enemy.prepWave === game.waveNum);
    const spawnedAtCamp = wave.length > 0 && wave.every(enemy => inEnemyTerritory(enemy.x, enemy.y));
    game.waveTimer = 15.01;
    tickWaveTimer(0.02);
    const targets = wave.map(enemy => enemy.muster);
    const toCamp = { x: camp.x - townHall.x, y: camp.y - townHall.y };
    const stagingAtBoundary = targets.every(target => target &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inTerritory(target.x + dx * TILE_SIZE, target.y + dy * TILE_SIZE)));
    const allHaveSafeRoutes = wave.every(enemy => enemy.musterRoute?.length > 0);
    const stagingOnCampSide = targets.every(target => (target.x - townHall.x) * toCamp.x +
      (target.y - townHall.y) * toCamp.y > Math.hypot(toCamp.x, toCamp.y) ** 2 * 0.25);
    const previousWaveUnaffected = previousWaveEnemy.muster.x === previousMuster.x &&
      previousWaveEnemy.muster.y === previousMuster.y && previousWaveEnemy.musterUntil == null;
    const tentBuilders = wave.filter(enemy => enemy.tentBuildTarget);
    const buildersNearStaging = tentBuilders.length > 0 && tentBuilders.every(enemy =>
      Math.hypot(enemy.tentBuildTarget.x - enemy.muster.x, enemy.tentBuildTarget.y - enemy.muster.y) <= TILE_SIZE * 5);
    let enteredPlayerZone = false;
    for (let frame = 0; frame < 15 * 60; frame++) {
      game.pathTick++;
      for (const enemy of wave) {
        tickEnemy(enemy, 1 / 60);
        if (inTerritory(enemy.x, enemy.y)) enteredPlayerZone = true;
      }
    }
    return {
      spawnedAtCamp,
      preparationStage: game.wavePreparation?.stage,
      stagingAtBoundary,
      stagingOnCampSide,
      previousWaveUnaffected,
      buildersNearStaging,
      allHaveSafeRoutes,
      allTargetsOutsidePlayerZone: targets.every(target => !inTerritory(target.x, target.y)),
      enteredPlayerZone
    };
  }

  function shortWaveIntervals({ seed = 'short-wave-intervals' } = {}) {
    return [30, 10].map(interval => {
      game.mapSettings = { cols: 128, rows: 128 };
      start(`${seed}-${interval}`);
      clearResources();
      createEnemyCamp();
      waveNum = 1;
      game.waveInterval = interval;
      game.waveTimer = interval;
      tickWaveTimer(1 / 60);
      const spawnedBeforeStart = enemies.filter(enemy => enemy.fromWave && enemy.prepWave === waveNum).length;
      for (let frame = 1; frame <= interval * 60 && waveNum === 1; frame++) tickWaveTimer(1 / 60);
      return {
        interval,
        spawnedBeforeStart,
        waveStarted: waveNum === 2 && !game.wavePreparation,
        waveEnemiesRemain: enemies.some(enemy => enemy.fromWave)
      };
    });
  }

  function waveStructuresSpawnUnits({ seed = 'wave-structure-spawns' } = {}) {
    const previousFaction = sides.enemy.faction;
    try {
      const results = [];
      for (const faction of ['humans', 'undead']) {
        sides.enemy.faction = faction;
        game.mapSettings = { cols: 128, rows: 128 };
        start(`${seed}-${faction}`);
        clearResources();
        createEnemyCamp();
        game.wavePreparation = { wave: game.waveNum, stage: 'gather' };
        startNextWave(true);
        const builder = enemies.find(enemy => enemy.tentBuildTarget);
        if (!builder) throw new Error(`The ${faction} wave spawned without a structure builder`);
        const site = builder.tentBuildTarget;
        game.waveTimer = 0.01;
        tickWaveTimer(0.02);
        if (!builder.buildTarget) throw new Error(`The ${faction} builder did not start construction with the wave`);
        builder.x = site.x;
        builder.y = site.y;
        tickEnemy(builder, site.maxProgress / GAME_CONFIG.enemyTents.buildRate + 1);
        const structure = enemyTents.find(tent => tent.waveActive && tent.x === site.x && tent.y === site.y);
        if (!structure) throw new Error(`The ${faction} wave structure was not completed`);
        const enemyCount = enemies.length;
        const frames = Math.ceil((GAME_CONFIG.enemyTents.summonInterval * GAME_CONFIG.enemyTents.summonsPerWave + 0.1) * 60);
        for (let frame = 0; frame < frames; frame++) tickEnemyTents(1 / 60);
        results.push({
          faction,
          spawner: structure.spawner,
          expectedSpawner: getEnemyFaction().spawner || 'tent',
          spawnedUnit: enemies.length > enemyCount && enemies.slice(enemyCount).some(enemy => enemy.waveSummoned)
        });
      }
      return results;
    } finally {
      sides.enemy.faction = previousFaction;
    }
  }

  function wavesArriveByRaftWithoutCamp({ seed = 'waves-by-raft' } = {}) {
    start(seed);
    clearResources();
    game.enemyCamp = null;
    game.enemyCampDestroyed = false;
    game.enemyTents = [];
    game.enemyTentBlueprints = [];
    game.waveNum = 1;
    startNextWave();
    return {
      noImmediateEnemies: enemies.length === 0,
      raftUnits: enemyRafts.reduce((sum, raft) => sum + raft.units.length, 0),
      allWaveEnemies: enemyRafts.every(raft => raft.units.every(enemy => enemy.fromWave))
    };
  }

  function raftWavePreparation({ seed = 'raft-wave-preparation' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    clearResources();
    game.enemyCamp = null;
    game.enemyCamps = [];
    game.enemyTents = [];
    game.waveNum = 1;
    game.waveTimer = 30.01;
    tickWaveTimer(0.02);
    const raftsStartedOutside = enemyRafts.length > 0 && enemyRafts.every(raft =>
      raft.x < 0 || raft.y < 0 || raft.x > game.WORLD_WIDTH || raft.y > game.WORLD_HEIGHT);
    const rafts = enemyRafts.slice();
    const safeLandingSlots = rafts.every(raft => raft.landingSlots?.length === raft.units.length &&
      raft.landingSlots.every((slot, index) => {
        const grid = getGridPos(slot.x, slot.y);
        return !isTileBlockedForEnemyStrict(grid.gx, grid.gy) &&
          raft.landingSlots.slice(index + 1).every(other =>
            Math.hypot(slot.x - other.x, slot.y - other.y) >= raft.units[index].radius + raft.units[raft.landingSlots.indexOf(other)].radius + 2);
      }));
    let raftsDeparting = false;
    for (let frame = 0; frame < 15 * 60; frame++) {
      game.pathTick++;
      tickEnemyRafts(1 / 60);
      raftsDeparting ||= enemyRafts.some(raft => raft.phase === 'departing' && raft.units.length === 0);
    }
    const landed = enemies.filter(enemy => enemy.fromWave && enemy.prepWave === game.waveNum);
    const landedOnSafeTiles = landed.every(enemy => {
      const grid = getGridPos(enemy.x, enemy.y);
      return !isTileBlockedForEnemyStrict(grid.gx, grid.gy);
    });
    game.waveTimer = 15.01;
    tickWaveTimer(0.02);
    const box = getTerritoryBox();
    const stagedAtBoundary = landed.length > 0 && landed.every(enemy => enemy.muster &&
      !inTerritory(enemy.muster.x, enemy.muster.y) &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
        inTerritory(enemy.muster.x + dx * TILE_SIZE, enemy.muster.y + dy * TILE_SIZE)));
    const stagedOnArrivalSide = landed.every(enemy =>
      enemy.waveArrivalSide === 'west' ? enemy.muster.x < box.x0 :
        enemy.waveArrivalSide === 'east' ? enemy.muster.x >= box.x1 :
          enemy.waveArrivalSide === 'north' ? enemy.muster.y < box.y0 : enemy.muster.y >= box.y1);
    const musterDistanceBefore = landed.map(enemy => Math.hypot(enemy.x - enemy.muster.x, enemy.y - enemy.muster.y));
    let enteredPlayerZone = false;
    for (let frame = 0; frame < 15 * 60; frame++) {
      game.pathTick++;
      tickEnemyRafts(1 / 60);
      for (const enemy of landed) {
        tickEnemy(enemy, 1 / 60);
        if (inTerritory(enemy.x, enemy.y)) enteredPlayerZone = true;
      }
    }
    const movedTowardMuster = landed.every((enemy, index) =>
      Math.hypot(enemy.x - enemy.muster.x, enemy.y - enemy.muster.y) < 6 ||
      Math.hypot(enemy.x - enemy.muster.x, enemy.y - enemy.muster.y) < musterDistanceBefore[index] - 1);
    return {
      raftsStartedOutside, raftsDeparting, raftsGone: enemyRafts.length === 0,
      landed: landed.length, preparationStage: game.wavePreparation?.stage,
      stagedAtBoundary, stagedOnArrivalSide, safeLandingSlots, landedOnSafeTiles, movedTowardMuster, enteredPlayerZone
    };
  }

  function demonWaveWithoutCamp({ seed = 'demon-wave-without-camp' } = {}) {
    sides.enemy.faction = 'demons';
    start(seed);
    clearResources();
    game.enemyCamp = null;
    game.enemyCamps = [];
    game.enemyCampDestroyed = false;
    game.enemyTents = [];
    game.enemyTentBlueprints = [];
    game.waveNum = 1;
    game.waveTimer = 15.01;
    tickWaveTimer(0.02);
    const noCampPreparation = game.wavePreparation === null && enemies.every(enemy => !enemy.fromWave) &&
      enemyTents.every(tent => !tent.wavePortal);
    game.waveTimer = 0.01;
    tickWaveTimer(0.02);
    return {
      noCampPreparation,
      waveStartsNormally: game.wavePreparation === null && game.waveNum === 2,
      enemiesSpawnAfterStart: enemies.some(enemy => enemy.fromWave),
      portalOpenedAfterStart: enemyTents.some(tent => tent.portal && !tent.campStructure)
    };
  }

  function demonCampWavePortals({ seed = 'demon-camp-wave-portals' } = {}) {
    sides.enemy.faction = 'demons';
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    clearResources();
    const camp = createEnemyCamp();
    if (!camp) throw new Error('The demon wave portal test needs an enemy camp');
    game.waveNum = 1;
    game.waveTimer = 15.01;
    tickWaveTimer(0.02);
    const source = game.wavePreparation?.portalSource;
    const wave = enemies.filter(enemy => enemy.fromWave && enemy.prepWave === game.waveNum);
    const preparedAtCamp = game.wavePreparation?.stage === 'portal' && source?.campStructure &&
      source.campId === camp.id && inEnemyTerritory(source.x, source.y) && wave.length > 0;
    let stayedAtCamp = true;
    step(3, () => {
      waveTimer = 14;
      stayedAtCamp = stayedAtCamp && wave.every(enemy => inEnemyTerritory(enemy.x, enemy.y));
    });
    game.waveTimer = 0.01;
    tickWaveTimer(0.02);
    const transit = game.demonWaveTransit;
    const exitPosition = transit?.exit;
    const exit = exitPosition && enemyTents.find(portal =>
      portal.x === exitPosition.x && portal.y === exitPosition.y);
    const exitAtColonyEdge = !!exitPosition && inTerritory(exitPosition.x, exitPosition.y) &&
      Math.hypot(exitPosition.x - townHall.x, exitPosition.y - townHall.y) > getBaseRadius();
    step(6, () => { waveTimer = 10; });
    const sourceRemoved = !enemyTents.includes(source);
    const exitRemains = !!exit && enemyTents.includes(exit);
    const exitSpawnsUnits = !!exit && exit.waveActive && exit.summonsLeft < GAME_CONFIG.enemyTents.summonsPerWave &&
      enemies.some(enemy => enemy.waveSummoned);
    let soldierCanDamageExit = false;
    if (exitRemains) {
      enemies = [];
      enemyTents = [exit];
      const soldier = makeSettler(1, exit.x + 10, exit.y, { weapon: 'sword', role: 'soldier' });
      settlers = [soldier];
      const hpBefore = exit.hp;
      clearEnemyTents(soldier, { tentAssault: true, dt: 1 / 60, markedAssignments: new Map() });
      soldierCanDamageExit = exit.hp < hpBefore;
    }
    return {
      preparedAtCamp, stayedAtCamp, exitAtColonyEdge,
      sourceRemoved,
      exitRemains, exitSpawnsUnits, soldierCanDamageExit,
      emerged: !!exitPosition && wave.length > 0 && wave.every(enemy =>
        !enemy.portalTransit && inTerritory(enemy.x, enemy.y)),
      prepCleared: game.wavePreparation === null
    };
  }

  function tentBlueprintAppearsOnArrival({ seed = 'tent-blueprint-arrival' } = {}) {
    start(seed);
    clearResources();
    const site = { x: townHall.x + 360, y: townHall.y, progress: 0, maxProgress: GAME_CONFIG.enemyTents.buildWork, builder: null };
    const builder = createConfiguredEnemy({ x: site.x + GAME_CONFIG.enemyTents.buildDistance + 7, y: site.y }, 'raider');
    builder.speed = 0;
    builder.buildTarget = site;
    site.builder = builder;
    enemies = [builder];
    enemyTentBlueprints = [];
    tickEnemy(builder, 1 / 60);
    const hiddenUntilArrival = enemyTentBlueprints.length === 0;
    builder.x = site.x + GAME_CONFIG.enemyTents.buildDistance - 2;
    tickEnemy(builder, 1 / 60);
    const fillRect = ctx.fillRect;
    let blueprintTileDrawn = false;
    ctx.fillRect = function (x, y, width, height) {
      if (x === site.x - 14 && y === site.y - 14 && width === 28 && height === 28) blueprintTileDrawn = true;
      return fillRect.call(this, x, y, width, height);
    };
    try { drawEnemyTentSites(); }
    finally { ctx.fillRect = fillRect; }
    return {
      hiddenUntilArrival,
      shownWhenBuilding: enemyTentBlueprints.includes(site),
      startedProgress: site.progress > 0,
      builderAnimating: builder.working > 0 && builder.workKind === 'build',
      blueprintTileDrawn
    };
  }

  function waveTentSitesNearPlayerTerritory({ seed = 'wave-tents-near-player' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    clearResources();
    createEnemyCamp();
    waveNum = 12;
    startNextWave(true);
    const builders = enemies.filter(enemy => enemy.fromWave && enemy.tentBuildTarget);
    const nearPlayerTerritory = site => {
      const { gx, gy } = getGridPos(site.x, site.y);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS &&
          inTerritory(x * TILE_SIZE + 15, y * TILE_SIZE + 15)) return true;
      }
      return false;
    };
    return {
      builders: builders.length,
      allNearPlayerTerritory: builders.every(enemy => nearPlayerTerritory(enemy.tentBuildTarget)),
      allOutsidePlayerTerritory: builders.every(enemy => !inTerritory(enemy.tentBuildTarget.x, enemy.tentBuildTarget.y)),
      allOutsideCamp: builders.every(enemy =>
        !inEnemyTerritory(enemy.tentBuildTarget.x, enemy.tentBuildTarget.y))
    };
  }

  function enemyCampVoicePhrases({ seed = 'enemy-camp-voices' } = {}) {
    start(seed);
    clearResources();
    const faction = getEnemyFaction().id;
    const guard = { enemyKey: GAME_CONFIG.factions[faction].enemies[0], type: 'normal' };
    return {
      faction,
      camp: phrasesFor(guard, faction, 'camp'),
      idle: phrasesFor(guard, faction, 'idle')
    };
  }

  // Scouts between waves: they walk the red band, settlers leave them be, they run when one comes near;
  // pointed at, one is hunted and runs off (23)
  function scoutsBetweenWaves({ seed = 'scouts' } = {}) {
    start(seed);
    waveNum = 4; scoutClock = 0; GAME_CONFIG.scouts.chance = 1;
    const seen = [];
    step(42, () => { waveTimer = 999; if (scouts.length) seen.push(...scouts.map(s => ({ x: s.x, y: s.y }))); });
    const band = (BORDER_MARGIN + 0.6) * TILE_SIZE;
    const inBand = seen.every(p => p.x < band || p.y < band || p.x > WORLD_WIDTH - band || p.y > WORLD_HEIGHT - band);
    const count = scouts.length;
    const scout = scouts[0];
    const notEnemy = !enemies.includes(scout);
    // pointed at: an enemy now, marked, running off
    scoutTapped(scout.x, scout.y);
    const hunted = enemies.includes(scout) && scout.markedTarget;
    // (#279, c1.11) not off at once: only once one of them comes near it
    settlers.forEach(s => { s.speed = 0; });
    step(3, () => { waveTimer = 999; });
    const stays = enemies.includes(scout) && !scout.fleeing;
    settlers[0].x = scout.x + (scout.x < WORLD_WIDTH / 2 ? 60 : -60); settlers[0].y = scout.y;
    step(12, () => { waveTimer = 999; });
    GAME_CONFIG.scouts.chance = 0.5;
    return { count, inBand, notEnemy, hunted, stays, goneOff: !enemies.includes(scout) };
  }

  // The camp is a single, persistent part of the Endless map, not a second map that opens after waves.
  function campLayouts({ seed = 'layouts' } = {}) {
    const first = window.sim.campOpens({ seed });
    const signature = () => [
      buildings.filter(building => building.enemyCampStructure).map(building => `${building.type}@${building.x},${building.y}`).sort().join('|'),
      enemyTents.filter(tent => tent.campStructure).map(tent => `${tent.x},${tent.y},${tent.hp}`).sort().join('|'),
      enemies.filter(enemy => enemy.campGuard).map(enemy => `${enemy.enemyKey}@${enemy.x},${enemy.y}`).sort().join('|')
    ].join('#');
    const before = signature();
    normalizeEnemyCamp();
    return {
      same: before === signature(), campExists: !!enemyCamp,
      sameWorld: COLS === first.cols && townHall.x === first.hallX,
      outpost: enemyTents.filter(tent => tent.campStructure && tent.outpost).length,
      campfires: buildings.filter(building => building.enemyCampStructure && building.type === 'campfire').length,
      layout: enemyCamp.layout,
      structureType: enemyCamp.structureType,
      structureCount: enemyCamp.structureCount,
      homes: enemyTents.filter(tent => tent.campStructure && !tent.outpost && !tent.wavePortal).map(tent => tent.campType),
      guards: enemies.filter(enemy => enemy.campGuard).length
    };
  }

  // A scout sent to the camp: it walks there, looks, is spotted, comes home; the camp is still there (33)
  function scoutTheCamp({ seed = 'scout-camp' } = {}) {
    window.sim.campOpens({ seed });
    const camp = { ...enemyCamp };
    waveTimer = 999;
    const sent = sendScout();
    const timerBefore = waveTimer, scout = raid.raiders[0];
    let looked = false, outsideDuringLook = false, guardsPassiveDuringLook = false;
    step(150, () => {
      if (raid.phase === 'fight') {
        looked = true;
        outsideDuringLook = !inEnemyTerritory(scout.x, scout.y);
        guardsPassiveDuringLook = enemies.filter(enemy => enemy.campGuard).every(enemy => !enemy.guardOff);
      }
      return looked && raid.phase === null;
    });
    return {
      sent, looked, outsideDuringLook, guardsPassiveDuringLook, timerAdvanced: waveTimer < timerBefore,
      campStays: !!enemyCamp && enemyCamp.seed === camp.seed, phase: raid.phase, home: settlers.length, raidActive
    };
  }

  return { waveMusters, wavePreparationTiming, wavePreparationPathAvoidsPlayerTerritory, waveBuilderStartsNearRally, waveMustersOutsideCamp, waveStagesAtPlayerBoundary, shortWaveIntervals, waveStructuresSpawnUnits, wavesArriveByRaftWithoutCamp, raftWavePreparation, demonWaveWithoutCamp, demonCampWavePortals, tentBlueprintAppearsOnArrival, waveTentSitesNearPlayerTerritory, enemyCampVoicePhrases, scoutsBetweenWaves, campLayouts, scoutTheCamp };
})());
