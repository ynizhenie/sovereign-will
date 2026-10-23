// Pre-wave deployment (#14)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // 7 swordsmen and 2 archers, a door and a few walls, 9 s before a wave. Returns the plan and where they stand.
  function deployment({ seed = 'defense-test', seconds = 12 }) {
    start(seed);
    clearResources();
    const door = nearHall(6, 0);
    placeBuilding('door', door.x, door.y);
    placeBuilding('wall_wood', nearHall(6, 1).x, nearHall(6, 1).y);
    placeBuilding('wall_wood', nearHall(-5, -4).x, nearHall(-5, -4).y);
    invalidateAllPaths();
    settlers = [];
    for (let i = 0; i < 7; i++) settlers.push(makeSettler(i + 1, townHall.x - 40 + (i % 4) * 25, townHall.y + 45 + Math.floor(i / 4) * 25, { weapon: 'sword', role: 'soldier' }));
    for (let i = 0; i < 2; i++) settlers.push(makeSettler(20 + i, townHall.x + 40, townHall.y - 45 - i * 25, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 }));
    defensePlan = null;
    waveTimer = 9; // the alert is on from deploySeconds before the wave
    window.sim.run(seconds, { holdWaves: false, each: () => { if (waveTimer < 2) waveTimer = 9; } });
    const plan = getDefensePlan();
    const radius = getBaseRadius();
    const offPost = settlers.filter(s => plan.squadOf.has(s)).map(s => Math.hypot(s.x - plan.squadOf.get(s).post.x, s.y - plan.squadOf.get(s).post.y));
    return {
      squads: plan.posts.length,
      firstPostByDoor: Math.hypot(plan.posts[0].x - door.x, plan.posts[0].y - door.y) <= TILE_SIZE * 1.5,
      postsWithinBase: plan.posts.every(p => Math.hypot(p.x - townHall.x, p.y - townHall.y) <= radius + TILE_SIZE * 1.5),
      allAtPosts: Math.max(...offPost) < 30
    };
  }

  // One squad at its post; a wave raider standing off, then walking up to it
  function holdAndEngage({ seed = 'engage-test' }) {
    start(seed);
    clearResources();
    // two squads (fewer would stand one to a post, #155); the first one is watched
    settlers = [0, 1, 2, 3, 4, 5].map(i => makeSettler(i + 1, townHall.x - 50 + i * 20, townHall.y + 50, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 }));
    // the wave's enemy north of the base first: the posts face it (#202)
    const en = createConfiguredEnemy({ x: townHall.x, y: townHall.y - 16 * TILE_SIZE }, 'raider');
    en.fromWave = true; en.speed = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    defensePlan = null;
    const post = getDefensePlan().posts[0];
    const squad = settlers.filter(s => getDefensePlan().squadOf.get(s).post === post);
    en.x = post.x; en.y = post.y - 12 * TILE_SIZE;
    run(8, { each: () => { waveTimer = 50; } });
    const held = squad.every(s => Math.hypot(s.x - post.x, s.y - post.y) < 30);
    en.y = post.y - 4 * TILE_SIZE; // now within 6 tiles of the post
    run(6, { each: () => { waveTimer = 50; } });
    return { held, engaged: en.hp < en.maxHp };
  }

  // Ahead of a wave, an archer climbs a tower that has arrows
  function archersManTowers({ seed = 'tower-alert-test' }) {
    start(seed);
    clearResources();
    const tower = placeBuilding('watchtower', nearHall(4, 0).x, nearHall(4, 0).y);
    tower.arrows = 6;
    settlers = [makeSettler(1, townHall.x - 40, townHall.y + 40, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 })];
    run(6, { holdWaves: false, each: () => { if (waveTimer > 8) waveTimer = 8; if (waveTimer < 1) waveTimer = 8; } });
    return { manned: tower.guards.length === 1 };
  }

  // During a wave, an axe worker chops a tree inside the base, leaves one far outside, and keeps working
  function workersStayClose({ seed = 'workers-alert-test', seconds = 20 }) {
    start(seed);
    clearResources();
    placeBuilding('wall_wood', nearHall(5, 0).x, nearHall(5, 0).y);
    const near = { ...nearHall(-3, 3), hp: 3, isGrowing: false, growProgress: 0 };
    const far = { ...nearHall(14, -10), hp: 3, isGrowing: false, growProgress: 0 };
    trees.push(near, far);
    invalidateAllPaths();
    const worker = makeSettler(1, townHall.x + 40, townHall.y + 40, { tool: 'axe' });
    settlers = [worker, makeSettler(2, townHall.x - 40, townHall.y, { weapon: 'sword', role: 'soldier', isPossessed: true })];
    const en = createConfiguredEnemy({ x: 3 * TILE_SIZE + 15, y: 3 * TILE_SIZE + 15 }, 'raider');
    en.fromWave = true; en.speed = 0; en.damage = 0;
    enemies = [en];
    let farthest = 0, sheltered = false;
    run(seconds, { each: () => {
      pendingRespawns.length = 0; waveTimer = 50;
      farthest = Math.max(farthest, Math.hypot(worker.x - townHall.x, worker.y - townHall.y));
      if (Math.hypot(worker.x - townHall.x, worker.y - townHall.y) < townHall.radius + 20 && !worker.carrying) sheltered = true;
    } });
    return { nearChopped: !trees.includes(near), farStanding: trees.includes(far), withinBase: farthest <= getBaseRadius() + 2 * TILE_SIZE };
  }

  // One squad posted at the top of the base; a wave raider gets to a wall at the bottom, far from the post (#131)
  function baseBreach({ seed = 'breach-test' }) {
    start(seed);
    clearResources();
    const wall = placeBuilding('wall_wood', nearHall(0, 4).x, nearHall(0, 4).y);
    invalidateAllPaths();
    settlers = [0, 1, 2].map(i => makeSettler(i + 1, townHall.x - 20 + i * 20, townHall.y - 50, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 }));
    defensePlan = null;
    const post = getDefensePlan().posts[0];
    const en = createConfiguredEnemy(nearHall(1, 5), 'raider');
    en.fromWave = true; en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    const farFromPost = Math.hypot(en.x - post.x, en.y - post.y) > GAME_CONFIG.defense.engageTiles * TILE_SIZE;
    run(10, { each: () => { waveTimer = 50; } });
    return { farFromPost, wallStands: buildings.includes(wall), engaged: en.hp < en.maxHp };
  }

  // Workers out gathering far from the base when the pre-wave alert starts, an apple tree with apples
  // out there too: they come back inside the base and leave the apples (#131)
  function workersComeBack({ seed = 'come-back-test', seconds = 12 }) {
    start(seed);
    clearResources();
    const apple = makeAppleTree({ ...nearHall(12, 8), hp: 3, isGrowing: false, growProgress: 0, priority: 0 });
    apple.applesReady = true;
    trees.push(apple);
    invalidateAllPaths();
    settlers = [makeSettler(1, nearHall(11, 8).x, nearHall(11, 8).y), makeSettler(2, nearHall(-12, -6).x, nearHall(-12, -6).y),
      makeSettler(3, nearHall(1, 1).x, nearHall(1, 1).y)];
    for (const s of settlers) s.needsRelief = s.id === 3;
    let leftBase = false;
    run(seconds, { holdWaves: false, each: f => {
      waveTimer = 8; apple.appleGrowth = 0;
      if (f > 6 * 60 && settlers.some(s => !isInSafeArea(s.x, s.y))) leftBase = true;
    } });
    return { allInside: settlers.every(s => isInSafeArea(s.x, s.y)), leftBase, applesLeft: apple.applesReady };
  }

  function unarmedDefend({ seed = 'unarmed-defend-test', seconds = 15 }) {
    sides.player.faction = 'humans';
    sides.enemy.faction = 'demons';
    start(seed);
    clearResources();
    const worker = makeSettler(1, townHall.x, townHall.y + 90, { tool: 'axe' });
    settlers = [worker];
    const enemy = createConfiguredEnemy({ x: townHall.x + 210, y: townHall.y }, 'demon_imp');
    Object.assign(enemy, { fromWave: true, campId: 'portal-camp', speed: 0, damage: 0 });
    enemies = [enemy];
    run(seconds);
    return { enemyHurt: enemy.hp < enemy.maxHp, workerMoved: Math.hypot(worker.x - (townHall.x), worker.y - (townHall.y + 90)) > 50 };
  }

  function noTentAssaultDuringCampLinkedWave({ seed = 'no-tent-assault-during-wave-test' }) {
    start(seed);
    clearResources();
    enemyTents = [{ x: townHall.x + TILE_SIZE * 8, y: townHall.y, hp: 300, maxHp: 300 }];
    const waveEnemy = createConfiguredEnemy({ x: townHall.x + TILE_SIZE * 10, y: townHall.y }, 'demon_imp');
    Object.assign(waveEnemy, { fromWave: true, campId: 'enemy-camp', speed: 0 });
    enemies = [waveEnemy];
    game.portalQueue = [];
    return { tentAssault: createSettlerTick(1 / 60).tentAssault };
  }

  function noTentAssaultDuringPreWaveWarning({ seed = 'no-tent-assault-before-wave-test' }) {
    start(seed);
    clearResources();
    enemyTents = [{ x: townHall.x + TILE_SIZE * 8, y: townHall.y, hp: 300, maxHp: 300 }];
    enemies = [];
    game.portalQueue = [];
    waveTimer = GAME_CONFIG.defense.deploySeconds;
    return { defenseAlert: isDefenseAlert(), tentAssault: createSettlerTick(1 / 60).tentAssault };
  }

  function waitsForRegroupedWave({ seed = 'wait-for-regrouped-wave-test' }) {
    start(seed);
    clearResources();
    const tent = { x: townHall.x + TILE_SIZE * 8, y: townHall.y, hp: 300, maxHp: 300 };
    enemyTents = [tent];
    const soldier = makeSettler(1, townHall.x, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [soldier];
    const enemy = createConfiguredEnemy({ x: townHall.x + TILE_SIZE * 7, y: townHall.y }, 'raider');
    Object.assign(enemy, { fromWave: true, campId: 'enemy-camp', speed: 0, musterUntil: game.pathTick + 600 });
    enemies = [enemy];
    const x = soldier.x, y = soldier.y;
    const acted = fightEnemies(soldier, createSettlerTick(1 / 60));
    return { insideBase: isInsideBase(enemy), acted, moved: Math.hypot(soldier.x - x, soldier.y - y) > 1 };
  }

  function holdsDuringFactionWaveMuster() {
    const previousPlayer = sides.player.faction, previousEnemy = sides.enemy.faction;
    const cases = [
      ['humans', 'raider'],
      ['demons', 'demon_imp'],
      ['undead', 'undead_zombie']
    ];
    const results = [];
    for (const [faction, enemyType] of cases) {
      sides.player.faction = 'humans';
      sides.enemy.faction = faction;
      start(`hold-${faction}-muster-test`);
      clearResources();
      waveTimer = 0;
      const soldier = makeSettler(1, townHall.x, townHall.y, { weapon: 'sword', role: 'soldier' });
      settlers = [soldier];
      defensePlan = null;
      const enemy = createConfiguredEnemy({ x: townHall.x + 110, y: townHall.y }, enemyType);
      Object.assign(enemy, {
        fromWave: true,
        speed: 0,
        damage: 0,
        muster: { x: enemy.x, y: enemy.y },
        musterUntil: game.pathTick + 600
      });
      enemies = [enemy];
      soldier.postTarget = enemy;
      soldier.captainTarget = enemy;

      tickEnemies(1 / 60);
      const heldAtPost = holdPost(soldier, createSettlerTick(1 / 60));
      const x = soldier.x, y = soldier.y;
      const acted = fightEnemies(soldier, createSettlerTick(1 / 60));
      results.push({
        faction,
        regrouping: enemy.musterUntil > game.pathTick,
        heldAtPost,
        acted,
        moved: Math.hypot(soldier.x - x, soldier.y - y) > 1,
        assignedTargetsCleared: !soldier.postTarget && !soldier.captainTarget
      });
    }
    sides.player.faction = previousPlayer;
    sides.enemy.faction = previousEnemy;
    return results;
  }

  function assaultOutpost({ seed = 'outpost-approach-test', seconds = 35 }) {
    start(seed);
    clearResources();
    const outpost = { x: townHall.x + TILE_SIZE * 8, y: townHall.y, outpost: true, hp: 300, maxHp: 300 };
    enemyTents = [outpost];
    settlers = [makeSettler(1, townHall.x, townHall.y, { weapon: 'sword', role: 'soldier' })];
    enemies = [];
    invalidateAllPaths();
    const before = outpost.hp;
    run(seconds);
    return { damaged: outpost.hp < before, destroyed: outpost.hp <= 0 };
  }

  function attackOutpostInTheWay({ seed = 'outpost-in-the-way-test', seconds = 20 }) {
    start(seed);
    clearResources();
    const y = townHall.y + 180;
    const outpost = { x: townHall.x + 120, y, outpost: true, hp: 300, maxHp: 300 };
    enemyTents = [outpost];
    const soldier = makeSettler(1, townHall.x - 180, y, { weapon: 'sword', role: 'soldier' });
    settlers = [soldier];
    const enemy = createConfiguredEnemy({ x: townHall.x + 360, y }, 'raider');
    Object.assign(enemy, { speed: 0, damage: 0 });
    enemies = [enemy];
    invalidateAllPaths();
    const before = outpost.hp;
    run(seconds, { each: () => { waveTimer = Infinity; } });
    return { damaged: outpost.hp < before };
  }

  function attackBattleBuildingInTheWay({ seed = 'battle-building-in-the-way-test', seconds = 30, weapon = 'sword' }) {
    start(seed);
    clearResources();
    const previousMode = game.gameMode;
    const previousBattlePhase = battle.phase;
    const previousHall = { x: townHall.x, y: townHall.y };
    game.gameMode = 'battle';
    battle.phase = 'fight';
    townHall.x = -10000;
    townHall.y = -10000;
    const wall = placeBuilding('wall_stone', 735, 615);
    wall.side = 'red';
    const soldier = makeSettler(1, 405, 615, {
      weapon, role: weapon === 'bow' ? 'archer' : 'soldier', quiver: weapon === 'bow', arrows: 12, quiverCapacity: 12,
      battleEntry: { x: 405, y: 615 }
    });
    settlers = [soldier];
    const enemy = createConfiguredEnemy({ x: 1035, y: 615 }, 'raider');
    Object.assign(enemy, { speed: 0, damage: 0, trapped: true });
    enemies = [enemy];
    invalidateAllPaths();
    const before = wall.hp;
    run(seconds);
    const damaged = wall.hp < before;
    game.gameMode = previousMode;
    battle.phase = previousBattlePhase;
    townHall.x = previousHall.x;
    townHall.y = previousHall.y;
    invalidateAllPaths();
    return { damaged };
  }

  function enemyBreaksWallOnTheWay({ seed = 'enemy-breaks-wall-on-the-way-test', seconds = 60 }) {
    start(seed);
    clearResources();
    settlers = [];
    const hallTile = getGridPos(townHall.x, townHall.y);
    const wallPos = tileCenter(hallTile.gx + 5, hallTile.gy);
    const wall = placeBuilding('wall_stone', wallPos.x, wallPos.y);
    const enemy = createConfiguredEnemy(tileCenter(hallTile.gx + 9, hallTile.gy), 'raider');
    Object.assign(enemy, { fromWave: true, speed: 1.5 });
    enemies = [enemy];
    invalidateAllPaths();
    const before = wall.hp;
    run(seconds);
    return { damaged: wall.hp < before };
  }

  function enemyRoutesAroundTree({ seed = 'enemy-routes-around-tree-test', seconds = 45 }) {
    start(seed);
    clearResources();
    settlers = [];
    const hallTile = getGridPos(townHall.x, townHall.y);
    const treePos = tileCenter(hallTile.gx + 5, hallTile.gy);
    const tree = { ...treePos, hp: 100, isGrowing: false, growProgress: 0 };
    trees.push(tree);
    const enemy = createConfiguredEnemy(tileCenter(hallTile.gx + 9, hallTile.gy), 'raider');
    Object.assign(enemy, { fromWave: true, speed: 1.5 });
    enemies = [enemy];
    invalidateAllPaths();
    const before = townHall.hp;
    run(seconds);
    return { damagedHall: townHall.hp < before, treeUntouched: trees.includes(tree) };
  }

  function enemyHitsHallCorner({ seed = 'hall-corner-hit-test', seconds = 2 }) {
    start(seed);
    clearResources();
    settlers = [];
    const enemy = createConfiguredEnemy({ x: townHall.x + 45, y: townHall.y + 45 }, 'raider');
    Object.assign(enemy, { speed: 0, fromWave: true });
    enemies = [enemy];
    const before = townHall.hp;
    run(seconds);
    return { damaged: townHall.hp < before };
  }

  function enemyEscapesTree({ seed = 'enemy-tree-escape-test', seconds = 30 }) {
    start(seed);
    clearResources();
    settlers = [];
    const pos = { x: townHall.x + TILE_SIZE * 9, y: townHall.y };
    trees.push({ ...pos, hp: 100, isGrowing: false, growProgress: 0 });
    const enemy = createConfiguredEnemy(pos, 'raider');
    Object.assign(enemy, { fromWave: true, speed: 1.5 });
    enemies = [enemy];
    invalidateAllPaths();
    const before = townHall.hp;
    run(seconds);
    return { leftTree: Math.hypot(enemy.x - pos.x, enemy.y - pos.y) > TILE_SIZE, damagedHall: townHall.hp < before };
  }

  return { deployment, holdAndEngage, archersManTowers, workersStayClose, baseBreach, workersComeBack,
    unarmedDefend, noTentAssaultDuringCampLinkedWave, noTentAssaultDuringPreWaveWarning, waitsForRegroupedWave, holdsDuringFactionWaveMuster, assaultOutpost, attackOutpostInTheWay,
    attackBattleBuildingInTheWay, enemyBreaksWallOnTheWay,
    enemyRoutesAroundTree, enemyHitsHallCorner, enemyEscapesTree };
})());
