// Warehouses and physical resources (#36)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const contents = storage => Object.fromEntries(Object.entries(storage.contents).map(([id, n]) => [id, Math.round(n)]));

  function setUp(seed) {
    start(seed);
    clearResources();
    invalidateAllPaths();
    window.showNotification = () => {};
    townHall.contents = {};
  }

  // The town hall is full; a warehouse a few tiles away has room. A woodcutter fells a tree.
  function deliverToWarehouse({ seed = 'storage-deliver' } = {}) {
    setUp(seed);
    townHall.contents = { stone: GAME_CONFIG.storage.townHall };
    const warehouse = placeBuilding('warehouse', nearHall(-5, 0).x, nearHall(-5, 0).y);
    trees.push({ ...nearHall(5, 2), hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 0 });
    settlers = [makeSettler(1, townHall.x + 40, townHall.y, { tool: 'axe' })];
    run(25, { each: () => { pendingRespawns.length = 0; } });
    return { hall: contents(townHall), warehouse: contents(warehouse), totalWood: stock.wood, capacity: getStorageCapacity(warehouse) };
  }

  // Every storage full: a worker with a marked tree to fell rests instead, and the player is told once
  function everythingFull({ seed = 'storage-full' } = {}) {
    setUp(seed);
    const notes = [];
    window.showNotification = text => notes.push(text);
    townHall.contents = { stone: GAME_CONFIG.storage.townHall };
    const tree = { ...nearHall(4, 0), hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 2 };
    trees.push(tree);
    settlers = [makeSettler(1, townHall.x + 40, townHall.y, { tool: 'axe' })];
    let idle = 0;
    run(10, { each: () => { if (settlers[0].isIdle) idle++; } });
    return { treeStands: trees.includes(tree), mostlyIdle: idle > 8 * 60, warnings: notes.filter(n => n === t('storage.full')).length };
  }

  // Wood only in a warehouse across the base; the player places a wall: a worker fetches the wood from
  // there, brings it and builds. A second wall can't be placed while the first one's wood is promised.
  function buildFromWarehouse({ seed = 'storage-build' } = {}) {
    setUp(seed);
    const warehouse = placeBuilding('warehouse', nearHall(-5, 0).x, nearHall(-5, 0).y);
    warehouse.contents = { wood: 8 };
    settlers = [makeSettler(1, townHall.x + 40, townHall.y)];
    const spot = nearHall(5, 3);
    buildMode = 'wall_wood'; mouse.x = spot.x; mouse.y = spot.y; handleCanvasClick();
    const placed = blueprints.length;
    const other = nearHall(5, -3);
    mouse.x = other.x; mouse.y = other.y; handleCanvasClick(); // 3 wood left free: not enough
    const secondPlaced = blueprints.length > placed;
    const woodRightAfter = stock.wood;
    let visitedWarehouse = false;
    run(30, { each: () => { if (Math.hypot(settlers[0].x - warehouse.x, settlers[0].y - warehouse.y) < 40) visitedWarehouse = true; } });
    buildMode = 'interact';
    return {
      placed, secondPlaced, woodRightAfter, visitedWarehouse,
      built: buildings.some(b => b.type === 'wall_wood' && b.x === spot.x && b.y === spot.y), warehouseWood: contents(warehouse).wood
    };
  }

  // Enemies break a warehouse: one pile per resource on its tile; workers bring it all to the town hall
  function warehouseDestroyed({ seed = 'storage-destroyed' } = {}) {
    setUp(seed);
    const warehouse = placeBuilding('warehouse', nearHall(-5, 0).x, nearHall(-5, 0).y);
    warehouse.contents = { wood: 12, stone: 7, food: 4 };
    const before = { wood: stock.wood, stone: stock.stone, food: stock.food };
    removeBuilding(warehouse);
    const piles = resourcePiles.map(p => `${p.type}:${p.amount}`).sort();
    const onTile = resourcePiles.every(p => Math.abs(p.x - warehouse.x) < 15 && Math.abs(p.y - warehouse.y) < 15);
    settlers = [makeSettler(1, townHall.x + 40, townHall.y), makeSettler(2, townHall.x - 40, townHall.y)];
    run(60, { each: () => { foodTimer = 999; } });
    return { piles, onTile, pilesLeft: resourcePiles.length, hall: contents(townHall), before };
  }

  // The Point tool on a warehouse shows what's in it
  function storagePopup({ seed = 'storage-popup' } = {}) {
    setUp(seed);
    const warehouse = placeBuilding('warehouse', nearHall(-5, 0).x, nearHall(-5, 0).y);
    warehouse.contents = { wood: 12, iron: 3 };
    buildMode = 'interact'; mouse.x = warehouse.x; mouse.y = warehouse.y; handleCanvasClick();
    updateUI();
    return { shown: !document.getElementById('storage-popup').hidden };
  }

  return { deliverToWarehouse, everythingFull, buildFromWarehouse, warehouseDestroyed, storagePopup };
})());
