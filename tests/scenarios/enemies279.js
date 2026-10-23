// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources } } = window.sim;
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); if (each && each(f)) return true; } return false; };

  // A wave gathers before it attacks (44), and a big one has a commander giving orders (45)
  function waveMusters({ seed = 'muster' } = {}) {
    start(seed);
    armory['gear:banner'] = 1;
    waveNum = 12; startNextWave(); waveTimer = 999;
    const wave = enemies.filter(en => en.fromWave);
    const from = wave.map(en => ({ x: en.x, y: en.y }));
    step(3, () => { waveTimer = 999; });
    // gathering: by the edge they came in at (not one told to go by its commander, nor a tent builder)
    const fromEdge = en => Math.min(en.x, en.y, WORLD_WIDTH - en.x, WORLD_HEIGHT - en.y);
    const early = Math.max(...wave.filter(en => en.musterUntil && !en.buildTarget).map(fromEdge));
    const captain = wave.find(en => en.captain);
    let ordered = 0;
    step(6, () => { waveTimer = 999; ordered = Math.max(ordered, enemies.filter(en => en.orderBubble && en.orderBubble.until > pathTick && !en.captain).length); });
    const later = Math.max(...wave.filter(en => enemies.includes(en)).map(en => Math.hypot(en.x - from[wave.indexOf(en)].x, en.y - from[wave.indexOf(en)].y)));
    return { size: wave.length, early, later, captain: !!captain, ordered };
  }

  // Scouts between waves: they walk the red band, settlers leave them be, they run when one comes near;
  // pointed at, one is hunted and runs off (23)
  function scoutsBetweenWaves({ seed = 'scouts' } = {}) {
    start(seed);
    waveNum = 4; scoutClock = 0; GAME_CONFIG.scouts.chance = 1;
    const seen = [];
    step(42, () => { waveTimer = 999; if (scouts.length) seen.push(...scouts.map(s => ({ x: s.x, y: s.y }))); });
    const band = (BORDER_MARGIN + 0.6) * TILE_SIZE;
    const inBand = seen.every(p => p.x < band || p.y < band || p.x > WORLD_WIDTH - band || p.y > WORLD_HEIGHT - band);
    const count = scouts.length;
    const scout = scouts[0];
    const notEnemy = !enemies.includes(scout);
    // pointed at: an enemy now, marked, running off
    scoutTapped(scout.x, scout.y);
    const hunted = enemies.includes(scout) && scout.markedTarget;
    // (#279, c1.11) not off at once: only once one of them comes near it
    settlers.forEach(s => { s.speed = 0; });
    step(3, () => { waveTimer = 999; });
    const stays = enemies.includes(scout) && !scout.fleeing;
    settlers[0].x = scout.x + (scout.x < WORLD_WIDTH / 2 ? 60 : -60); settlers[0].y = scout.y;
    step(12, () => { waveTimer = 999; });
    GAME_CONFIG.scouts.chance = 0.5;
    return { count, inBand, notEnemy, hunted, stays, goneOff: !enemies.includes(scout) };
  }

  // The camp stays on the main map as the party arrives (34, 37)
  function campLayouts({ seed = 'layouts' } = {}) {
    window.sim.campOpens({ seed });
    const camp = enemyTents.find(et => et.outpost && et.campId === raidCamp.id);
    const buildingsBefore = buildings.filter(b => b.campId === camp.campId).map(b => `${b.type}@${b.x},${b.y}`).sort();
    openRaidPicker(); document.querySelector('#raid-picker [data-raid="go"]').click();
    const arrived = step(60, () => { waveTimer = 999; return !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'); });
    enterCamp();
    const buildingsAfter = buildings.filter(b => b.campId === camp.campId).map(b => `${b.type}@${b.x},${b.y}`).sort();
    const onMainMap = COLS === 40 && townHall.x > 0 && settlers.length > raid.raiders.length;
    const sameCamp = enemyTents.includes(camp) && raid.campId === camp.campId;
    return { layout: camp.layout, walls: buildingsBefore.filter(b => b.startsWith('wall')).length,
      same: JSON.stringify(buildingsBefore) === JSON.stringify(buildingsAfter), arrived, onMainMap, sameCamp };
  }

  // A camp is placed on dry ground with a clear gap beyond the territory when the map permits it.
  function campSitePlacement({ seed = 'camp-site' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    const outpost = enemyTents.find(et => et.outpost);
    if (!outpost) return { placed: false };
    const center = getGridPos(outpost.x, outpost.y), radius = GAME_CONFIG.raid.wallTiles + 3;
    let waterInArea = 0;
    const water = new Set(waterTiles.map(w => {
      const g = getGridPos(w.x, w.y);
      return `${g.gx},${g.gy}`;
    }));
    for (let gy = center.gy - radius; gy <= center.gy + radius; gy++) {
      for (let gx = center.gx - radius; gx <= center.gx + radius; gx++) {
        if (water.has(`${gx},${gy}`)) waterInArea++;
      }
    }
    const box = getTerritoryBox();
    const dx = Math.max(box.x0 - outpost.x, 0, outpost.x - box.x1);
    const dy = Math.max(box.y0 - outpost.y, 0, outpost.y - box.y1);
    return { placed: true, waterInArea, separationTiles: Math.hypot(dx, dy) / TILE_SIZE };
  }

  // The wave leaves the camp and stages at the map edge on a default map, where the territory fills the map.
  function waveStagesAtCamp({ seed = 'wave-stage' } = {}) {
    start(seed);
    waveNum = 12;
    startNextWave(true);
    const wave = enemies.filter(en => en.fromWave && en.wavePrepared);
    const camp = enemyTents.find(et => et.outpost);
    const target = wave[0]?.waveTarget;
    if (!camp || !target) return { count: wave.length, target: false };
    const edge = Math.min(target.x, target.y, WORLD_WIDTH - target.x, WORLD_HEIGHT - target.y);
    const hallDistance = Math.hypot(townHall.x - target.x, townHall.y - target.y);
    const campDistance = Math.hypot(townHall.x - camp.x, townHall.y - camp.y);
    return { count: wave.length, prepared: wave.every(en => en.waveTarget.x === target.x && en.waveTarget.y === target.y),
      edge, fartherFromHall: hallDistance > campDistance, inTerritory: inTerritory(target.x, target.y) };
  }

  // A raid holds the prepared wave in its camp and pauses its timer.
  function waveMarchPausesDuringRaid({ seed = 'wave-pause' } = {}) {
    window.sim.campOpens({ seed });
    startNextWave(true);
    const enemy = enemies.find(en => en.fromWave && en.wavePrepared);
    if (!enemy) return { prepared: false };
    enemy.x = enemy.waveTarget.x; enemy.y = enemy.waveTarget.y;
    const fromStartBefore = Math.hypot(enemy.x - enemy.waveStart.x, enemy.y - enemy.waveStart.y);
    const timer = waveTimer;
    startRaid([settlers[0]]);
    for (let f = 0; f < 120; f++) update(1 / 60);
    const fromStartAfter = Math.hypot(enemy.x - enemy.waveStart.x, enemy.y - enemy.waveStart.y);
    return { prepared: true, paused: waveMarchPaused, timerHeld: waveTimer === timer, returned: fromStartAfter < fromStartBefore };
  }

  // Camp defenders stay passive toward settlers who remain at home.
  function campDefendersIgnoreColony({ seed = 'camp-guards' } = {}) {
    window.sim.campOpens({ seed });
    const defender = enemies.find(en => en.campDefender && en.hp > 0);
    const worker = settlers.find(s => !s.raider);
    if (!defender || !worker) return { guarded: false, unchanged: false };
    const campDefenders = enemies.filter(en => en.campDefender);
    const pets = campDefenders.filter(en => GAME_CONFIG.enemies[en.enemyKey].pet).length;
    const humanoids = campDefenders.length - pets;
    worker.x = townHall.x; worker.y = townHall.y; worker.speed = 0;
    const hp = worker.hp;
    step(1, () => { waveTimer = 999; });
    return { guarded: !defender.guardOff, unchanged: worker.hp === hp, pets, humanoids };
  }

  function campDefendersAttackIntruders({ seed = 'camp-intruders' } = {}) {
    start(seed);
    const defender = enemies.find(en => en.campDefender && en.hp > 0);
    const intruder = settlers.find(s => !s.raider);
    if (!defender || !intruder) return { defenderFound: false, attacked: false, leftPost: false };
    intruder.x = defender.guard.x;
    intruder.y = defender.guard.y;
    intruder.hp = intruder.maxHp = 9999;
    intruder.speed = 0;
    defender.attackCooldown = 0;
    const hp = intruder.hp;
    step(4, () => { waveTimer = 999; });
    return { defenderFound: true, attacked: intruder.hp < hp, leftPost: !!defender.guardOff };
  }

  function campOutpostAndTownHallAccess({ seed = 'camp-structures' } = {}) {
    start(seed);
    const camp = enemyTents.find(et => et.outpost && et.hp > 0);
    const intruder = settlers[0];
    if (!camp || !intruder) return { found: false, hallBlocked: false, outpostBlocked: false, hallApproachClear: false, outpostAttackable: false };

    const hallBlocked = collidesWithWall(townHall.x, townHall.y, intruder.radius);
    const outpostBlocked = collidesWithWall(camp.x, camp.y, intruder.radius);
    const hallEdgeClear = !collidesWithBoxList(townHall.x + STRUCTURE_COLLISION_HALF_SIZE + intruder.radius + 1, townHall.y, intruder.radius, [townHall], STRUCTURE_COLLISION_HALF_SIZE);
    const outpostEdgeClear = !collidesWithWall(
      camp.x + OUTPOST_COLLISION_HALF_WIDTH + intruder.radius + 1,
      camp.y + OUTPOST_COLLISION_OFFSET_Y,
      intruder.radius
    );
    const hallApproach = getTownHallApproachPoint(intruder);
    const hallApproachClear = !collidesWithWall(hallApproach.x, hallApproach.y, intruder.radius) &&
      Math.max(Math.abs(townHall.x - hallApproach.x), Math.abs(townHall.y - hallApproach.y)) <=
        STRUCTURE_COLLISION_HALF_SIZE + TILE_SIZE / 2 + intruder.radius + 4;

    settlers = [intruder]; enemies = [];
    intruder.x = camp.x + 100; intruder.y = camp.y; intruder.hp = intruder.maxHp = 9999;
    intruder.weapon = 'sword'; intruder.role = 'soldier'; intruder.orderTarget = camp;
    const hp = camp.hp;
    for (let f = 0; f < 1200 && camp.hp === hp; f++) fightByOrders(intruder, 1 / 60, false);
    return { found: true, hallBlocked, outpostBlocked, hallEdgeClear, outpostEdgeClear, hallApproachClear, outpostAttackable: camp.hp < hp };
  }

  function offscreenCampUsesNumbersOnly({ seed = 'camp-offscreen' } = {}) {
    start(seed);
    window.sim.campOpens({ seed });
    const camp = enemyTents.find(et => et.outpost && et.hp > 0);
    const guard = enemies.find(en => en.campDefender && en.campId === camp?.campId && en.hp > 0 &&
      !GAME_CONFIG.enemies[en.enemyKey].pet);
    if (!camp || !guard) return { found: false, offscreen: false, stayed: false, numbersSimulated: false };
    camera.zoom = 2.4;
    camera.x = camp.x < townHall.x ? WORLD_WIDTH - 80 : 80;
    camera.y = camp.y < townHall.y ? WORLD_HEIGHT - 80 : 80;
    settlers.forEach(s => {
      s.x = camp.x < WORLD_WIDTH / 2 ? WORLD_WIDTH - 80 : 80;
      s.y = camp.y < WORLD_HEIGHT / 2 ? WORLD_HEIGHT - 80 : 80;
      s.speed = 0;
    });
    const view = getViewRect(80);
    const offscreen = camp.x < view.x0 || camp.x > view.x1 || camp.y < view.y0 || camp.y > view.y1;
    const before = { x: guard.x, y: guard.y };
    camp.campMeals = 0;
    guard.campActivity = 'wander'; guard.campTarget = { x: guard.x + 100, y: guard.y };
    step(4, () => { waveTimer = 999; });
    return {
      found: true, offscreen,
      stayed: guard.x === before.x && guard.y === before.y && guard.campActivity === null,
      numbersSimulated: camp.campMeals > 0
    };
  }

  function campLifeAndOwnBuildings({ seed = 'camp-life' } = {}) {
    start(seed);
    const camp = enemyTents.find(et => et.outpost && et.hp > 0);
    const guards = enemies.filter(en => en.campDefender && en.campId === camp?.campId &&
      en.hp > 0 && !GAME_CONFIG.enemies[en.enemyKey].pet);
    const fire = buildings.find(b => b.type === 'campfire' && b.campId === camp?.campId);
    const wall = buildings.find(b => b.campId === camp?.campId && b.type.startsWith('wall'));
    const stockBefore = { rawMeat: stock.rawMeat || 0, firewood: stock.firewood || 0 };
    if (!camp || guards.length < 2 || !fire || !wall)
      return { campFound: false, cooked: false, ate: false, talked: false, lit: false, rawMeatInfinite: false, firewoodInfinite: false, noSupplyDrops: false, wallSafe: false };

    const cook = guards[0];
    const talker = guards[1];
    talker.x = cook.x + 20; talker.y = cook.y; talker.guard = { x: talker.x, y: talker.y };
    talker.campActivity = 'talk'; talker.campActivityTimer = 0.01;
    step(0.1, () => { waveTimer = 999; });
    const talked = !!talker.say;
    for (const guard of guards) {
      if (guard !== cook) {
        guard.campActivity = 'talk';
        guard.campActivityTimer = 999;
      }
    }

    const supply = { x: camp.x, y: camp.y + 36 };
    fire.fuelLeft = 0; fire.burning = 0; fire.cookProgress = 0;
    camp.campMeals = 0;
    cook.x = supply.x; cook.y = supply.y; cook.guard = { x: cook.x, y: cook.y };
    cook.campActivity = 'cook'; cook.campCarrying = { rawMeat: 0, firewood: 0 };
    cook.campTarget = null; cook.campFireX = fire.x; cook.campFireY = fire.y;
    step(1 / 60, () => { waveTimer = 999; });
    const fetchedWood = cook.campCarrying.firewood === 1;

    cook.x = fire.x + 32; cook.y = fire.y;
    step(1 / 60, () => { waveTimer = 999; });
    const lit = fire.fuelLeft > 0 && fire.burning === 1 && cook.campCarrying.firewood === 0;

    cook.x = supply.x; cook.y = supply.y;
    step(1 / 60, () => { waveTimer = 999; });
    const fetchedMeat = cook.campCarrying.rawMeat === 1;

    cook.x = fire.x + 32; cook.y = fire.y;
    step(1 / 60, () => { waveTimer = 999; });
    const meatHeldWhileCooking = cook.campCarrying.rawMeat === 1;
    step(GAME_CONFIG.cooking.seconds + 0.1, () => { waveTimer = 999; });
    const cooked = camp.campMeals === GAME_CONFIG.cooking.makes;

    cook.campActivity = 'eat'; cook.campActivityTimer = 0.01;
    step(0.1, () => { waveTimer = 999; });
    const ate = cook.campActivity !== 'eat';

    fire.fuelLeft = 0; cook.campActivity = 'cook'; cook.campCarrying = { rawMeat: 0, firewood: 0 };
    cook.campTarget = null; cook.campFireX = fire.x; cook.campFireY = fire.y;
    cook.x = supply.x; cook.y = supply.y;
    step(1 / 60, () => { waveTimer = 999; });
    const firewoodInfinite = fetchedWood && cook.campCarrying.firewood === 1;
    fire.fuelLeft = GAME_CONFIG.cooking.fuel.firewood;
    cook.campCarrying = { rawMeat: 0, firewood: 0 };
    cook.campTarget = null;
    step(1 / 60, () => { waveTimer = 999; });
    const rawMeatInfinite = fetchedMeat && cook.campCarrying.rawMeat === 1;

    const intruder = settlers[0];
    const wallHp = wall.hp;
    cook.campActivity = null;
    cook.x = wall.x + 10; cook.y = wall.y;
    cook.guard = { x: cook.x, y: cook.y };
    intruder.x = cook.x + 25; intruder.y = cook.y;
    intruder.speed = 0;
    cook.attackCooldown = 0;
    step(1, () => { waveTimer = 999; });
    const lootBefore = window.game.loot.length;
    cook.campCarrying = { rawMeat: 1, firewood: 1 };
    cook.hp = 0;
    removeDeadEnemies();
    const newLoot = window.game.loot.slice(lootBefore);
    const noSupplyDrops = (stock.rawMeat || 0) === stockBefore.rawMeat && (stock.firewood || 0) === stockBefore.firewood &&
      !newLoot.some(pile => (pile.items || []).some(item => item.includes('rawMeat') || item.includes('firewood')));
    return { campFound: true, cooked, ate, talked, lit, meatHeldWhileCooking, rawMeatInfinite, firewoodInfinite, noSupplyDrops, wallSafe: wall.hp === wallHp };
  }

  function campCookingAndWildlife({ seed = 'camp-cooking-paths' } = {}) {
    start(seed);
    window.sim.campOpens({ seed });
    const camp = enemyTents.find(et => et.outpost && et.hp > 0);
    if (!camp) return { campFound: false, accessibleFires: false, cooked: false, interiorSpawnBlocked: false, boarsOutside: false };
    camera.x = camp.x;
    camera.y = camp.y;
    settlers = [];
    const fires = buildings.filter(b => b.campId === camp.campId && b.type === 'campfire');
    const accessibleFires = fires.length > 0 && fires.every(fire => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const gx = Math.floor(fire.x / TILE_SIZE) + dx, gy = Math.floor(fire.y / TILE_SIZE) + dy;
      const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
      return !isTileBlockedForEnemyStrict(gx, gy) && !collidesWithWall(x, y, 10);
    }));
    const mid = getGridPos(camp.x, camp.y), radius = GAME_CONFIG.raid.wallTiles;
    let probe = null;
    for (let dy = -radius + 1; dy < radius && !probe; dy++) {
      for (let dx = -radius + 1; dx < radius; dx++) {
        const x = (mid.gx + dx) * TILE_SIZE + 15, y = (mid.gy + dy) * TILE_SIZE + 15;
        if (isTileOccupied(x, y) || enemies.some(en => Math.hypot(en.x - x, en.y - y) < 22)) continue;
        probe = { x, y, dx, dy };
        break;
      }
    }
    const interiorSpawnBlocked = !!probe && !isSpawnSpotFree(probe.x, probe.y);
    boars = [];
    if (probe) for (let i = 0; i < 8; i++) spawnResource('boar', probe.x, probe.y, 60);
    const boarsOutside = boars.every(boar => {
      const tile = getGridPos(boar.x, boar.y);
      const dx = Math.abs(tile.gx - mid.gx), dy = Math.abs(tile.gy - mid.gy);
      return camp.layout === 'round' ? Math.hypot(dx, dy) > radius + 0.5 : Math.max(dx, dy) > radius;
    });

    const cook = enemies.find(en => en.campDefender && en.campId === camp.campId && en.hp > 0 &&
      !(GAME_CONFIG.enemies[en.enemyKey] || {}).pet);
    if (!cook || !fires.length) return { campFound: true, accessibleFires, cooked: false, interiorSpawnBlocked, boarsOutside };
    const fire = fires[0];
    fire.fuelLeft = 0; fire.burning = 0; fire.cookProgress = 0;
    camp.campMeals = 0;
    cook.campActivity = 'cook';
    cook.campActivityTimer = 0;
    cook.campCarrying = { rawMeat: 0, firewood: 0 };
    cook.campTarget = null;
    cook.campFireX = fire.x;
    cook.campFireY = fire.y;
    let mealsProduced = 0;
    step(50, () => { waveTimer = 999; mealsProduced = Math.max(mealsProduced, camp.campMeals || 0); });
    return { campFound: true, accessibleFires, cooked: mealsProduced > 0, interiorSpawnBlocked, boarsOutside };
  }

  function campTentSummonsOnlyDuringRaid({ seed = 'camp-tent-summons' } = {}) {
    window.sim.campOpens({ seed });
    const camp = enemyTents.find(et => et.outpost && et.hp > 0);
    if (!camp) return { campFound: false, outside: -1, inside: -1, markedDefenders: false };
    const countSummoned = () => enemies.filter(en => en.summoned && en.campId === camp.campId).length;
    startNextWave();
    step(GAME_CONFIG.enemyTents.summonInterval * 2 + 1, () => { waveTimer = 999; });
    const outside = countSummoned();
    settlers[0].hp = settlers[0].maxHp = 9999;
    startRaid([settlers[0]]);
    enterCamp();
    step(GAME_CONFIG.enemyTents.summonInterval + 1);
    const summoned = enemies.filter(en => en.summoned && en.campId === camp.campId);
    return {
      campFound: true, outside, inside: summoned.length,
      markedDefenders: summoned.every(en => en.campDefender && en.guard)
    };
  }

  function campPetsFollowPlayerOwnership({ seed = 'camp-pets' } = {}) {
    start(seed);
    const outpost = enemyTents.find(et => et.outpost);
    const campId = outpost.campId;
    const before = enemies.filter(en => en.campDefender && en.campId === campId && GAME_CONFIG.enemies[en.enemyKey].pet).length;
    settlers.push(makeSettler(999, townHall.x + 90, townHall.y + 90, { type: 'dog', role: 'pet' }));
    tickRaidCamp(1 / 60);
    const after = enemies.filter(en => en.campDefender && en.campId === campId && GAME_CONFIG.enemies[en.enemyKey].pet).length;
    return { before, after };
  }

  function campEnemyKindsFollowPlayerProgress({ seed = 'camp-unlocks' } = {}) {
    const playerFaction = sides.player.faction, enemyFaction = sides.enemy.faction;
    sides.player.faction = 'humans';
    sides.enemy.faction = 'humans';
    start(seed);
    const camp = enemyTents.find(et => et.outpost && et.hp > 0);
    if (!camp) {
      sides.player.faction = playerFaction;
      sides.enemy.faction = enemyFaction;
      return { campFound: false };
    }
    const has = id => enemies.some(en => en.campDefender && en.campId === camp.campId && en.enemyKey === id);
    const before = { brute: has('brute'), archer: has('raider_archer'), medic: has('raider_medic') };
    armory['weapons:bow'] = 1;
    armory['tools:medbag'] = 1;
    settlers.push(makeSettler(998, townHall.x + 90, townHall.y + 90, { type: 'big' }));
    tickRaidCamp(1 / 60);
    const after = { brute: has('brute'), archer: has('raider_archer'), medic: has('raider_medic') };
    sides.player.faction = playerFaction;
    sides.enemy.faction = enemyFaction;
    return { campFound: true, before, after };
  }

  function wavePetsFollowPlayerOwnership({ seed = 'wave-pets' } = {}) {
    const groups = GAME_CONFIG.attackGroups;
    GAME_CONFIG.attackGroups = [{ club: 10, raider: 20, brute: 0, archer: 0 }];
    start(seed);
    waveNum = 20;
    startNextWave();
    const withoutPet = enemies.filter(en => en.fromWave && GAME_CONFIG.enemies[en.enemyKey].pet).length;
    start(seed);
    settlers.push(makeSettler(999, townHall.x + 90, townHall.y + 90, { type: 'dog', role: 'pet' }));
    waveNum = 20;
    startNextWave();
    const withPet = enemies.filter(en => en.fromWave && GAME_CONFIG.enemies[en.enemyKey].pet).length;
    GAME_CONFIG.attackGroups = groups;
    return { withoutPet, withPet };
  }

  function waveArchersFollowPlayerBow({ seed = 'wave-archers' } = {}) {
    const groups = GAME_CONFIG.attackGroups;
    GAME_CONFIG.attackGroups = [{ club: 0, raider: 0, brute: 0, archer: 20 }];
    start(seed);
    startNextWave();
    const withoutBow = enemies.filter(en => en.fromWave && GAME_CONFIG.enemies[en.enemyKey].ranged).length;
    start(seed);
    armory['weapons:bow'] = 1;
    startNextWave();
    const withBowInArmory = enemies.filter(en => en.fromWave && GAME_CONFIG.enemies[en.enemyKey].ranged).length;
    start(seed);
    settlers[0].weapon = 'bow';
    startNextWave();
    const withBowEquipped = enemies.filter(en => en.fromWave && GAME_CONFIG.enemies[en.enemyKey].ranged).length;
    GAME_CONFIG.attackGroups = groups;
    return { withoutBow, withBowInArmory, withBowEquipped };
  }

  function enemyRostersFollowPlayerProgress({ seed = 'enemy-rosters' } = {}) {
    const groups = GAME_CONFIG.attackGroups;
    const playerFaction = sides.player.faction, enemyFaction = sides.enemy.faction;
    GAME_CONFIG.attackGroups = [{ club: 12, raider: 12, brute: 12, archer: 12 }];
    const base = {}, unlocked = {};
    const kindsInWave = () => [...new Set([
      ...enemies.filter(en => en.fromWave).map(en => en.enemyKey),
      ...portalQueue
    ])].sort();
    for (const faction of ['humans', 'demons', 'undead']) {
      sides.player.faction = 'humans';
      sides.enemy.faction = faction;
      start(`${seed}-${faction}-base`);
      waveNum = 20;
      startNextWave();
      base[faction] = kindsInWave();

      start(`${seed}-${faction}-unlocked`);
      settlers.push(
        makeSettler(901, townHall.x + 90, townHall.y + 90, { type: 'dog', role: 'pet' }),
        makeSettler(902, townHall.x + 110, townHall.y + 90, { type: 'big' })
      );
      settlers[0].weapon = 'bow';
      armory['weapons:bow'] = 1;
      armory['tools:medbag'] = 1;
      waveNum = 20;
      startNextWave();
      unlocked[faction] = kindsInWave();
    }
    sides.player.faction = playerFaction;
    sides.enemy.faction = enemyFaction;
    GAME_CONFIG.attackGroups = groups;
    return { base, unlocked };
  }

  function playerPetUnlocksOtherFactions({ seed = 'cross-faction-pets' } = {}) {
    const groups = GAME_CONFIG.attackGroups;
    const playerFaction = sides.player.faction, enemyFaction = sides.enemy.faction;
    GAME_CONFIG.attackGroups = [{ club: 0, raider: 20, brute: 0, archer: 0 }];
    const results = {};
    for (const [faction, petId] of [['undead', 'undead_ghost'], ['demons', 'demon_beast']]) {
      sides.player.faction = 'humans';
      sides.enemy.faction = faction;
      start(`${seed}-${faction}`);
      settlers.push(makeSettler(999, townHall.x + 90, townHall.y + 90, { type: 'dog', role: 'pet' }));
      waveNum = 20;
      startNextWave();
      const wavePet = enemies.some(en => en.fromWave && en.enemyKey === petId) || portalQueue.includes(petId);

      start(`${seed}-${faction}-camp`);
      settlers.push(makeSettler(999, townHall.x + 90, townHall.y + 90, { type: 'dog', role: 'pet' }));
      const outpost = enemyTents.find(et => et.outpost);
      if (outpost) tickRaidCamp(1 / 60);
      const campPet = !!outpost && enemies.some(en => en.campDefender &&
        en.campId === outpost.campId && en.enemyKey === petId);
      results[faction] = { wavePet, campPet };
    }
    sides.player.faction = playerFaction;
    sides.enemy.faction = enemyFaction;
    GAME_CONFIG.attackGroups = groups;
    return results;
  }

  function waveGearFollowsPlayerOwnership({ seed = 'wave-gear' } = {}) {
    const groups = GAME_CONFIG.attackGroups;
    const gear = GAME_CONFIG.enemyGear;
    GAME_CONFIG.attackGroups = [{ club: 0, raider: 4, brute: 0, archer: 0 }];
    GAME_CONFIG.enemyGear = { perWave: 1, max: 1 };
    start(seed);
    waveNum = 1;
    startNextWave();
    const withoutGear = enemies.filter(en => en.fromWave && en.armor === 'leather').length;
    start(seed);
    armory['gear:leather_armor'] = 1;
    waveNum = 1;
    startNextWave();
    const withGear = enemies.filter(en => en.fromWave && en.armor === 'leather').length;
    GAME_CONFIG.attackGroups = groups;
    GAME_CONFIG.enemyGear = gear;
    return { withoutGear, withGear };
  }

  function waveShieldArmorAndBannerFollowPlayerGear({ seed = 'wave-gear-banner' } = {}) {
    const groups = GAME_CONFIG.attackGroups, gear = GAME_CONFIG.enemyGear;
    GAME_CONFIG.attackGroups = [{ club: 0, raider: 20, brute: 0, archer: 0 }];
    GAME_CONFIG.enemyGear = { perWave: 1, max: 1 };
    start(seed);
    waveNum = 1;
    startNextWave();
    const without = {
      armor: enemies.some(en => en.fromWave && en.armor),
      shield: enemies.some(en => en.fromWave && en.shield),
      banner: enemies.some(en => en.fromWave && en.captain)
    };

    start(seed);
    armory['gear:armor'] = 1;
    armory['gear:shield'] = 1;
    waveNum = 1;
    startNextWave();
    const withArmorAndShield = {
      armor: enemies.some(en => en.fromWave && en.armor === 'iron'),
      shield: enemies.some(en => en.fromWave && en.shield),
      banner: enemies.some(en => en.fromWave && en.captain)
    };

    start(seed);
    armory['gear:banner'] = 1;
    waveNum = 1;
    startNextWave();
    const withBanner = enemies.some(en => en.fromWave && en.captain);
    GAME_CONFIG.attackGroups = groups;
    GAME_CONFIG.enemyGear = gear;
    return { without, withArmorAndShield, withBanner };
  }

  function campGhostDoesNotAttackColony({ seed = 'ghost-guard' } = {}) {
    start(seed);
    const worker = settlers[0];
    const post = { x: worker.x + GAME_CONFIG.raid.guardTiles * 30 + 100, y: worker.y };
    const ghost = createConfiguredEnemy(post, 'undead_ghost');
    ghost.guard = { ...post };
    ghost.campId = 'test-camp';
    ghost.campDefender = true;
    enemies.push(ghost);
    const hp = worker.hp, x = ghost.x, y = ghost.y;
    for (let f = 0; f < 60; f++) update(1 / 60);
    return { hpUnchanged: worker.hp === hp, heldAtPost: ghost.x === x && ghost.y === y, raidInactive: !raid.phase };
  }

  // An idle camp doesn't start battle music or accept attack orders before a party goes there.
  function inactiveCampIsNotCombat({ seed = 'quiet-camp' } = {}) {
    start(seed);
    const musicOn = audio.musicOn;
    audio.musicOn = true;
    const defender = enemies.find(en => en.campDefender);
    const outpost = enemyTents.find(et => et.outpost);
    const music = musicMix();
    const battleTracks = GAME_CONFIG.factions[sides.enemy.faction].music.battle;
    const battleMusic = Object.keys(music).some(track => battleTracks.includes(track));
    if (defender) { mouse.x = defender.x; mouse.y = defender.y; handleCanvasClick(); }
    const defenderMarked = !!defender?.markedTarget;
    if (outpost) { mouse.x = outpost.x; mouse.y = outpost.y; handleCanvasClick(); }
    audio.musicOn = musicOn;
    return { battleMusic, defenderMarked, outpostMarked: !!outpost?.markedTarget };
  }

  // A scout sent to the camp: it walks there, looks, is spotted, comes home; the camp is still there (33)
  function scoutTheCamp({ seed = 'scout-camp' } = {}) {
    window.sim.campOpens({ seed });
    const camp = { ...raidCamp };
    const sent = sendScout();
    let looked = false, cols = 0;
    step(150, () => { waveTimer = 999; if (raid.phase === 'fight') { looked = true; cols = COLS; } return looked && raid.phase === null; });
    return { sent, looked, cols, campStays: !!raidCamp && raidCamp.seed === camp.seed, phase: raid.phase, home: settlers.length };
  }

  return { waveMusters, scoutsBetweenWaves, campLayouts, campSitePlacement, waveMarchPausesDuringRaid, campDefendersIgnoreColony, campDefendersAttackIntruders, campOutpostAndTownHallAccess, offscreenCampUsesNumbersOnly, campLifeAndOwnBuildings, campCookingAndWildlife, campTentSummonsOnlyDuringRaid, campPetsFollowPlayerOwnership, campEnemyKindsFollowPlayerProgress, wavePetsFollowPlayerOwnership, waveArchersFollowPlayerBow, enemyRostersFollowPlayerProgress, playerPetUnlocksOtherFactions, waveGearFollowsPlayerOwnership, waveShieldArmorAndBannerFollowPlayerGear, campGhostDoesNotAttackColony, inactiveCampIsNotCombat, scoutTheCamp };
})());
