// Farm zones and farmers (#29)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // Three wheat and two sapling zone tiles east of the town hall; `farmer`: a worker with a hoe (else a
  // worker with no tool). Returns what got planted and, after the wheat ripens, what the farmer did.
  function farmZonesPlanted({ seed = 'farm-test', farmer = true, seconds = 20 }) {
    start(seed);
    clearResources();
    window.showNotification = () => {};
    const row = i => ({ x: townHall.x + (3 + i) * TILE_SIZE, y: townHall.y + 2 * TILE_SIZE });
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
    const food0 = stock.food;
    for (const plot of farmPlots) plot.growth = 100;
    run(30, { each: () => { pendingRespawns.length = 0; stock.food = Math.max(stock.food, food0); } });
    return { ...planted, harvestedFood: stock.food > food0, replanted: farmPlots.length };
  }

  // Painting and clearing zone tiles; nothing on water
  function farmZonePainting({ seed = 'farm-paint-test' }) {
    start(seed);
    window.showNotification = () => {};
    const x = townHall.x + 3 * TILE_SIZE, y = townHall.y;
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

  return { farmZonesPlanted, farmZonePainting };
})());
