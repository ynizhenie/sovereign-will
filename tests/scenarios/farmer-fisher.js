// Farmers' spare time, watering, and fishers' worms (#106)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // A farmer with no zones and a few grass tufts around: it gathers them
  function idleFarmer({ seed = 'idle-farmer-test', seconds = 30 }) {
    start(seed);
    clearResources();
    for (let i = 0; i < 3; i++) grassList.push({ ...nearHall(3 + i, 3), hp: 1 });
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 60, townHall.y, { tool: 'hoe' })];
    run(seconds, { each: () => { pendingRespawns.length = 0; } });
    return { grassLeft: grassList.length };
  }

  // Four wheat plots and a pool of water; a farmer with (or without) a watering can. Returns growth.
  function watering({ seed = 'watering-test', can = true, seconds = 12 }) {
    start(seed);
    clearResources();
    for (let i = 0; i < 4; i++) farmPlots.push({ ...nearHall(3 + i, 3), growth: 0, priority: 0, harvestProgress: 0 });
    waterTiles.push({ ...nearHall(-3, 3) });
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x, townHall.y + 60, { tool: 'hoe', wateringCan: can })];
    run(seconds);
    return { watered: farmPlots.filter(f => f.watered).length, growth: farmPlots.map(f => Math.round(f.growth)) };
  }

  // A fisher, a fishing spot, and corpses at various ages; no seeds or grain in stock
  function worms({ seed = 'worms-test', seconds = 40 }) {
    start(seed);
    clearResources();
    window.showNotification = () => {};
    const spot = nearHall(-4, 0);
    waterTiles.push({ ...spot, isFishing: true });
    invalidateAllPaths();
    const life = GAME_CONFIG.corpses.seconds;
    corpses = [
      { ...nearHall(3, 2), radius: 11, side: 'settler', kind: 'normal', age: life * 0.6, big: false, wormsTaken: false },
      { ...nearHall(4, 3), radius: 18, side: 'enemy', kind: 'brute', age: life * 0.6, big: true, wormsTaken: false },
      { ...nearHall(5, 2), radius: 11, side: 'enemy', kind: 'raider', age: 0, big: false, wormsTaken: false } // too fresh
    ];
    settlers = [makeSettler(1, townHall.x + 40, townHall.y, { tool: 'rod' })];
    Object.assign(stock, { worms: 0, wheatSeeds: 0, wheat: 0 });
    const fresh = corpses[2];
    let wormsSeen = 0;
    const original = payCost;
    let wormsSpent = 0;
    window.payCost = cost => { if (cost.worms) wormsSpent += cost.worms; return original(cost); };
    try {
      run(seconds, { each: () => { wormsSeen = Math.max(wormsSeen, stock.worms + wormsSpent); fresh.age = Math.min(fresh.age, 1); } });
    } finally { window.payCost = original; }
    return { wormsGathered: wormsSeen, freshUntouched: !fresh.wormsTaken, caughtFish: stock.rawFish > 0, wormsSpent };
  }

  return { idleFarmer, watering, worms };
})());
