// Full possession (#16): the possessed settler's AI is off, taps are orders, moving by hand cancels them
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const tap = (x, y) => { mouse.x = x; mouse.y = y; handleCanvasClick(); };
  let notes = [];

  // An empty field, the given settler possessed, notifications collected in `notes`
  function setUp(seed, extra) {
    start(seed);
    clearResources();
    invalidateAllPaths();
    notes = recentNotifications; // the messages shown from here on
    notes.length = 0;
    buildMode = 'interact';
    const s = makeSettler(1, nearHall(2, 0).x, nearHall(2, 0).y, { isPossessed: true, ...extra });
    settlers = [s];
    return s;
  }

  // A possessed worker next to grass, a tent while it's wounded, and an enemy hitting it: it does nothing
  // by itself. Returns whether it moved, gathered or hit back.
  function aiOff({ seed = 'possess-ai-off' } = {}) {
    const s = setUp(seed, { hp: 60 });
    grassList.push({ ...nearHall(3, 0), hp: 1, priority: 2 });
    placeBuilding('tent', nearHall(2, 3).x, nearHall(2, 3).y);
    const enemy = createConfiguredEnemy(nearHall(2, 1), 'raider_club');
    enemy.speed = 0; enemy.damage = 1;
    enemies = [enemy];
    const x0 = s.x, y0 = s.y;
    run(4);
    return { moved: Math.hypot(s.x - x0, s.y - y0) > 6, gathered: !!s.carrying, hitBack: enemy.hp < enemy.maxHp };
  }

  // A woodcutter taps a tree a few tiles away, then the town hall. Returns what it carried and handed in.
  function chopAndDeliver({ seed = 'possess-chop', tool = 'axe' } = {}) {
    const s = setUp(seed, { tool });
    const tree = { ...nearHall(6, 0), hp: 3, maxHp: 3, isGrowing: false, priority: 0 };
    trees.push(tree);
    invalidateAllPaths();
    tap(tree.x, tree.y);
    const ordered = !!s.order;
    run(15);
    // (#298) felled and cut into pieces: the bigger one tapped, picked up
    const piece = logs.slice().sort((a, b) => b.yield.wood - a.yield.wood)[0];
    if (piece) { tap(piece.x, piece.y); run(6); }
    const carried = s.carrying
      ? Object.fromEntries((s.carrying.items || [s.carrying]).map(item => [item.type, item.amount]))
      : null;
    const wood0 = stock.wood;
    const saplings0 = stock.saplings;
    tap(townHall.x, townHall.y);
    run(10);
    return { ordered, treeGone: !trees.includes(tree), carried, handedIn: stock.wood - wood0, saplingsHandedIn: stock.saplings - saplings0, notes };
  }

  // A swordsman taps an enemy standing a few tiles away: walks over and fights it until it's dead
  function attackOrder({ seed = 'possess-attack' } = {}) {
    const s = setUp(seed, { weapon: 'sword', role: 'soldier' });
    const enemy = createConfiguredEnemy(nearHall(7, 0), 'raider_club');
    enemy.speed = 0; enemy.damage = 0;
    enemies = [enemy];
    tap(enemy.x, enemy.y);
    run(15);
    return { enemyDead: !enemies.includes(enemy), orderDone: !s.order };
  }

  // A worker taps a blueprint: walks over and builds it
  function buildOrder({ seed = 'possess-build' } = {}) {
    const s = setUp(seed);
    const bp = createBuildingBlueprint('wall_wood', nearHall(6, 2).x, nearHall(6, 2).y);
    blueprints.push(bp);
    tap(bp.x, bp.y);
    run(15);
    return { built: buildings.some(b => b.x === bp.x && b.y === bp.y && b.type === 'wall_wood'), orderDone: !s.order };
  }

  // (#326) An order is given, then the player taps the ground (no keys or joystick any more): it walks there, the
  // order gone, and stops there
  function moveCancels({ seed = 'possess-cancel' } = {}) {
    const s = setUp(seed, { tool: 'axe' });
    const tree = { ...nearHall(8, 0), hp: 3, maxHp: 3, isGrowing: false, priority: 0 };
    trees.push(tree);
    tap(tree.x, tree.y);
    run(0.5);
    const hadOrder = !!s.order;
    const spot = { x: s.x, y: s.y + 90 };
    tap(spot.x, spot.y);
    const walking = !!s.order && s.order.kind === 'walk';
    run(5);
    return { hadOrder, walking, there: Math.hypot(s.x - spot.x, s.y - spot.y) < 10, done: !s.order, treeStands: trees.includes(tree) };
  }

  return { possessAiOff: aiOff, possessChopAndDeliver: chopAndDeliver, possessAttack: attackOrder, possessBuild: buildOrder, possessMoveCancels: moveCancels };
})());
