// The demons (#43)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const corpseAt = p => ({ ...p, radius: 11, side: 'enemy', kind: 'raider', age: 0, big: false, wormsTaken: false });

  function asDemons(seed) {
    sides.player.faction = 'demons';
    sides.player.color = '#e8572a';
    sides.enemy.color = '#e9c46a';
    start(seed);
    window.showNotification = () => {};
  }

  function demonColony({ seed = 'demon-colony' } = {}) {
    asDemons(seed);
    const startUnits = settlers.map(s => s.type);
    const hire = [...document.querySelectorAll('#recruit-row button')].map(b => b.id);
    const build = [...document.querySelectorAll('#build-actions button')].map(b => b.id);
    const weapons = [...document.querySelectorAll('#weapon-actions button')].map(b => b.id);
    stock.food = 100; stock.wood = 100;
    spawnSettler('fire_imp');
    const fireImp = settlers.find(s => s.type === 'fire_imp');
    return {
      startUnits, hire, tent: build.includes('btn-tent'), circle: build.includes('btn-sacrifice_circle'), portal: build.includes('btn-portal'),
      hellfireCraftable: weapons.includes('btn-hellfire'), fireImp: { weapon: fireImp.weapon, role: fireImp.role }
    };
  }

  // A wounded imp with a corpse nearby, no wave on: it eats it and is whole again
  function eatsCorpse({ seed = 'demon-eat' } = {}) {
    asDemons(seed);
    clearResources();
    const imp = createSettler('imp', 1, nearHall(3, 0).x, nearHall(3, 0).y, { hp: 30 });
    settlers = [imp];
    corpses = [corpseAt(nearHall(5, 2))];
    run(8);
    return { hp: imp.hp, maxHp: imp.maxHp, corpses: corpses.length };
  }

  // Two wounded demons; the player selects one more and taps the sacrificial circle: it walks into it and
  // dies, and the wounded are healed to full
  function sacrifice({ seed = 'demon-sacrifice' } = {}) {
    asDemons(seed);
    clearResources();
    invalidateAllPaths();
    const circle = placeBuilding('sacrifice_circle', nearHall(-4, 0).x, nearHall(-4, 0).y);
    const victim = createSettler('imp', 1, nearHall(2, 2).x, nearHall(2, 2).y);
    const a = createSettler('imp', 2, nearHall(3, 0).x, nearHall(3, 0).y, { hp: 20 });
    const b = createSettler('demon', 3, nearHall(0, 3).x, nearHall(0, 3).y, { hp: 50 });
    settlers = [victim, a, b];
    corpses = [];
    waveTimer = 999;
    selectedSettler = victim;
    buildMode = 'interact'; mouse.x = circle.x; mouse.y = circle.y; handleCanvasClick();
    const sent = victim.sacrificeAt === circle;
    run(10);
    return { sent, victimDead: !settlers.includes(victim), healed: a.hp === a.maxHp && b.hp === b.maxHp };
  }

  // A pair of portals: one by the town hall, one across the map; a worker sent to the far side steps
  // through instead of walking all the way
  function portals({ seed = 'demon-portals' } = {}) {
    asDemons(seed);
    clearResources();
    invalidateAllPaths();
    const g = getGridPos(townHall.x, townHall.y);
    const near = placeBuilding('portal', nearHall(2, 0).x, nearHall(2, 0).y);
    const farTile = tileCenter(COLS - BORDER_MARGIN - 3, g.gy);
    const far = placeBuilding('portal', farTile.x, farTile.y);
    invalidateAllPaths();
    const s = createSettler('imp', 1, nearHall(1, 1).x, nearHall(1, 1).y);
    settlers = [s];
    const target = tileCenter(COLS - BORDER_MARGIN - 2, g.gy + 3);
    let seconds = 0, arrived = false;
    for (let f = 0; f < 15 * 60 && !arrived; f++) {
      moveEntityTowards(s, target.x, target.y, s.speed, false, 1 / 60);
      if (Math.hypot(s.x - target.x, s.y - target.y) < 20) arrived = true;
      seconds += 1 / 60;
    }
    const walking = Math.hypot(target.x - nearHall(1, 1).x, target.y - nearHall(1, 1).y) / (s.speed * GAME_CONFIG.movementScale * 60);
    return { arrived, quicker: seconds < walking / 2, portals: [near.type, far.type] };
  }

  // The demons as the enemy: portals open away from the base and the wave comes out of them
  function demonWave({ seed = 'demon-wave' } = {}) {
    sides.enemy.faction = 'demons';
    start(seed);
    waveNum = 11; startNextWave();
    const minDist = GAME_CONFIG.factions.demons.minPortalTiles * TILE_SIZE;
    const kinds = [...new Set(enemies.map(en => en.enemyKey))];
    return {
      portals: enemyTents.length, farFromBase: enemyTents.every(p => Math.hypot(p.x - townHall.x, p.y - townHall.y) >= minDist),
      byPortals: enemies.every(en => enemyTents.some(p => Math.hypot(p.x - en.x, p.y - en.y) < 40)),
      demons: kinds.every(k => k.startsWith('demon_')), enemies: enemies.length
    };
  }

  return { demonColony, eatsCorpse, sacrifice, portals, demonWave };
})());
