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

// The config entry of an enemy on the map
function getEnemyDef(enemy) {
  return getDefinition('enemies', enemy.enemyKey) || GAME_CONFIG.enemies.raider;
}

// A new enemy from GAME_CONFIG.enemies; type and radius come from the config unless given
function createConfiguredEnemy(pos, enemyKey, type, radius) {
  const definition = getDefinition('enemies', enemyKey);
  if (!definition) return null;
  return {
    type: type || definition.type, enemyKey, x: pos.x, y: pos.y, radius: radius || definition.radius,
    hp: definition.hp, maxHp: definition.hp,
    weapon: definition.weapon || 'sword', speed: definition.speed, damage: definition.damage,
    reward: { ...(definition.reward || {}) }, attackCooldown: 0,
    path: [], pathTarget: null, pathTimer: 0, buildTarget: null
  };
}

function createNormalEnemy(pos, enemyKey = 'raider') {
  return createConfiguredEnemy(pos, getDefinition('enemies', enemyKey) ? enemyKey : 'raider');
}

function grantEnemyReward(enemy) {
  addResources(enemy.reward);
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
      return { x: x, y: y, progress: 0, maxProgress: GAME_CONFIG.enemyTents.buildWork, builder: null };
    }
  }
  return null;
}

function startNextWave() {
  const scaling = GAME_CONFIG.waveScaling;
  enemyTents.forEach(et => {
    et.summonTimer = 0;
    et.summonsLeft = GAME_CONFIG.enemyTents.summonsPerWave;
  });

  // difficulty goes up every wavesPerDifficulty waves (starting at 0)
  const difficulty = Math.floor((waveNum - 1) / scaling.wavesPerDifficulty);

  const maxTentsByDifficulty = Math.min(scaling.maxTents, difficulty + 1);
  let tentCount = Math.min(
    Math.max(0, maxTentsByDifficulty - enemyTents.length - enemyTentBlueprints.length),
    scaling.newTents.min + Math.floor(rand() * (scaling.newTents.max - scaling.newTents.min + 1))
  );

  let normalEnemies = [];

  // squad size grows by growthPerDifficulty per difficulty level (+50%: wave 1-5 x1, 96-100 x10.5)
  const multiplier = 1 + (difficulty * scaling.growthPerDifficulty);

  // a random base squad from the config
  const baseGroups = GAME_CONFIG.attackGroups || [];
  let group = null;

  if (baseGroups.length > 0) {
    const index = Math.floor(rand() * baseGroups.length);
    group = baseGroups[index];
  }

  if (group) {
    // every enemy kind with a waveKey, in config order
    Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey).forEach(def => {
      const baseCount = Number(group[def.waveKey] || 0);
      const count = Math.max(0, Math.floor(baseCount * multiplier));

      for (let i = 0; i < count; i++) {
        const enemy = createConfiguredEnemy(getRandomBorderPos(), def.id);
        if (!enemy) continue;

        enemies.push(enemy);

        if (def.buildsTents) {
          normalEnemies.push(enemy);
        }
      }
    });
  }

  tentCount = Math.min(tentCount, normalEnemies.length);

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
