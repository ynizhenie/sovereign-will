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

  return { pointMark };
})());
