// Footprints out of blood and dung, and settlers relieving themselves (#124)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // A settler walked straight across a pool of blood (or a pile of dung): how many footprints, of what
  function footprints({ seed = 'smear-test', source = 'blood', by = null }) {
    start(seed);
    clearResources();
    const pool = nearHall(4, 3);
    // its own pile: it starts standing on it (it just left it there)
    const s = makeSettler(1, by === 'self' ? pool.x : pool.x - 60, pool.y, { isPossessed: true });
    settlers = [s];
    bloodSplats = []; dung = [];
    if (source === 'blood') bloodSplats.push({ x: pool.x, y: pool.y, r: 5, age: 0 });
    else dung.push({ x: pool.x, y: pool.y, age: 0, by: by === 'self' ? s : null, byLeft: false });
    for (let i = 0; i < 90; i++) { s.x += 2; update(1 / 60); } // walk 180 px east (through it, or off its own)
    const trails = bloodSplats.filter(b => b.kind === 'trail');
    const result = { trails: trails.length, color: trails[0] ? trails[0].color : null, beyond: trails.every(t => t.x > pool.x) };
    if (by === 'self') {
      // later, coming back through it by chance, it does step in it
      bloodSplats = [];
      s.smear = null;
      for (let i = 0; i < 180; i++) { s.x -= 2; update(1 / 60); }
      result.later = bloodSplats.filter(b => b.kind === 'trail').length;
    }
    return result;
  }

  // Three meals in, a settler walks off away from the buildings and leaves dung there
  function relief({ seed = 'relief-test', seconds = 30 }) {
    start(seed);
    clearResources();
    for (let i = 0; i < 3; i++) grassList.push({ ...nearHall(8, -2 + i * 2), hp: 1 });
    const grassAt = grassList.map(g => ({ x: g.x, y: g.y })); // the settler may well pick the grass later
    placeBuilding('tent', nearHall(2, 2).x, nearHall(2, 2).y);
    invalidateAllPaths();
    const s = makeSettler(1, townHall.x + 50, townHall.y + 50);
    settlers = [s];
    stock.food = 100;
    for (let meal = 0; meal < GAME_CONFIG.relief.mealsBefore; meal++) { s.hunger = 0.001; update(1 / 60); }
    const needs = !!s.needsRelief;
    run(seconds, { each: () => { pendingRespawns.length = 0; s.hunger = 999; } });
    const pile = dung[0];
    const minDist = GAME_CONFIG.relief.awayFromBuildings * TILE_SIZE;
    return {
      needs, piles: dung.length, stillNeeds: !!s.needsRelief, meals: s.meals,
      awayFromBuildings: !!pile && buildings.every(b => Math.hypot(pile.x - b.x, pile.y - b.y) >= minDist),
      nearGrass: !!pile && grassAt.some(g => Math.hypot(pile.x - g.x, pile.y - g.y) <= TILE_SIZE * 1.5)
    };
  }

  return { footprints, relief };
})());
