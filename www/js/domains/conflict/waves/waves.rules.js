// Waves: when they come, how big, what enemies they bring and where from, their tents, the difficulty

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/i18n.js';
import { getGridPos, isBorderZone } from '../../../engine/world/grid.js';
import { BORDER_MARGIN, TILE_SIZE, game } from '../../../engine/world/state.js';
import { rand } from '../../../engine/world/rng.js';
import { addResources } from '../../colony/storage/storage.rules.js';
import { isTileOccupied } from '../../economy/building/building.rules.js';
import { getEnemyFaction } from '../../factions/factions.rules.js';
import { showNotification } from '../../../ui/toasts.js';
import { invalidateAllPaths, isTileBlockedForEnemyStrict } from '../../../engine/movement/pathfinding.js';
import { addCorpse } from '../combat/combat.rules.js';
import { openDemonPortal } from '../../factions/demons/demons.rules.js';
import { playSound } from '../../../app/sounds.js';

export const WAVE_WARNING_SECONDS = 15;

export function getDifficulty() {
  return GAME_CONFIG.difficulty[game.gameDifficulty] || GAME_CONFIG.difficulty.normal;
}

export function getRandomBorderPos() {
  let side = Math.floor(rand() * 4);
  let gx, gy;
  if (side === 0) {
    gx = Math.floor(rand() * game.COLS);
    gy = Math.floor(rand() * BORDER_MARGIN);
  } else if (side === 1) {
    gx = Math.floor(rand() * game.COLS);
    gy = game.ROWS - 1 - Math.floor(rand() * BORDER_MARGIN);
  } else if (side === 2) {
    gx = Math.floor(rand() * BORDER_MARGIN);
    gy = Math.floor(rand() * game.ROWS);
  } else {
    gx = game.COLS - 1 - Math.floor(rand() * BORDER_MARGIN);
    gy = Math.floor(rand() * game.ROWS);
  }
  return { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
}

// The config entry of an enemy on the map
export function getEnemyDef(enemy) {
  return getDefinition('enemies', enemy.enemyKey) || GAME_CONFIG.enemies.raider;
}

// A new enemy from GAME_CONFIG.enemies; type and radius come from the config unless given
export function createConfiguredEnemy(pos, enemyKey, type, radius) {
  const definition = getDefinition('enemies', enemyKey);
  if (!definition) return null;
  const enemy = {
    type: type || definition.type, enemyKey, x: pos.x, y: pos.y, radius: radius || definition.radius,
    hp: definition.hp * getDifficulty().enemyHp, maxHp: definition.hp * getDifficulty().enemyHp,
    weapon: definition.weapon || 'sword', speed: definition.speed, damage: definition.damage,
    reward: { ...(definition.reward || {}) }, attackCooldown: 0,
    path: [], pathTarget: null, pathTimer: 0, buildTarget: null
  };
  if (definition.quiver) {
    enemy.arrows = definition.quiver.arrows;
    game.enemyArrowStock += definition.quiver.tentStock;
  }
  return enemy;
}

export function createNormalEnemy(pos, enemyKey = 'raider') {
  return createConfiguredEnemy(pos, getDefinition('enemies', enemyKey) ? enemyKey : 'raider');
}

export function findNearestEnemyTent(origin) {
  let nearest = null;
  let nearestDist = Infinity;
  game.enemyTents.forEach(tent => {
    const dist = Math.hypot(tent.x - origin.x, tent.y - origin.y);
    if (dist < nearestDist) { nearest = tent; nearestDist = dist; }
  });
  return nearest;
}

export function grantEnemyReward(enemy) {
  addResources(enemy.reward);
}

export function getNearbyEnemyTentSite(origin) {
  let originG = getGridPos(origin.x, origin.y);
  for (let attempt = 0; attempt < 40; attempt++) {
    let gx = Math.max(0, Math.min(game.COLS - 1, originG.gx + Math.floor(rand() * 9) - 4));
    let gy = Math.max(0, Math.min(game.ROWS - 1, originG.gy + Math.floor(rand() * 9) - 4));
    let x = gx * TILE_SIZE + 15;
    let y = gy * TILE_SIZE + 15;
    let occupied = isTileOccupied(x, y) ||
      game.naturalRocks.some(r => r.x === x && r.y === y) ||
      game.waterTiles.some(w => w.x === x && w.y === y) ||
      game.enemyTents.some(t => t.x === x && t.y === y) ||
      game.enemyTentBlueprints.some(t => t.x === x && t.y === y);

    if (isBorderZone(gx, gy) && !occupied && Math.hypot(x - origin.x, y - origin.y) <= 150) {
      return { x: x, y: y, progress: 0, maxProgress: GAME_CONFIG.enemyTents.buildWork, builder: null };
    }
  }
  return null;
}

// Where a wave's enemy appears: the map's edge, or for the demons one of their portals (#43)
export function getWaveSpawnPos() {
  if (!getEnemyFaction().portalSpawns || game.enemyTents.length === 0) return getRandomBorderPos();
  const portal = game.enemyTents[Math.floor(rand() * game.enemyTents.length)];
  // a free tile beside the portal, never inside a tree, a rock or the water (#177)
  const g = getGridPos(portal.x, portal.y);
  const free = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dy) && !isTileBlockedForEnemyStrict(g.gx + dx, g.gy + dy)) free.push({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
    }
  }
  return free.length ? free[Math.floor(rand() * free.length)] : { x: portal.x, y: portal.y };
}

// How much the player's army scales a wave (#179): 1 at army.base settlers, more for a bigger army
export function getWaveArmyFactor() {
  const army = GAME_CONFIG.waveScaling.army;
  const units = game.settlers.filter(s => s.temporary === undefined).length;
  return Math.max(army.min, Math.min(army.max, 1 + (units - army.base) * army.perUnit));
}

export function startNextWave() {
  if (game.gameMode === 'endless') playSound('horn');
  const scaling = GAME_CONFIG.waveScaling;
  game.enemyTents.forEach(et => {
    et.summonTimer = 0;
    et.summonsLeft = GAME_CONFIG.enemyTents.summonsPerWave;
  });

  // difficulty goes up every wavesPerDifficulty waves (starting at 0)
  const difficulty = Math.floor((game.waveNum - 1) / scaling.wavesPerDifficulty);

  const maxTentsByDifficulty = Math.min(scaling.maxTents, difficulty + 1);
  let tentCount = Math.min(
    Math.max(0, maxTentsByDifficulty - game.enemyTents.length - game.enemyTentBlueprints.length),
    scaling.newTents.min + Math.floor(rand() * (scaling.newTents.max - scaling.newTents.min + 1))
  );

  // the demons' portals open first, so the wave can come out of them
  // as many as tents would be (#177), but always one to come out of
  if (getEnemyFaction().portalSpawns) {
    for (let i = 0; i < (game.enemyTents.length === 0 ? Math.max(1, tentCount) : tentCount); i++) openDemonPortal();
    invalidateAllPaths();
  }

  let normalEnemies = [];

  // squad size grows by growthPerDifficulty per difficulty level (+50%: wave 1-5 x1, 96-100 x10.5), with
  // the player's army (#179); the first wave is lighter
  const multiplier = (1 + (difficulty * scaling.growthPerDifficulty)) * getWaveArmyFactor() * (game.waveNum === 1 ? scaling.firstWave : 1);

  // a random base squad from the config
  const baseGroups = GAME_CONFIG.attackGroups || [];
  let group = null;

  if (baseGroups.length > 0) {
    const index = Math.floor(rand() * baseGroups.length);
    group = baseGroups[index];
  }

  let spawned = 0;
  const spawnWaveEnemy = def => {
    const enemy = createConfiguredEnemy(getWaveSpawnPos(), def.id);
    if (!enemy) return;
    enemy.fromWave = true; // the wave the base deploys against (see isDefenseAlert)
    game.enemies.push(enemy);
    spawned++;
    if (def.buildsTents) normalEnemies.push(enemy);
  };
  const waveKinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id));

  if (group) {
    // every enemy kind of the enemy's faction with a waveKey, in config order (#43)
    waveKinds.forEach(def => {
      const baseCount = [].concat(def.waveKey).reduce((sum, key) => sum + Number(group[key] || 0), 0);
      const count = Math.max(0, Math.floor(baseCount * multiplier * getDifficulty().enemyCount * (def.waveScale || 1)));
      for (let i = 0; i < count; i++) spawnWaveEnemy(def);
    });
  }
  // never an empty wave: one of the first kind
  if (spawned === 0 && waveKinds.length) spawnWaveEnemy(waveKinds[0]);

  // portals (the demons, #43) have opened by themselves already; tents need builders
  if (getEnemyFaction().portalSpawns) normalEnemies = [];
  tentCount = Math.min(tentCount, normalEnemies.length);

  for (let t = 0; t < tentCount; t++) {
    let builder = normalEnemies[t];
    let site = getNearbyEnemyTentSite(builder);

    if (site) {
      site.builder = builder;
      builder.buildTarget = site;
      game.enemyTentBlueprints.push(site);
    }
  }

  game.waveNum++;
}

// The wave timer: a warning 15 s before, then the wave
export function tickWaveTimer(dt) {
  const before = game.waveTimer;
  game.waveTimer -= dt;
  // one warning, 15 s before the wave (holds of the timer in tests keep it above)
  if (before > WAVE_WARNING_SECONDS && game.waveTimer <= WAVE_WARNING_SECONDS) showNotification(t('wave.warning', { seconds: WAVE_WARNING_SECONDS }), true);
  if (game.waveTimer <= 0) {
    startNextWave();
    game.waveTimer = game.waveInterval;
  }
}

// Enemy tents: destroyed ones go; the rest summon enemies now and then
export function tickEnemyTents(dt) {
  for (let i = game.enemyTents.length - 1; i >= 0; i--) {
    let et = game.enemyTents[i];
    if (et.hp <= 0) {
      game.enemyTents.splice(i, 1);
      invalidateAllPaths();
    }
  }

  game.enemyTents.forEach(et => {
    et.summonTimer = (et.summonTimer || 0) + dt;
    const tentConfig = GAME_CONFIG.enemyTents;
    if ((et.summonsLeft || 0) > 0 && et.summonTimer >= tentConfig.summonInterval && game.enemies.length < tentConfig.maxEnemies) {
      et.summonTimer = 0;
      et.summonsLeft--;
      let spawnPos = {
        x: Math.max(15, Math.min(game.WORLD_WIDTH - 15, et.x + (rand() - 0.5) * 30)),
        y: Math.max(15, Math.min(game.WORLD_HEIGHT - 15, et.y + (rand() - 0.5) * 30))
      };
      const summoned = createConfiguredEnemy(spawnPos, getEnemyFaction().summonEnemy || tentConfig.summonEnemy);
      summoned.summoned = true; // from a tent, not the wave: doesn't call off an assault on the tents
      game.enemies.push(summoned);
    }
  });
}

// Dead enemies: their reward, a corpse, and off the list; a tent site its builder died at goes too
export function removeDeadEnemies() {
  game.enemies.forEach(en => {
    if (en.hp <= 0 && !en.rewardGranted) {
      en.rewardGranted = true;
      if (!en.crumbled) { grantEnemyReward(en); addCorpse(en, 'enemy', en.enemyKey); }
    }
  });
  game.enemies = game.enemies.filter(en => en.hp > 0);
  game.enemyTentBlueprints = game.enemyTentBlueprints.filter(site => game.enemies.includes(site.builder));
}
