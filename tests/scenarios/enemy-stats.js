// Enemies built like settlers (#136)
Object.assign(window.sim, (() => {
  const { start, helpers: { tileCenter, makeSettler, clearResources } } = window.sim;

  // Each enemy kind against a settler of its body with its weapon: hp, speed, size, damage per hit
  function enemyStatsMatch({ seed = 'enemy-stats' } = {}) {
    start(seed);
    gameDifficulty = 'normal';
    const out = {};
    for (const key of Object.keys(GAME_CONFIG.enemies)) {
      const def = GAME_CONFIG.enemies[key];
      const en = createConfiguredEnemy({ x: 100, y: 100 }, key);
      const settler = Object.assign(createSettler(def.body, 1, 100, 100), { weapon: def.weapon });
      const stats = getWeaponStats(settler, 'combat');
      out[key] = {
        hp: en.maxHp === settler.maxHp, speed: en.speed === settler.speed, size: en.radius === settler.visualRadius,
        damage: en.damage === stats.damage * stats.multiplier
      };
    }
    return out;
  }

  // A swordsman and a sword raider, face to face: each blow lands for the same damage, as often
  function swordDuel({ seed = 'sword-duel' } = {}) {
    start(seed);
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const a = tileCenter(g.gx + 4, g.gy), b = tileCenter(g.gx + 5, g.gy);
    const s = makeSettler(1, a.x, a.y, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 });
    settlers = [s];
    const en = createConfiguredEnemy(b, 'raider');
    en.hp = en.maxHp = 1e4;
    enemies = [en];
    const blows = { settler: [], enemy: [] };
    let sHp = s.hp, eHp = en.hp;
    for (let f = 0; f < 6 * 60; f++) {
      waveTimer = 999;
      update(1 / 60);
      if (s.hp < sHp) { blows.settler.push(Math.round(sHp - s.hp)); sHp = s.hp; }
      if (en.hp < eHp) { blows.enemy.push(Math.round(eHp - en.hp)); eHp = en.hp; }
    }
    return { settlerTook: [...new Set(blows.settler)], enemyTook: [...new Set(blows.enemy)], settlerHits: blows.settler.length, enemyHits: blows.enemy.length };
  }

  return { enemyStatsMatch, swordDuel };
})());
