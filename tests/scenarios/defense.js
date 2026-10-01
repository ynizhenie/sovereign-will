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
    settlers = [0, 1, 2].map(i => makeSettler(i + 1, townHall.x - 20 + i * 20, townHall.y + 50, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 }));
    defensePlan = null;
    const post = getDefensePlan().posts[0];
    const en = createConfiguredEnemy({ x: post.x, y: post.y - 12 * TILE_SIZE }, 'raider');
    en.fromWave = true; en.speed = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    run(8, { each: () => { waveTimer = 50; } });
    const held = settlers.every(s => Math.hypot(s.x - post.x, s.y - post.y) < 30);
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

  return { deployment, holdAndEngage, archersManTowers, workersStayClose, baseBreach, workersComeBack };
})());
