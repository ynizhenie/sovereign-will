// Waves: when they come, how big, what enemies they bring and where from, their tents, the difficulty

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, isBorderZone, rand } from '../../../engine/world/index.js';
import { addResources } from '../../colony/storage/index.js';
import { isTileOccupied } from '../../economy/building/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { showNotification } from '../../../ui/index.js';
import { invalidateAllPaths, isTileBlockedForEnemyStrict } from '../../../engine/movement/index.js';
import { addCorpse } from '../combat/index.js';
import { openDemonPortal } from '../../factions/demons/index.js';
import { isNight } from '../../world/index.js';
import { someoneSays } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';
import { onUnitDeath } from '../morale/index.js';

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
/** @returns {import('../../../engine/world/types.js').Enemy} */
export function createConfiguredEnemy(pos, enemyKey, type, radius) {
  const definition = getDefinition('enemies', enemyKey);
  if (!definition) return /** @type {any} */ (null); // callers pass keys that are in the config
  const enemy = {
    type: type || definition.type, enemyKey, x: pos.x, y: pos.y, radius: radius || definition.radius,
    hp: definition.hp * getDifficulty().enemyHp, maxHp: definition.hp * getDifficulty().enemyHp,
    weapon: definition.weapon || 'sword', speed: definition.speed, damage: definition.damage,
    reward: { ...(definition.reward || {}) }, attackCooldown: 0,
    path: [], pathTarget: null, pathTimer: 0, buildTarget: null
  };
  if (game.gameMode === 'endless' && getDifficulty().likePlayer) asStrongAsPlayers(enemy, definition);
  if (definition.quiver) {
    enemy.arrows = definition.quiver.arrows;
    game.enemyArrowStock += definition.quiver.tentStock;
  }
  return enemy;
}

// Hard (#255): an enemy as strong as the player's own unit of its kind: its faction's settler type (big for
// a big one) gives the hp and the speed, its weapon in a settler's hands the damage (per second in melee, per
// arrow and how often for an archer); whichever is more of the two, so it's never weaker than it was
function asStrongAsPlayers(enemy, definition) {
  const units = getEnemyFaction().units || ['normal', 'big'];
  const kind = GAME_CONFIG.settlerTypes[definition.type === 'big' ? units[1] || units[0] : units[0]] || GAME_CONFIG.settlerTypes.normal;
  const weapon = (getDefinition('weapons', enemy.weapon) || GAME_CONFIG.weapons.fist).combat;
  const hp = kind.hp * getDifficulty().enemyHp;
  enemy.hp = enemy.maxHp = Math.max(enemy.hp, hp);
  enemy.speed = Math.max(enemy.speed, kind.speed);
  if (definition.ranged) {
    enemy.damage = Math.max(enemy.damage, weapon.damage * kind.damageMultiplier);
    enemy.shotCooldown = Math.min(definition.ranged.cooldown, weapon.cooldown);
  } else enemy.damage = Math.max(enemy.damage, (weapon.damage / weapon.cooldown) * kind.damageMultiplier);
}

export function createNormalEnemy(pos, enemyKey = 'raider') {
  return createConfiguredEnemy(pos, getDefinition('enemies', enemyKey) ? enemyKey : 'raider');
}

export function findNearestEnemyTent(origin) {
  let nearest = /** @type {{ x: number, y: number } | null} */ (null);
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

// Where a wave's enemy appears: the map's edge, or for the demons one of their portals
export function getWaveSpawnPos() {
  if (!getEnemyFaction().portalSpawns || game.enemyTents.length === 0) return getRandomBorderPos();
  const portal = game.enemyTents[Math.floor(rand() * game.enemyTents.length)];
  // a free tile beside the portal, never inside a tree, a rock or the water
  const g = getGridPos(portal.x, portal.y);
  const free = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dy) && !isTileBlockedForEnemyStrict(g.gx + dx, g.gy + dy)) free.push({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
    }
  }
  return free.length ? free[Math.floor(rand() * free.length)] : { x: portal.x, y: portal.y };
}

// How much the player's army scales a wave: 1 at army.base settlers, more for a bigger army
export function getWaveArmyFactor() {
  const army = GAME_CONFIG.waveScaling.army;
  const units = game.settlers.filter(s => s.temporary === undefined).length;
  return Math.max(army.min, Math.min(army.max, 1 + (units - army.base) * army.perUnit));
}

// Armour and a shield on a wave enemy, by chance, once the player has made them (GAME_CONFIG.enemyGear)
function dressForWave(enemy, def) {
  const gear = GAME_CONFIG.enemyGear;
  const chance = Math.min(gear.max, (game.waveNum - gear.fromWave + 1) * gear.perWave);
  if (chance <= 0) return;
  if (game.playerGear.armor && rand() < chance) {
    enemy.armor = 'iron';
    enemy.maxHp += GAME_CONFIG.gear.armor.hpBonus;
    enemy.hp = enemy.maxHp;
  }
  if (game.playerGear.shield && def.type === 'normal' && !def.ranged && !def.healer && !def.necromancer && rand() < chance) enemy.shield = true;
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
  // as many as tents would be, but always one to come out of
  if (getEnemyFaction().portalSpawns) {
    for (let i = 0; i < (game.enemyTents.length === 0 ? Math.max(1, tentCount) : tentCount); i++) openDemonPortal();
    invalidateAllPaths();
  }

  let normalEnemies = [];

  // squad size grows smoothly, wave by wave, growthPerDifficulty every wavesPerDifficulty waves (#232: it went
  // up in steps, x3 from wave 1 to 2 and x2 at wave 6), with the player's army; the first waves are lighter,
  // firstWave at wave 1 and rampPerWave more each wave after up to full
  const growth = 1 + (Math.max(0, game.waveNum - scaling.growFromWave) / scaling.wavesPerDifficulty) * scaling.growthPerDifficulty;
  const ramp = Math.min(1, scaling.firstWave + (game.waveNum - 1) * scaling.rampPerWave);
  const multiplier = growth * getWaveArmyFactor() * ramp;

  // a random base squad from the config
  const baseGroups = GAME_CONFIG.attackGroups || [];
  let group = null;

  if (baseGroups.length > 0) {
    const index = Math.floor(rand() * baseGroups.length);
    group = baseGroups[index];
  }

  let spawned = 0;
  // the demons' come out of their portals a few at a time (#250): queued, let out by tickPortalWave
  const queued = getEnemyFaction().portalSpawns;
  game.portalQueue = [];
  const spawnWaveEnemy = def => {
    if (queued) { game.portalQueue.push(def.id); spawned++; return; }
    const enemy = createConfiguredEnemy(getWaveSpawnPos(), def.id);
    if (!enemy) return;
    enemy.fromWave = true; // the wave the base deploys against (see isDefenseAlert)
    dressForWave(enemy, def);
    if (isNight() && rand() < GAME_CONFIG.daytime.enemyTorchShare) enemy.torch = true; // (a night wave, #257)
    game.enemies.push(enemy);
    spawned++;
    if (def.buildsTents) normalEnemies.push(enemy);
  };
  const waveKinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id));

  if (group) {
    // every enemy kind of the enemy's faction with a waveKey, in config order
    waveKinds.forEach(def => {
      const baseCount = /** @type {string[]} */ ([]).concat(def.waveKey).reduce((sum, key) => sum + Number(group[key] || 0), 0);
      // rounded at random, half an enemy under: on average as many as rounding down gave, but without the
      // small counts of a squad all jumping together once the multiplier passed 1 (#232)
      const exact = Math.max(0, baseCount * multiplier * getDifficulty().enemyCount * (def.waveScale || 1) - 0.5);
      const count = Math.floor(exact) + (rand() < exact - Math.floor(exact) ? 1 : 0);
      for (let i = 0; i < count; i++) spawnWaveEnemy(def);
    });
  }
  // never an empty wave: one of the first kind
  if (spawned === 0 && waveKinds.length) spawnWaveEnemy(waveKinds[0]);

  // portals (the demons) have opened by themselves already; tents need builders
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

  if (queued) { game.portalTimer = 0; tickPortalWave(0); } // (the first of them at once)
  game.waveSize = game.enemies.filter(en => en.fromWave).length + game.portalQueue.length; // (morale: a wave that's lost most of them runs)
  game.waveRouted = false;
  game.waveNum++;
}

// A wave's demons still to come out of the portals (#250): `batch` of them every `seconds`
export function tickPortalWave(dt) {
  if (!game.portalQueue || !game.portalQueue.length) return;
  game.portalTimer = (game.portalTimer || 0) - dt;
  if (game.portalTimer > 0) return;
  const c = GAME_CONFIG.portalWave;
  game.portalTimer = c.seconds;
  if (game.portalQueue.length) playSound('portal', game.enemyTents[0]); // (#252)
  for (const id of game.portalQueue.splice(0, c.batch)) {
    const enemy = createConfiguredEnemy(getWaveSpawnPos(), id);
    if (!enemy) continue;
    enemy.fromWave = true;
    dressForWave(enemy, GAME_CONFIG.enemies[id]);
    if (isNight() && rand() < GAME_CONFIG.daytime.enemyTorchShare) enemy.torch = true;
    game.enemies.push(enemy);
  }
}

// The wave timer: a warning 15 s before, then the wave
export function tickWaveTimer(dt) {
  const before = game.waveTimer;
  game.waveTimer -= dt;
  // one warning, 15 s before the wave (holds of the timer in tests keep it above)
  if (before > WAVE_WARNING_SECONDS && game.waveTimer <= WAVE_WARNING_SECONDS) {
    showNotification(t('wave.warning', { seconds: WAVE_WARNING_SECONDS }), true);
    someoneSays(game.settlers.filter(s => !s.asleep), getPlayerFaction().id, 'wave', true); // (#252)
  }
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

// What a fallen enemy drops (GAME_CONFIG.loot, #210, #232): for each thing it held, now and then the thing
// itself, more often part of what it costs; a pile on the ground the settlers pick up
export function dropLoot(en) {
  if (game.gameMode !== 'endless') return;
  const loot = GAME_CONFIG.loot;
  const held = [];
  if (en.weapon && en.weapon !== 'fist' && GAME_CONFIG.weapons[en.weapon]) held.push(['weapons', en.weapon]);
  if (en.armor === 'iron') held.push(['gear', 'armor']);
  if (en.shield) held.push(['gear', 'shield']);
  // the thing itself, each with itemChance, lying apart (#232: no more bundles of a share of their cost)
  held.forEach(([category, id], i) => {
    if (rand() >= loot.itemChance) return;
    const a = i * 2.1;
    game.loot.push({ x: en.x + Math.cos(a) * 8 * i, y: en.y + Math.sin(a) * 8 * i, hp: 1, maxHp: 1, priority: 0, yield: {}, items: [`${category}:${id}`] });
  });
}

// Dead enemies: their reward, a corpse, and off the list; a tent site its builder died at goes too
export function removeDeadEnemies() {
  game.enemies.forEach(en => {
    if (en.hp <= 0 && !en.fled && !en.deadNoted) { en.deadNoted = true; onUnitDeath(en, 'enemy'); }
    if (en.hp <= 0 && !en.rewardGranted) {
      en.rewardGranted = true;
      if (!en.crumbled) { grantEnemyReward(en); addCorpse(en, 'enemy', en.enemyKey); dropLoot(en); }
    }
  });
  game.enemies = game.enemies.filter(en => en.hp > 0);
  game.enemyTentBlueprints = game.enemyTentBlueprints.filter(site => game.enemies.includes(site.builder));
}
