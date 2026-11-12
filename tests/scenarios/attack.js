// Who a blow hits (#144)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // Two enemies within reach of a swordsman: one blow at the first. Returns which of them got hurt.
  function oneBlow({ seed = 'one-blow', type = 'normal' } = {}) {
    start(seed);
    const hx = townHall.x + 120, hy = townHall.y;
    const s = makeSettler(1, hx, hy, { weapon: 'sword', role: 'soldier', type });
    settlers = [s];
    enemies = [createConfiguredEnemy({ x: hx + 25, y: hy }, 'raider'), createConfiguredEnemy({ x: hx, y: hy + 25 }, 'raider')];
    performAttack(s, enemies[0].x, enemies[0].y);
    return enemies.map(en => en.hp < en.maxHp);
  }

  // An enemy healer by a hurt raider, no settler near: it walks up and heals it (#203)
  function enemyHealer({ seed = 'enemy-healer' } = {}) {
    start(seed);
    clearResources();
    settlers = [];
    const g = getGridPos(townHall.x, townHall.y);
    const at = (dx, dy) => ({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
    const hurt = createConfiguredEnemy(at(-12, -10), 'raider');
    hurt.hp = 20; hurt.speed = 0;
    const medic = createConfiguredEnemy(at(-9, -10), 'raider_medic');
    enemies = [hurt, medic];
    run(4);
    return { healed: hurt.hp > 40, holdsBag: getEnemyDef(medic).tool === 'medbag' };
  }

  function enemyHealerHerbs({ seed = 'enemy-healer-herbs' } = {}) {
    start(seed);
    game.gameMode = 'endless';
    clearResources();
    settlers = [];
    const medic = createConfiguredEnemy({ x: townHall.x + 120, y: townHall.y }, 'raider_medic');
    const hurt = createConfiguredEnemy({ x: medic.x + 20, y: medic.y }, 'raider');
    hurt.hp = 1;
    enemies = [hurt, medic];
    game.enemyTents = [{ x: medic.x, y: medic.y, hp: 60, maxHp: 60, waveActive: true }];
    game.enemyHerbStock = 0;
    medic.herbs = 1;
    tickEnemy(medic, 1.3);
    const afterUse = { herbs: medic.herbs, hp: hurt.hp };
    game.enemyHerbStock = 5;
    tickEnemy(medic, 0.1);
    const afterRefill = { herbs: medic.herbs, stock: game.enemyHerbStock };
    tickEnemy(medic, 1.3);
    return { afterUse, afterRefill, healingResumed: hurt.hp > afterUse.hp };
  }

  // A worker carrying wood home is hit: it turns on the enemy rather than walk on (#208)
  function struckWhileCarrying({ seed = 'struck-carrying' } = {}) {
    start(seed);
    clearResources();
    const w = makeSettler(1, townHall.x + 220, townHall.y, { tool: 'axe' });
    w.carrying = { type: 'wood', amount: 3 };
    settlers = [w];
    const en = createConfiguredEnemy({ x: w.x + 18, y: w.y }, 'raider');
    en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    damageSettler(w, 1, en);
    let turned = false;
    run(1, { each: () => { if (w.activity === 'strikeBack') turned = true; } });
    return { turned, hit: en.hp < en.maxHp };
  }

  // Six swordsmen on two raiders a few steps apart: no more than three on one of them at a time, so both get
  // fought (#208)
  function meleeSlots({ seed = 'melee-slots' } = {}) {
    start(seed);
    clearResources();
    settlers = Array.from({ length: 6 }, (_, i) => makeSettler(i + 1, townHall.x - 60 + i * 20, townHall.y + 120, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 }));
    // the second a little farther from the town hall: everyone's first pick is the nearer one
    const make = (dx, dy) => { const en = createConfiguredEnemy({ x: townHall.x + dx, y: townHall.y + dy }, 'raider'); en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e5; en.fromWave = true; return en; };
    enemies = [make(-50, 200), make(50, 260)];
    let most = 0;
    run(8, { each: () => { waveTimer = 50; for (const en of enemies) most = Math.max(most, settlers.filter(s => Math.hypot(s.x - en.x, s.y - en.y) < 45).length); } });
    return { most, bothFought: enemies.every(en => en.hp < en.maxHp) };
  }

  function campProtection({ seed = 'camp-protection' } = {}) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x + 120, townHall.y, { weapon: 'sword', role: 'soldier' });
    settlers = [s];
    enemies = [];
    const campId = 1;
    game.raidCampId = campId;
    const fire = { type: 'campfire', side: 'red', enemyCampStructure: true, campId, x: s.x + 10, y: s.y, hp: 1000, maxHp: 1000 };
    const tent = { x: s.x + 1000, y: s.y, campStructure: true, campId, markedTarget: true, hp: 1000, maxHp: 1000 };
    buildings.push(fire);
    enemyTents = [tent];
    const tick = createSettlerTick(1 / 60);
    const markedTargetIgnored = !goForMarkedTent(s, tick);
    performAttack(s, fire.x, fire.y);
    const campUntouchedOutsideRaid = fire.hp === 1000 && tent.hp === 1000;
    game.raidActive = true;
    s.attackCooldown = 0;
    performAttack(s, fire.x, fire.y);
    return { markedTargetIgnored, campUntouchedOutsideRaid, campDamageAllowedInRaid: fire.hp < 1000 };
  }

  function enemyBuildingWeaponRange({ seed = 'building-weapon-range' } = {}) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x + 120, townHall.y, { weapon: 'sword', role: 'soldier', speed: 0 });
    settlers = [s];
    const enemy = createConfiguredEnemy({ x: s.x + 400, y: s.y }, 'raider');
    enemy.hp = enemy.maxHp = 1e5;
    enemies = [enemy];
    const range = getWeaponStats(s, 'combat').range;
    const wall = { type: 'wall_wood', side: 'red', x: s.x + range + 5, y: s.y, hp: 1000, maxHp: 1000 };
    buildings.push(wall);
    s.path = [{ x: wall.x, y: wall.y }];
    s.isBlockedPath = true;
    engageEnemy(s, createSettlerTick(1 / 60), enemy, null, 1 / 60);
    const noHitOutOfRange = wall.hp === 1000;
    wall.x = s.x + range - 1;
    s.path = [{ x: wall.x, y: wall.y }];
    s.isBlockedPath = true;
    s.attackCooldown = 0;
    engageEnemy(s, createSettlerTick(1 / 60), enemy, null, 1 / 60);
    return { noHitOutOfRange, hitInRange: wall.hp < 1000 };
  }

  function rangedUnitsUseDaggersOnStructures({ seed = 'ranged-structure-daggers' } = {}) {
    start(seed);
    clearResources();
    const rangedWeapons = ['bow', 'crossbow'];
    const playerResults = rangedWeapons.map((weapon, i) => {
      const s = makeSettler(i + 1, townHall.x + 120 + i * 120, townHall.y, {
        weapon, role: 'archer', quiver: true, arrows: 8, speed: 0
      });
      settlers = [s];
      const enemy = createConfiguredEnemy({ x: s.x + 400, y: s.y }, 'raider');
      enemy.fromWave = true;
      enemies = [enemy];
      const wall = { type: 'wall_wood', side: 'red', x: s.x + 20, y: s.y, hp: 100, maxHp: 100 };
      buildings.push(wall);
      s.path = [{ x: wall.x, y: wall.y }];
      s.isBlockedPath = true;
      engageEnemy(s, createSettlerTick(1 / 60), enemy, null, 1 / 60);
      return { weapon, damage: 100 - wall.hp, arrows: s.arrows, swingWeapon: s.swingWeapon };
    });

    start(`${seed}-ordered`);
    clearResources();
    game.gameMode = 'battle';
    game.raidActive = true;
    game.raidCampId = 1;
    const orderedArcher = makeSettler(1, townHall.x + 120, townHall.y, {
      weapon: 'crossbow', role: 'archer', quiver: true, arrows: 0, speed: 0
    });
    const orderedBuilding = {
      type: 'wall_wood', side: 'red', enemyCampStructure: true, campId: game.raidCampId,
      x: orderedArcher.x + 25, y: orderedArcher.y, hp: 100, maxHp: 100
    };
    settlers = [orderedArcher];
    buildings.push(orderedBuilding);
    orderedArcher.orderTarget = orderedBuilding;
    fightByOrders(orderedArcher, 1 / 60, false);
    const orderedStructure = { damage: 100 - orderedBuilding.hp, arrows: orderedArcher.arrows,
      swingWeapon: orderedArcher.swingWeapon };

    const enemyDamage = ['raider', 'raider_fist', 'raider_archer'].map((key, i) => {
      start(`${seed}-enemy-${i}`);
      clearResources();
      game.gameMode = 'endless';
      game.raidActive = false;
      const wall = { type: 'wall_wood', x: townHall.x + 180, y: townHall.y, hp: 1000, maxHp: 1000 };
      buildings.push(wall);
      const enemy = createConfiguredEnemy({ x: wall.x + 25, y: wall.y }, key);
      enemy.speed = 0;
      enemy.isBlockedPath = true;
      enemies = [enemy];
      tickEnemy(enemy, 1 / 60);
      return { key, damage: 1000 - wall.hp, weapon: enemy.weapon };
    });
    return { playerResults, orderedStructure, enemyDamage };
  }

  function holdsBehindBreachedWall({ seed = 'holds-wall' } = {}) {
    start(seed);
    clearResources();
    const wall = { type: 'wall_wood', x: townHall.x + 180, y: townHall.y, hp: 1000, maxHp: 1000 };
    buildings.push(wall);
    resetTileIndex();
    const s = makeSettler(1, wall.x - 70, wall.y, { weapon: 'sword', role: 'soldier', speed: 1.2 });
    settlers = [s];
    const enemy = createConfiguredEnemy({ x: wall.x + 22, y: wall.y }, 'raider');
    enemy.fromWave = true;
    enemy.siegeTarget = wall;
    enemy.siegeTargetTick = pathTick;
    enemy.hp = enemy.maxHp = 1e5;
    enemies = [enemy];
    const before = { x: s.x, y: s.y };
    engageEnemy(s, createSettlerTick(1 / 60), enemy, null, 1 / 60);
    return {
      movedAroundWall: Math.hypot(s.x - before.x, s.y - before.y) > 0.01,
      enemyTouchesWall: collidesWithBoxList(enemy.x, enemy.y, enemy.radius + 2, [wall], 15)
    };
  }

  async function enemyBuildingBreakSound({ seed = 'enemy-building-break-sound' } = {}) {
    // (the sound woken first: while it's awaited the game runs on, and an enemy already there struck the
    // wall off the screen, its next blow not due by the tick below)
    const { audio, startAudio } = await import('/js/engine/platform/audio.js');
    startAudio();
    if (audio.ctx?.state === 'suspended') await audio.ctx.resume();
    start(seed);
    clearResources();
    const wall = { type: 'wall_wood', x: townHall.x + 180, y: townHall.y, hp: 1000, maxHp: 1000 };
    buildings.push(wall);
    const enemy = createConfiguredEnemy({ x: wall.x + 25, y: wall.y }, 'raider');
    enemy.speed = 0;
    enemy.isBlockedPath = true;
    enemies = [enemy];
    audio.soundOn = true;
    audio.last.swing = -Infinity;
    camera.x = wall.x; camera.y = wall.y; // (a sound off the screen isn't played)
    tickEnemy(enemy, 1 / 60);
    return { buildingDamaged: wall.hp < wall.maxHp, soundPlayed: Number.isFinite(audio.last.swing) };
  }

  return { struckWhileCarrying, meleeSlots, enemyHealer, enemyHealerHerbs, oneBlow, campProtection, enemyBuildingWeaponRange, rangedUnitsUseDaggersOnStructures, holdsBehindBreachedWall, enemyBuildingBreakSound };
})());
