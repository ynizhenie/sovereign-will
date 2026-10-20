// The friend's batch of fixes (#279), part C3: zones
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources, tileCenter } } = window.sim;
  const quiet = () => { boars = []; boarRespawnTimer = 999; waveTimer = 999; };

  // A relief zone: settlers go there, 5 heaps at most in it, its dung not smeared
  function reliefZone({ seed = 'relief-zone' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    for (const [dx, dy] of [[4, 4], [5, 4]]) { const p = tileCenter(g.gx + dx, g.gy + dy); toggleZone(p.x, p.y, 'relief'); }
    settlers = [0, 1, 2, 3, 4, 5, 6].map(i => makeSettler(1 + i, townHall.x - 40 + i * 12, townHall.y + 45));
    stock.food = 999;
    settlers.forEach(s => { s.needsRelief = true; s.hunger = 999; });
    run(40, { each: () => { quiet(); settlers.forEach(s => { s.hunger = 999; }); } });
    const inZone = dung.filter(d => inReliefZone(d.x, d.y));
    // one walks over a heap in the zone: no footprints
    const s = settlers[0];
    const heap = inZone[0];
    s.smear = null;
    if (heap) { s.x = heap.x; s.y = heap.y; trackFootprints(s); }
    return { heaps: dung.length, inZone: inZone.length, allMarked: inZone.every(d => d.inZone), smeared: !!s.smear };
  }

  // Posts marked: soldiers stand on them before a wave, one a tile; the rest as ever
  function postZones({ seed = 'post-zones' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const tiles = [[-4, -4], [-3, -4]].map(([dx, dy]) => tileCenter(g.gx + dx, g.gy + dy));
    tiles.forEach(p => toggleZone(p.x, p.y, 'post'));
    settlers = [0, 1, 2, 3].map(i => makeSettler(10 + i, townHall.x + i * 15, townHall.y + 50, { weapon: 'sword', role: 'soldier' }));
    defensePlan = null;
    const plan = getDefensePlan();
    const onTiles = settlers.filter(s => tiles.some(p => plan.squadOf.get(s).post.x === p.x && plan.squadOf.get(s).post.y === p.y)).length;
    // a wave: they go and stand there
    const en = createConfiguredEnemy({ x: 30, y: 30 }, 'raider'); en.fromWave = true; en.speed = 0; enemies.push(en);
    run(10, { each: quiet });
    const standing = tiles.filter(p => settlers.some(s => Math.hypot(s.x - p.x, s.y - p.y) < 20)).length;
    return { onTiles, everyoneHasAPost: settlers.every(s => plan.squadOf.get(s)), standing };
  }

  return { reliefZone, postZones };
})());
