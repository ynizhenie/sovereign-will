// Firewood, fish traps and worms in the grass (#199)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; };

  // A woodcutter with no trees to fell chops firewood out of the stock's wood; a campfire burns firewood only
  function chop({ seed = 'firewood' } = {}) {
    start(seed);
    clearResources();
    placeBuilding('campfire', nearHall(3, 0).x, nearHall(3, 0).y);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 30, townHall.y + 40, { tool: 'axe' })];
    Object.assign(stock, { wood: 5, firewood: 0 });
    run(30, { each: quiet });
    return { wood: stock.wood, firewood: stock.firewood, fuel: Object.keys(GAME_CONFIG.cooking.fuel).sort() };
  }

  // A fish trap by the water catches by itself; a fisher empties it and carries the fish home
  function fishTrap({ seed = 'fish-trap' } = {}) {
    start(seed);
    clearResources();
    const w = nearHall(-4, 3);
    waterTiles.push({ x: w.x, y: w.y });
    const trap = placeBuilding('fish_trap', w.x + TILE_SIZE, w.y);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 30, townHall.y + 40, { tool: 'rod' })];
    stock.rawFish = 0;
    let most = 0;
    run(GAME_CONFIG.buildings.fish_trap.fishTrap.seconds * 2 + 1, { each: () => { quiet(); most = Math.max(most, trap.fish || 0); stock.wheatSeeds = 0; stock.worms = 0; stock.wheat = 0; } });
    run(20, { each: quiet });
    return { caught: most >= 2, emptied: (trap.fish || 0) < 2, fishHome: stock.rawFish >= 2 };
  }

  // A fish trap goes only on a tile next to water
  function trapPlacement({ seed = 'fish-trap-place' } = {}) {
    start(seed);
    clearResources();
    const w = nearHall(-4, 3);
    waterTiles.push({ x: w.x, y: w.y });
    stock.wood = 100;
    buildMode = 'fish_trap';
    const tapAt = p => { mouse.x = p.x; mouse.y = p.y; const n = blueprints.length; handleCanvasClick(); return blueprints.length > n; };
    const r = { byWater: tapAt({ x: w.x + TILE_SIZE, y: w.y }), dryLand: tapAt(nearHall(5, -4)) };
    buildMode = 'interact';
    return r;
  }

  // An idle fisher with no bait digs in the grass: now and then a worm, taken home
  function digWorms({ seed = 'dig-worms' } = {}) {
    start(seed);
    clearResources();
    grassList = [nearHall(3, 3), nearHall(-3, 2), nearHall(2, -3)].map(p => ({ x: p.x, y: p.y, hp: 10, maxHp: 10 }));
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 30, townHall.y + 40, { tool: 'rod' })];
    Object.assign(stock, { worms: 0, wheatSeeds: 0, wheat: 0 });
    let dug = false;
    run(90, { each: () => { quiet(); if (settlers[0].activity === 'idleDigWorms') dug = true; } });
    return { dug, worms: stock.worms > 0 };
  }

  return { firewoodChop: chop, firewoodFishTrap: fishTrap, firewoodTrapPlacement: trapPlacement, firewoodDigWorms: digWorms };
})());
