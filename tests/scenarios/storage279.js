// The friend's batch of fixes (#279), part C2: the storage
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, placeBuilding, clearResources, tileCenter } } = window.sim;
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999; };

  // The hall full: what's over lies by it in packs of 10, 9 to a tile within a tile of it, then a layer on
  // top; all full, the packs there take more
  function packs({ seed = 'packs', extra = 300 } = {}) {
    start(seed); clearResources();
    settlers = [];
    keepStoresInStep();
    stock.stone += GAME_CONFIG.storage.capacity.hall + extra;
    keepStoresInStep();
    const stone = piles.filter(p => p.type === 'stone');
    const perTile = {};
    for (const p of stone) { const k = `${Math.floor(p.x / TILE_SIZE)},${Math.floor(p.y / TILE_SIZE)},${p.layer || 0}`; perTile[k] = (perTile[k] || 0) + 1; }
    const body = STRUCTURE_COLLISION_HALF_SIZE + TILE_SIZE + 10;
    return {
      total: Math.round(stone.reduce((a, p) => a + p.amount, 0)),
      biggest: Math.max(...stone.map(p => p.amount)),
      mostOnATile: Math.max(...Object.values(perTile)),
      layers: [...new Set(stone.map(p => p.layer || 0))].sort(),
      near: stone.every(p => Math.max(Math.abs(p.x - townHall.x), Math.abs(p.y - townHall.y)) <= body + TILE_SIZE * 1.5),
      count: stone.length
    };
  }

  // Two storages: each group its own; what lies in the wrong one is carried over by one with nothing to do
  function sorting({ seed = 'sorting' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y), w = tileCenter(g.gx + 5, g.gy);
    const warehouse = placeBuilding('warehouse', w.x, w.y);
    invalidateAllPaths();
    const settler = makeSettler(1, townHall.x + 100, townHall.y + 100);
    settlers = [settler];
    keepStoresInStep();
    warehouse.store = warehouse.store || {};
    // something of the warehouse's lying in the hall (or the other way round): 20 moved over by hand
    const id = ['stone', 'wood', 'food'].find(k => storeHome(k) === warehouse) || 'stone';
    const home = storeHome(id), other = home === townHall ? warehouse : townHall;
    other.store[id] = (other.store[id] || 0) + 20;
    home.store[id] = Math.max(0, (home.store[id] || 0) - 20);
    const before = home.store[id] || 0;
    run(40, { each: quiet });
    return { moved: (home.store[id] || 0) - before };
  }

  function approachesStorage({ seed = 'storage-approach' } = {}) {
    start(seed); clearResources();
    settlers = [];
    const g = getGridPos(townHall.x, townHall.y), at = tileCenter(g.gx + 5, g.gy);
    const warehouse = placeBuilding('warehouse', at.x, at.y);
    invalidateAllPaths();
    const carrier = makeSettler(1, warehouse.x + 150, warehouse.y + 90);
    settlers = [carrier];
    const resource = ['wood', 'stone', 'food'].find(id => storeHome(id) === warehouse) || 'wood';
    carrier.carrying = { type: resource, amount: 1 };
    for (let i = 0; i < 20 * 60 && carrier.carrying; i++) {
      goDeliver(carrier, { dt: 1 / 60 });
    }
    const warehouseDelivered = !carrier.carrying && (warehouse.store[resource] || 0) > 0;
    warehouse.store = { wood: GAME_CONFIG.storage.capacity.warehouse };
    const hallCarrier = makeSettler(2, townHall.x + 240, townHall.y + 180);
    settlers.push(hallCarrier);
    hallCarrier.carrying = { type: 'wood', amount: 1 };
    for (let i = 0; i < 20 * 60 && hallCarrier.carrying; i++) {
      goDeliver(hallCarrier, { dt: 1 / 60 });
    }
    const townHallDelivered = !hallCarrier.carrying && isAtStorage(hallCarrier, townHall);
    return { warehouseDelivered, townHallDelivered };
  }

  return { packs, sorting, approachesStorage };
})());
