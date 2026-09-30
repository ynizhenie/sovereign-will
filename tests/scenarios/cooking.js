// Raw food and cooking at campfires (#30, #31)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // A campfire, `workers` workers with no tool, and a stock of raw food and fuel. The colony doesn't eat
  // during the test. Returns the stock after, the most cooks at the fire at once, whether food was
  // carried home, and how many fuel trips were made.
  function cookingRun({ seed = 'cooking-test', food = 5, raw = { rawMeat: 3, rawFish: 2, wheat: 2 }, fuel = { wood: 2, coal: 0 }, workers = 1, seconds = 60 }) {
    start(seed);
    clearResources();
    const p = nearHall(3, 2);
    placeBuilding('campfire', p.x, p.y);
    invalidateAllPaths();
    settlers = Array.from({ length: workers }, (_, i) => makeSettler(1 + i, townHall.x - 40 + i * 30, townHall.y + 60));
    Object.assign(stock, { food, rawMeat: 0, rawFish: 0, wheat: 0, wood: 0, coal: 0 }, raw, fuel);
    let maxCooks = 0, carriedFood = false, fuelTrips = 0;
    const seen = new WeakSet();
    run(seconds, { each: () => {
      foodTimer = 999;
      maxCooks = Math.max(maxCooks, settlers.filter(s => s.carrying && s.carrying.forFire).length);
      for (const s of settlers) {
        if (s.carrying && isFoodKind(s.carrying.type)) carriedFood = true; // a dish, e.g. cooked meat
        if (s.carrying && s.carrying.forFire && GAME_CONFIG.cooking.fuel[s.carrying.type] && !seen.has(s.carrying)) { seen.add(s.carrying); fuelTrips++; }
      }
    } });
    return { food: stock.food, rawMeat: stock.rawMeat, rawFish: stock.rawFish, wheat: stock.wheat, wood: stock.wood, coal: stock.coal,
      maxCooks, carriedFood, fuelTrips };
  }

  return { cookingRun };
})());
