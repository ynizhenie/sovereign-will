// #248 (part two): a door built right on a wall, an iron door, the iron trap
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boarRespawnTimer = 999; pendingRespawns = []; };
  const typeAt = p => (buildings.find(b => b.x === p.x && b.y === p.y) || {}).type || null;

  // A door ordered right on a wall: the wall stands till the door's built, then the door is there instead
  // and the wall's refund comes back; an iron door on that door the same; not on anything else
  function doorOnWall({ seed = 'door-on-wall', wall = 'wall_wood' } = {}) {
    start(seed); clearResources();
    const p = nearHall(4, 0);
    placeBuilding(wall, p.x, p.y);
    const tent = nearHall(-4, 0);
    placeBuilding('tent', tent.x, tent.y);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y + 40), makeSettler(2, townHall.x + 40, townHall.y - 40)];
    Object.assign(stock, { wood: 50, stone: 50, iron: 50 });
    const tap = (mode, at) => { buildMode = mode; mouse.x = at.x; mouse.y = at.y; const n = blueprints.length; handleCanvasClick(); buildMode = 'interact'; return blueprints.length > n; };
    const placed = tap('door', p);
    const wallWhileBuilding = typeAt(p);
    const wood = stock.wood;
    run(25, { each: quiet });
    const door = typeAt(p);
    const refund = stock.wood - wood + GAME_CONFIG.buildings.door.cost.wood; // (the door's own wood went too)
    const ironPlaced = tap('iron_door', p);
    run(30, { each: quiet });
    return { placed, wallWhileBuilding, door, refund, ironPlaced, ironDoor: typeAt(p), onTent: tap('iron_door', tent),
      walkable: !isTileBlockedForSettler(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE)) };
  }

  // An iron trap: an enemy stepping on it is badly hurt and held holdSeconds, then free; the trap sets
  // itself again. Settlers keep off it, enemies don't see it
  function trapEnemy({ seed = 'iron-trap-enemy' } = {}) {
    start(seed); clearResources();
    const p = nearHall(6, 0);
    const trap = placeBuilding('iron_trap', p.x, p.y);
    invalidateAllPaths();
    const def = GAME_CONFIG.buildings.iron_trap.ironTrap;
    const en = createConfiguredEnemy({ x: p.x + 2, y: p.y }, 'raider');
    en.hp = en.maxHp = 500;
    enemies = [en];
    settlers = [];
    run(0.1, { each: quiet });
    const caught = { held: trap.holding === en, hurt: 500 - en.hp };
    run(def.holdSeconds - 1, { each: () => { quiet(); waveTimer = 50; } });
    const stillHeld = trap.holding === en && Math.hypot(en.x - p.x, en.y - p.y) < 1;
    run(2, { each: () => { quiet(); waveTimer = 50; } });
    const g = getGridPos(p.x, p.y);
    return { ...caught, stillHeld, freed: trap.holding !== en && !en.trapped,
      settlersKeepOff: isTileBlockedForSettler(g.gx, g.gy), enemiesDontSee: !isTileBlockedForEnemyStrict(g.gx, g.gy) };
  }

  // A boar near a baited iron trap goes for the food: caught at boarChance, otherwise it eats the bait
  function trapBoar({ seed = 'iron-trap-boar', chance = 1 } = {}) {
    start(seed); clearResources();
    const def = GAME_CONFIG.buildings.iron_trap.ironTrap, was = def.boarChance;
    def.boarChance = chance;
    const p = nearHall(9, 0);
    const trap = placeBuilding('iron_trap', p.x, p.y);
    trap.bait = 1;
    invalidateAllPaths();
    settlers = [];
    const boar = { x: p.x + 90, y: p.y + 10, hp: 40, maxHp: 40, priority: 0 };
    boars = [boar];
    run(15, { each: quiet });
    def.boarChance = was;
    return { caught: trap.holding === boar && !!boar.trapped, atTrap: Math.hypot(boar.x - p.x, boar.y - p.y) < 12, baitLeft: trap.bait || 0 };
  }

  // A worker with free hands takes a piece of food from the stock to an iron trap with no bait
  function baitIronTrap({ seed = 'iron-trap-bait' } = {}) {
    start(seed); clearResources();
    const p = nearHall(5, 2);
    const trap = placeBuilding('iron_trap', p.x, p.y);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y + 40)];
    boars = [];
    stock.food = 5;
    run(15, { each: quiet });
    return { bait: trap.bait || 0, food: stock.food };
  }

  return { doorOnWall, ironTrapEnemy: trapEnemy, ironTrapBoar: trapBoar, ironTrapBait: baitIronTrap };
})());
