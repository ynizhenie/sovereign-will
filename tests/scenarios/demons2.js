// The demons, stage two (#250): corpses cut up or put in pits, the den, portals letting a wave out a few at a
// time, cages
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, clearResources, placeBuilding, makeSettler } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const asFactions = (player, enemy, seed) => { sides.player.faction = player; sides.enemy.faction = enemy; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; sides.enemy.faction = 'humans'; };
  const calm = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; corpses.forEach(c => { c.age = 0; }); };
  const corpseAt = (p, big = false) => ({ ...p, radius: big ? 16 : 11, side: 'enemy', kind: 'demon_imp', age: 0, big, wormsTaken: false });
  const soldier = (id, p, extra = {}) => Object.assign(createSettler('imp', id, p.x, p.y), { weapon: 'sword', role: 'soldier' }, extra);

  // After a wave, with nobody wounded, a soldier cuts the corpses up for raw meat (more off a big one) and
  // carries it home; with a demon wounded, they're left for it to eat. pit: a corpse pit takes 3 of them
  // first, and they keep longer in it
  function butcher({ seed = 'demon-butcher', wounded = false, pit = false } = {}) {
    asFactions('demons', 'humans', seed);
    const s = soldier(1, nearHall(2, 2));
    const others = wounded ? [Object.assign(createSettler('imp', 2, nearHall(-3, 2).x, nearHall(-3, 2).y), { hp: 30 })] : [];
    settlers = [s, ...others];
    const thePit = pit ? placeBuilding('corpse_pit', nearHall(-4, -2).x, nearHall(-4, -2).y) : null;
    invalidateAllPaths();
    corpses = [corpseAt(nearHall(4, 3)), corpseAt(nearHall(5, -2), true), ...(pit ? [corpseAt(nearHall(3, -3)), corpseAt(nearHall(-2, 4))] : [])];
    stock.rawMeat = 0;
    run(pit ? 60 : 30, { each: () => { calm(); if (thePit) (thePit.corpses || []).forEach(c => { c.age = 0; }); } });
    const r = { corpses: corpses.length, meat: pit ? [3, 6].includes(stock.rawMeat) : stock.rawMeat, inPit: thePit ? (thePit.corpses || []).length : null };
    // in the pit they keep: a while later, still there, where on the ground they'd be gone
    if (thePit) {
      settlers = [];
      const lifetime = GAME_CONFIG.corpses.seconds;
      thePit.corpses.forEach(c => { c.age = 0; });
      for (let f = 0; f < lifetime * 60 * 0.8; f++) tickDemonCamp(1 / 60);
      r.kept = thePit.corpses.length === 3;
    }
    back();
    return r;
  }

  // A wounded demon eats one out of a corpse pit, whole again
  function eatFromPit({ seed = 'demon-pit-eat' } = {}) {
    asFactions('demons', 'humans', seed);
    const pit = placeBuilding('corpse_pit', nearHall(4, 2).x, nearHall(4, 2).y);
    pit.corpses = [corpseAt(pit), corpseAt(pit)];
    invalidateAllPaths();
    const s = Object.assign(createSettler('imp', 1, nearHall(1, 2).x, nearHall(1, 2).y), { hp: 20 });
    settlers = [s];
    corpses = [];
    run(10, { each: calm });
    back();
    return { whole: s.hp === s.maxHp, leftInPit: pit.corpses.length };
  }

  // The den is the demons' home now (#250): room for 2 more; the circle is for sacrifices only
  function den({ seed = 'demon-den' } = {}) {
    asFactions('demons', 'humans', seed);
    const base = getMaxPop();
    placeBuilding('sacrifice_circle', nearHall(4, 0).x, nearHall(4, 0).y);
    const withCircle = getMaxPop();
    placeBuilding('demon_den', nearHall(-4, 0).x, nearHall(-4, 0).y);
    const r = { circle: withCircle - base, den: getMaxPop() - withCircle };
    back();
    return r;
  }

  // An enemy demon wave comes out of the portals a few at a time (batch every `seconds`), and the portals
  // open out of the base
  function portalBatches({ seed = 'demon-portal-batches' } = {}) {
    asFactions('humans', 'demons', seed);
    settlers = [];
    const c = GAME_CONFIG.portalWave;
    game.enemyTents.push({
      x: game.WORLD_WIDTH - TILE_SIZE * 6, y: game.WORLD_HEIGHT - TILE_SIZE * 6,
      hp: 60, maxHp: 60, summonTimer: 0, summonsLeft: 0, outpost: true, campId: 'portal-wave-test'
    });
    waveNum = 30; // (a big one)
    startNextWave();
    const first = enemies.filter(en => en.fromWave).length, queued = portalQueue.length;
    const portals = enemyTents.filter(t => t.portal && t.hp > 0);
    const firstWave = enemies.filter(en => en.fromWave);
    const emergedAtPortal = firstWave.length > 0 && firstWave.every(en =>
      portals.some(t => Math.hypot((en.waveStart || en).x - t.x, (en.waveStart || en).y - t.y) <= TILE_SIZE * 2));
    run(c.seconds + 0.1, { holdWaves: true, each: calm });
    const second = enemies.filter(en => en.fromWave).length;
    run(c.seconds * Math.ceil(queued / c.batch) + 1, { each: calm });
    const outOfBase = enemyTents.every(t => Math.hypot(t.x - townHall.x, t.y - townHall.y) > getBaseRadius() + c.awayTiles * TILE_SIZE - 1);
    const insidePlayerZone = portals.length > 0 && portals.every(t => inTerritory(t.x, t.y));
    const advanced = firstWave.some(en => game.enemies.includes(en) &&
      Math.hypot(en.x - en.waveStart.x, en.y - en.waveStart.y) > TILE_SIZE * 2);
    const r = { first: first <= c.batch && first > 0, queued: queued > 0, second: second > first && second <= first + c.batch,
      allOut: portalQueue.length === 0, outOfBase, inTerritory: insidePlayerZone, emergedAtPortal, advanced };
    back();
    return r;
  }

  function noCorpseHaulingDuringCampWave({ seed = 'demon-wave-corpses' } = {}) {
    asFactions('humans', 'demons', seed);
    const settler = makeSettler(1, townHall.x + 30, townHall.y + 40);
    settlers = [settler];
    corpses = [{ x: settler.x, y: settler.y, radius: 11, side: 'enemy', kind: 'demon_imp', age: 0 }];
    const waveEnemy = createConfiguredEnemy({ x: townHall.x + 300, y: townHall.y + 300 }, 'demon_imp');
    Object.assign(waveEnemy, { fromWave: true, campId: 'enemy-camp' });
    enemies = [waveEnemy];
    portalQueue = [];
    run(1 / 60);
    const r = { stillOnGround: corpses.length === 1, notCarried: !settler.carrying };
    back();
    return r;
  }

  // At a wave's end a soldier catches the badly wounded enemy and locks it in the free cage; left long
  // enough, it dies there, a corpse; eaten: a wounded demon whole again, the cage free
  function cage({ seed = 'demon-cage', eat = false } = {}) {
    asFactions('demons', 'humans', seed);
    const theCage = placeBuilding('cage', nearHall(-3, 2).x, nearHall(-3, 2).y);
    invalidateAllPaths();
    const s = soldier(1, nearHall(3, 1), { hp: 1e4, maxHp: 1e4 });
    settlers = [s];
    const en = createConfiguredEnemy(nearHall(5, 1), 'raider');
    Object.assign(en, { speed: 0, damage: 0, hp: en.maxHp * 0.15, fromWave: true });
    enemies = [en];
    let caught = false;
    run(15, { each: () => { calm(); waveTimer = 50; if (s.carrying && s.carrying.type === 'captive') caught = true; } });
    const r = { caught, inCage: !!theCage.captive, enemyGone: !enemies.includes(en) };
    if (eat) {
      const hungry = Object.assign(createSettler('imp', 2, nearHall(-1, 2).x, nearHall(-1, 2).y), { hp: 20 });
      settlers = [hungry];
      run(10, { each: calm });
      Object.assign(r, { whole: hungry.hp === hungry.maxHp, cageFree: !theCage.captive });
    } else {
      settlers = [];
      const n = corpses.length;
      for (let f = 0; f < (GAME_CONFIG.buildings.cage.cage.captiveSeconds + 1) * 60; f++) tickDemonCamp(1 / 60);
      Object.assign(r, { died: !theCage.captive && corpses.length === n + 1 });
    }
    back();
    return r;
  }

  return { demonButcher: butcher, demonEatFromPit: eatFromPit, demonDen: den, demonPortalBatches: portalBatches,
    demonWaveCorpses: noCorpseHaulingDuringCampWave, demonCage: cage };
})());
