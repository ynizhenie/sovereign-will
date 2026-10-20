// The friend's #298, comment: marks first, the censor, demons by their portals
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, placeBuilding, clearResources, tileCenter } } = window.sim;
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999; };

  // Food running low, raw meat and a lit fire there, and a tree marked: the worker goes for the tree first (3)
  function marksFirst({ seed = 'marks-first' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const fire = placeBuilding('campfire', tileCenter(g.gx + 2, g.gy + 3).x, tileCenter(g.gx + 2, g.gy + 3).y); fire.fuelLeft = 5;
    const t = tileCenter(g.gx - 5, g.gy + 2);
    const tree = { x: t.x, y: t.y, hp: 3, isGrowing: false, priority: 1 };
    trees.push(tree);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y + 60, { tool: 'axe' })];
    const s = settlers[0];
    Object.assign(stock, { food: 0, rawMeat: 10, firewood: 5 });
    const did = new Set();
    run(8, { each: () => { quiet(); stock.food = 0; did.add(s.activity); } });
    return { toTree: did.has('harvestMarked'), cooked: did.has('cook'), felled: !!tree.fallen || !trees.includes(tree) };
  }

  // Relieving itself, then called away half way: the censor's gone (2)
  function censorOff({ seed = 'censor-off' } = {}) {
    start(seed); clearResources();
    const s = settlers[0];
    settlers.length = 1;
    s.needsRelief = true; s.reliefSpot = { x: s.x, y: s.y };
    let on = false;
    run(1, { each: () => { quiet(); if (isCensored(s)) on = true; } });
    // a wave: it goes to arms, still needing to go
    s.reliefSpot = { x: s.x + 400, y: s.y };
    s.relievingAt = pathTick - 10;
    return { on, offAfter: !isCensored(s), stillNeeds: !!s.needsRelief };
  }

  // An enemy demon wave out of its portals gathers by them, not off at the map's edge (4)
  function demonsMuster({ seed = 'demons-muster' } = {}) {
    sides.player.faction = 'humans'; sides.enemy.faction = 'demons'; start(seed); clearResources(); invalidateAllPaths();
    settlers = [];
    waveNum = 30;
    startNextWave();
    const out = enemies.filter(en => en.fromWave && en.muster);
    const near = p => Math.min(...enemyTents.map(t => Math.hypot(t.x - p.x, t.y - p.y)));
    const r = { some: out.length > 0, byPortal: out.every(en => near(en.muster) < 4 * TILE_SIZE) };
    sides.enemy.faction = 'humans';
    return r;
  }

  return { marksFirst, censorOff, demonsMuster };
})());
