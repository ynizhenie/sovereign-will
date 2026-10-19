// Day and night (#257)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const calm = () => { boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999; };
  const day = () => GAME_CONFIG.daytime;
  const nightStart = () => day().morning + day().day + day().evening;

  // A day: morning (the start), day, evening, night, morning again; dark at night, light by day, half way
  // through the morning half dark
  function phases({ seed = 'night-phases' } = {}) {
    start(seed); clearResources();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y)];
    const at = t => { dayTime = t; return getDayPhase(); };
    const r = { start: getDayPhase(), startTime: dayTime,
      phases: [at(10), at(100), at(220), at(300)],
      dark: { day: (dayTime = 100, getDarkness()), night: (dayTime = 300, getDarkness()), midMorning: (dayTime = day().morning / 2, Math.round(getDarkness() * 100) / 100) },
      interval: waveInterval };
    dayTime = 0;
    run(day().morning + 1, { each: calm });
    r.afterMorning = getDayPhase();
    return r;
  }

  // Night: workers go to sleep at the tent, hunger standing still; half the soldiers keep watch, the rest
  // sleep too; in the morning they wake up, and want to eat
  function sleep({ seed = 'night-sleep' } = {}) {
    start(seed); clearResources();
    const tent = placeBuilding('tent', nearHall(4, 2).x, nearHall(4, 2).y);
    invalidateAllPaths();
    const workers = [1, 2].map(i => makeSettler(i, townHall.x - 40, townHall.y + 30 * i));
    const soldiers = [3, 4].map(i => makeSettler(i, townHall.x + 40, townHall.y + 30 * (i - 2), { weapon: 'sword', role: 'soldier' }));
    settlers = [...workers, ...soldiers];
    stock.food = 50;
    settlers.forEach(s => { s.hunger = 20; });
    dayTime = nightStart() + 1;
    run(15, { each: calm });
    const hungerAsleep = workers[0].hunger;
    run(5, { each: calm });
    const r = {
      workersAsleep: workers.every(s => s.asleep), byTent: workers.every(s => Math.hypot(s.x - tent.x, s.y - tent.y) < 50),
      hungerStill: workers[0].hunger === hungerAsleep, onWatch: soldiers.filter(s => !s.asleep).length, watchAsleep: soldiers.filter(s => s.asleep).length
    };
    dayTime = nightStart() + day().night - 0.5; // (the night nearly over)
    const wanted = new Set();
    run(3, { each: () => { calm(); workers.forEach(s => { if (s.wantsMeal || s.eating) wanted.add(s); }); } });
    return { ...r, awake: settlers.every(s => !s.asleep), hungry: wanted.size === workers.length };
  }

  // A wave due at night: everyone's woken before it
  function woken({ seed = 'night-woken' } = {}) {
    start(seed); clearResources();
    settlers = [makeSettler(1, townHall.x - 40, townHall.y), makeSettler(2, townHall.x + 40, townHall.y)];
    dayTime = nightStart() + 1;
    run(10, { each: calm });
    const asleep = settlers.every(s => s.asleep);
    run(1, { holdWaves: false, each: () => { boars = []; waveTimer = day().wakeSeconds - 2; } });
    return { asleep, wokenAll: settlers.every(s => !s.asleep) };
  }

  // A torch post is lit at dusk by a worker, with a piece of firewood; in the morning it's out
  function torchPost({ seed = 'night-torch' } = {}) {
    start(seed); clearResources();
    const post = placeBuilding('torch', nearHall(5, 0).x, nearHall(5, 0).y);
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x - 40, townHall.y)];
    stock.firewood = 5;
    dayTime = day().morning + day().day + 1; // (evening)
    run(15, { each: calm });
    const r = { lit: !!post.lit, firewood: stock.firewood };
    dayTime = 0; wasNight = true; // (the night just over)
    run(0.1, { each: calm });
    return { ...r, outInTheMorning: !post.lit };
  }

  // At night, a soldier on watch out of the light takes a torch for the night (a piece of firewood); with no
  // firewood for one, settlers keep to the base
  function handTorch({ seed = 'night-hand-torch', firewood = 5 } = {}) {
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x + getBaseRadius(), townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    stock.firewood = firewood;
    dayTime = nightStart() + 1;
    run(6, { each: calm });
    return { torch: !!s.torchInHand, firewood: stock.firewood, reach: nightReach(makeSettler(9, 0, 0)) === Infinity ? 'any' : 'base' };
  }

  // A night wave: some of its enemies carry torches; and what gives light at night
  function nightWave({ seed = 'night-wave' } = {}) {
    start(seed); clearResources();
    settlers = [];
    dayTime = nightStart() + 1;
    waveNum = 30;
    startNextWave();
    const torches = enemies.filter(en => en.torch).length;
    const r = { someTorches: torches > 0, notAll: torches < enemies.length };
    // the lights: the town hall, a torch in an enemy's hand, a portal, a necromancer's staff
    placeBuilding('portal', nearHall(5, 5).x, nearHall(5, 5).y);
    settlers = [Object.assign(createSettler('zombie', 1, townHall.x + 40, townHall.y), { tool: 'necro_staff' })];
    const lights = getLights();
    r.lights = { hall: lights.some(l => l.x === townHall.x && l.y === townHall.y && Math.abs(l.r - (townHall.radius + day().hallLightTiles * TILE_SIZE)) < 0.01),
      enemyTorch: lights.some(l => enemies.some(en => en.torch && en.x === l.x && en.y === l.y)),
      portal: lights.some(l => buildings.some(b => b.type === 'portal' && b.x === l.x && b.y === l.y)),
      staff: lights.some(l => l.x === settlers[0].x && l.y === settlers[0].y) };
    enemies = [];
    return r;
  }

  // No firewood at night, a campfire and a soldier on watch: one woodcutter stays up to get some
  function fuelDuty({ seed = 'night-fuel' } = {}) {
    start(seed); clearResources();
    placeBuilding('campfire', nearHall(4, 0).x, nearHall(4, 0).y);
    invalidateAllPaths();
    const cutter = makeSettler(1, townHall.x - 40, townHall.y, { tool: 'axe' });
    const other = makeSettler(2, townHall.x - 40, townHall.y + 40);
    const guard = makeSettler(3, townHall.x + 40, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [cutter, other, guard];
    stock.firewood = 0;
    dayTime = nightStart() + 1;
    let cutterUp = false;
    run(10, { each: () => { calm(); if (onFuelDuty(cutter) && !cutter.asleep) cutterUp = true; } });
    return { cutterUp, firewoodMade: (stock.firewood || 0) > 0, otherAsleep: !!other.asleep };
  }

  return { nightPhases: phases, nightSleep: sleep, nightWoken: woken, nightTorchPost: torchPost, nightHandTorch: handTorch, nightWave, nightFuelDuty: fuelDuty };
})());
