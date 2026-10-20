// The friend's #298, part 2: the campfire, leather armour, a night order kept to
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, placeBuilding, clearResources, tileCenter } } = window.sim;
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999; };
  const night = () => { const c = GAME_CONFIG.daytime; dayTime = c.morning + c.day + c.evening + 2; };

  // A fire with fuel and nobody at it burns down by itself; six idle round one fire: four at most sit by it,
  // one to a side (4)
  function campfire({ seed = 'fire-298' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y), at = tileCenter(g.gx + 5, g.gy + 4);
    const fire = placeBuilding('campfire', at.x, at.y);
    invalidateAllPaths();
    settlers = [];
    fire.fuelLeft = 5;
    run(6, { each: quiet });
    const burnt = 5 - fire.fuelLeft, lit = (fire.burning || 0) > 0;
    settlers = [0, 1, 2, 3, 4, 5].map(i => makeSettler(i + 1, at.x - 40 + i * 15, at.y + 50));
    let most = 0, clash = false;
    run(40, { each: () => {
      quiet(); fire.fuelLeft = 5;
      const by = settlers.filter(s => s.idle && s.idle.act === 'campfire');
      settlers.forEach(s => { if (s.isIdle && (!s.idle || s.idle.act !== 'campfire')) s.idle = { act: 'campfire', left: 99, spot: { x: fire.x, y: fire.y }, partnerId: null }; });
      const sitting = by.filter(s => Math.hypot(s.x - fire.x, s.y - fire.y) < 40);
      most = Math.max(most, sitting.length);
      const seats = by.map(s => s.idle.seat).filter(n => n !== undefined);
      if (new Set(seats).size < seats.length) clash = true;
    } });
    return { burnt: Math.round(burnt * 10) / 10, lit, most, clash };
  }

  // Leather armour: less than iron; iron put on over it puts it in the armory; a wave wears it once the player
  // has made it (8)
  function leather({ seed = 'leather-298' } = {}) {
    start(seed); clearResources();
    const s = makeSettler(1, townHall.x + 60, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    const hp0 = s.maxHp;
    putOnGear(s, 'leather_armor');
    const leatherHp = s.maxHp - hp0, kind = s.armor;
    s.hp = s.maxHp; damageSettler(s, 100, null);
    const leatherTaken = Math.round(s.maxHp - s.hp);
    armory = {};
    putOnGear(s, 'armor');
    const swapped = { armor: s.armor, hp: s.maxHp - hp0, stored: armory['gear:leather_armor'] || 0 };
    playerGear = { armor: false, shield: false, leather: true };
    waveNum = 30;
    enemies = [];
    for (let i = 0; i < 3; i++) startNextWave();
    const wave = enemies.filter(en => en.fromWave);
    return { leatherHp, kind, leatherTaken, swapped, waveLeather: wave.some(en => en.armor === 'leather'), waveIron: wave.some(en => en.armor === 'iron') };
  }

  // Up at night for a wall: it builds it and does nothing else (no cooking with raw meat and a fire there) (11)
  function nightOnlyOrder({ seed = 'night-only-298' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y), at = tileCenter(g.gx + 3, g.gy + 3);
    const fire = placeBuilding('campfire', at.x, at.y); fire.fuelLeft = 5;
    settlers = [makeSettler(1, townHall.x - 40, townHall.y + 50, {})];
    const s = settlers[0];
    Object.assign(stock, { rawMeat: 10, wood: 20, firewood: 5 });
    night();
    run(8, { each: quiet });
    const bp = createBuildingBlueprint('wall_wood', townHall.x + 120, townHall.y - 75); bp.needs = { ...GAME_CONFIG.buildings.wall_wood.cost }; blueprints.push(bp);
    const did = new Set();
    run(25, { each: () => { quiet(); if (!s.asleep) did.add(s.activity); } });
    return { built: buildings.some(b => b.type === 'wall_wood'), cooked: did.has('cook'), did: [...did].sort() };
  }

  return { campfire298: campfire, leather298: leather, nightOnlyOrder };
})());
