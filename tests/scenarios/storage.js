// Warehouses (#36, #141): a shared stock; the town hall and warehouses are where settlers bring
// resources and fetch them, whichever is nearest
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const near = (s, o, r) => Math.hypot(s.x - o.x, s.y - o.y) < r;

  function setUp(seed) {
    start(seed);
    clearResources();
    invalidateAllPaths();
    window.showNotification = () => {};
  }

  // A woodcutter fells a tree far from the town hall, with a warehouse next to the tree; the stock is
  // already huge (no limit). Returns where the wood went.
  function deliverToWarehouse({ seed = 'storage-deliver' } = {}) {
    setUp(seed);
    stock.wood = 1000;
    const warehouse = placeBuilding('warehouse', nearHall(9, 0).x, nearHall(9, 0).y);
    trees.push({ ...nearHall(9, 2), hp: 3, maxHp: 3, isGrowing: false, growProgress: 0, priority: 0 });
    const s = makeSettler(1, nearHall(8, 3).x, nearHall(8, 3).y, { tool: 'axe' });
    settlers = [s];
    let atWarehouse = false, atHall = false;
    run(20, { each: () => {
      pendingRespawns.length = 0;
      if (stock.wood > 1000) return; // delivered: idle after that, near the hall
      if (near(s, warehouse, 40)) atWarehouse = true;
      if (near(s, townHall, townHall.radius + 20)) atHall = true;
    } });
    return { wood: stock.wood, atWarehouse, atHall };
  }

  // A worker next to a warehouse across the base from the town hall; the player places a wall nearby:
  // the wood is fetched at the warehouse. A second wall can't be placed while the first one's wood is
  // promised.
  function buildFromWarehouse({ seed = 'storage-build' } = {}) {
    setUp(seed);
    stock.wood = 8;
    const warehouse = placeBuilding('warehouse', nearHall(-8, 0).x, nearHall(-8, 0).y);
    const s = makeSettler(1, nearHall(-7, 1).x, nearHall(-7, 1).y);
    settlers = [s];
    const spot = nearHall(-7, 4);
    buildMode = 'wall_wood'; mouse.x = spot.x; mouse.y = spot.y; handleCanvasClick();
    const placed = blueprints.length;
    const other = nearHall(-7, -4);
    mouse.x = other.x; mouse.y = other.y; handleCanvasClick(); // 3 wood left free: not enough
    const secondPlaced = blueprints.length > placed;
    const woodRightAfter = stock.wood;
    let atWarehouse = false, atHall = false;
    run(30, { each: () => {
      if (blueprints.length === 0) return; // built: idle after that, near the hall
      if (near(s, warehouse, 40)) atWarehouse = true;
      if (near(s, townHall, townHall.radius + 20)) atHall = true;
    } });
    buildMode = 'interact';
    return {
      placed, secondPlaced, woodRightAfter, atWarehouse, atHall, wood: stock.wood,
      built: buildings.some(b => b.type === 'wall_wood' && b.x === spot.x && b.y === spot.y)
    };
  }

  // Enemies break a warehouse: the stock stays as it was (it's shared, not inside the building)
  function warehouseDestroyed({ seed = 'storage-destroyed' } = {}) {
    setUp(seed);
    const warehouse = placeBuilding('warehouse', nearHall(-5, 0).x, nearHall(-5, 0).y);
    const before = { ...stock };
    removeBuilding(warehouse);
    return { same: JSON.stringify({ ...stock }) === JSON.stringify(before), gone: !buildings.includes(warehouse) };
  }

  return { deliverToWarehouse, buildFromWarehouse, warehouseDestroyed };
})());
