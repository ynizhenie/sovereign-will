// The friend's batch of fixes (#279), comment 1, part G1: small things
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;
  const night = () => { const c = GAME_CONFIG.daytime; dayTime = c.morning + c.day + c.evening + 2; };
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); waveTimer = 999; if (each) each(); } };
  const calm = () => { boars = []; boarRespawnTimer = 999; pendingRespawns = []; };

  // Three workers asleep, one wall ordered at night: one gets up for it, not all (10)
  function nightOneUp({ seed = 'night-one-up' } = {}) {
    start(seed); clearResources();
    settlers.length = 0;
    const ws = [0, 1, 2].map(i => makeSettler(700 + i, townHall.x - 40 + i * 30, townHall.y + 50, {}));
    settlers.push(...ws);
    night();
    step(8, calm);
    const allAsleep = ws.every(w => w.asleep);
    const bp = createBuildingBlueprint('wall_wood', townHall.x + 120, townHall.y - 75); bp.needs = { ...GAME_CONFIG.buildings.wall_wood.cost }; blueprints.push(bp);
    stock.wood = 20;
    let mostUp = 0;
    step(6, () => { calm(); mostUp = Math.max(mostUp, ws.filter(w => !w.asleep).length); });
    return { allAsleep, mostUp };
  }

  // Eating, then put to sleep: the meal's put away, not stuck at its mouth (9)
  function eatThenSleep({ seed = 'eat-sleep' } = {}) {
    start(seed); clearResources();
    const s = settlers[0];
    settlers.length = 1;
    s.eating = { left: 5, icon: 'food' };
    s.asleep = true;
    step(0.2, calm);
    const putAway = !s.eating;
    s.asleep = false;
    s.eating = { left: 1, icon: 'food' };
    s.isPossessed = true; // (not by goEat: eaten in its time all the same)
    step(1.5, calm);
    return { putAway, eaten: !s.eating };
  }

  // A foreman's squad: only those within 5 tiles of it (12)
  function foremanRange({ seed = 'foreman-range' } = {}) {
    start(seed); clearResources();
    const boss = makeSettler(1, townHall.x - 40, townHall.y + 40, { whistle: true });
    const near = makeSettler(2, townHall.x + 40, townHall.y + 40, { tool: 'axe' });
    const far = makeSettler(3, townHall.x - 40 + 12 * TILE_SIZE, townHall.y + 40, { tool: 'axe', speed: 0 });
    settlers = [boss, near, far];
    Object.assign(stock, { wood: 200, stone: 0, food: 200 });
    const told = new Set();
    let maxAway = 0;
    run(30, { each: () => { calm(); settlers.forEach(o => { o.hunger = 999; }); stock.stone = 0; if (near.focus) told.add('near'); if (far.focus) told.add('far'); maxAway = Math.max(maxAway, Math.hypot(boss.x - (townHall.x - 40), boss.y - (townHall.y + 40))); } });
    return { near: told.has('near'), far: told.has('far'), stayed: maxAway < 6 * TILE_SIZE };
  }

  // A temporary zombie crumbling: what it held drops like anyone's (16)
  function zombieDrops({ seed = 'zombie-drops' } = {}) {
    start(seed); clearResources();
    GAME_CONFIG.loot.itemChance0 = GAME_CONFIG.loot.itemChance; GAME_CONFIG.loot.itemChance = 1;
    const z = makeSettler(900, townHall.x + 60, townHall.y, { weapon: 'club', temporary: 0.01 });
    settlers.push(z);
    loot.length = 0;
    updateTemporaryZombies(0.1);
    GAME_CONFIG.loot.itemChance = GAME_CONFIG.loot.itemChance0;
    return { gone: !settlers.includes(z), club: loot.some(l => l.items.includes('weapons:club')) };
  }

  return { nightOneUp, eatThenSleep, foremanRange, zombieDrops };
})());
