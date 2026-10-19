// The undead (#43, #164, #175)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const corpseAt = (p, big = false) => ({ ...p, radius: big ? 18 : 11, side: 'enemy', kind: big ? 'brute' : 'raider', age: 0, big, wormsTaken: false });
  const necromancerAt = (id, p, extra = {}) => Object.assign(createSettler('zombie', id, p.x, p.y), { tool: 'necro_staff' }, extra);

  function asUndead(seed) {
    sides.player.faction = 'undead';
    sides.player.color = '#9b59b6';
    sides.enemy.color = '#e8572a';
    start(seed);
  }

  // A new game as the undead: what it can hire and build, its tabs and HUD, its food, bones and rot
  function undeadColony({ seed = 'undead-colony' } = {}) {
    asUndead(seed);
    const ids = sel => [...document.querySelectorAll(sel)].filter(b => !b.hidden).map(b => b.id);
    const r = {
      startUnits: settlers.map(s => s.type), startStaffs: settlers.filter(s => s.tool === 'necro_staff').length, hire: ids('#recruit-row .tile'),
      tools: ids('#craft-tools .tile'), gear: ids('#craft-gear .tile'),
      build: ids('#build-actions button'), farmingTab: !document.getElementById('tab-btn-farming').hidden,
      blightTab: !document.getElementById('tab-btn-blight').hidden, foodTile: !!document.getElementById('group-food') || !!document.getElementById(resourceHudId('food')) || !!document.getElementById(resourceHudId('rawMeat')),
      food: stock.food
    };
    clearResources();
    placeBuilding('grave', nearHall(-4, 0).x, nearHall(-4, 0).y);
    r.maxPop = getMaxPop();
    settlers = settlers.filter(s => s.tool !== 'necro_staff'); // (the grave by itself: no necromancer working it, #253)
    const bones0 = stock.bones, rot0 = stock.rot;
    run(10);
    r.bonesMade = Math.round((stock.bones - bones0) * 10) / 10;
    r.rotMade = Math.round((stock.rot - rot0) * 10) / 10;
    // food brought in: meat into bones, berries into rot
    const s = settlers[0];
    s.x = townHall.x + 40; s.y = townHall.y;
    const before = { bones: stock.bones, rot: stock.rot };
    s.carrying = { type: 'bundle', items: [{ type: 'rawMeat', amount: 3 }, { type: 'berries', amount: 2 }] };
    run(2);
    r.fromMeat = Math.round(stock.bones - before.bones - 0.7);
    r.fromBerries = Math.round(stock.rot - before.rot - 0.2);
    r.foodAfter = stock.food;
    return r;
  }

  // A zombie given a bow becomes a skeleton, and a zombie again when the bow's taken away
  function bowMakesSkeleton({ seed = 'undead-bow' } = {}) {
    asUndead(seed);
    clearResources();
    const z = createSettler('zombie', 1, townHall.x + 40, townHall.y);
    settlers = [z];
    stock.wood = 50; stock.leather = 20; stock.rope = 5;
    selectedSettler = z;
    window.sim.helpers.placeWorkshop();
    craftWeapon('bow');
    run(20); // made at a workshop first (#211, #248), into the store
    selectedSettler = z;
    giveStored('weapons', 'bow');
    run(10); // then taken up
    const withBow = { type: z.type, weapon: z.weapon };
    selectedSettler = z;
    disarmSettler('weapon');
    run(5);
    return { withBow, without: { type: z.type, weapon: z.weapon } };
  }

  // A zombie with the necromancer's staff, a grave and seven corpses (one big), a wave coming: it raises five as
  // temporary zombies (they take no room), gets its raises back at the grave, raises the last two;
  // a raised zombie crumbles into rot when its time is up
  function necromancerRaises({ seed = 'undead-raise' } = {}) {
    asUndead(seed);
    clearResources();
    invalidateAllPaths();
    placeBuilding('grave', nearHall(-4, 0).x, nearHall(-4, 0).y);
    const necro = necromancerAt(1, nearHall(3, 0));
    settlers = [necro];
    corpses = [corpseAt(nearHall(5, 2), true), ...[3, 4, 5, 6, 7, 8].map(dx => corpseAt(nearHall(dx, 4)))];
    let afterFirstRound = null, recharged = false;
    run(45, { holdWaves: false, each: () => {
      waveTimer = 5; // a wave coming: raised, not taken for bones (#199)
      settlers.forEach(s => { if (s.temporary !== undefined) s.temporary = 999; });
      if (necro.raisesLeft === 0 && afterFirstRound === null) afterFirstRound = settlers.length - 1;
      if (afterFirstRound !== null && necro.raisesLeft === 5) recharged = true;
    } });
    const raised = settlers.filter(s => s.temporary !== undefined);
    const r = { afterFirstRound, recharged, raised: raised.length, corpsesLeft: corpses.length,
      bigZombies: raised.filter(s => s.type === 'big_zombie').length, popTaken: getCurrentPop() - 1 };
    loot = [];
    raised.forEach(s => { s.temporary = 0.01; });
    settlers = [...settlers.filter(s => s.temporary !== undefined)]; // (nobody to pick it up)
    run(1);
    r.crumbled = settlers.length === 0;
    // on the ground where they were (#253): a little rot and bones each, more off a big one
    r.leftOnGround = { piles: loot.length, rot: loot.reduce((a, l) => a + (l.yield.rot || 0), 0), bones: loot.reduce((a, l) => a + (l.yield.bones || 0), 0) };
    r.corpsesFromThem = corpses.length;
    return r;
  }

  function necromancerHeals({ seed = 'undead-heal' } = {}) {
    asUndead(seed);
    clearResources();
    const necro = necromancerAt(1, nearHall(3, 0));
    const zombie = createSettler('zombie', 2, nearHall(4, 0).x, nearHall(4, 0).y, { hp: 40 });
    settlers = [necro, zombie];
    corpses = [];
    run(5);
    return { healed: zombie.hp > 40 };
  }

  // Blight: round the graveyard and graves, gone with a grave; marked ground a necromancer blights;
  // enemies go slower on it; a corpse on it rises
  function blight({ seed = 'undead-blight' } = {}) {
    asUndead(seed);
    clearResources();
    invalidateAllPaths();
    const grave = placeBuilding('grave', nearHall(-8, 0).x, nearHall(-8, 0).y);
    const r = { hall: isBlighted(nearHall(2, 2).x, nearHall(2, 2).y), grave: isBlighted(nearHall(-9, 0).x, nearHall(-9, 0).y),
      away: isBlighted(nearHall(8, 8).x, nearHall(8, 8).y) };
    buildings.splice(buildings.indexOf(grave), 1);
    pathTick++;
    r.goneWithGrave = !isBlighted(nearHall(-9, 0).x, nearHall(-9, 0).y);
    // a marked tile, blighted by a necromancer
    const mark = nearHall(7, 0);
    buildMode = 'blight'; mouse.x = mark.x; mouse.y = mark.y; handleCanvasClick(); buildMode = 'interact';
    settlers = [necromancerAt(1, nearHall(4, 0))];
    corpses = [];
    run(6);
    r.marked = blightZones.length === 1;
    r.blighted = isBlighted(mark.x, mark.y);
    // an enemy walking on it, and one walking off it
    const walk = p => { const en = createConfiguredEnemy(p, 'raider'); const x0 = en.x; for (let i = 0; i < 30; i++) moveEntityTowards(en, en.x + 200, en.y, en.speed, true, 1 / 60); return en.x - x0; };
    r.slowed = walk(nearHall(1, 1)) < walk(nearHall(9, 9)) * 0.8;
    // a corpse on blighted ground rises
    settlers = [createSettler('zombie', 2, townHall.x - 200, townHall.y)];
    corpses = [corpseAt(nearHall(2, -2))];
    run(GAME_CONFIG.blight.riseSeconds + 1);
    r.rose = corpses.length === 0 && settlers.some(s => s.temporary !== undefined);
    return r;
  }

  // A necromancer raises a corpse from where it stands, a few tiles off, without walking up to it (#203)
  function raiseFromAfar({ seed = 'undead-afar' } = {}) {
    asUndead(seed);
    clearResources();
    invalidateAllPaths();
    const necro = necromancerAt(1, nearHall(4, 0));
    settlers = [necro];
    const corpse = corpseAt(nearHall(7, 0)); // 90 px away
    corpses = [corpse];
    const x0 = necro.x;
    let thread = false, xAtRaise = null;
    run(3, { holdWaves: false, each: () => { waveTimer = 5; if (necro.raising) thread = true; if (xAtRaise === null && corpses.length === 0) xAtRaise = necro.x; } });
    return { raised: corpses.length === 0 && settlers.some(s => s.temporary !== undefined), stayed: xAtRaise !== null && Math.abs(xAtRaise - x0) < 10, thread };
  }

  // Rot is spent (#204): a marked tile takes blightRot of it, and waits while there's none; hiring a zombie
  // takes rot as well as bones
  function rotSpent({ seed = 'undead-rot' } = {}) {
    asUndead(seed);
    clearResources();
    invalidateAllPaths();
    const mark = nearHall(7, 0);
    buildMode = 'blight'; mouse.x = mark.x; mouse.y = mark.y; handleCanvasClick(); buildMode = 'interact';
    settlers = [necromancerAt(1, nearHall(4, 0))];
    corpses = [];
    stock.rot = 0;
    run(6, { each: () => { stock.rot = 0; } });
    const waitedWithout = !isBlighted(mark.x, mark.y);
    stock.rot = 5;
    run(6, { each: () => { if (stock.rot > 5) stock.rot = 5; } }); // (no rot trickling in from the graveyard)
    const r = { waitedWithout, blighted: isBlighted(mark.x, mark.y), rotLeft: Math.round(stock.rot) };
    Object.assign(stock, { bones: 100, rot: 100 });
    spawnSettler('zombie');
    r.hire = { bones: 100 - stock.bones, rot: Math.round(100 - stock.rot) };
    stock.bones = 3.4; stock.rot = 0;
    r.missing = getMissingCost(GAME_CONFIG.settlerTypes.zombie.hireCost);
    return r;
  }

  // The undead as the enemy: a wave is theirs, and their necromancer raises a corpse into a temporary zombie
  function undeadEnemies({ seed = 'undead-enemy' } = {}) {
    sides.enemy.faction = 'undead';
    start(seed);
    waveNum = 11; startNextWave();
    const kinds = [...new Set(enemies.map(en => en.enemyKey))].sort();
    clearResources();
    settlers = [];
    const necro = createConfiguredEnemy(nearHall(-8, -8), 'undead_necromancer');
    necro.fromWave = true;
    enemies = [necro];
    corpses = [corpseAt(nearHall(-6, -8))];
    run(6, { holdWaves: true });
    const zombie = enemies.find(en => en.enemyKey === 'undead_zombie');
    return { kinds, zombies: enemies.filter(en => en.enemyKey === 'undead_zombie').length, corpses: corpses.length, temporary: !!zombie && zombie.temporary > 0 };
  }

  return { undeadRaiseFromAfar: raiseFromAfar, undeadRotSpent: rotSpent, undeadColony, bowMakesSkeleton, necromancerRaises, necromancerHeals, undeadBlight: blight, undeadEnemies };
})());
