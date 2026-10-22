// Waves: when they come, how big, what enemies they bring and where from, their tents, the difficulty

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, rand, townHall } from '../../../engine/world/index.js';
import { addResources } from '../../colony/storage/index.js';
import { isTileOccupied } from '../../economy/building/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { showNotification } from '../../../ui/index.js';
import { armorOf } from '../../colony/equipment/index.js';
import { getEnemyReach, invalidateAllPaths, isTileBlockedForEnemyStrict } from '../../../engine/movement/index.js';
import { addCorpse } from '../combat/index.js';
import { openDemonPortal } from '../../factions/demons/index.js';
import { getFrontier, getFrontierTiles, isNight, isOutskirts } from '../../world/index.js';
import { newLook, newPetLook, noteDay, someoneSays } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';
import { onUnitDeath } from '../morale/index.js';

export const WAVE_WARNING_SECONDS = 15;

export function getDifficulty() {
  return GAME_CONFIG.difficulty[game.gameDifficulty] || GAME_CONFIG.difficulty.normal;
}

export function getRandomBorderPos() {
  // (#299) the frontier's band (getFrontier): a default map's edge, a big map's some way past the base
  const f = getFrontierTiles();
  let side = Math.floor(rand() * 4);
  let gx = 0, gy = 0;
  const joined = getEnemyReach();
  const ok = (x, y) => !isTileBlockedForEnemyStrict(x, y) && joined[y * game.COLS + x] === 1;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (attempt) side = Math.floor(rand() * 4);
    if (side === 0) {
      gx = f.gx0 + Math.floor(rand() * (f.gx1 - f.gx0 + 1));
      gy = f.gy0 + Math.floor(rand() * BORDER_MARGIN);
    } else if (side === 1) {
      gx = f.gx0 + Math.floor(rand() * (f.gx1 - f.gx0 + 1));
      gy = f.gy1 - Math.floor(rand() * BORDER_MARGIN);
    } else if (side === 2) {
      gx = f.gx0 + Math.floor(rand() * BORDER_MARGIN);
      gy = f.gy0 + Math.floor(rand() * (f.gy1 - f.gy0 + 1));
    } else {
      gx = f.gx1 - Math.floor(rand() * BORDER_MARGIN);
      gy = f.gy0 + Math.floor(rand() * (f.gy1 - f.gy0 + 1));
    }
    // (out in the open on a big map, on land joined to the base: not inside a tree, rock or the sea; a map's
    // own edge is clear)
    if (ok(gx, gy)) return { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
  }
  // none found by chance (a frontier mostly sea): the band's tiles that will do, one of them
  const band = [];
  for (let y = f.gy0; y <= f.gy1; y++) for (let x = f.gx0; x <= f.gx1; x++) if (isOutskirts(x, y) && ok(x, y)) band.push({ x, y });
  // (a base on a narrow neck of land, the sea all along the frontier: the shore farthest out it's joined to)
  if (!band.length) {
    const hall = getGridPos(townHall.x, townHall.y);
    for (let y = f.gy0; y <= f.gy1; y++) for (let x = f.gx0; x <= f.gx1; x++) {
      if (!ok(x, y) || Math.hypot(x - hall.gx, y - hall.gy) < 16) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !joined[(y + dy) * game.COLS + x + dx])) band.push({ x, y });
    }
  }
  if (band.length) { const t = band[Math.floor(rand() * band.length)]; return { x: t.x * TILE_SIZE + 15, y: t.y * TILE_SIZE + 15 }; }
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
    look: definition.pet ? newPetLook(definition.pet) : newLook(), // (#306: a man or a woman, one of their looks; a pet's its own, #314)
    ghostly: definition.pet === 'ghost', // (#314: through everyone)
    type: type || definition.type, enemyKey, x: pos.x, y: pos.y, radius: radius || definition.radius,
    hp: definition.hp, maxHp: definition.hp,
    weapon: definition.weapon || 'sword', speed: definition.speed, damage: definition.damage,
    reward: { ...(definition.reward || {}) }, attackCooldown: 0,
    path: [], pathTarget: null, pathTimer: 0, buildTarget: null
  };
  asPlayerUnit(enemy, definition); // (every mode, #255)
  if (definition.quiver) {
    enemy.arrows = definition.quiver.arrows;
    game.enemyArrowStock += definition.quiver.tentStock;
  }
  return enemy;
}

// The player's own unit an enemy is: its faction's settler kind (a big one's the big kind, a pet's its
// own) and what it carries; a necromancer's staff comes with its trade
export function enemyPlayerUnit(definition) {
  const faction = enemyFactionOf(definition.id);
  const units = faction.units || ['normal', 'big'];
  const type = definition.pet || (definition.type === 'big' ? units[1] || units[0] : units[0]);
  const kind = GAME_CONFIG.settlerTypes[type] || GAME_CONFIG.settlerTypes.normal;
  return { faction: faction.id, type: kind.id, weapon: definition.weapon || 'fist', tool: definition.tool || (definition.necromancer ? 'necro_staff' : null) };
}

// What the player's own unit of an enemy's kind hits for: a hit, and seconds between hits (a pet's bite)
function unitHit(definition) {
  const unit = enemyPlayerUnit(definition);
  const kind = GAME_CONFIG.settlerTypes[unit.type];
  if (kind.bite) return { kind, hit: kind.bite.damage, cooldown: kind.bite.cooldown };
  if (kind.pet) return { kind, hit: 0, cooldown: 1 }; // (a ghost dives, it doesn't bite, #314)
  const weapon = getDefinition('weapons', unit.weapon) || GAME_CONFIG.weapons.fist;
  const tool = unit.tool ? getDefinition('tools', unit.tool) : null;
  const hit = (unit.weapon === 'fist' && tool && tool.combatDamage ? tool.combatDamage : weapon.combat.damage) * kind.damageMultiplier;
  return { kind, hit, cooldown: weapon.combat.cooldown };
}

// (#255) Every enemy is exactly the player's own unit of its kind: its kind's speed, the damage in a
// settler's hands (per second in melee, per arrow and how often for an archer); only the hp is the
// difficulty's. hitDamage is a hit's, the number a tile shows
function asPlayerUnit(enemy, definition) {
  const hpFactor = getDifficulty().enemyHp;
  const { kind, hit, cooldown } = unitHit(definition);
  enemy.hp = enemy.maxHp = kind.hp * hpFactor;
  enemy.speed = kind.speed;
  enemy.hitDamage = hit;
  if (definition.ranged) {
    enemy.damage = hit;
    enemy.shotCooldown = cooldown;
  } else enemy.damage = hit / cooldown;
}

// An enemy kind's melee damage a second as the player's own unit of its kind would deal (an archer out of
// arrows fights like its melee kind)
export function enemyDamagePerSecond(definition) {
  const { hit, cooldown } = unitHit(definition);
  return hit / cooldown;
}

// The faction an enemy kind is of (its list of enemies has it), else the enemy's
export function enemyFactionOf(id) {
  return Object.values(GAME_CONFIG.factions).find(f => (f.enemies || []).includes(id)) || getEnemyFaction();
}

// An enemy kind's hp and a hit's damage (an arrow's for an archer) as it would come now, with the
// difficulty (a battle's tiles show them, #255)
export function enemyStats(id) {
  const definition = getDefinition('enemies', id);
  const enemy = { hp: definition.hp, maxHp: definition.hp, speed: definition.speed, damage: definition.damage, weapon: definition.weapon || 'sword' };
  asPlayerUnit(enemy, definition);
  return { hp: Math.round(enemy.hp), damage: Math.round(enemy.hitDamage) };
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

    if (isOutskirts(gx, gy) && !occupied && Math.hypot(x - origin.x, y - origin.y) <= 150) {
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
  // (the best the player has made: iron, else leather, #298)
  const armour = game.playerGear.armor ? GAME_CONFIG.gear.armor : game.playerGear.leather ? GAME_CONFIG.gear.leather_armor : null;
  if (armour && rand() < chance) {
    enemy.armor = armour.armorKind;
    enemy.maxHp += armour.hpBonus;
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
    musterAt(enemy); // (it gathers first, #279)
    if (isNight() && rand() < GAME_CONFIG.daytime.enemyTorchShare) enemy.torch = true; // (a night wave, #257)
    game.enemies.push(enemy);
    spawned++;
    if (def.buildsTents) normalEnemies.push(enemy);
  };
  const waveKinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id) && (!def.fromWave || game.waveNum >= def.fromWave)); // (a pet from its wave on, #314)

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
  regroupBySide(); // (#279: those of a side gather together)
  pickCaptain(spawned);
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
    musterAt(enemy); // (#279)
    game.enemies.push(enemy);
  }
  pickCaptain(game.waveSize);
}

// (#279) a wave's enemy gathers first, a little in from where it came, for musterSeconds
function musterAt(enemy) {
  const m = GAME_CONFIG.waveMuster, d = Math.max(1, Math.hypot(townHall.x - enemy.x, townHall.y - enemy.y));
  enemy.musterUntil = game.pathTick + Math.round(m.musterSeconds * 60);
  enemy.muster = { x: enemy.x + (townHall.x - enemy.x) / d * TILE_SIZE * 1.5, y: enemy.y + (townHall.y - enemy.y) / d * TILE_SIZE * 1.5 };
}

// (#279) a wave's enemies that came in on the same side of the map gather together: at the middle of where
// they came in, a tile and a half in from the edge. (#298) Out of portals (the demons), by the portal each
// came out of: a tile and a half from it towards the base, not off to the map's edge
function regroupBySide() {
  const f = getFrontier(), W = f.x1, H = f.y1; // (#299: the frontier's sides, a default map's own)
  const portals = getEnemyFaction().portalSpawns ? game.enemyTents.filter(et => !et.outpost && et.hp > 0) : [];
  const nearestPortal = en => portals.reduce((best, p) => (!best || Math.hypot(p.x - en.x, p.y - en.y) < Math.hypot(best.x - en.x, best.y - en.y) ? p : best), null);
  const sideOf = en => portals.length ? `portal:${portals.indexOf(nearestPortal(en))}` : /** @type {[string, number][]} */ ([['left', en.x - f.x0], ['right', W - en.x], ['top', en.y - f.y0], ['bottom', H - en.y]]).sort((a, b) => a[1] - b[1])[0][0];
  const groups = {};
  for (const en of game.enemies) if (en.fromWave && en.musterUntil && !en.buildTarget) (groups[sideOf(en)] = groups[sideOf(en)] || []).push(en);
  for (const [side, group] of Object.entries(groups)) {
    const cx = group.reduce((sum, en) => sum + en.x, 0) / group.length, cy = group.reduce((sum, en) => sum + en.y, 0) / group.length;
    const inset = (BORDER_MARGIN + 1.5) * TILE_SIZE;
    const portal = side.startsWith('portal:') ? portals[Number(side.slice(7))] : null;
    const toHall = portal ? Math.max(1, Math.hypot(townHall.x - portal.x, townHall.y - portal.y)) : 1;
    const at = portal ? { x: portal.x + (townHall.x - portal.x) / toHall * TILE_SIZE * 1.5, y: portal.y + (townHall.y - portal.y) / toHall * TILE_SIZE * 1.5 }
      : side === 'left' ? { x: f.x0 + inset, y: cy } : side === 'right' ? { x: W - inset, y: cy } : side === 'top' ? { x: cx, y: f.y0 + inset } : { x: cx, y: H - inset };
    group.forEach((en, i) => { const a = i * 2.4; en.muster = { x: at.x + Math.cos(a) * 14 * Math.sqrt(i), y: at.y + Math.sin(a) * 14 * Math.sqrt(i) }; });
  }
}

// (#279) a wave big enough has a commander: one of its melee enemies (not big, not a healer), with a banner
function pickCaptain(size) {
  if (size < GAME_CONFIG.waveMuster.captainFrom || game.enemies.some(en => en.captain && en.hp > 0)) return;
  // (in the biggest group gathering, so it has its own about it; not one off building a tent)
  const pick = game.enemies.filter(en => en.fromWave && !en.buildTarget && en.type === 'normal' && !getEnemyDef(en).healer && !getEnemyDef(en).necromancer && !getEnemyDef(en).ranged)
    .map(en => ({ en, near: game.enemies.filter(o => o.muster && en.muster && Math.hypot(o.muster.x - en.muster.x, o.muster.y - en.muster.y) < 120).length }))
    .sort((a, b) => b.near - a.near)[0];
  if (pick) pick.en.captain = true;
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
  if (armorOf(en)) held.push(['gear', armorOf(en).id]);
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
    if (en.hp <= 0 && !en.fled && !en.deadNoted) { en.deadNoted = true; onUnitDeath(en, 'enemy'); noteDay(en.lastHitBy, 'kills', 'kill', 0.25); } // (its slayer's day, #279)
    if (en.hp <= 0 && !en.rewardGranted) {
      en.rewardGranted = true;
      if (!en.crumbled) { grantEnemyReward(en); addCorpse(en, 'enemy', en.enemyKey); dropLoot(en); }
    }
  });
  game.enemies = game.enemies.filter(en => en.hp > 0);
  game.enemyTentBlueprints = game.enemyTentBlueprints.filter(site => game.enemies.includes(site.builder));
}
