// #248 (part four): meals eaten at a storage, paths, foremen and captains
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const calm = () => { boars = []; boarRespawnTimer = 999; pendingRespawns = []; };

  // Hungry, a settler out in the base walks to the town hall and eats there a while; in a wave it waits
  function eatAtStorage({ seed = 'eat-storage', wave = false } = {}) {
    start(seed); clearResources();
    const p = nearHall(6, 3);
    const s = makeSettler(1, p.x, p.y);
    settlers = [s];
    stock.food = 10;
    const far = createConfiguredEnemy(nearHall(-20, -15), 'raider');
    far.speed = 0;
    enemies = wave ? [far] : [];
    s.hunger = 0.01;
    let ateAt = null, ate = false;
    run(12, { each: () => { calm(); if (s.eating && !ateAt) ateAt = Math.hypot(s.x - townHall.x, s.y - townHall.y); if (s.eating) ate = true; if (s.hunger < 5) s.hunger = 50; } });
    return { ate, atHall: ateAt !== null && ateAt < townHall.radius + 40, food: stock.food, stillWants: !!s.wantsMeal };
  }

  // Settlers walking the same way in the base over and over wear a path; out of the base, none; left be, it
  // fades
  function pathsWear({ seed = 'paths' } = {}) { // (not `paths`: that's the game's)
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x, townHall.y + 60);
    const outAt = { x: townHall.x + getBaseRadius() + 200, y: townHall.y };
    const out = makeSettler(2, outAt.x, outAt.y);
    settlers = [s, out];
    const a = { x: townHall.x - 60, y: townHall.y + 60 }, b = { x: townHall.x + 60, y: townHall.y + 60 };
    let f = 0;
    run(120, { each: () => {
      calm(); settlers.forEach(o => { o.hunger = 999; });
      const k = (f++ % 240) / 240, t = k < 0.5 ? k * 2 : 2 - k * 2;
      s.x = a.x + (b.x - a.x) * t; s.y = a.y;
      out.x = outAt.x + Math.sin(f / 20) * 40; out.y = outAt.y; // (walking about out there, held there)
    } });
    const shows = GAME_CONFIG.paths.shows;
    const g = getGridPos(townHall.x, townHall.y + 60);
    const worn = (paths[`${g.gx},${g.gy}`] || 0) >= shows;
    const outWorn = Object.keys(paths).some(key => { const [x, y] = key.split(',').map(Number); return Math.hypot(x * TILE_SIZE + 15 - townHall.x, y * TILE_SIZE + 15 - townHall.y) > getBaseRadius() + TILE_SIZE; });
    settlers = [];
    run(600, { each: calm });
    return { worn, outWorn, faded: !((paths[`${g.gx},${g.gy}`] || 0) >= shows) };
  }

  // A foreman tells its workers what's needed most: short of stone, one with an axe swaps it for the pickaxe
  // in the armory (its axe into the armory) and goes for stone; the order shows over both
  function foreman({ seed = 'foreman' } = {}) {
    start(seed); clearResources();
    for (const [dx, dy] of [[5, 3], [-5, 3]]) boulders.push({ ...nearHall(dx, dy), hp: 4, maxHp: 4, priority: 0 });
    invalidateAllPaths();
    const boss = makeSettler(1, townHall.x - 40, townHall.y + 40);
    putOnGear(boss, 'whistle');
    const w1 = makeSettler(2, townHall.x + 40, townHall.y + 40, { tool: 'axe' });
    settlers = [boss, w1];
    Object.assign(stock, { wood: 200, stone: 0, food: 200 });
    armory = { 'tools:pickaxe': 1 };
    let bubble = false;
    run(30, { each: () => { calm(); settlers.forEach(o => { o.hunger = 999; }); stock.stone = 0; if (boss.orderBubble && w1.orderBubble && boss.orderBubble.until > pathTick) bubble = true; } });
    return { focus: w1.focus && w1.focus.resource, tool: w1.tool, axeStored: armory['tools:axe'] || 0, bubble };
  }

  // Player marks, fishing spots and wheat plots take priority over the foreman's stock-based choice;
  // the worker is sent to take the matching tool from the armory.
  function foremanFollowsPlayerMark({ kind = 'tree', tool = 'axe', output = 'wood', fishing = false, farming = false } = {}) {
    start(`foreman-mark-${kind}`); clearResources();
    const boss = makeSettler(1, townHall.x - 10, townHall.y + 40);
    putOnGear(boss, 'whistle');
    const worker = makeSettler(2, townHall.x + 10, townHall.y + 40);
    settlers = [boss, worker];
    boss.squadIds = [worker.id];
    boss.orderIn = 0;
    armory = { [`tools:${tool}`]: 1 };
    if (farming) farmZones = [{ crop: 'wheat' }];
    const marked = { x: worker.x, y: worker.y, priority: 1, yield: { [output]: 1 } };
    const tick = {
      dt: 0.1,
      isWaveActive: false,
      markedResources: fishing || farming ? [] : [marked],
      resourceKind: new Map([[marked, kind]]),
      activeWaterSpots: fishing ? [{ x: worker.x, y: worker.y }] : []
    };
    foremanOrders(boss, tick);
    return {
      tool: worker.targetEquipment?.tool || null,
      focus: worker.focus?.resource || null,
      armory: armory[`tools:${tool}`] || 0
    };
  }

  // A captain in a wave gives its soldiers enemies to go for, the nearest the town hall first, each its own
  function captain({ seed = 'captain' } = {}) {
    start(seed); clearResources();
    const cap = makeSettler(1, townHall.x, townHall.y + 50, { weapon: 'sword', role: 'soldier' });
    putOnGear(cap, 'banner');
    const soldiers = [2, 3].map(i => makeSettler(i, townHall.x + 30 * i, townHall.y + 50, { weapon: 'sword', role: 'soldier' }));
    settlers = [cap, ...soldiers];
    // (targets only: held as in an iron trap, they neither walk nor strike, so the captain isn't busy striking back)
    enemies = [8, 12, 16].map(d => { const en = createConfiguredEnemy(nearHall(d, 0), 'raider'); en.speed = 0; en.damage = 0; en.trapped = true; en.hp = en.maxHp = 1e4; return en; });
    run(8, { each: () => { calm(); settlers.forEach(o => { o.hunger = 999; }); } });
    const targets = soldiers.map(o => enemies.indexOf(o.captainTarget));
    return { given: targets.every(i => i >= 0), different: new Set(targets).size === targets.length, nearest: targets.includes(0) };
  }

  return { eatAtStorage, pathsWear, foreman, foremanFollowsPlayerMark, captain };
})());
