// Mechanics batch: resting (#171), butchering boars (#172), hunger (#178), waves (#179)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // A swordsman kills a boar: it bleeds and drops as a carcass; the swordsman butchers it where it lies
  // for butcherSeconds, working at it, and then carries the meat
  function butcherBoar({ seed = 'butcher-test' }) {
    start(seed);
    clearResources();
    const at = { x: townHall.x + 120, y: townHall.y };
    boars = [{ ...at, hp: 40, maxHp: 40, priority: 0, wanderTimer: 0, wanderInterval: 999, targetX: at.x, targetY: at.y }];
    const s = makeSettler(1, at.x - 20, at.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    const boar = boars[0];
    GAME_CONFIG.mapResources.boar.dungChance = 1; // every hit scares dung out of it here
    const splats = bloodSplats.length;
    let killedAt = null, meatAt = null, worked = false;
    run(30, { each: f => {
      if (killedAt === null && boar.isCarcass) killedAt = f / 60;
      if (killedAt !== null && meatAt === null && boar.butcher > 0 && s.working > 0) worked = true;
      if (meatAt === null && s.carrying && (s.carrying.items || [s.carrying]).some(i => i.type === 'rawMeat')) meatAt = f / 60;
    } });
    GAME_CONFIG.mapResources.boar.dungChance = 0.12;
    return {
      killed: killedAt !== null, butcherSeconds: meatAt !== null && killedAt !== null ? meatAt - killedAt : null,
      worked, gone: !boars.includes(boar), bled: bloodSplats.length > splats && boar.bloodAge !== undefined, dung: dung.length > 0
    };
  }

  // Settlers eat on clocks of their own, and go off after five meals
  function ownHunger({ seed = 'hunger-test' }) {
    start(seed);
    settlers = [1, 2, 3, 4].map(i => makeSettler(i, townHall.x + i * 20, townHall.y + 40));
    stock.food = 100;
    update(1 / 60);
    const clocks = settlers.map(s => s.hunger);
    const s = settlers[0];
    const food0 = stock.food;
    const needsAfter = [];
    for (let meal = 1; meal <= GAME_CONFIG.relief.mealsBefore; meal++) {
      settlers.forEach(o => { o.hunger = o === s ? 0.001 : 999; });
      update(1 / 60);
      needsAfter.push(!!s.needsRelief);
    }
    return { distinct: new Set(clocks.map(c => c.toFixed(3))).size, eaten: food0 - stock.food, needsAfter };
  }

  // Enemies in a wave: the first lighter, then more for a bigger army
  function waveSizes({ seed = 'wave-size-test' }) {
    const wave = (num, army) => {
      start(seed);
      settlers = Array.from({ length: army }, (_, i) => makeSettler(i + 1, townHall.x, townHall.y + 40));
      enemies = []; enemyTents = []; enemyTentBlueprints = [];
      worldSeed.setState(12345);
      waveNum = num; startNextWave();
      return enemies.length;
    };
    return { first: wave(1, 6), second: wave(2, 6), small: wave(2, 2), big: wave(2, 20), firstTiny: wave(1, 1) };
  }

  // A settler with nothing to do puts its weapon on its back; at work it holds it
  function resting({ seed = 'rest-test' }) {
    start(seed);
    clearResources();
    const idle = makeSettler(1, townHall.x + 40, townHall.y + 40, { weapon: 'sword', role: 'soldier' });
    settlers = [idle];
    run(1);
    const idleRests = isResting(idle);
    trees.push({ x: townHall.x + 90, y: townHall.y, hp: 50, maxHp: 50 });
    const worker = makeSettler(2, townHall.x + 60, townHall.y, { tool: 'axe' });
    settlers.push(worker);
    invalidateAllPaths();
    let workerRested = false;
    run(3, { each: () => { if (worker.activity !== 'patrol' && isResting(worker)) workerRested = true; } });
    return { idleRests, activity: idle.activity, workerRested, workerActivity: worker.activity };
  }

  return { butcherBoar, ownHunger, waveSizes, resting };
})());
