function getRandomBorderPos() {
  let side = Math.floor(rand() * 4);
  let gx, gy;
  if (side === 0) {
    gx = Math.floor(rand() * COLS);
    gy = Math.floor(rand() * BORDER_MARGIN);
  } else if (side === 1) {
    gx = Math.floor(rand() * COLS);
    gy = ROWS - 1 - Math.floor(rand() * BORDER_MARGIN);
  } else if (side === 2) {
    gx = Math.floor(rand() * BORDER_MARGIN);
    gy = Math.floor(rand() * ROWS);
  } else {
    gx = COLS - 1 - Math.floor(rand() * BORDER_MARGIN);
    gy = Math.floor(rand() * ROWS);
  }
  return { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
}

function createNormalEnemy(pos, enemyKey = 'raider') {
  const definition = getDefinition('enemies', enemyKey) || getDefinition('enemies', 'raider');
  const weapon = definition.weapon || 'sword';
  return {
    type: 'normal', enemyKey, x: pos.x, y: pos.y, radius: 10,
    hp: definition.hp, maxHp: definition.hp,
    weapon, speed: definition.speed, damage: definition.damage,
    reward: { ...(definition.reward || {}) }, path: [], pathTarget: null, pathTimer: 0,
    buildTarget: null
  };
}

function createConfiguredEnemy(pos, enemyKey, type, radius) {
  const definition = getDefinition('enemies', enemyKey);
  if (!definition) return null;
  return {
    type, enemyKey, x: pos.x, y: pos.y, radius,
    hp: definition.hp, maxHp: definition.hp,
    weapon: definition.weapon || 'sword', speed: definition.speed, damage: definition.damage,
    reward: { ...(definition.reward || {}) }, attackCooldown: 0,
    path: [], pathTarget: null, pathTimer: 0
  };
}

function grantEnemyReward(enemy) {
  Object.entries(enemy.reward || {}).forEach(([resource, amount]) => {
    if (resource === 'food') food += amount;
    if (resource === 'wood') wood += amount;
    if (resource === 'stone') stone += amount;
    if (resource === 'coal') coal += amount;
    if (resource === 'ironOre') ironOreStock += amount;
    if (resource === 'iron') iron += amount;
    if (resource === 'leather') leather += amount;
  });
}

function getNearbyEnemyTentSite(origin) {
  let originG = getGridPos(origin.x, origin.y);
  for (let attempt = 0; attempt < 40; attempt++) {
    let gx = Math.max(0, Math.min(COLS - 1, originG.gx + Math.floor(rand() * 9) - 4));
    let gy = Math.max(0, Math.min(ROWS - 1, originG.gy + Math.floor(rand() * 9) - 4));
    let x = gx * TILE_SIZE + 15;
    let y = gy * TILE_SIZE + 15;
    let occupied = isTileOccupied(x, y) ||
      naturalRocks.some(r => r.x === x && r.y === y) ||
      waterTiles.some(w => w.x === x && w.y === y) ||
      enemyTents.some(t => t.x === x && t.y === y) ||
      enemyTentBlueprints.some(t => t.x === x && t.y === y);

    if (isBorderZone(gx, gy) && !occupied && Math.hypot(x - origin.x, y - origin.y) <= 150) {
      return { x: x, y: y, progress: 0, maxProgress: 180, builder: null };
    }
  }
  return null;
}

function startNextWave() {
  enemyTents.forEach(et => {
    et.summonTimer = 0;
    et.summonsLeft = 2;
  });

  const difficulty = Math.min(
    Math.floor((waveNum - 1) / 5),
    GAME_CONFIG.attackGroups.length - 1
  );

  const maxTentsByDifficulty = Math.min(
    8,
    difficulty + 1
  );

  let tentCount = Math.min(
    Math.max(
      0,
      maxTentsByDifficulty -
        enemyTents.length -
        enemyTentBlueprints.length
    ),
    1 + Math.floor(rand() * 2)
  );

  let normalEnemies = [];

  const difficultyGroups =
    GAME_CONFIG.attackGroups?.[difficulty] || [];

  let group = null;

  if (difficultyGroups.length > 0) {
    const index = Math.floor(rand() * difficultyGroups.length);
    group = difficultyGroups[index];
  }

  if (group) {
    const enemyTypes = [
      {
        key: 'club',
        enemy: 'raider_club',
        type: 'normal',
        radius: 10,
        buildsTents: true
      },
      {
        key: 'raider',
        enemy: 'raider',
        type: 'normal',
        radius: 10,
        buildsTents: false
      },
      {
        key: 'brute',
        enemy: 'brute',
        type: 'big',
        radius: 18,
        buildsTents: false
      },
      {
        key: 'archer',
        enemy: 'raider_archer',
        type: 'archer',
        radius: 11,
        buildsTents: false
      }
    ];

    enemyTypes.forEach(entry => {
      const count = Math.max(
        0,
        Math.floor(Number(group[entry.key] || 0))
      );

      for (let i = 0; i < count; i++) {
        const enemy = createConfiguredEnemy(
          getRandomBorderPos(),
          entry.enemy,
          entry.type,
          entry.radius
        );

        if (!enemy) continue;

        enemies.push(enemy);

        if (entry.buildsTents) {
          normalEnemies.push(enemy);
        }
      }
    });
  }

  tentCount = Math.min(
    tentCount,
    normalEnemies.length
  );

  for (let t = 0; t < tentCount; t++) {
    let builder = normalEnemies[t];

    let site = getNearbyEnemyTentSite(builder);

    if (site) {
      site.builder = builder;
      builder.buildTarget = site;
      enemyTentBlueprints.push(site);
    }
  }

  waveNum++;
}
