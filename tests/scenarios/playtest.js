// Bugs from the playtest of 2026-10-09
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // The playtest's colony: every worker holds a tool, the third settler is a soldier; a campfire, wood,
  // raw meat, and no ready food. Returns the food after, and whether anyone cooked.
  function cookingWithTools({ seed = 'cook-tools', food = 0, seconds = 40, wave = false }) {
    start(seed);
    clearResources();
    const p = nearHall(3, 2);
    placeBuilding('campfire', p.x, p.y);
    invalidateAllPaths();
    settlers = [
      makeSettler(1, townHall.x - 40, townHall.y + 60, { tool: 'hoe' }),
      makeSettler(2, townHall.x - 10, townHall.y + 60, { tool: 'pickaxe' }),
      makeSettler(3, townHall.x + 20, townHall.y + 60, { weapon: 'sword', role: 'soldier' })
    ];
    Object.assign(stock, { food, rawMeat: 20, rawFish: 0, wheat: 0, wood: 30, coal: 0 });
    foodMix = {}; syncFoodMix();
    if (wave) enemies = [createConfiguredEnemy({ x: 45, y: 45 }, 'raider')];
    let cooked = false;
    run(seconds, { each: () => {
      settlers.forEach(s => { s.hunger = 999; });
      if (wave) { enemies.forEach(en => { en.x = 45; en.y = 45; en.hp = en.maxHp; }); }
      if (settlers.some(s => s.carrying && s.carrying.forFire)) cooked = true;
    } });
    return { food: Math.floor(stock.food), rawMeat: stock.rawMeat, cooked, tools: settlers.map(s => s.tool) };
  }

  // A badly hurt worker healing at a tent; an enemy comes and hits it there. Does it stand and heal, or
  // turn on the enemy? Returns what it was doing most of the time, and the hits it dealt.
  function healUnderAttack({ seed = 'heal-attacked', seconds = 4 }) {
    start(seed);
    clearResources();
    const t = nearHall(3, 0);
    placeBuilding('tent', t.x, t.y);
    invalidateAllPaths();
    const s = makeSettler(1, t.x + 20, t.y, { hp: 20 });
    settlers = [s];
    const en = createConfiguredEnemy({ x: t.x + 34, y: t.y }, 'raider');
    en.hp = en.maxHp = 1e5;
    enemies = [en];
    const counts = {};
    run(seconds, { each: () => {
      s.hp = Math.max(s.hp, 15); // kept alive: we watch what it does
      counts[s.activity] = (counts[s.activity] || 0) + 1;
    } });
    const mostly = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { mostly, enemyHurt: en.hp < en.maxHp };
  }

  // A campfire right in front of the base, as in the playtest; a free-handed worker cooks there, then has
  // other work. Returns how long anyone stood still on a tile it can't walk (inside the campfire).
  function campfireInFront({ seed = 'stuck-a', seconds = 120 }) {
    start(seed);
    const cf = nearHall(0, 2); placeBuilding('campfire', cf.x, cf.y);
    for (const [dx, dy] of [[-2, 1], [-2, 2], [2, 1]]) { const p = nearHall(dx, dy); placeBuilding('spikes', p.x, p.y); }
    const wh = nearHall(4, 3); placeBuilding('warehouse', wh.x, wh.y);
    invalidateAllPaths();
    settlers = ['axe', 'pickaxe', 'hoe', 'none', 'none'].map((t, i) => makeSettler(i + 1, townHall.x - 60 + i * 25, townHall.y + 70, { tool: t }));
    settlers.push(makeSettler(9, townHall.x + 60, townHall.y + 70, { weapon: 'sword', role: 'soldier' }));
    Object.assign(stock, { rawMeat: 20, wood: 40, food: 3 });
    let insideFor = 0, longest = 0;
    run(seconds, { each: () => {
      settlers.forEach(s => { s.hunger = 999; });
      const inside = settlers.some(s => { const g = getGridPos(s.x, s.y); return isTileBlockedForSettler(g.gx, g.gy); });
      if (inside) { insideFor++; longest = Math.max(longest, insideFor); } else insideFor = 0;
    } });
    return { longestInsideSeconds: Math.round(longest / 60), food: Math.floor(stock.food) };
  }

  // A settler caught inside an obstacle (a wall put up where it stood): it walks out to its work
  function walksOutOfObstacle({ seed = 'walk-out' }) {
    start(seed);
    clearResources();
    const w = nearHall(4, 0);
    placeBuilding('wall_wood', w.x, w.y);
    invalidateAllPaths();
    const s = makeSettler(1, w.x, w.y);
    settlers = [s];
    const goal = nearHall(8, 3);
    for (let f = 0; f < 60 * 6; f++) moveEntityTowards(s, goal.x, goal.y, s.speed, false, 1 / 60);
    return { moved: Math.round(Math.hypot(s.x - w.x, s.y - w.y)), reached: Math.hypot(s.x - goal.x, s.y - goal.y) < 12 };
  }

  // The same colony on another map, where a woodcutter stood halfway between the hall and a warehouse,
  // turning from one to the other every few frames. Counts the 3-second stretches someone carrying a
  // load walked a lot and got nowhere.
  function deliveryJitter({ seed = 'stuck-e', seconds = 150 }) {
    campfireInFront({ seed, seconds: 0 });
    const tools = ['axe', 'pickaxe', 'hoe', 'none', 'none', 'pickaxe', 'axe'];
    settlers = tools.map((t, i) => makeSettler(i + 1, townHall.x - 60 + i * 20, townHall.y + 70, { tool: t }));
    settlers.push(makeSettler(9, townHall.x + 60, townHall.y + 70, { weapon: 'sword', role: 'soldier' }));
    Object.assign(stock, { rawMeat: 20, wood: 40, food: 3 });
    const hist = new Map(); let stuck = 0;
    run(seconds, { each: f => {
      settlers.forEach(s => { s.hunger = 999; });
      for (const s of settlers) {
        let h = hist.get(s); if (!h) hist.set(s, h = []);
        h.push([s.x, s.y, s.activity]); if (h.length > 180) h.shift();
        if (f % 60 || h.length < 180 || !h.every(e => e[2] === 'deliverCarrying')) continue;
        let walked = 0; for (let i = 1; i < h.length; i++) walked += Math.hypot(h[i][0] - h[i - 1][0], h[i][1] - h[i - 1][1]);
        if (walked > 25 && Math.hypot(h[179][0] - h[0][0], h[179][1] - h[0][1]) < 6) stuck++;
      }
    } });
    return { stuck };
  }

  // Spikes against the hall on its left, as in the playtest's screenshot; woodcutters on that side carry
  // wood to the hall. Returns the damage the colony took from its own spikes.
  function ownSpikesAtHall({ seed = 'own-spikes', seconds = 90 }) {
    start(seed);
    clearResources();
    for (const [dx, dy] of [[-2, -1], [-2, 0], [-2, 1], [0, -2], [-1, -2]]) { const p = nearHall(dx, dy); placeBuilding('spikes', p.x, p.y); }
    // trees out to the left and above, so the way home comes past the spikes
    for (const [dx, dy] of [[-7, 0], [-7, 2], [-6, -3], [0, -7], [-3, -6]]) { const p = nearHall(dx, dy); trees.push({ x: p.x, y: p.y, hp: 40, maxHp: 40 }); }
    invalidateAllPaths();
    settlers = [1, 2, 3].map(i => makeSettler(i, townHall.x - 120, townHall.y - 20 * i, { tool: 'axe' }));
    // the damage taken: each tick what the settlers lost, then healed back to full
    let hurt = 0;
    run(seconds, { each: () => settlers.forEach(s => { hurt += s.maxHp - s.hp; s.hunger = 999; s.hp = s.maxHp; }) });
    return { hurt, wood: stock.wood };
  }

  // A soldier that last struck north walks east to the hall's other side: which way its sword points
  function facingWhileWalking({ seed = 'facing' }) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x - 150, townHall.y + 90, { weapon: 'sword', role: 'soldier' });
    s.facing = -Math.PI / 2; // last struck north
    settlers = [s];
    const goal = { x: townHall.x + 150, y: townHall.y + 90 };
    let east = 0, frames = 0;
    for (let f = 0; f < 60 * 2; f++) {
      moveEntityTowards(s, goal.x, goal.y, s.speed, false, 1 / 60);
      tickAnimation(s, 1 / 60);
      frames++; if (Math.abs(s.facing || 0) < 0.3) east++;
    }
    return { pointsEastShare: Math.round(east / frames * 100) / 100 };
  }

  return { cookingWithTools, healUnderAttack, campfireInFront, walksOutOfObstacle, deliveryJitter, ownSpikesAtHall, facingWhileWalking };
})());
