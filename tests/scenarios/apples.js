// Apple trees (#34)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // One apple tree and one ordinary tree; a woodcutter and a worker with no tool. `mark`: none, or the
  // apple tree marked 'bare' (before apples grew) or 'ripe' (with apples). Returns what happened to it.
  function appleOrchard({ seed = 'apple-test', mark = 'none', ripe = true, seconds = 30 }) {
    start(seed);
    clearResources();
    const apple = makeAppleTree({ ...nearHall(4, 2), hp: 3, isGrowing: false, growProgress: 0, priority: 0 });
    const plain = { ...nearHall(-4, 2), hp: 3, isGrowing: false, growProgress: 0, priority: 0 };
    trees.push(apple, plain);
    invalidateAllPaths();
    if (mark === 'bare') { mouse.x = apple.x; mouse.y = apple.y; buildMode = 'interact'; handleCanvasClick(); }
    apple.applesReady = ripe;
    if (mark === 'ripe') { mouse.x = apple.x; mouse.y = apple.y; buildMode = 'interact'; handleCanvasClick(); }
    settlers = [makeSettler(1, townHall.x + 50, townHall.y, { tool: 'axe' }), makeSettler(2, townHall.x - 50, townHall.y)];
    const food0 = stock.food;
    let picked = 0;
    run(seconds, { each: () => {
      pendingRespawns.length = 0;
      if (apple.applesReady === false && apple.appleGrowth === 0 && !apple.countedPick) { apple.countedPick = true; picked++; }
      apple.appleGrowth = Math.min(apple.appleGrowth, 0.5); // no second crop during the test
      stock.food = Math.max(stock.food, food0);
    } });
    return { appleTreeStands: trees.includes(apple), plainTreeStands: trees.includes(plain), picked: picked > 0, foodUp: stock.food > food0 };
  }

  // Apple trees on generated maps: roughly the configured share of grown trees, same trees every time
  function appleShare({ seeds }) {
    return seeds.map(seed => {
      start(seed);
      const grown = trees.filter(t => !t.isGrowing);
      return { apple: grown.filter(t => t.apple).length, grown: grown.length, keys: trees.filter(t => t.apple).map(t => `${t.x},${t.y}`).join(';') };
    });
  }

  return { appleOrchard, appleShare };
})());

// Picking apples shows on the tree like any other gathering (#176): a progress bar while it's picked
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;
  function applePickBar({ seed = 'apple-bar' } = {}) {
    start(seed);
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const tree = makeAppleTree({ ...tileCenter(g.gx + 4, g.gy), hp: 3, isGrowing: false, growProgress: 0, priority: 0 });
    tree.applesReady = true;
    trees.push(tree);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y)];
    const bars = [];
    const original = drawProgressBar;
    window.drawProgressBar = (x, y, share) => { if (x === tree.x && y === tree.y) bars.push(Math.round(share * 100)); return original.apply(this, arguments); };
    try {
      run(12, { each: f => { tree.appleGrowth = 0; if (f % 10 === 0) render(); } });
    } finally { window.drawProgressBar = original; }
    return { shown: bars.some(b => b > 0 && b < 100), rising: bars.length > 1 && bars[bars.length - 1] >= bars[0], picked: !tree.applesReady };
  }
  return { applePickBar };
})());
