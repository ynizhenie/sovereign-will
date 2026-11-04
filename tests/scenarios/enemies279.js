// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources } } = window.sim;
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); if (each && each(f)) return true; } return false; };

  // A wave gathers before it attacks (44), and a big one has a commander giving orders (45)
  function waveMusters({ seed = 'muster' } = {}) {
    start(seed);
    waveNum = 12; startNextWave(); waveTimer = 999;
    const wave = enemies.filter(en => en.fromWave);
    const from = wave.map(en => ({ x: en.x, y: en.y }));
    step(3, () => { waveTimer = 999; });
    // gathering: by the edge they came in at (not one told to go by its commander, nor a tent builder)
    const fromEdge = en => Math.min(en.x, en.y, WORLD_WIDTH - en.x, WORLD_HEIGHT - en.y);
    const early = Math.max(...wave.filter(en => en.musterUntil && !en.buildTarget).map(fromEdge));
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
    enemy.speed = 0;
    enemy.muster = { x: enemy.x, y: enemy.y };
    enemies = [enemy];
    enemyTents = [{
      x: s.x + 100, y: s.y, hp: 100, maxHp: 100,
      summonsLeft: 1, summonTimer: GAME_CONFIG.enemyTents.summonInterval
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
    createEnemyCamp();
    return {
      same: before === signature(), campExists: !!enemyCamp,
      sameWorld: COLS === first.cols && townHall.x === first.hallX,
      outpost: enemyTents.filter(tent => tent.campStructure).length,
      campfires: buildings.filter(building => building.enemyCampStructure && building.type === 'campfire').length,
      guards: enemies.filter(enemy => enemy.campGuard).length
    };
  }

  // A scout sent to the camp: it walks there, looks, is spotted, comes home; the camp is still there (33)
  function scoutTheCamp({ seed = 'scout-camp' } = {}) {
    window.sim.campOpens({ seed });
    const camp = { ...enemyCamp };
    const sent = sendScout();
    let looked = false;
    step(150, () => { waveTimer = 999; if (raid.phase === 'fight') looked = true; return looked && raid.phase === null; });
    return { sent, looked, campStays: !!enemyCamp && enemyCamp.seed === camp.seed, phase: raid.phase, home: settlers.length, raidActive };
  }

  return { waveMusters, wavePreparationTiming, scoutsBetweenWaves, campLayouts, scoutTheCamp };
})());
