// Soldiers' and necromancers' own between waves (#199): patrols round the base, training at a dummy,
// guarding gatherers far out; a necromancer taking bones from corpses and keeping behind its own
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const asFaction = (faction, seed) => { sides.player.faction = faction; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; };
  const fed = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; }; // (no boars to hunt, nothing growing back to gather)
  const fromHall = s => Math.hypot(s.x - townHall.x, s.y - townHall.y);

  // A soldier on patrol walks round the base just past its edge
  function patrol({ seed = 'duty-patrol' } = {}) {
    asFaction('humans', seed);
    const s = makeSettler(1, townHall.x + 40, townHall.y + 40, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    run(0.5, { each: fed });
    s.idle = { act: 'patrolEdge', left: 120, spot: null, partnerId: null };
    const edge = getBaseRadius() + TILE_SIZE;
    run(10, { each: fed });
    const a0 = Math.atan2(s.y - townHall.y, s.x - townHall.x);
    let turned = 0, last = a0, offEdge = 0, samples = 0;
    run(30, { each: () => {
      fed();
      const a = Math.atan2(s.y - townHall.y, s.x - townHall.x);
      turned += Math.abs(Math.atan2(Math.sin(a - last), Math.cos(a - last)));
      last = a;
      samples++;
      if (Math.abs(fromHall(s) - edge) > 2.5 * TILE_SIZE) offEdge++;
    } });
    return { roundTheEdge: offEdge / samples < 0.1, turned: turned > 1.5, activity: s.activity };
  }

  // A soldier at a training dummy: its damage grows a little, by trainPerSecond a second
  function train({ seed = 'duty-train' } = {}) {
    asFaction('humans', seed);
    const dummy = placeBuilding('dummy', nearHall(3, 2).x, nearHall(3, 2).y);
    const s = makeSettler(1, townHall.x + 40, townHall.y + 40, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    run(0.5, { each: fed });
    const before = getWeaponStats(s, 'combat');
    s.idle = { act: 'train', left: 60, spot: { x: dummy.x, y: dummy.y }, partnerId: null };
    run(30, { each: fed });
    const after = getWeaponStats(s, 'combat');
    return { atDummy: Math.hypot(s.x - dummy.x, s.y - dummy.y) < 35, trained: s.trained > 0.015 && s.trained < 0.04, stronger: after.multiplier > before.multiplier, activity: s.activity };
  }

  // A worker cutting a tree far out of the base: an idle soldier goes and stands guard by it
  function guard({ seed = 'duty-guard' } = {}) {
    asFaction('humans', seed);
    const far = nearHall(12, 0);
    trees.push({ x: far.x, y: far.y, hp: 1e6, maxHp: 1e6 });
    invalidateAllPaths();
    const w = makeSettler(1, far.x - 25, far.y, { tool: 'axe' });
    const s = makeSettler(2, townHall.x - 30, townHall.y + 40, { weapon: 'sword', role: 'soldier' });
    settlers = [w, s];
    run(20, { each: fed });
    return { byWorker: Math.hypot(s.x - w.x, s.y - w.y) < GAME_CONFIG.idle.guardRange * 1.5, activity: s.activity, guarding: s.guardingId === w.id };
  }

  // Between waves a necromancer takes the bones from a corpse; in a wave it raises it
  function bones({ seed = 'duty-bones', wave = false } = {}) {
    asFaction('undead', seed);
    const necro = Object.assign(createSettler('zombie', 1, nearHall(2, 2).x, nearHall(2, 2).y), { tool: 'necro_staff' });
    settlers = [necro];
    corpses = [{ ...nearHall(-3, 3), radius: 10, side: 'enemy', kind: 'raider', age: 0 }];
    const bones0 = stock.bones, made = getPlayerFaction().bonesPerSecond.hall * 8; // (the graveyard makes some anyway)
    run(8, { holdWaves: !wave, each: () => { if (wave) waveTimer = 5; } });
    const r = { corpseGone: corpses.length === 0, bones: Math.round(stock.bones - bones0 - made), raised: settlers.some(s => s.temporary !== undefined) };
    back();
    return r;
  }

  // An enemy closing in: the colony's necromancer steps back towards the town hall
  function keepBack({ seed = 'duty-keepback' } = {}) {
    asFaction('undead', seed);
    const necro = Object.assign(createSettler('zombie', 1, nearHall(8, 0).x, nearHall(8, 0).y), { tool: 'necro_staff' });
    settlers = [necro];
    const en = createConfiguredEnemy({ x: necro.x + 70, y: necro.y }, 'raider');
    en.speed = 0; en.damage = 0;
    enemies = [en];
    run(3, { holdWaves: false, each: () => { waveTimer = 5; } });
    back();
    return { away: Math.hypot(necro.x - en.x, necro.y - en.y) > 110, nearerHall: necro.x < en.x - 80 };
  }

  // An archer out of arrows (#232): no hunting a boar, no training at a dummy
  function archerNoArrows({ seed = 'duty-noarrows' } = {}) {
    asFaction('humans', seed);
    const dummy = placeBuilding('dummy', nearHall(3, 2).x, nearHall(3, 2).y);
    const a = makeSettler(1, townHall.x + 40, townHall.y + 40, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 });
    settlers = [a];
    const boar = { x: townHall.x + 200, y: townHall.y, hp: 30, maxHp: 30, wanderTimer: 0, wanderInterval: 999, priority: 0, targetX: townHall.x + 200, targetY: townHall.y };
    const acts = new Set();
    run(30, { each: () => { a.hunger = 999; boars = [boar]; boarRespawnTimer = 999; pendingRespawns = []; acts.add(a.activity); if (a.idle && a.idle.act === 'train') acts.add('train'); } });
    return { hunted: acts.has('harvest'), trained: acts.has('train') || (a.trained || 0) > 0, dummy: !!dummy };
  }

  return { dutyArcherNoArrows: archerNoArrows, dutyPatrol: patrol, dutyTrain: train, dutyGuard: guard, dutyBones: bones, dutyKeepBack: keepBack };
})());
