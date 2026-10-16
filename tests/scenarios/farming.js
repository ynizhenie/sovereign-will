// Farm zones and farmers (#29)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  // tile centres east of the town hall: dx tiles right, dy tiles down
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // Three wheat and two sapling zone tiles east of the town hall; `farmer`: a worker with a hoe (else a
  // worker with no tool). Returns what got planted and, after the wheat ripens, what the farmer did.
  function farmZonesPlanted({ seed = 'farm-test', farmer = true, seconds = 20 }) {
    start(seed);
    clearResources();
    const row = i => nearHall(3 + i, 2);
    for (let i = 0; i < 3; i++) toggleFarmZone(row(i).x, row(i).y, 'wheat');
    for (let i = 3; i < 5; i++) toggleFarmZone(row(i).x, row(i).y, 'sapling');
    stock.wheatSeeds = 10; stock.saplings = 5;
    settlers = [makeSettler(1, townHall.x + 60, townHall.y, farmer ? { tool: 'hoe' } : {})];
    run(seconds, { each: () => { pendingRespawns.length = 0; } });
    const planted = {
      wheat: farmPlots.length,
      saplings: trees.filter(t => t.isGrowing).length,
      seedsSpent: 10 - stock.wheatSeeds, saplingsSpent: 5 - stock.saplings
    };
    // ripen the wheat: the farmer should harvest it and plant the tiles again
    const wheat0 = stock.wheat;
    for (const plot of farmPlots) plot.growth = 100;
    run(30, { each: () => { pendingRespawns.length = 0; } });
    return { ...planted, harvestedFood: stock.wheat > wheat0, replanted: farmPlots.length };
  }

  // Painting and clearing zone tiles; nothing on water
  function farmZonePainting({ seed = 'farm-paint-test' }) {
    start(seed);
    const { x, y } = nearHall(3, 0);
    toggleFarmZone(x, y, 'wheat');
    const afterWheat = farmZones.map(z => z.crop);
    toggleFarmZone(x, y, 'sapling');
    const afterSapling = farmZones.map(z => z.crop);
    toggleFarmZone(x, y, 'sapling');
    const afterToggleOff = farmZones.length;
    toggleFarmZone(x, y, 'wheat');
    toggleFarmZone(x, y, 'clear');
    const afterClear = farmZones.length;
    const water = waterTiles[0];
    if (water) toggleFarmZone(water.x, water.y, 'wheat');
    return { afterWheat, afterSapling, afterToggleOff, afterClear, onWater: farmZones.length };
  }

  // A wheat plot growing, a dung pile a few tiles off, a farmer with (or without) a backpack: it carries the
  // dung to the plot; the plot's harvest then yields twice the wheat (#201)
  function fertilizer({ seed = 'fertilizer', backpack = true } = {}) {
    start(seed);
    clearResources();
    const p = nearHall(4, 3), d = nearHall(-3, 4);
    farmPlots = [{ x: p.x, y: p.y, growth: 30, priority: 0, harvestProgress: 0 }];
    const heap = Object.assign(placeBuilding('dung_heap', d.x, d.y), { dung: 1 }); // (#232)
    invalidateAllPaths();
    const farmer = makeSettler(1, townHall.x + 40, townHall.y + 40, { tool: 'hoe', backpack });
    settlers = [farmer];
    stock.food = 999;
    run(15, { each: () => { farmer.hunger = 999; } });
    const plot = farmPlots[0];
    const r = { fertilized: !!plot.fertilized, dungLeft: heap.dung };
    const harvester = makeSettler(2, plot.x, plot.y);
    finishHarvest(harvester, plot, 'farm');
    r.wheat = harvester.carrying ? (harvester.carrying.items || [harvester.carrying]).filter(c => c.type === 'wheat').reduce((n, c) => n + c.amount, 0) : 0;
    return r;
  }

  return { farmZonesPlanted, farmZonePainting, fertilizer };
})());
