// The friend's batch of fixes (#279), part A2: the night and the AI
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources, placeBuilding } } = window.sim;
  const night = () => { const c = GAME_CONFIG.daytime; dayTime = c.morning + c.day + c.evening + 2; };
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); waveTimer = 999; if (each) each(); } };

  // A corpse by the tent: taken away before anyone sleeps there (8); asleep, the hurt mend (31)
  function corpseBySleep({ seed = 'corpse-sleep' } = {}) {
    start(seed); clearResources();
    settlers.length = 1;
    const s = settlers[0];
    const tent = placeBuilding('tent', townHall.x + 120, townHall.y + 15);
    s.x = tent.x + 40; s.y = tent.y;
    addCorpse({ x: tent.x + 20, y: tent.y + 30, radius: 10 }, 'enemy', 'raider');
    night();
    let carried = false;
    step(25, () => { if (s.carrying && s.carrying.type === 'corpse') carried = true; });
    const nearTent = game.corpses.filter(c => Math.hypot(c.x - tent.x, c.y - tent.y) < 90).length;
    const asleep = !!s.asleep;
    s.hp = 40;
    step(2);
    return { carried, nearTent, asleep, mended: s.hp > 40 };
  }

  // A torch post placed at night with every worker asleep: a soldier on watch builds it (9)
  function soldierTorch({ seed = 'soldier-torch' } = {}) {
    start(seed); clearResources();
    settlers.length = 0;
    const w = makeSettler(600, townHall.x - 60, townHall.y + 50, {});
    const s1 = makeSettler(601, townHall.x + 40, townHall.y + 60, { weapon: 'sword', role: 'soldier' });
    const s2 = makeSettler(602, townHall.x + 60, townHall.y + 60, { weapon: 'sword', role: 'soldier' });
    settlers.push(w, s1, s2);
    stock.wood = 20;
    stock.torches = 2;
    night();
    step(8);
    const workerAsleep = !!w.asleep;
    const bp = createBuildingBlueprint('torch', townHall.x + 120, townHall.y + 75); bp.needs = { ...GAME_CONFIG.buildings.torch.cost }; blueprints.push(bp);
    const seen = new Set();
    step(25, () => { for (const o of [s1, s2]) seen.add(o.activity); });
    return { workerAsleep, soldierBuilt: seen.has('build') || seen.has('deliverMaterials'), torchUp: buildings.some(b => b.type === 'torch') };
  }

  // Ordered to work at night: a worker gets up for it, drowsy (half pace), and says it wants to sleep (14)
  function nightOrder({ seed = 'night-order' } = {}) {
    start(seed); clearResources();
    settlers.length = 1;
    const s = settlers[0];
    night();
    step(8);
    const sleptFirst = !!s.asleep;
    const bp = createBuildingBlueprint('wall_wood', townHall.x + 120, townHall.y - 75); bp.needs = { ...GAME_CONFIG.buildings.wall_wood.cost }; blueprints.push(bp);
    stock.wood = 20;
    let drowsy = false; const said = new Set();
    step(20, () => { if (s.drowsy) drowsy = true; if (s.say) said.add(s.say.text); });
    const built = buildings.some(b => b.type === 'wall_wood');
    step(6);
    return { sleptFirst, drowsy, said: t('voice.humans.sleepy').split('|').some(p => said.has(p)), built, backToSleep: !!s.asleep };
  }

  // Awake at night, hunger at half the rate (16); a soldier on watch cooks at the fire (15)
  function nightHunger({ seed = 'night-hunger' } = {}) {
    start(seed);
    const s = settlers[0];
    s.isPossessed = true; s.hunger = 30; dayTime = GAME_CONFIG.daytime.morning + 5;
    step(4);
    const day = 30 - s.hunger;
    s.hunger = 30; night();
    step(4);
    const nightRate = 30 - s.hunger;
    s.isPossessed = false;
    return { ratio: nightRate / day };
  }

  // An enemy tent still up at night: the soldiers stay up and go and break it (17)
  function nightTent({ seed = 'night-tent' } = {}) {
    start(seed); clearResources();
    settlers.length = 0;
    for (let i = 0; i < 2; i++) settlers.push(makeSettler(700 + i, townHall.x + 40 * i, townHall.y + 60, { weapon: 'sword', role: 'soldier' }));
    enemyTents.push({ x: townHall.x + 300, y: townHall.y, hp: 60, maxHp: 60, summonTimer: 0, summonsLeft: 0 });
    stock.firewood = 10;
    night();
    step(40, () => {});
    return { tentsLeft: enemyTents.length, asleep: settlers.filter(s => s.asleep).length };
  }

  // A medic hurt, no one else: it heals itself (21); a torch held, a weapon in the other hand: the torch goes
  // to its side in a fight (30)
  function medicSelf({ seed = 'medic-self' } = {}) {
    start(seed); clearResources();
    settlers.length = 1;
    const m = settlers[0];
    m.tool = 'medbag'; m.bagHerbs = 3; m.hp = 40; m.role = 'worker';
    const en = createConfiguredEnemy({ x: townHall.x + 400, y: townHall.y + 300 }, 'raider'); en.fromWave = true; en.speed = 0; enemies.push(en);
    step(6);
    return { hp: m.hp };
  }

  // At night a soldier on watch cooks at the fire (15)
  function nightCook({ seed = 'night-cook' } = {}) {
    start(seed); clearResources();
    settlers.length = 0;
    for (let i = 0; i < 2; i++) settlers.push(makeSettler(600 + i, townHall.x - 40 + i * 30, townHall.y + 60, { weapon: 'sword', role: 'soldier' }));
    const fire = placeBuilding('campfire', townHall.x + 90, townHall.y + 15); fire.fuelLeft = 5;
    stock.rawMeat = 10; stock.food = 0; stock.firewood = 20;
    night();
    step(20);
    return { food: stock.food };
  }

  return { nightCook, corpseBySleep, soldierTorch, nightOrder, nightHunger, nightTent, medicSelf };
})());
