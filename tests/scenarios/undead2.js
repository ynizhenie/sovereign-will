// The undead, stage two (#253): graves worked by a necromancer, one to start with, boars only when pointed
// at, blight spreading by itself, corpses carried to the graves
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const asUndead = seed => { sides.player.faction = 'undead'; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; };
  const calm = () => { boars = boars.filter(b => b.keep); boarRespawnTimer = 999; pendingRespawns = []; corpses.forEach(c => { c.age = 0; }); };
  const corpseAt = p => ({ ...p, radius: 11, side: 'enemy', kind: 'raider', age: 0, big: false, wormsTaken: false });
  const necromancerAt = (id, p) => Object.assign(createSettler('zombie', id, p.x, p.y), { tool: 'necro_staff' });

  // A necromancer works a grave for bones and rot, then the grave rests; with a corpse by it, no rest
  function graveWork({ seed = 'grave-work', corpse = false } = {}) {
    asUndead(seed);
    const grave = placeBuilding('grave', nearHall(-4, 0).x, nearHall(-4, 0).y);
    invalidateAllPaths();
    settlers = [necromancerAt(1, nearHall(-3, 1))];
    corpses = corpse ? [corpseAt({ x: grave.x + 10, y: grave.y + 12 })] : [];
    let works = 0, last = stock.bones, rested = false;
    run(18, { each: () => {
      calm();
      if (stock.bones - last >= GAME_CONFIG.graveWork.bones - 0.01) works++;
      last = stock.bones;
      if ((grave.rest || 0) > 0) rested = true;
    } });
    back();
    return { works, rested };
  }

  // The undead start with a necromancer: a third one, with the staff
  function startNecromancer({ seed = 'undead-start' } = {}) {
    sides.player.faction = 'undead'; start(seed);
    const r = { settlers: settlers.length, staffs: settlers.filter(s => s.tool === 'necro_staff').length };
    back();
    return r;
  }

  // A boar near by: the necromancer leaves it be, unless the player points at it
  function boarLeftBe({ seed = 'necro-boar', marked = false } = {}) {
    asUndead(seed);
    const s = necromancerAt(1, nearHall(2, 2));
    settlers = [s];
    const p = nearHall(6, 4);
    const boar = { x: p.x, y: p.y, hp: 40, maxHp: 40, priority: marked ? 1 : 0, keep: true, wanderTimer: 0, wanderInterval: 999 };
    boars = [boar];
    let went = false;
    run(10, { each: () => { calm(); if (Math.hypot(s.x - boar.x, s.y - boar.y) < 60 || boar.hp < boar.maxHp) went = true; } });
    back();
    return { went };
  }

  // Blight spreading by itself: a necromancer blights the tiles nearest the base, rot spent; with none left
  // anywhere, the switch goes off for good
  function spreadBlight({ seed = 'auto-blight', allDone = false } = {}) { // (not `autoBlight`: that's the game's)
    asUndead(seed);
    settlers = [necromancerAt(1, nearHall(3, 3))];
    stock.rot = 100;
    if (allDone) {
      for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) {
        if (!isBorderZone(gx, gy) && !isTileBlockedForSettler(gx, gy)) blightZones.push({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15, done: true });
      }
    }
    autoBlight = true;
    const rot0 = stock.rot;
    run(allDone ? 1 : 25, { each: calm });
    const done = blightZones.filter(z => z.done && z.auto);
    const nearest = done.length ? Math.min(...done.map(z => Math.hypot(z.x - townHall.x, z.y - townHall.y))) : null;
    const r = allDone ? { on: autoBlight, doneForGood: autoBlightDone }
      : { blighted: done.length >= 3, nearBase: nearest !== null && nearest < getBaseRadius() + 5 * TILE_SIZE, rotSpent: stock.rot < rot0 };
    autoBlight = false; autoBlightDone = false;
    back();
    return r;
  }

  // Undead workers carry the corpses lying about to a grave, two by each at most
  function carryToGraves({ seed = 'corpses-graves' } = {}) {
    asUndead(seed);
    const grave = placeBuilding('grave', nearHall(-4, 0).x, nearHall(-4, 0).y);
    invalidateAllPaths();
    settlers = [createSettler('zombie', 1, nearHall(2, 2).x, nearHall(2, 2).y), createSettler('zombie', 2, nearHall(2, -2).x, nearHall(2, -2).y)];
    corpses = [nearHall(4, 3), nearHall(5, -2), nearHall(3, 4)].map(corpseAt);
    run(40, { each: () => { calm(); waveTimer = 999; } });
    const r = (GAME_CONFIG.graveWork.nearTiles + 0.5) * TILE_SIZE;
    const byGrave = corpses.filter(c => Math.max(Math.abs(c.x - grave.x), Math.abs(c.y - grave.y)) <= r).length;
    back();
    return { byGrave, total: corpses.length };
  }

  return { undeadGraveWork: graveWork, undeadStartNecromancer: startNecromancer, undeadBoarLeftBe: boarLeftBe, undeadAutoBlight: spreadBlight, undeadCorpsesToGraves: carryToGraves };
})());
