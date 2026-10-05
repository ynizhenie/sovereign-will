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
    window.showNotification = () => {};
  }

  // A new game as the undead: what it can hire and build, its tabs and HUD, its food, bones and rot
  function undeadColony({ seed = 'undead-colony' } = {}) {
    asUndead(seed);
    const ids = sel => [...document.querySelectorAll(sel)].filter(b => !b.hidden).map(b => b.id);
    const r = {
      startUnits: settlers.map(s => s.type), hire: ids('#recruit-row button'),
      tools: ids('#tool-actions button'), gear: ids('#tab-tools .gear-actions button'),
      build: ids('#build-actions button'), farmingTab: !document.getElementById('tab-btn-farming').hidden,
      blightTab: !document.getElementById('tab-btn-blight').hidden, foodTile: !!document.getElementById('group-food') || !!document.getElementById(resourceHudId('food')) || !!document.getElementById(resourceHudId('rawMeat')),
      food: stock.food
    };
    clearResources();
    placeBuilding('grave', nearHall(-4, 0).x, nearHall(-4, 0).y);
    r.maxPop = getMaxPop();
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
    stock.wood = 50; stock.leather = 20;
    selectedSettler = z;
    craftWeapon('bow');
    run(5);
    const withBow = { type: z.type, weapon: z.weapon };
    selectedSettler = z;
    disarmSettler('weapon');
    run(5);
    return { withBow, without: { type: z.type, weapon: z.weapon } };
  }

  // A zombie with the necromancer's staff, a grave and seven corpses (one big): it raises five as
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
    run(45, { each: () => {
      settlers.forEach(s => { if (s.temporary !== undefined) s.temporary = 999; });
      if (necro.raisesLeft === 0 && afterFirstRound === null) afterFirstRound = settlers.length - 1;
      if (afterFirstRound !== null && necro.raisesLeft === 5) recharged = true;
    } });
    const raised = settlers.filter(s => s.temporary !== undefined);
    const r = { afterFirstRound, recharged, raised: raised.length, corpsesLeft: corpses.length,
      bigZombies: raised.filter(s => s.type === 'big_zombie').length, popTaken: getCurrentPop() - 1 };
    const rot0 = stock.rot;
    raised.forEach(s => { s.temporary = 0.01; });
    run(1);
    r.crumbled = settlers.filter(s => s.temporary !== undefined).length === 0;
    r.rotFromThem = Math.round(stock.rot - rot0 - 0.1);
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

  return { undeadColony, bowMakesSkeleton, necromancerRaises, necromancerHeals, undeadBlight: blight, undeadEnemies };
})());
