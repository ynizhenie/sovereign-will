// #248 (part three): how much the town hall and warehouses hold, piles by them, rope, mining a spawner
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; };
  const total = store => Object.values(store || {}).reduce((a, b) => a + b, 0);
  const piled = id => piles.filter(p => p.type === id).reduce((a, p) => a + p.amount, 0);
  const round = n => Math.round(n * 100) / 100;

  // The stock lies in the town hall up to what it holds; more lies on a pile by it, and counts all the same;
  // spending takes off the pile first
  function hallFull({ seed = 'store-hall' } = {}) {
    start(seed); clearResources();
    settlers = [];
    run(0.1);
    const startInHall = round(total(townHall.store)) === round(Object.keys(GAME_CONFIG.resources).reduce((a, id) => a + Math.max(0, stock[id] || 0), 0));
    const cap = GAME_CONFIG.storage.capacity.hall;
    stock.wood += cap; // more than it holds
    run(0.1);
    const hallHolds = round(total(townHall.store));
    const onPile = round(piled('wood'));
    const pileByHall = piles.every(p => Math.hypot(p.x - townHall.x, p.y - townHall.y) < townHall.radius + 4 * TILE_SIZE);
    const before = stock.wood;
    payCost({ wood: 10 });
    run(0.1);
    return { startInHall, hallHolds, onPile: onPile > 0, pileByHall, stockKept: before === stock.wood + 10, pileFirst: round(piled('wood')) === round(onPile - 10), hallSame: round(total(townHall.store)) === hallHolds };
  }

  // A pile by the full town hall, a warehouse with room: a worker with nothing to do carries it in; the stock
  // doesn't change. The warehouse falls: what it held lies on the ground where it stood, still in the stock
  function haulAndFall({ seed = 'store-haul' } = {}) {
    start(seed); clearResources();
    const w = nearHall(5, 0);
    const warehouse = placeBuilding('warehouse', w.x, w.y);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y + 40)];
    stock.food = 999; // (nobody goes hungry)
    run(0.1, { each: quiet });
    stock.stone += GAME_CONFIG.storage.capacity.hall; // the hall full, stone on a pile by it
    run(0.1, { each: quiet });
    const stone = stock.stone, pileBefore = piled('stone');
    run(40, { each: quiet });
    const inWarehouse = (warehouse.store || {}).stone || 0;
    const r = { pileBefore: pileBefore > 0, carried: inWarehouse > 0, pileLess: piled('stone') < pileBefore, stockSame: stock.stone === stone,
      warehouseFull: round(total(warehouse.store)) <= GAME_CONFIG.storage.capacity.warehouse };
    warehouse.hp = 0;
    removeBuilding(warehouse);
    run(0.1, { each: quiet });
    // (#279: in packs round where it stood)
    const where = piles.filter(p => Math.max(Math.abs(p.x - warehouse.x), Math.abs(p.y - warehouse.y)) <= 50 && p.type === 'stone');
    return { ...r, droppedWhereItStood: where.length > 0 && round(where.reduce((a, p) => a + p.amount, 0)) >= round(inWarehouse) - 0.01, stockAfterFall: stock.stone === stone };
  }

  // A load brought home goes into its own storage (#279: with two, each group of resources has its own)
  function deliverInto({ seed = 'store-deliver' } = {}) {
    start(seed); clearResources();
    const w = nearHall(6, 0);
    const warehouse = placeBuilding('warehouse', w.x, w.y);
    invalidateAllPaths();
    const s = makeSettler(1, w.x + 20, w.y + 20);
    settlers = [s];
    s.carrying = { type: 'wood', amount: 5, loads: 9 };
    keepStoresInStep(); // (the start's stock into the hall first)
    const was = { hall: townHall.store.wood || 0 };
    run(8, { each: quiet });
    // its own storage (the town hall for wood), or with that full, the nearest with room
    const hallGot = (townHall.store.wood || 0) - was.hall, warehouseGot = (warehouse.store || {}).wood || 0;
    const home = storeHome('wood');
    return { inWarehouse: Math.round(hallGot + warehouseGot), toItsPlace: roomIn(home) >= 1 ? (home === warehouse ? warehouseGot : hallGot) === 5 : warehouseGot === 5 || hallGot === 5 };
  }

  // Saved and loaded: what lies where comes back
  function storesSaved({ seed = 'store-save' } = {}) {
    start(seed); clearResources();
    settlers = [];
    stock.wood += GAME_CONFIG.storage.capacity.hall;
    run(0.1);
    const before = { hall: round(total(townHall.store)), piles: piles.length, wood: round(piled('wood')) };
    const saved = JSON.parse(JSON.stringify(serializeGame()));
    start('store-save-other');
    loadGame(saved);
    isPaused = true;
    return { same: JSON.stringify(before) === JSON.stringify({ hall: round(total(townHall.store)), piles: piles.length, wood: round(piled('wood')) }) };
  }

  // Rope: twisted from two herbs by hand at the town hall, no workshop needed


  // An ore spawner with a mine on it (#326, 27.10, 26): a miner works it for its ore, one at a time, and it's
  // still there; without one, nobody touches it
  function mineSpawner({ seed = 'maze-283', marked = true } = {}) { // (its spawner has an open side)
    let miner, spawner, spot;
    for (const mapSeed of [seed, 'maze-137', 'ore-a']) {
      start(mapSeed);
      ironOres = []; coalOres = []; boulders = []; pendingRespawns = [];
      invalidateAllPaths();
      miner = makeSettler(1, townHall.x, townHall.y, { tool: 'pickaxe' });
      settlers = [miner];
      const reachable = getOreSpawners('iron')
        .map(resource => ({ resource, spot: getResourceApproachPoint(miner, resource) }))
        .filter(candidate => candidate.spot)
        .sort((a, b) => Math.hypot(a.spot.x - miner.x, a.spot.y - miner.y) - Math.hypot(b.spot.x - miner.x, b.spot.y - miner.y));
      if (reachable.length) {
        ({ resource: spawner, spot } = reachable[0]);
        break;
      }
    }
    if (!spawner) throw new Error('No reachable iron spawner on the test maps');
    if (marked) buildings.push({ type: 'mine', x: spawner.x, y: spawner.y, hp: 150, maxHp: 150 });
    miner.x = spot.x; miner.y = spot.y;
    stock.ironOre = 0;
    run(40, { each: () => { quiet(); ironOres = []; coalOres = []; pendingRespawns = []; } });
    const carried = settlers[0].carrying && settlers[0].carrying.type === 'ironOre' ? settlers[0].carrying.amount : 0;
    return { ore: stock.ironOre + carried >= 1, standing: naturalRocks.includes(spawner) }; // (unmarked: one, then the nearest thing)
  }

  return { storeHallFull: hallFull, storeHaulAndFall: haulAndFall, storeDeliverInto: deliverInto, storesSaved, mineSpawner };
})());
