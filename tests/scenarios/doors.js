// Doors blocked from outside (#17): workers clear them first; soldiers break out of a walled-in base.
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, wallRing, clearResources } } = window.sim;

  // An empty map, the town hall walled in 3 tiles out with one door on the east side; `blocker`
  // ('boulder', 'tree' or 'rock') is put right outside the door. Returns the door and its outside tile.
  function walledBase(seed, blocker) {
    start(seed);
    clearResources();
    wallRing(3);
    const cx = Math.floor(townHall.x / TILE_SIZE), cy = Math.floor(townHall.y / TILE_SIZE);
    const doorPos = tileCenter(cx + 3, cy);
    buildings = buildings.filter(b => b.x !== doorPos.x || b.y !== doorPos.y);
    const door = placeBuilding('door', doorPos.x, doorPos.y);
    const outside = tileCenter(cx + 4, cy);
    if (blocker === 'boulder') boulders.push({ ...outside, hp: 4 });
    if (blocker === 'tree') trees.push({ ...outside, hp: 3, isGrowing: false, growProgress: 0 });
    if (blocker === 'rock') naturalRocks.push({ ...outside, hp: 100 });
    invalidateAllPaths();
    return { door, outside, cx, cy };
  }

  // A miner inside, a boulder blocking the door and another boulder nearer to him inside the base:
  // the door one should go first. Returns which boulder was mined first.
  function doorBlockerFirst({ seed = 'door-blocker-test', seconds = 40 }) {
    const { outside, cx, cy } = walledBase(seed, 'boulder');
    const inner = tileCenter(cx - 2, cy);
    boulders.push({ ...inner, hp: 4 });
    invalidateAllPaths();
    settlers = [makeSettler(1, inner.x + TILE_SIZE, inner.y, { tool: 'pickaxe' })];
    const doorBoulder = boulders.find(b => b.x === outside.x && b.y === outside.y);
    const innerBoulder = boulders.find(b => b.x === inner.x && b.y === inner.y);
    let first = null;
    run(seconds, { each: () => {
      if (first) return;
      if (!boulders.includes(doorBoulder)) first = 'door';
      else if (!boulders.includes(innerBoulder)) first = 'inner';
    } });
    return { first };
  }

  // A soldier alone in a base whose only door is blocked from outside; returns whether the blocker is
  // gone and whether the base was sealed to begin with.
  function sealedBreakout({ seed = 'sealed-test', blocker, seconds = 30 }) {
    const { outside } = walledBase(seed, blocker);
    settlers = [makeSettler(1, townHall.x - 40, townHall.y, { weapon: 'sword', role: 'soldier' })];
    const list = { boulder: boulders, tree: trees, rock: naturalRocks }[blocker];
    const obj = list.find(o => o.x === outside.x && o.y === outside.y);
    const sealedAtStart = isBaseSealed();
    run(seconds);
    return { sealedAtStart, cleared: !list.includes(obj) };
  }

  return { doorBlockerFirst, sealedBreakout };
})());
