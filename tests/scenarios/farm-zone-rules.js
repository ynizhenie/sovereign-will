// Where farm zones may go, clearing them, and no building in them (#92)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;
  // tile centres east of the town hall: dx tiles right, dy tiles down
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // One tile per case, each tried as a wheat zone; returns which ones took
  function zonePlacement({ seed = 'zone-rules-test' }) {
    start(seed);
    clearResources();
    window.showNotification = () => {};
    const tile = i => nearHall(3 + i, 3);
    const cases = {
      grass: () => {},
      grassTuft: p => grassList.push({ ...p, hp: 1 }),
      stick: p => sticks.push({ ...p, hp: 1 }),
      bush: p => berryBushes.push({ ...p, hp: 1 }),
      tree: p => trees.push({ ...p, hp: 3, isGrowing: false, growProgress: 0 }),
      boulder: p => boulders.push({ ...p, hp: 4 }),
      sand: p => beachTiles.push({ ...p }),
      wall: p => window.sim.helpers.placeBuilding('wall_wood', p.x, p.y)
    };
    const took = {};
    Object.entries(cases).forEach(([name, put], i) => {
      const p = tile(i);
      put(p);
      toggleFarmZone(p.x, p.y, 'wheat');
      took[name] = farmZones.some(z => z.x === p.x && z.y === p.y);
    });
    return took;
  }

  // A wheat zone tile with a grass tuft on it: a worker with no tool clears it, the farmer plants
  function zoneGetsCleared({ seed = 'zone-clear-test', seconds = 30 }) {
    start(seed);
    clearResources();
    const p = nearHall(4, 2);
    grassList.push({ ...p, hp: 1 });
    toggleFarmZone(p.x, p.y, 'wheat');
    stock.wheatSeeds = 5;
    settlers = [makeSettler(1, townHall.x + 60, townHall.y, { tool: 'hoe' }), makeSettler(2, townHall.x - 60, townHall.y)];
    run(seconds, { each: () => { pendingRespawns.length = 0; } });
    return { grassGone: !grassList.some(g => g.x === p.x && g.y === p.y), planted: farmPlots.some(f => f.x === p.x && f.y === p.y) };
  }

  return { zonePlacement, zoneGetsCleared };
})());
