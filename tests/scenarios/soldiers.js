// Soldiers and the enemy's way in (#155)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const soldiers = n => Array.from({ length: n }, (_, i) => makeSettler(i + 1, townHall.x - 50 + (i % 4) * 25, townHall.y + 50 + Math.floor(i / 4) * 25,
    { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 }));

  function setUp(seed) {
    start(seed);
    clearResources();
    invalidateAllPaths();
    window.showNotification = () => {};
    defensePlan = null;
  }

  // Four swordsmen (less than two squads): a post each round the base
  function singles({ seed = 'soldiers-singles' } = {}) {
    setUp(seed);
    settlers = soldiers(4);
    const plan = getDefensePlan();
    return { posts: plan.posts.length, slots: settlers.map(s => plan.squadOf.get(s).slot) };
  }

  // An enemy just outside the base (no building near it), far from every post: someone goes for it
  function nearBase({ seed = 'soldiers-near-base' } = {}) {
    setUp(seed);
    settlers = soldiers(6);
    const plan = getDefensePlan();
    // the side of the base no post is on
    const far = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => ({ dx, dy, p: nearHall(dx * 6, dy * 6) }))
      .sort((a, b) => Math.min(...plan.posts.map(p => Math.hypot(p.x - b.p.x, p.y - b.p.y))) - Math.min(...plan.posts.map(p => Math.hypot(p.x - a.p.x, p.y - a.p.y))))[0];
    const en = createConfiguredEnemy(far.p, 'raider');
    en.fromWave = true; en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    const farFromPosts = plan.posts.every(p => Math.hypot(p.x - en.x, p.y - en.y) > GAME_CONFIG.defense.engageTiles * TILE_SIZE);
    run(10, { each: () => { waveTimer = 50; } });
    return { farFromPosts, engaged: en.hp < en.maxHp };
  }

  // A tower with no arrows of its own, an archer with a full quiver: it goes up ahead of the wave and
  // stays there when the enemy reaches the town hall
  function archerTower({ seed = 'soldiers-tower' } = {}) {
    setUp(seed);
    const tower = placeBuilding('watchtower', nearHall(4, 0).x, nearHall(4, 0).y);
    tower.arrows = 0;
    const archer = makeSettler(1, townHall.x - 40, townHall.y + 40, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers = [archer];
    run(6, { holdWaves: false, each: () => { waveTimer = Math.min(waveTimer, 8); if (waveTimer < 1) waveTimer = 8; } });
    const up = archer.towerAssignment === tower;
    const en = createConfiguredEnemy(nearHall(-2, 0), 'raider');
    en.fromWave = true; en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    run(3, { each: () => { waveTimer = 50; } });
    return { up, stillUp: archer.towerAssignment === tower, shotAt: en.hp < en.maxHp };
  }

  // Six soldiers at their posts; the player points at an enemy far from all of them: three go
  function soldiersMarked({ seed = 'soldiers-marked' } = {}) {
    setUp(seed);
    settlers = soldiers(6);
    const en = createConfiguredEnemy(nearHall(-14, -10), 'raider');
    en.fromWave = true; en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4;
    en.markedTarget = true;
    enemies = [en];
    run(2, { each: () => { waveTimer = 50; } });
    return { goingForIt: settlers.filter(s => s.postTarget === en).length };
  }

  // A ring of walls round the hall with its door on the far side: an enemy on the near side breaks the
  // wall in front of it; a ring of spikes with a gap on the far side: it walks over the spikes
  function wayIn({ seed = 'soldiers-way-in', ring = 'walls' } = {}) {
    setUp(seed);
    const g = getGridPos(townHall.x, townHall.y);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== 4) continue;
        const p = tileCenter(g.gx + dx, g.gy + dy);
        if (ring === 'walls') placeBuilding(dx === -4 && dy === 0 ? 'door' : 'wall_stone', p.x, p.y);
        else if (!(dx === -4 && Math.abs(dy) <= 1)) placeBuilding('spikes', p.x, p.y);
      }
    }
    invalidateAllPaths();
    const start = tileCenter(g.gx + 9, g.gy);
    const path = findPathAStar(start.x, start.y, townHall.x, townHall.y, true).path;
    const tiles = getTileIndex();
    const crosses = kind => path.some(p => tiles[kind].has(`${p.x},${p.y}`));
    const door = buildings.find(b => b.type === 'door');
    return { throughWall: crosses('walls'), overSpikes: crosses('spikes'), viaDoor: !!door && path.some(p => p.x === door.x && p.y === door.y) };
  }

  return { soldiersSingles: singles, soldiersNearBase: nearBase, soldiersTower: archerTower, soldiersMarked, soldiersWayIn: wayIn };
})());
