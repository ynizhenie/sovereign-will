// Carrying more than one load (#26): a backpack, and big settlers
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // One axe worker and a row of trees east of the town hall. Returns how many loads it brought on its
  // first trip home, and whether it still delivered what it had once the trees ran out.
  function carryTrips({ seed = 'backpack-test', type = 'normal', backpack = false, trees: treeCount = 5, seconds = 60 }) {
    start(seed);
    clearResources();
    for (let i = 0; i < treeCount; i++) {
      trees.push({ x: townHall.x + (3 + i) * TILE_SIZE, y: townHall.y + 2 * TILE_SIZE, hp: 3, isGrowing: false, growProgress: 0 });
    }
    invalidateAllPaths();
    const extra = type === 'big' ? { type: 'big', radius: 13, visualRadius: 18, speed: 0.7 } : {};
    settlers = [makeSettler(1, townHall.x + 60, townHall.y, { tool: 'axe', backpack, ...extra })];
    const s = settlers[0];
    const woodPerTree = GAME_CONFIG.mapResources.tree.yield.wood;
    const wood0 = stock.wood;
    // (#298: a felled tree is cut into pieces, a load each: the loads it set off home with, counted)
    let firstTrip = null, loads = 0;
    run(seconds, { each: () => {
      pendingRespawns.length = 0; // no regrowth: just these trees
      if (s.carrying) loads = Math.max(loads, s.carrying.loads || 0);
      if (firstTrip === null && stock.wood > wood0) firstTrip = loads;
    } });
    return { capacity: getCarryCapacity(s), firstTrip, allDelivered: (stock.wood - wood0) / woodPerTree, treesLeft: trees.length };
  }

  return { carryTrips };
})());
