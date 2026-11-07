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
    const r = { start: getDayPhase(), startTime: dayTime === day().morning / 2,
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

  function sleepAtEnemyCamp({ seed = 'night-enemy-camp' } = {}) {
    const previousMode = game.gameMode;
    const previousSettings = game.mapSettings;
    game.gameMode = 'endless';
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed); clearResources();
    settlers = [makeSettler(1, townHall.x - 40, townHall.y)];
    createEnemyCamps(1);
    const guards = enemies.filter(enemy => enemy.campGuard);
    dayTime = nightStart() + 1;
    run(30, { each: calm });
    const sleepers = guards.filter(enemy => enemy.asleep);
    game.gameMode = previousMode;
    game.mapSettings = previousSettings;
    return { asleep: !!settlers[0].asleep, guards: guards.length, sleepingGuards: sleepers.length,
      keeperAwake: guards.filter(enemy => enemy.campFireKeeper).every(enemy => !enemy.asleep) };
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

  // At night, a soldier on watch out of the light fetches a crafted torch; without one it keeps to the base
  function handTorch({ seed = 'night-hand-torch', torches = 1 } = {}) {
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x + getBaseRadius(), townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    stock.torches = torches;
    dayTime = nightStart() + 1;
    run(15, { each: calm });
    return { torch: !!s.torchInHand, torches: stock.torches, reach: nightReach(s) === Infinity ? 'any' : 'base' };
  }

  function directionalNightReach({ seed = 'night-directional-reach' } = {}) {
    start(seed); clearResources();
    const east = nearHall(12, 0);
    placeBuilding('wall_wood', east.x, east.y);
    invalidateAllPaths();
    const s = makeSettler(1, townHall.x, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    stock.torches = 0;
    dayTime = nightStart() + 1;
    const eastTarget = { x: townHall.x + 300, y: townHall.y };
    const westTarget = { x: townHall.x - 300, y: townHall.y };
    return { east: nightReach(s, eastTarget), west: nightReach(s, westTarget) };
  }

  // A night wave: some of its enemies carry torches; and what gives light at night
  function nightWave({ seed = 'night-wave' } = {}) {
    start(seed); clearResources();
    settlers = [];
    dayTime = nightStart() + 1;
    waveNum = 30;
    startNextWave();
    const waveEnemies = enemies.concat(...enemyRafts.map(raft => raft.units));
    const torches = waveEnemies.filter(en => en.torch).length;
    const r = { someTorches: torches > 0, notAll: torches < waveEnemies.length };
    // the lights: the town hall, a torch in an enemy's hand, a portal, a necromancer's staff
    placeBuilding('portal', nearHall(5, 5).x, nearHall(5, 5).y);
    settlers = [Object.assign(createSettler('zombie', 1, townHall.x + 40, townHall.y), { tool: 'necro_staff' })];
    // (#326) an enemy's torch gives light where the colony sees it, not in the fog: one by the hall does, the far ones don't
    const carriers = waveEnemies.filter(en => en.torch);
    if (carriers[0]) {
      for (const raft of enemyRafts) raft.units = raft.units.filter(enemy => enemy !== carriers[0]);
      enemies.push(carriers[0]);
    }
    carriers[0].x = townHall.x + 60; carriers[0].y = townHall.y; tickFog(1);
    const lights = getLights();
    r.farTorchesDark = carriers.slice(1).every(en => !lights.some(l => l.x === en.x && l.y === en.y));
    r.lights = { hall: lights.some(l => l.x === townHall.x && l.y === townHall.y && Math.abs(l.r - (townHall.radius + day().hallLightTiles * TILE_SIZE)) < 0.01),
      enemyTorch: lights.some(l => waveEnemies.some(en => en.torch && en.x === l.x && en.y === l.y)),
      portal: lights.some(l => buildings.some(b => b.type === 'portal' && b.x === l.x && b.y === l.y)),
      staff: lights.some(l => l.color && Math.hypot(l.x - settlers[0].x, l.y - settlers[0].y) < 40) };
    const fogEnabled = game.fogEnabled;
    game.fogEnabled = false;
    r.enemyTorchWithoutFog = getLights().some(l => waveEnemies.some(en => en.torch && en.x === l.x && en.y === l.y));
    game.fogEnabled = fogEnabled;
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

  return { nightPhases: phases, nightSleep: sleep, nightSleepAtEnemyCamp: sleepAtEnemyCamp, nightWoken: woken, nightTorchPost: torchPost, nightHandTorch: handTorch, directionalNightReach, nightWave, nightFuelDuty: fuelDuty };
})());
