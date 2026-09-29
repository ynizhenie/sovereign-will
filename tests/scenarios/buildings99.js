// Watchtower guards climbing down, and smelter limits (#99)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // A tower in a line of walls, the guard facing the wall side; it must climb down onto a free tile the
  // town hall can reach, not into a wall
  function towerExit({ seed = 'tower-exit-test' }) {
    start(seed);
    clearResources();
    const t = nearHall(5, 0);
    const tower = placeBuilding('watchtower', t.x, t.y);
    // walls all along the outer side and both ends: only the town hall side is open
    for (const [dx, dy] of [[6, -1], [6, 0], [6, 1], [5, -1], [5, 1]]) { const p = nearHall(dx, dy); placeBuilding('wall_stone', p.x, p.y); }
    invalidateAllPaths();
    const s = makeSettler(1, t.x, t.y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 5 });
    settlers = [s];
    tower.guards = [s]; s.towerAssignment = tower;
    s.x = t.x + 10; s.y = t.y; // facing the walls
    releaseTowerGuard(s);
    const g = getGridPos(s.x, s.y);
    const hallReach = getSettlerReach({ x: townHall.x, y: townHall.y });
    return { inWall: collidesWithWall(s.x, s.y, 10), reachable: getReachSteps(hallReach, g.gx, g.gy) !== -1,
      besideTower: Math.hypot(s.x - t.x, s.y - t.y) <= TILE_SIZE * 1.5 };
  }

  // One smelter, lots of ore and coal, four idle workers. Tracks how many carry to it at once and how
  // full it ever gets.
  function smelterRush({ seed = 'smelter-test', seconds = 60, collect = true }) {
    start(seed);
    clearResources();
    const p = nearHall(4, 3);
    const smelter = placeBuilding('smelter', p.x, p.y);
    invalidateAllPaths();
    settlers = [0, 1, 2, 3].map(i => makeSettler(1 + i, townHall.x - 60 + i * 40, townHall.y + 60));
    stock.ironOre = 40; stock.coal = 40;
    let maxCarriers = 0, maxOre = 0, maxCoal = 0, maxIron = 0, maxCollectors = 0;
    run(seconds, { each: () => {
      if (!collect) for (const s of settlers) if (s.carrying && s.carrying.type === 'iron') { smelter.ironProduced += s.carrying.amount; s.carrying = null; }
      const carriers = settlers.filter(s => s.carrying && s.carrying.type === 'smelterDelivery').length;
      maxCarriers = Math.max(maxCarriers, carriers);
      maxOre = Math.max(maxOre, smelter.oreLoaded || 0);
      maxCoal = Math.max(maxCoal, smelter.coalLoaded || 0);
      maxIron = Math.max(maxIron, smelter.ironProduced || 0);
    } });
    return { maxCarriers, maxOre, maxCoal, maxIron, ironHome: stock.iron };
  }

  return { towerExit, smelterRush };
})());
