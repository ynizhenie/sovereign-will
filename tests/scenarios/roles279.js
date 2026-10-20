// The friend's batch of fixes (#279), part D: roles, the captain arming, possession
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources, placeBuilding } } = window.sim;
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; };
  const step = (sec, each) => run(sec, { holdWaves: false, each: () => { quiet(); if (each) each(); } });

  // A worker with a weapon is a soldier; a foreman takes no weapon; each has a title by what it holds (12)
  function roles({ seed = 'roles' } = {}) {
    start(seed); clearResources();
    const w = makeSettler(1, townHall.x + 40, townHall.y, { weapon: 'sword' });
    const f = makeSettler(2, townHall.x + 40, townHall.y + 20, { whistle: true, weapon: 'club' });
    settlers = [w, f];
    armory = {};
    step(3, () => { waveTimer = 999; });
    const titles = {};
    for (const [name, extra] of Object.entries({ axe: { tool: 'axe' }, hoe: { tool: 'hoe' }, rod: { tool: 'rod' }, medbag: { tool: 'medbag' }, bow: { weapon: 'bow', role: 'archer' }, none: {} })) {
      titles[name] = roleTitle(makeSettler(9, 0, 0, extra));
    }
    selectedSettler = f; armory['weapons:sword'] = 1;
    const given = craftWeapon('sword');
    return { workerRole: w.role, foremanWeapon: f.weapon, foremanRole: f.role, clubStored: armory['weapons:club'] || 0, given, titles };
  }

  // A captain lends the unarmed a weapon from the store before a wave, and has it back after (13)
  function captainLends({ seed = 'captain-lends' } = {}) {
    start(seed); clearResources();
    const c = makeSettler(1, townHall.x + 40, townHall.y + 40, { weapon: 'sword', role: 'soldier', banner: true });
    const a = makeSettler(2, townHall.x + 70, townHall.y + 40, {}), b = makeSettler(3, townHall.x + 10, townHall.y + 50, {});
    settlers = [c, a, b];
    armory = { 'weapons:spear': 1, 'weapons:club': 1 };
    waveTimer = 15;
    step(8, () => { waveTimer = Math.max(waveTimer, 10); });
    const armed = [a, b].map(s => s.weapon).sort();
    waveTimer = 200;
    step(12, () => { waveTimer = 200; });
    return { armed, after: [a, b].map(s => s.weapon), back: armory };
  }

  // By hand: a medic heals the one tapped; a corpse tapped is carried to the heap; a pack tapped is carried in;
  // a campfire tapped, it cooks (47)
  function byHand({ seed = 'by-hand' } = {}) {
    start(seed); clearResources();
    const p = settlers[0];
    settlers = [p];
    p.isPossessed = true;
    const out = {};
    // heal
    const hurt = makeSettler(5, p.x + 60, p.y, { hp: 40, speed: 0 }); settlers.push(hurt);
    p.tool = 'medbag'; p.bagHerbs = 2;
    orderPossessed(p, hurt.x, hurt.y);
    step(4, () => { waveTimer = 999; });
    out.healed = hurt.hp > 40;
    settlers = [p]; p.tool = 'none'; p.order = null;
    // a corpse
    addCorpse({ x: p.x + 40, y: p.y + 30, radius: 10 }, 'enemy', 'raider');
    const corpse = corpses[corpses.length - 1];
    orderPossessed(p, corpse.x, corpse.y);
    let carried = false;
    step(20, () => { waveTimer = 999; if (p.carrying && p.carrying.type === 'corpse') carried = true; });
    out.corpse = { carried, moved: Math.hypot(corpse.x - (townHall.x + 40), corpse.y - (townHall.y + 30)) > 60 };
    // a pack
    p.order = null;
    piles = [{ x: p.x + 30, y: p.y, type: 'stone', amount: 5, layer: 0 }];
    stock.stone = 20 + 5; keepStoresInStep();
    const pack = piles.find(pl => pl.type === 'stone');
    if (pack) orderPossessed(p, pack.x, pack.y);
    step(10, () => { waveTimer = 999; });
    out.packIn = !piles.some(pl => pl === pack);
    // cooking
    p.order = null;
    const fire = placeBuilding('campfire', townHall.x + 90, townHall.y + 15); fire.fuelLeft = 5;
    stock.rawMeat = 4; const food = stock.food;
    orderPossessed(p, fire.x, fire.y);
    out.cookOrder = p.order && p.order.kind;
    step(25, () => { waveTimer = 999; });
    out.cooked = stock.food > food;
    p.isPossessed = false;
    return out;
  }

  return { roles, captainLends, byHand };
})());
