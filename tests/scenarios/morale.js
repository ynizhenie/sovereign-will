// Morale and panic (#207)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const asFactions = (player, enemy, seed) => {
    sides.player.faction = player; sides.enemy.faction = enemy;
    start(seed);
    clearResources();
    invalidateAllPaths();
  };
  const back = () => { sides.player.faction = 'humans'; sides.enemy.faction = 'humans'; };

  // A wave of ten that's lost eight (routShare, #232): the two left panic; with a tent of theirs they go to it and heal there,
  // without one they leave the map with no reward
  function rout({ seed = 'morale-rout', tent = true } = {}) {
    asFactions('humans', 'humans', seed);
    settlers = [];
    enemies = Array.from({ length: 10 }, (_, i) => { const en = createConfiguredEnemy(nearHall(-14 + (i % 5), -10 + Math.floor(i / 5)), 'raider'); en.fromWave = true; return en; });
    waveSize = 10; waveRouted = false;
    const tentAt = nearHall(-20, -14);
    enemyTents = tent ? [{ x: tentAt.x, y: tentAt.y, hp: 60, maxHp: 60, summonTimer: 0, summonsLeft: 0 }] : [];
    for (const en of enemies.slice(0, 8)) en.hp = 0;
    removeDeadEnemies();
    const left = [...enemies];
    left.forEach(en => { en.hp = en.maxHp / 2; });
    const food0 = stock.food;
    run(1);
    const panicked = left.every(en => en.panic);
    const reached = new Set();
    run(25, { each: () => { for (const en of left) if (Math.hypot(en.x - tentAt.x, en.y - tentAt.y) < 40) reached.add(en); } });
    back();
    return {
      panicked,
      atTent: tent ? reached.size === left.length : undefined,
      healed: tent ? left.some(en => en.hp > en.maxHp / 2) : undefined,
      gone: tent ? undefined : left.every(en => !enemies.includes(en)),
      noReward: stock.food === food0
    };
  }

  // A wave of ten that's lost seven: the three left still fight (#232: they ran too early)
  function holdOn({ seed = 'morale-hold' } = {}) {
    asFactions('humans', 'humans', seed);
    settlers = [];
    enemies = Array.from({ length: 10 }, (_, i) => { const en = createConfiguredEnemy(nearHall(-14 + (i % 5), -10 + Math.floor(i / 5)), 'raider'); en.fromWave = true; return en; });
    waveSize = 10; waveRouted = false;
    for (const en of enemies.slice(0, 7)) en.hp = 0;
    removeDeadEnemies();
    run(1);
    const r = { routed: waveRouted, panicked: enemies.some(en => en.panic) };
    back();
    return r;
  }

  // The undead panic at a single blow, unless their necromancer is close by; humans hold
  function undeadNerves({ seed = 'morale-undead', necromancer = false } = {}) {
    asFactions('undead', 'humans', seed);
    const z = createSettler('zombie', 1, townHall.x + 150, townHall.y);
    settlers = [z];
    if (necromancer) settlers.push(Object.assign(createSettler('zombie', 2, townHall.x + 180, townHall.y), { tool: 'necro_staff' }));
    const en = createConfiguredEnemy({ x: z.x + 20, y: z.y }, 'raider');
    en.speed = 0; en.damage = 0;
    enemies = [en];
    tickMorale(1 / 60);
    damageSettler(z, 5, en);
    const panic = !!z.panic;
    back();
    return { panic };
  }

  // Where each side's morale settles: the humans lower against demons and the undead
  function bases() {
    const at = (player, enemy) => { sides.player.faction = player; sides.enemy.faction = enemy; window.sim.start('morale-bases'); const b = baseMorale(settlers[0], 'settler'); back(); return b; };
    return { humansVsHumans: at('humans', 'humans'), humansVsDemons: at('humans', 'demons'), demons: at('demons', 'humans'), undead: at('undead', 'humans') };
  }

  // A badly hurt demon in a panic heals on the imp next to it, never to the imp's death
  function demonBite({ seed = 'morale-demons' } = {}) {
    asFactions('demons', 'humans', seed);
    const d = Object.assign(createSettler('imp', 1, townHall.x + 150, townHall.y), { hp: 20, panic: true, morale: 0 });
    const ally = Object.assign(createSettler('imp', 2, townHall.x + 170, townHall.y), { hp: 5 });
    settlers = [d, ally];
    enemies = [];
    const hp0 = d.hp;
    run(3, { each: () => { d.panic = true; d.morale = 0; d.hunger = 999; ally.hunger = 999; } });
    back();
    return { healed: d.hp > hp0, allyAlive: ally.hp >= 1 };
  }

  // The enemy's necromancer keeps off: a settler walking up to it, it backs away
  function necromancerBack({ seed = 'morale-necro' } = {}) {
    asFactions('humans', 'undead', seed);
    const necro = createConfiguredEnemy(nearHall(-12, 0), 'undead_necromancer');
    const zombie = createConfiguredEnemy(nearHall(-8, 0), 'undead_zombie');
    zombie.speed = 0;
    enemies = [necro, zombie];
    const s = makeSettler(1, necro.x + 60, necro.y, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 });
    s.speed = 0;
    settlers = [s];
    corpses = [];
    run(3);
    back();
    return { keptOff: Math.hypot(necro.x - s.x, necro.y - s.y) >= GAME_CONFIG.morale.necroKeepBack - 10 };
  }

  // A boar shaken to a panic keeps running from the settler near it
  function boarPanic({ seed = 'morale-boar' } = {}) {
    asFactions('humans', 'humans', seed);
    const boar = { x: townHall.x + 200, y: townHall.y, hp: 30, maxHp: 30, wanderTimer: 0, priority: 0 };
    boars = [boar];
    settlers = [makeSettler(1, boar.x + 60, boar.y)];
    shakeMorale(boar, 40, 'boar');
    boarsPanic();
    back();
    return { panic: !!boar.panic, running: (boar.fleeTimer || 0) > 0 };
  }

  return { moraleHoldOn: holdOn, moraleBoar: boarPanic, moraleRout: rout, moraleUndead: undeadNerves, moraleBases: bases, moraleDemonBite: demonBite, moraleNecromancerBack: necromancerBack };
})());
