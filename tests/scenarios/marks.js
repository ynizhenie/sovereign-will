// Point on a resource: one kind of mark, on and off (no 1-2-3 levels), worked by up to markWorkers (#232)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  function pointMark({ seed = 'point-mark' } = {}) {
    start(seed);
    clearResources();
    const far = nearHall(6, 0), near = nearHall(3, 3);
    trees.push({ x: far.x, y: far.y, hp: 1e6, maxHp: 1e6, priority: 0 }, { x: near.x, y: near.y, hp: 1e6, maxHp: 1e6, priority: 0 });
    invalidateAllPaths();
    const tree = trees[trees.length - 2];
    buildMode = 'interact';
    const tap = () => { mouse.x = tree.x; mouse.y = tree.y; handleCanvasClick(); return tree.priority; };
    const marks = [tap(), tap(), tap()];
    settlers = [1, 2, 3].map(i => makeSettler(i, townHall.x - 30 + i * 20, townHall.y + 40, { tool: 'axe' }));
    let most = 0;
    run(10, { each: () => { settlers.forEach(s => { s.hunger = 999; }); most = Math.max(most, settlers.filter(s => Math.hypot(s.x - tree.x, s.y - tree.y) < 40).length); } });
    return { marks, atMarked: most };
  }

  // Five marked rocks and two miners: each on a rock of its own, both at work at once, each rock done before
  // the next (#232: both went for one, the other stood about)
  function marksSpread({ seed = 'mark-rocks' } = {}) {
    start(seed);
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const rocks = [[5, 2], [6, 2], [7, 2], [5, 3], [7, 4]].map(([dx, dy]) => tileCenter(g.gx + dx, g.gy + dy)).map(p => ({ x: p.x, y: p.y, hp: 4, maxHp: 4, priority: 1 }));
    boulders.push(...rocks);
    invalidateAllPaths();
    settlers = [1, 2].map(i => makeSettler(i, townHall.x - 40 - i * 20, townHall.y + 40, { tool: 'pickaxe' }));
    let together = false, started = 0;
    run(25, { each: () => {
      settlers.forEach(s => { s.hunger = 999; });
      const hit = rocks.filter(r => boulders.includes(r) && r.hp < r.maxHp && r.hp > 0);
      if (hit.length >= 2) together = true;
      started = Math.max(started, hit.length);
    } });
    return { together, allDone: rocks.every(r => !boulders.includes(r)) };
  }

  // An archer with an empty quiver and a wave coming: it fetches arrows from the stock before taking its post
  function archerRestock({ seed = 'archer-restock' } = {}) {
    start(seed);
    clearResources();
    const a = makeSettler(1, townHall.x + 80, townHall.y + 60, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 });
    settlers = [a, ...[2, 3].map(i => makeSettler(i, townHall.x - 60, townHall.y + 30 * i, { weapon: 'sword', role: 'soldier' }))];
    stock.arrows = 30;
    run(12, { holdWaves: false, each: () => { settlers.forEach(s => { s.hunger = 999; }); waveTimer = 8; } });
    return { arrows: a.arrows, stock: stock.arrows };
  }

  return { pointMark, marksSpread, archerRestock };
})());
