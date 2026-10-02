// The undead (#43)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const corpseAt = (p, big = false) => ({ ...p, radius: big ? 18 : 11, side: 'enemy', kind: big ? 'brute' : 'raider', age: 0, big, wormsTaken: false });

  function asUndead(seed) {
    sides.player.faction = 'undead';
    sides.player.color = '#9b59b6';
    sides.enemy.color = '#e8572a';
    start(seed);
    window.showNotification = () => {};
  }

  // A new game as the undead: what it starts with, what it can hire and build, food and bones over a minute
  function undeadColony({ seed = 'undead-colony' } = {}) {
    asUndead(seed);
    const startUnits = settlers.map(s => s.type);
    const hire = [...document.querySelectorAll('#recruit-row button')].map(b => b.id);
    const build = [...document.querySelectorAll('#build-actions button')].map(b => b.id);
    const bones0 = stock.bones;
    run(60);
    const bonesAfter = stock.bones;
    spawnSettler('skeleton');
    const skeleton = settlers.find(s => s.type === 'skeleton');
    return {
      startUnits, hire, tent: build.includes('btn-tent'), grave: build.includes('btn-grave'),
      ateMeals: settlers.some(s => s.meals > 0), bonesMade: Math.round(bonesAfter - bones0),
      skeleton: skeleton && { weapon: skeleton.weapon, role: skeleton.role, arrows: skeleton.arrows > 0 }
    };
  }

  // A necromancer, a grave, and seven corpses (one big) around: it raises five, goes back to the grave
  // for its raises, and raises the last two
  function necromancerRaises({ seed = 'undead-raise' } = {}) {
    asUndead(seed);
    clearResources();
    invalidateAllPaths();
    placeBuilding('grave', nearHall(-4, 0).x, nearHall(-4, 0).y);
    placeBuilding('grave', nearHall(-4, 2).x, nearHall(-4, 2).y);
    const necro = createSettler('necromancer', 1, nearHall(3, 0).x, nearHall(3, 0).y);
    settlers = [necro];
    corpses = [corpseAt(nearHall(5, 2), true), ...[3, 4, 5, 6, 7, 8].map(dx => corpseAt(nearHall(dx, 4)))];
    let afterFirstRound = null, recharged = false;
    run(45, { each: () => {
      if (necro.raisesLeft === 0 && afterFirstRound === null) afterFirstRound = settlers.length - 1;
      if (afterFirstRound !== null && necro.raisesLeft === GAME_CONFIG.settlerTypes.necromancer.necromancer.raises) recharged = true;
    } });
    return {
      afterFirstRound, recharged, raised: settlers.length - 1, corpsesLeft: corpses.length,
      bigZombies: settlers.filter(s => s.type === 'big_zombie').length
    };
  }

  // A wounded zombie next to a necromancer gets healed
  function necromancerHeals({ seed = 'undead-heal' } = {}) {
    asUndead(seed);
    clearResources();
    const necro = createSettler('necromancer', 1, nearHall(3, 0).x, nearHall(3, 0).y);
    const zombie = createSettler('zombie', 2, nearHall(4, 0).x, nearHall(4, 0).y, { hp: 40 });
    settlers = [necro, zombie];
    corpses = [];
    run(5);
    return { healed: zombie.hp > 40 };
  }

  // The undead as the enemy: a wave is made of theirs, and their necromancer raises a corpse into a zombie
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
    return { kinds, zombies: enemies.filter(en => en.enemyKey === 'undead_zombie').length, corpses: corpses.length };
  }

  return { undeadColony, necromancerRaises, necromancerHeals, undeadEnemies };
})());
