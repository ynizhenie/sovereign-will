// Waves: when they come, how big, what enemies they bring and where from, their tents, the difficulty

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, isBorderZone, rand, townHall } from '../../../engine/world/index.js';
import { addResources } from '../../colony/storage/index.js';
import { isTileOccupied } from '../../economy/building/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { showNotification } from '../../../ui/index.js';
import { armorOf, isRangedWeapon } from '../../colony/equipment/index.js';
import { getEnemyReach, invalidateAllPaths, isTileBlockedForEnemyStrict, moveEntityTowards } from '../../../engine/movement/index.js';
import { addCorpse, getBaseRadius } from '../combat/index.js';
import { openDemonPortal, openDemonPortalAt } from '../../factions/demons/index.js';
import { getFrontier, getFrontierTiles, getTerritoryBox, hasTerritory, inEnemyTerritory, inTerritory, isNight, isOutskirts } from '../../world/index.js';
import { generateUnitName, newLook, newPetLook, noteDay, someoneSays } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';
import { onUnitDeath } from '../morale/index.js';
import { markEnemyKillForPlague } from '../../../modes/plague/index.js';

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

function getRaftLandingSlots(at, units, joined) {
  const centre = getGridPos(at.x, at.y), candidates = [];
  const radius = 4;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const gx = centre.gx + dx, gy = centre.gy + dy;
    if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS ||
        joined[gy * game.COLS + gx] !== 1 || isTileBlockedForEnemyStrict(gx, gy)) continue;
    candidates.push({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
  }
  candidates.sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));

  const assigned = new Map(), occupied = game.enemies.filter(enemy => enemy.hp > 0);
  for (const unit of [...units].sort((a, b) => b.radius - a.radius)) {
    const spot = candidates.find(candidate =>
      !occupied.some(enemy => Math.hypot(enemy.x - candidate.x, enemy.y - candidate.y) < enemy.radius + unit.radius + 2) &&
      [...assigned].every(([other, point]) =>
        Math.hypot(point.x - candidate.x, point.y - candidate.y) >= other.radius + unit.radius + 2));
    if (!spot) return null;
    assigned.set(unit, spot);
  }
  return units.map(unit => assigned.get(unit));
}

function getRaftLandingPos(units, joined = getEnemyReach()) {
  const landings = [];
  const maxDepth = Math.ceil(Math.min(game.COLS, game.ROWS) / 2);
  for (let depth = 0; depth < maxDepth && !landings.length; depth++) {
    for (let gy = depth; gy < game.ROWS - depth; gy++) for (let gx = depth; gx < game.COLS - depth; gx++) {
      if (gx !== depth && gx !== game.COLS - 1 - depth &&
          gy !== depth && gy !== game.ROWS - 1 - depth) continue;
      if (isTileBlockedForEnemyStrict(gx, gy) || joined[gy * game.COLS + gx] !== 1) continue;
      const edges = [
        { distance: gx, side: 'west', dx: 1, dy: 0 },
        { distance: game.COLS - 1 - gx, side: 'east', dx: -1, dy: 0 },
        { distance: gy, side: 'north', dx: 0, dy: 1 },
        { distance: game.ROWS - 1 - gy, side: 'south', dx: 0, dy: -1 }
      ];
      const nearest = Math.min(...edges.map(edge => edge.distance));
      for (const edge of edges.filter(candidate => candidate.distance === nearest)) {
        const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
        const slots = getRaftLandingSlots({ x, y }, units, joined);
        if (slots) landings.push({ x, y, ...edge, slots });
      }
    }
  }
  if (!landings.length) {
    const at = getRandomBorderPos();
    const slots = getRaftLandingSlots(at, units, joined);
    if (!slots) throw new Error('No safe landing area available for an enemy raft');
    const edges = [
      { distance: at.x, side: 'west', dx: 1, dy: 0 },
      { distance: game.WORLD_WIDTH - at.x, side: 'east', dx: -1, dy: 0 },
      { distance: at.y, side: 'north', dx: 0, dy: 1 },
      { distance: game.WORLD_HEIGHT - at.y, side: 'south', dx: 0, dy: -1 }
    ].sort((a, b) => a.distance - b.distance);
    return { x: at.x, y: at.y, ...edges[0], slots };
  }
  const landing = landings[Math.floor(rand() * landings.length)];
  return {
    x: landing.x,
    y: landing.y,
    side: landing.side,
    dx: landing.dx,
    dy: landing.dy,
    slots: landing.slots
  };
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
  const look = definition.pet ? newPetLook(definition.pet) : newLook();
  const enemy = {
    look, // (#306: a man or a woman, one of their looks; a pet's its own, #314)
    name: generateUnitName(enemyFactionOf(definition.id).id, look.female, game.enemies, definition.pet || null),
    ghostly: definition.pet === 'ghost', // (#314: through everyone)
    type: type || definition.type, enemyKey, x: pos.x, y: pos.y, radius: radius || definition.radius, bigBody: !!definition.big,
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
  if (definition.healer) {
    enemy.herbs = definition.healer.bagSize;
    if (game.gameMode !== 'battle') game.enemyHerbStock += definition.healer.tentStock;
  }
  return enemy;
}

// The player's own unit an enemy is: its faction's settler kind (a big one's the big kind, a pet's its
// own) and what it carries; a necromancer's staff comes with its trade
export function enemyPlayerUnit(definition) {
  const faction = enemyFactionOf(definition.id);
  const units = faction.units || ['normal', 'big'];
  const type = definition.pet || (definition.type === 'big' || definition.big ? units[1] || units[0] : units[0]);
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

// Structures are hit once per weapon cooldown, like they are by the player's units. Ranged units use
// their dagger rather than arrows against a building.
export function enemyBuildingAttack(definition) {
  const unit = enemyPlayerUnit(definition);
  const kind = GAME_CONFIG.settlerTypes[unit.type] || GAME_CONFIG.settlerTypes.normal;
  if (kind.bite) return { damage: kind.bite.damage, cooldown: kind.bite.cooldown };
  const weapon = getDefinition('weapons', unit.weapon) || GAME_CONFIG.weapons.fist;
  const stats = definition.ranged ? weapon.dagger : weapon.combat;
  if (!stats) return { damage: 0, cooldown: 1 };
  const tool = unit.tool ? getDefinition('tools', unit.tool) : null;
  const damage = unit.weapon === 'fist' && tool && tool.combatDamage != null ? tool.combatDamage : stats.damage;
  return { damage: damage * kind.damageMultiplier, cooldown: stats.cooldown };
}

// (#255) Every enemy is exactly the player's own unit of its kind: its kind's speed, the damage in a
// settler's hands (per second in melee, per arrow and how often for an archer); only the hp is the
// difficulty's. hitDamage is a hit's, the number a tile shows
function asPlayerUnit(enemy, definition) {
  const hpFactor = getDifficulty().enemyHp;
  const { kind, hit, cooldown } = unitHit(definition);
  enemy.hp = enemy.maxHp = kind.hp * hpFactor;
  enemy.speed = kind.speed;
  enemy.visualRadius = kind.visualRadius; // (drawn and lying as the player's own of its kind, #314)
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

// (#326) Seconds between an enemy kind's blows, as the player's own unit of its kind strikes
export function enemyHitCooldown(definition) {
  return unitHit(definition).cooldown;
}

// The faction an enemy kind is of (its own `faction`, or its list of enemies has it), else the enemy's
export function enemyFactionOf(id) {
  const own = (getDefinition('enemies', id) || {}).faction;
  return (own && GAME_CONFIG.factions[own]) || Object.values(GAME_CONFIG.factions).find(f => (f.enemies || []).includes(id)) || getEnemyFaction();
}

// (#326) A preset (GAME_CONFIG.unitPresets) as a faction's unit: its settler kind by the preset's size, what it
// holds; null if the faction hasn't that kind or may not have the tool (a medic's bag isn't the undead's)
export function presetUnit(factionId, preset) {
  const faction = GAME_CONFIG.factions[factionId];
  const type = (faction.units || ['normal', 'big'])[{ normal: 0, big: 1, pet: 2 }[preset.size]];
  const tool = preset.tool ? getDefinition('tools', preset.tool) : null;
  if (!type || (tool && tool.factions && !tool.factions.includes(factionId))) return null;
  return { faction: factionId, type, weapon: preset.weapon, tool: preset.tool || null };
}

// (#326) The enemy kind that is a faction's preset: one of its own enemies that's that very unit, else one made
// for it (once, into GAME_CONFIG.enemies) like the nearest of them: an archer like its archer, a medic like the
// humans' healer, a big one like its big one, any other like its swordsman, holding the preset's weapon. A made
// one has no waveKey: scouts and raid defenders don't use it as their template
export function presetEnemyKey(factionId, presetId) {
  const preset = GAME_CONFIG.unitPresets.find(p => p.id === presetId);
  const unit = preset && presetUnit(factionId, preset);
  if (!unit) return null;
  const faction = GAME_CONFIG.factions[factionId];
  const own = (faction.enemies || []).map(id => GAME_CONFIG.enemies[id]).filter(Boolean);
  const same = own.find(def => { const u = enemyPlayerUnit(def); return u.type === unit.type && u.weapon === unit.weapon && (u.tool || null) === unit.tool; });
  if (same) return same.id;
  const key = `${factionId}_${presetId}`;
  if (GAME_CONFIG.enemies[key]) return key;
  const melee = def => !def.pet && !def.ranged && !def.healer && !def.necromancer;
  // (27.10, 32) an archer, a medic or a necromancer behaves as its trade's, a big one of them in a big body
  const trade = unit.tool === 'medbag' ? GAME_CONFIG.enemies.raider_medic
    : unit.tool === 'necro_staff' ? own.find(def => def.necromancer) || GAME_CONFIG.enemies.undead_necromancer
    : isRangedWeapon(unit.weapon) ? own.find(def => def.ranged) : null;
  const bigOne = own.find(def => def.type === 'big');
  const template = trade || (preset.size === 'big' ? bigOne
    : own.find(def => melee(def) && def.type === 'normal' && def.weapon === 'sword') || own.find(def => melee(def) && def.type === 'normal'));
  if (!template) return null;
  const body = trade && preset.size === 'big' && bigOne ? { big: true, radius: bigOne.radius } : {};
  const weapon = getDefinition('weapons', unit.weapon);
  const reach = preset.size === 'normal' && weapon.combat.range ? Math.max(6, weapon.combat.range - 30) : template.reach;
  // (#326) a crossbow's own shot, not the archer template's bow: farther, harder, slower to load
  const ranged = unit.weapon === 'crossbow'
    ? { range: weapon.combat.approach, keepAway: Math.round(weapon.combat.approach * 0.85), cooldown: weapon.combat.cooldown, arrowSpeed: weapon.combat.projectileSpeed, arrowLife: weapon.combat.projectileLife }
    : undefined;
  GAME_CONFIG.enemies[key] = { ...template, ...body, id: key, faction: factionId, weapon: unit.weapon, tool: unit.tool || undefined, reach, waveKey: undefined, buildsTents: false, ...(ranged ? { ranged } : {}) };
  return key;
}

// The preset's weapon or trade is weighted independently; its chance changes smoothly between its unlock and
// the end of the ramp. Human and demon fist presets are never part of a wave.
export function getWavePresetWeight(preset, wave = game.waveNum, factionId = getEnemyFaction().id) {
  if (preset.size !== 'pet' && preset.weapon === 'fist' && !preset.tool && factionId !== 'undead') return 0;
  if (preset.size === 'pet') {
    const pet = GAME_CONFIG.wavePresets.pet;
    if (wave < pet.fromWave) return 0;
    const progress = Math.min(1, Math.max(0, (wave - pet.fromWave) / GAME_CONFIG.wavePresets.rampWaves));
    return pet.startWeight + (pet.endWeight - pet.startWeight) * progress;
  }
  const item = preset.tool === 'medbag' ? 'medic' : preset.tool === 'necro_staff' ? 'necromancer' : preset.weapon;
  const rule = GAME_CONFIG.wavePresets.items[item];
  if (!rule || wave < rule.fromWave) return 0;
  const progress = Math.min(1, Math.max(0, (wave - rule.fromWave) / GAME_CONFIG.wavePresets.rampWaves));
  let weight = rule.startWeight + (rule.endWeight - rule.startWeight) * progress;
  if (preset.size !== 'normal') {
    const size = GAME_CONFIG.wavePresets[preset.size];
    if (!size || wave < size.fromWave) return 0;
    const sizeProgress = Math.min(1, Math.max(0, (wave - size.fromWave) / GAME_CONFIG.wavePresets.rampWaves));
    weight *= size.startWeight + (size.endWeight - size.startWeight) * sizeProgress;
  }
  return weight;
}

export function getWavePresetPool(factionId = getEnemyFaction().id, wave = game.waveNum) {
  return GAME_CONFIG.unitPresets.flatMap(preset => {
    const unit = presetUnit(factionId, preset);
    const weight = getWavePresetWeight(preset, wave, factionId);
    if (!unit || weight <= 0) return [];
    const enemyKey = presetEnemyKey(factionId, preset.id);
    return enemyKey ? [{ preset, enemyKey, weight }] : [];
  });
}

export function getWavePresetGroupSize(factionId, preset) {
  return factionId === 'undead' && preset.size !== 'pet' && preset.weapon === 'fist' && !preset.tool ? 2 : 1;
}

function pickWavePreset(pool) {
  const total = pool.reduce((sum, option) => sum + option.weight, 0);
  let roll = rand() * total;
  for (const option of pool) {
    roll -= option.weight;
    if (roll < 0) return option;
  }
  return pool[pool.length - 1] || null;
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
  game.enemyTents.filter(tent => !tent.campStructure || (game.raidActive && tent.campId === game.raidCampId)).forEach(tent => {
    const dist = Math.hypot(tent.x - origin.x, tent.y - origin.y);
    if (dist < nearestDist) { nearest = tent; nearestDist = dist; }
  });
  return nearest;
}

export function grantEnemyReward(enemy) {
  addResources(enemy.reward);
}

/** @returns {{ x: number, y: number, progress: number, maxProgress: number, builder: import('../../../engine/world/types.js').Enemy | null, waveActive?: boolean } | null} */
export function getNearbyEnemyTentSite(origin) {
  const rally = origin.muster || origin;
  const camps = game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
  const centre = getGridPos(rally.x, rally.y), radius = 32;
  const territory = hasTerritory();
  const nearTerritory = new Uint8Array(game.COLS * game.ROWS);
  if (territory) {
    const minX = Math.max(0, centre.gx - radius - 3), maxX = Math.min(game.COLS - 1, centre.gx + radius + 3);
    const minY = Math.max(0, centre.gy - radius - 3), maxY = Math.min(game.ROWS - 1, centre.gy + radius + 3);
    for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
      if (inTerritory(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15)) nearTerritory[gy * game.COLS + gx] = 1;
    }
  }
  const reserved = new Set(game.enemies.map(enemy => enemy.tentBuildTarget)
    .filter(Boolean).map(site => `${site.x},${site.y}`));
  const territoryNear = (gx, gy) => {
    for (let territoryY = Math.max(0, gy - 3); territoryY <= Math.min(game.ROWS - 1, gy + 3); territoryY++) {
      for (let territoryX = Math.max(0, gx - 3); territoryX <= Math.min(game.COLS - 1, gx + 3); territoryX++) {
        if (nearTerritory[territoryY * game.COLS + territoryX]) return true;
      }
    }
    return false;
  };
  let best = null, bestDistance = Infinity;
  for (let gy = Math.max(0, centre.gy - radius); gy <= Math.min(game.ROWS - 1, centre.gy + radius); gy++) {
    for (let gx = Math.max(0, centre.gx - radius); gx <= Math.min(game.COLS - 1, centre.gx + radius); gx++) {
      if (Math.hypot(gx - centre.gx, gy - centre.gy) > radius || isBorderZone(gx, gy)) continue;
      const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15, key = `${x},${y}`;
      if (reserved.has(key) || game.enemyTentBlueprints.some(site => site.x === x && site.y === y) ||
          game.enemyTents.some(tent => tent.x === x && tent.y === y) || isTileOccupied(x, y) ||
          (territory && inTerritory(x, y)) || inEnemyTerritory(x, y)) continue;
      const nearPlayer = territory && territoryNear(gx, gy);
      if (camps.length ? !nearPlayer : nearPlayer) continue;
      if (camps.some(camp => Math.hypot(x - camp.x, y - camp.y) <
        (camp.radius || GAME_CONFIG.raid.campRadiusTiles) * TILE_SIZE + TILE_SIZE)) continue;
      const distance = Math.hypot(x - rally.x, y - rally.y) +
        Math.hypot(x - townHall.x, y - townHall.y) * 0.05;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return best ? { ...best, progress: 0, maxProgress: GAME_CONFIG.enemyTents.buildWork, builder: null } : null;
}

// Where a wave's enemy appears: the map's edge, or for the demons one of their portals
/** @param {{ x: number, y: number } | null} [sourcePortal] */
export function getWaveSpawnPos(sourcePortal = null) {
  const portals = sourcePortal ? [sourcePortal] : game.enemyTents.filter(tent => tent.portal && !tent.campStructure);
  if (getEnemyFaction().portalSpawns && portals.length > 0) {
    const portal = portals[Math.floor(rand() * portals.length)];
    const g = getGridPos(portal.x, portal.y);
    const free = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if ((dx || dy) && !isTileBlockedForEnemyStrict(g.gx + dx, g.gy + dy)) free.push({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
      }
    }
    return free.length ? free[Math.floor(rand() * free.length)] : { x: portal.x, y: portal.y };
  }

  const camps = game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
  if (camps.length) {
    const camp = camps.reduce((nearest, current) =>
      Math.hypot(current.x - townHall.x, current.y - townHall.y) <
        Math.hypot(nearest.x - townHall.x, nearest.y - townHall.y) ? current : nearest);
    const centre = getGridPos(camp.x, camp.y);
    const radius = camp.radius || GAME_CONFIG.raid.campRadiusTiles, toHall = Math.atan2(townHall.y - camp.y, townHall.x - camp.x);
    const candidates = [];
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.hypot(dx, dy) < Math.max(1, radius - 1)) continue;
      const gx = centre.gx + dx, gy = centre.gy + dy;
      const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
      if (!isTileBlockedForEnemyStrict(gx, gy) && !inTerritory(x, y)) {
        const awayFromHall = -(Math.cos(toHall) * dx + Math.sin(toHall) * dy);
        candidates.push({ x, y, awayFromHall });
      }
    }
    candidates.sort((a, b) => b.awayFromHall - a.awayFromHall);
    const nearSide = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.35)));
    if (nearSide.length) return nearSide[Math.floor(rand() * nearSide.length)];
  }
  return getRandomBorderPos();
}

// How much the player's army scales a wave: 1 at army.base settlers, more for a bigger army
export function getWaveArmyFactor() {
  const army = GAME_CONFIG.waveScaling.army;
  const units = game.settlers.filter(s => s.temporary === undefined).length;
  return Math.max(army.min, Math.min(army.max, 1 + (units - army.base) * army.perUnit));
}

const PLAYER_DEVELOPMENT_ITEMS = new Set([
  'weapons:spear', 'weapons:bow', 'weapons:iron_sword', 'weapons:iron_spear', 'weapons:crossbow',
  'tools:medbag', 'tools:necro_staff',
  'gear:leather_armor', 'gear:shield', 'gear:helmet', 'gear:armor',
  'buildings:workshop', 'buildings:smelter', 'buildings:smithy', 'buildings:mine', 'buildings:watchtower'
]);

// Combat gear the player has unlocked, made, stored, equipped, or built is a lightweight development signal.
function getPlayerDevelopmentItems() {
  const items = new Set();
  for (const [key, count] of Object.entries(game.armory)) if (count > 0) items.add(key);
  for (const [key, unlocked] of Object.entries(game.unlocked)) if (unlocked) items.add(key);
  for (const settler of game.settlers) {
    if (settler.weapon && settler.weapon !== 'fist') items.add(`weapons:${settler.weapon}`);
    if (settler.tool) items.add(`tools:${settler.tool}`);
    if (settler.armor) items.add(`gear:${settler.armor === 'iron' ? 'armor' : 'leather_armor'}`);
    if (settler.shield) items.add('gear:shield');
    if (settler.helmet) items.add('gear:helmet');
  }
  for (const building of game.buildings) if (building.side !== 'red') items.add(`buildings:${building.type}`);
  if (game.playerGear.leather) items.add('gear:leather_armor');
  for (const id of ['armor', 'shield', 'helmet']) if (game.playerGear[id]) items.add(`gear:${id}`);
  return items;
}

export function getPlayerDevelopment() {
  return Math.min(GAME_CONFIG.waveScaling.maxTechItems,
    [...getPlayerDevelopmentItems()].filter(key => PLAYER_DEVELOPMENT_ITEMS.has(key)).length);
}

export function getWaveEnemyCount(wave = game.waveNum) {
  const scaling = GAME_CONFIG.waveScaling;
  if (wave <= 1) return Math.max(scaling.minimum, scaling.firstWave);
  const base = scaling.minimum + (wave - 1) * scaling.perWave;
  const exact = base * getWaveArmyFactor() *
    (1 + getPlayerDevelopment() * scaling.techPerItem) * getDifficulty().enemyCount;
  const whole = Math.floor(exact);
  return Math.max(scaling.minimum, whole + (rand() < exact - whole ? 1 : 0));
}

export function getWaveGearChance(item, wave = game.waveNum) {
  const rule = GAME_CONFIG.waveGear[item];
  const development = getPlayerDevelopmentItems();
  const gear = item === 'leather' ? ['gear:leather_armor', 'gear:armor']
    : [`gear:${item === 'iron' ? 'armor' : item}`];
  if (!rule || wave < rule.fromWave || !gear.some(key => development.has(key))) return 0;
  const progress = Math.min(1, Math.max(0, (wave - rule.fromWave) / GAME_CONFIG.waveGear.rampWaves));
  return rule.startChance + (rule.endChance - rule.startChance) * progress;
}

// Armour, a shield and a helmet become more common as the enemy faction develops.
export function dressForWave(enemy, def, wave = game.waveNum) {
  if (def.pet) return; // (a pet wears nothing, #326)
  if (!enemy.armor) {
    const ironChance = getWaveGearChance('iron', wave), leatherChance = getWaveGearChance('leather', wave);
    const armourRoll = rand();
    const armour = armourRoll < ironChance ? GAME_CONFIG.gear.armor
      : armourRoll < ironChance + leatherChance ? GAME_CONFIG.gear.leather_armor : null;
    if (armour) {
      enemy.armor = armour.armorKind;
      enemy.maxHp += armour.hpBonus;
      enemy.hp = enemy.maxHp;
    }
  }
  if (!enemy.shield && !def.ranged && !def.healer && !def.necromancer && rand() < getWaveGearChance('shield', wave)) enemy.shield = true;
  if (!enemy.helmet && rand() < getWaveGearChance('helmet', wave)) enemy.helmet = true;
}

export function startNextWave(preparing = false) {
  if (!preparing && game.gameMode === 'endless') playSound('horn');
  const scaling = GAME_CONFIG.waveScaling;
  if (!preparing) activateEnemyTents();

  // difficulty goes up every wavesPerDifficulty waves (starting at 0)
  const difficulty = Math.floor((game.waveNum - 1) / scaling.wavesPerDifficulty);

  const maxTentsByDifficulty = Math.min(scaling.maxTents, difficulty + 1);
  const activeTents = game.enemyTents.filter(tent => !tent.campStructure);
  let tentCount = Math.min(
    Math.max(0, maxTentsByDifficulty - activeTents.length - game.enemyTentBlueprints.length),
    scaling.newTents.min + Math.floor(rand() * (scaling.newTents.max - scaling.newTents.min + 1))
  );

  /** @type {ReturnType<typeof openDemonPortal>} */
  let prepPortal = null;
  const camps = game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
  // A demon wave waits at a portal in its camp, then crosses to a portal at the colony's edge.
  if (getEnemyFaction().portalSpawns) {
    if (preparing) {
      const camp = camps.length ? camps.reduce((nearest, current) =>
        Math.hypot(current.x - townHall.x, current.y - townHall.y) <
          Math.hypot(nearest.x - townHall.x, nearest.y - townHall.y) ? current : nearest) : null;
      prepPortal = openDemonPortal(camp);
      if (!prepPortal) throw new Error('No safe tile available for the demon wave portal');
      prepPortal.wavePortal = true;
      if (game.wavePreparation) game.wavePreparation.portalSource = prepPortal;
    } else {
      for (let i = 0; i < (activeTents.length === 0 ? Math.max(1, tentCount) : tentCount); i++) openDemonPortal();
    }
    invalidateAllPaths();
  }

  let normalEnemies = [];
  const factionId = getEnemyFaction().id;
  const presets = getWavePresetPool(factionId);
  let spawned = 0;
  // the demons' come out of their portals a few at a time (#250): queued, let out by tickPortalWave
  const queued = getEnemyFaction().portalSpawns && !preparing;
  game.portalQueue = [];
  const raftUnits = [];
  const spawnWaveEnemy = def => {
    if (queued) { game.portalQueue.push(def.id); spawned++; return; }
    const enemy = createConfiguredEnemy(getWaveSpawnPos(prepPortal), def.id);
    if (!enemy) return;
    enemy.fromWave = true; // the wave the base deploys against (see isDefenseAlert)
    if (preparing) enemy.prepWave = game.wavePreparation?.wave ?? game.waveNum;
    dressForWave(enemy, def);
    if (isNight() && rand() < GAME_CONFIG.daytime.enemyTorchShare) enemy.torch = true; // (a night wave, #257)
    musterAt(enemy);
    if (!game.enemyCamps?.length && !game.enemyCamp && !queued && !prepPortal) raftUnits.push(enemy);
    else game.enemies.push(enemy);
    spawned++;
    if (def.buildsTents) normalEnemies.push(enemy);
  };
  const count = getWaveEnemyCount();
  for (let i = 0; i < count && presets.length; i++) {
    const picked = pickWavePreset(presets);
    const def = picked && GAME_CONFIG.enemies[picked.enemyKey];
    if (def) {
      for (let member = 0; member < getWavePresetGroupSize(factionId, picked.preset); member++) spawnWaveEnemy(def);
    }
  }

  if (raftUnits.length) createEnemyRafts(raftUnits);
  regroupBySide(); // (#279: builders place wave tents near the same rally point as their wave)

  // portals (the demons) have opened by themselves already; tents need builders
  if (getEnemyFaction().portalSpawns) normalEnemies = [];
  if (!getEnemyFaction().portalSpawns) {
    // A raft wave may roll a preset mix with no explicitly marked tent-builder. Give one normal
    // unit the builder role as well, so every human/undead wave can actually establish its tent or grave.
    if (!normalEnemies.length) {
      normalEnemies = game.enemyRafts.flatMap(raft => raft.units).filter(enemy =>
        !getEnemyDef(enemy).pet && enemy.type === 'normal').slice(0, 1);
    }
    if (!normalEnemies.length) {
      normalEnemies = game.enemies.filter(enemy =>
        enemy.fromWave && !getEnemyDef(enemy).pet && enemy.type === 'normal').slice(0, 1);
    }
    tentCount = Math.min(tentCount, normalEnemies.length);

    for (let t = 0; t < tentCount; t++) {
      let builder = normalEnemies[t];
      builder.waveTentBuilder = true;
      let site = getNearbyEnemyTentSite(builder);

      if (site) {
        site.builder = builder;
        site.waveActive = true;
        builder.tentBuildTarget = site;
      }
    }
  }

  if (queued) {
    game.portalWavePrep = preparing ? game.wavePreparation?.wave ?? game.waveNum : null;
    game.portalTimer = 0;
    tickPortalWave(0); // (the first of them at once)
  }
  pickCaptain(spawned);
  game.waveSize = countLiveWaveEnemies() + game.portalQueue.length; // (morale: a wave that's lost most of them runs)
  game.waveRouted = false;
  if (!preparing) game.waveNum++;
}

function activateEnemyTents() {
  for (const tent of game.enemyTents) {
    if (tent.campStructure) continue;
    tent.waveActive = true;
    tent.summonTimer = 0;
    tent.summonsLeft = GAME_CONFIG.enemyTents.summonsPerWave;
    tent.summonWave = game.waveNum;
  }
}

function countLiveWaveEnemies() {
  return game.enemies.filter(enemy => enemy.fromWave).length +
    game.enemyRafts.reduce((sum, raft) => sum + raft.units.length, 0);
}

function createEnemyRafts(units) {
  const capacity = GAME_CONFIG.waveMuster.raftCapacity;
  const joined = getEnemyReach();
  for (let i = 0; i < units.length; i += capacity) {
    const group = units.slice(i, i + capacity);
    const { x, y, side, dx, dy, slots } = getRaftLandingPos(group, joined);
    const clearance = TILE_SIZE * 3;
    const startX = side === 'west' ? -clearance : side === 'east' ? game.WORLD_WIDTH + clearance : x;
    const startY = side === 'north' ? -clearance : side === 'south' ? game.WORLD_HEIGHT + clearance : y;
    const distance = Math.hypot(x - startX, y - startY);
    const travelX = (x - startX) / distance, travelY = (y - startY) / distance;
    const arrivalWindow = GAME_CONFIG.waveMuster.preparationSeconds -
      GAME_CONFIG.waveMuster.departureSeconds - 1;
    group.forEach(enemy => { enemy.waveArrivalSide = side; });
    game.enemyRafts.push({
      x: startX, y: startY,
      targetX: x, targetY: y, dx: travelX || dx, dy: travelY || dy,
      speed: Math.max(GAME_CONFIG.waveMuster.raftSpeed, distance / arrivalWindow),
      departX: startX, departY: startY,
      arrivalSide: side, phase: 'arriving', units: group, landingSlots: slots
    });
  }
}

export function tickEnemyRafts(dt) {
  for (let i = game.enemyRafts.length - 1; i >= 0; i--) {
    const raft = game.enemyRafts[i];
    if (!raft.phase) raft.phase = 'arriving';
    const distance = Math.hypot(raft.targetX - raft.x, raft.targetY - raft.y);
    const step = (raft.speed || GAME_CONFIG.waveMuster.raftSpeed) * dt;
    if (distance > step) {
      raft.x += (raft.targetX - raft.x) / distance * step;
      raft.y += (raft.targetY - raft.y) / distance * step;
      continue;
    }
    raft.x = raft.targetX;
    raft.y = raft.targetY;
    if (raft.phase === 'arriving') {
      for (const [index, enemy] of raft.units.entries()) {
        const slot = raft.landingSlots?.[index];
        if (!slot) throw new Error('An enemy raft reached shore without a safe disembarkation tile');
        enemy.x = slot.x;
        enemy.y = slot.y;
        game.enemies.push(enemy);
      }
      raft.units = [];
      raft.phase = 'departing';
      raft.targetX = raft.departX ?? raft.x - raft.dx * TILE_SIZE * 3;
      raft.targetY = raft.departY ?? raft.y - raft.dy * TILE_SIZE * 3;
      const departureDistance = Math.hypot(raft.targetX - raft.x, raft.targetY - raft.y);
      raft.dx = (raft.targetX - raft.x) / departureDistance;
      raft.dy = (raft.targetY - raft.y) / departureDistance;
    } else {
      game.enemyRafts.splice(i, 1);
    }
  }
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
    if (game.wavePreparation && game.portalWavePrep === game.wavePreparation.wave) enemy.prepWave = game.wavePreparation.wave;
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

function keepWaveMusterBeyondTerritory(point) {
  if (!hasTerritory()) return point;
  const nearPlayerTerritory = (x, y) => {
    const gx = Math.floor(x / TILE_SIZE), gy = Math.floor(y / TILE_SIZE);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tileX = gx + dx, tileY = gy + dy;
      if (tileX >= 0 && tileY >= 0 && tileX < game.COLS && tileY < game.ROWS &&
        inTerritory(tileX * TILE_SIZE + 15, tileY * TILE_SIZE + 15)) return true;
    }
    return false;
  };
  if (!nearPlayerTerritory(point.x, point.y)) return point;
  const length = Math.max(1, Math.hypot(point.x - townHall.x, point.y - townHall.y));
  const dx = (point.x - townHall.x) / length, dy = (point.y - townHall.y) / length;
  for (let tiles = 3; tiles <= 12; tiles++) {
    const outside = { x: point.x + dx * TILE_SIZE * (tiles - 2), y: point.y + dy * TILE_SIZE * (tiles - 2) };
    if (!nearPlayerTerritory(outside.x, outside.y)) return outside;
  }
  return point;
}

// (#279) a wave's enemies that came in on the same side of the map gather together: at the middle of where
// they came in, a tile and a half in from the edge. (#298) Out of portals (the demons), by the portal each
// came out of: a tile and a half from it towards the base, not off to the map's edge
function regroupBySide() {
  const camps = game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
  const waveUnits = game.enemies.concat(game.enemyRafts.flatMap(raft => raft.units));
  if (camps.length && !getEnemyFaction().portalSpawns) {
    const camp = camps.reduce((nearest, current) =>
      Math.hypot(current.x - townHall.x, current.y - townHall.y) <
        Math.hypot(nearest.x - townHall.x, nearest.y - townHall.y) ? current : nearest);
    const radius = ((camp.radius || GAME_CONFIG.raid.campRadiusTiles) + 2.5) * TILE_SIZE;
    const awayFromHall = Math.atan2(camp.y - townHall.y, camp.x - townHall.x);
    const group = waveUnits.filter(en => en.fromWave && en.musterUntil && !en.buildTarget && !en.tentBuildTarget &&
      (!game.wavePreparation || en.prepWave === game.wavePreparation.wave));
    group.forEach((en, i) => {
      const angle = awayFromHall + (i - (group.length - 1) / 2) * 0.18;
      const point = { x: camp.x + Math.cos(angle) * radius, y: camp.y + Math.sin(angle) * radius };
      en.muster = keepWaveMusterBeyondTerritory(point);
      en.musterRoute = getTerritoryBypassRoute(en, en.muster) || [];
    });
    return;
  }
  const f = getFrontier(), W = f.x1, H = f.y1; // (#299: the frontier's sides, a default map's own)
  const portals = getEnemyFaction().portalSpawns ? game.enemyTents.filter(et => et.portal && (!et.campStructure || et.wavePortal) && et.hp > 0) : [];
  const nearestPortal = en => portals.reduce((best, p) => (!best || Math.hypot(p.x - en.x, p.y - en.y) < Math.hypot(best.x - en.x, best.y - en.y) ? p : best), null);
  const sideOf = en => en.waveArrivalSide || (portals.length ? `portal:${portals.indexOf(nearestPortal(en))}` : /** @type {[string, number][]} */ ([['left', en.x - f.x0], ['right', W - en.x], ['top', en.y - f.y0], ['bottom', H - en.y]]).sort((a, b) => a[1] - b[1])[0][0]);
  const groups = {};
  for (const en of waveUnits) if (en.fromWave && en.musterUntil && !en.buildTarget && !en.tentBuildTarget &&
      (!game.wavePreparation || en.prepWave === game.wavePreparation.wave)) (groups[sideOf(en)] = groups[sideOf(en)] || []).push(en);
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

function stageWaveAtPlayerEdge() {
  const camps = game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
  const camp = camps.length ? camps.reduce((nearest, current) =>
    Math.hypot(current.x - townHall.x, current.y - townHall.y) <
      Math.hypot(nearest.x - townHall.x, nearest.y - townHall.y) ? current : nearest) : null;
  const wave = game.enemies.filter(enemy => enemy.fromWave && enemy.hp > 0 &&
    enemy.prepWave === game.wavePreparation?.wave);
  for (const raft of game.enemyRafts) {
    if (raft.phase === 'arriving') wave.push(...raft.units.filter(enemy =>
      enemy.fromWave && enemy.prepWave === game.wavePreparation?.wave));
  }
  if (!wave.length) return;
  const toCampX = camp ? camp.x - townHall.x : 0, toCampY = camp ? camp.y - townHall.y : 0;
  const campSide = camp ? Math.abs(toCampX) >= Math.abs(toCampY)
    ? (toCampX < 0 ? 'west' : 'east')
    : (toCampY < 0 ? 'north' : 'south') : null;
  const box = getTerritoryBox();
  const gx0 = Math.max(1, Math.floor(box.x0 / TILE_SIZE) - 1);
  const gy0 = Math.max(1, Math.floor(box.y0 / TILE_SIZE) - 1);
  const gx1 = Math.min(game.COLS - 2, Math.ceil(box.x1 / TILE_SIZE));
  const gy1 = Math.min(game.ROWS - 2, Math.ceil(box.y1 / TILE_SIZE));
  const sides = campSide ? [campSide] : [...new Set(wave.map(enemy => enemy.waveArrivalSide).filter(Boolean))];
  for (const side of sides) {
    const positions = [];
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
      if (inTerritory(x, y) || inEnemyTerritory(x, y) ||
        ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inTerritory(x + dx * TILE_SIZE, y + dy * TILE_SIZE))) continue;
      if ((side === 'east' && x < box.x1) || (side === 'west' && x >= box.x0) ||
        (side === 'south' && y < box.y1) || (side === 'north' && y >= box.y0)) continue;
      positions.push({ x, y });
    }
    const group = wave.filter(enemy => campSide || enemy.waveArrivalSide === side);
    if (!positions.length || !group.length) continue;
    positions.sort((a, b) => Math.abs((side === 'east' || side === 'west' ? a.y - townHall.y : a.x - townHall.x)) -
      Math.abs((side === 'east' || side === 'west' ? b.y - townHall.y : b.x - townHall.x)));
    const slots = positions.slice(0, Math.min(positions.length, group.length));
    slots.sort((a, b) => side === 'east' || side === 'west' ? a.y - b.y : a.x - b.x);
    group.forEach((enemy, index) => {
      if (enemy.buildTarget) return;
      const slot = Math.min(slots.length - 1, Math.floor((index + 0.5) * slots.length / group.length));
      enemy.muster = { x: slots[slot].x, y: slots[slot].y };
      enemy.musterRoute = getTerritoryBypassRoute(enemy, enemy.muster) || [];
      enemy.path = null;
      enemy.pathTarget = null;
      enemy.pathRetryTimer = 0;
      enemy.directBlockedTimer = 0;
      enemy.moveVx = 0;
      enemy.moveVy = 0;
    });
  }
  const builders = wave.filter(enemy => enemy.waveTentBuilder || enemy.tentBuildTarget);
  const staleSites = new Set(builders.map(builder => builder.tentBuildTarget));
  game.enemyTentBlueprints = game.enemyTentBlueprints.filter(site => !staleSites.has(site));
  for (const builder of builders) delete builder.tentBuildTarget;
  for (const builder of builders) {
    const site = getNearbyEnemyTentSite(builder);
    if (!site) continue;
    site.builder = builder;
    site.waveActive = true;
    builder.tentBuildTarget = site;
  }
}

function getTerritoryBypassRoute(start, target) {
  if (!hasTerritory()) return [target];
  const box = getTerritoryBox(), pad = TILE_SIZE * 2;
  const left = box.x0 - pad, right = box.x1 + pad, top = box.y0 - pad, bottom = box.y1 + pad;
  const width = right - left, height = bottom - top, perimeter = 2 * (width + height);
  const project = point => {
    const clampX = Math.max(left, Math.min(right, point.x));
    const clampY = Math.max(top, Math.min(bottom, point.y));
    return [
      { x: clampX, y: top, t: clampX - left },
      { x: right, y: clampY, t: width + clampY - top },
      { x: clampX, y: bottom, t: width + height + right - clampX },
      { x: left, y: clampY, t: width * 2 + height + bottom - clampY }
    ];
  };
  const pointAt = distance => {
    const t = (distance + perimeter) % perimeter;
    if (t <= width) return { x: left + t, y: top };
    if (t <= width + height) return { x: right, y: top + t - width };
    if (t <= width * 2 + height) return { x: right - (t - width - height), y: bottom };
    return { x: left, y: bottom - (t - width * 2 - height) };
  };
  const segmentIsSafe = (from, to) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.ceil(distance / TILE_SIZE);
    for (let step = 1; step <= steps; step++) {
      const progress = step / steps;
      if (inTerritory(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress)) return false;
    }
    return true;
  };
  if (segmentIsSafe(start, target)) return [target];
  const starts = project(start).filter(point => segmentIsSafe(start, point));
  const targets = project(target).filter(point => segmentIsSafe(point, target));
  if (!starts.length || !targets.length) return null;
  /** @type {import('../../../engine/world/types.js').Point[] | null} */
  let bestRoute = null;
  let bestDistance = Infinity;
  const corners = [
    { x: left, y: top, t: 0 },
    { x: right, y: top, t: width },
    { x: right, y: bottom, t: width + height },
    { x: left, y: bottom, t: width * 2 + height }
  ];
  for (const from of starts) for (const to of targets) {
    const clockwise = (to.t - from.t + perimeter) % perimeter;
    for (const forward of [true, false]) {
      const span = forward ? clockwise : perimeter - clockwise;
      const route = [start, from];
      const direction = forward ? 1 : -1;
      const nodes = corners.map(corner => {
        const distance = forward ? (corner.t - from.t + perimeter) % perimeter : (from.t - corner.t + perimeter) % perimeter;
        return { ...corner, distance };
      }).filter(corner => corner.distance > 1 && corner.distance < span - 1)
        .sort((a, b) => a.distance - b.distance);
      route.push(...nodes.map(corner => pointAt(from.t + direction * corner.distance)));
      route.push(to, target);
      const length = route.slice(1).reduce((sum, point, index) =>
        sum + Math.hypot(point.x - route[index].x, point.y - route[index].y), 0);
      if (length < bestDistance) { bestDistance = length; bestRoute = route; }
    }
  }
  return bestRoute;
}

function findDemonWaveExit(camp) {
  const box = getTerritoryBox();
  const gx0 = Math.max(0, Math.floor(box.x0 / TILE_SIZE)), gy0 = Math.max(0, Math.floor(box.y0 / TILE_SIZE));
  const gx1 = Math.min(game.COLS - 1, Math.ceil(box.x1 / TILE_SIZE)), gy1 = Math.min(game.ROWS - 1, Math.ceil(box.y1 / TILE_SIZE));
  const direction = { x: camp.x - townHall.x, y: camp.y - townHall.y };
  const length = Math.max(1, Math.hypot(direction.x, direction.y));
  const candidates = [];
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
    const edgeDistance = Math.min(x - box.x0, box.x1 - x, y - box.y0, box.y1 - y);
    if (!inTerritory(x, y) || Math.hypot(x - townHall.x, y - townHall.y) < getBaseRadius() + TILE_SIZE ||
        isTileBlockedForEnemyStrict(gx, gy) || isTileOccupied(x, y) ||
        game.enemyTents.some(tent => Math.hypot(tent.x - x, tent.y - y) < 4 * TILE_SIZE)) continue;
    candidates.push({ x, y, edgeDistance, alignment: ((x - townHall.x) * direction.x + (y - townHall.y) * direction.y) / length });
  }
  candidates.sort((a, b) => a.edgeDistance - b.edgeDistance || b.alignment - a.alignment);
  return candidates[0] || null;
}

function beginDemonWaveTransit() {
  const prep = game.wavePreparation;
  const source = prep?.portalSource;
  if (!source) throw new Error('The prepared demon wave has no entrance portal');
  const camp = game.enemyCamps?.find(c => c.id === source.campId) || game.enemyCamp || { x: source.x, y: source.y };
  const position = findDemonWaveExit(camp);
  if (!position) throw new Error('No safe tile available for the demon wave exit portal');
  const exit = openDemonPortalAt(position.x, position.y);
  if (!exit) throw new Error('Could not open the demon wave exit portal');
  exit.wavePortal = true;
  const enemies = game.enemies.filter(enemy => enemy.fromWave && enemy.hp > 0 && enemy.prepWave === prep.wave);
  game.demonWaveTransit = {
    source: { x: source.x, y: source.y }, exit: { x: exit.x, y: exit.y },
    phase: 'entering', timer: 0
  };
  for (const enemy of enemies) {
    enemy.portalTransit = true;
    enemy.path = null;
    enemy.musterUntil = 0;
  }
  playSound('portal', source);
  invalidateAllPaths();
}

function tickDemonWaveTransit(dt) {
  const transit = game.demonWaveTransit;
  if (!transit) return;
  const enemies = game.enemies.filter(enemy => enemy.portalTransit);
  if (transit.phase === 'entering') {
    for (const enemy of enemies) {
      if (Math.hypot(transit.source.x - enemy.x, transit.source.y - enemy.y) > 20) {
        moveEntityTowards(enemy, transit.source.x, transit.source.y, enemy.speed, true, dt);
      }
    }
    if (enemies.some(enemy => Math.hypot(transit.source.x - enemy.x, transit.source.y - enemy.y) > 20)) return;
    game.enemyTents = game.enemyTents.filter(tent =>
      !tent.wavePortal || tent.x !== transit.source.x || tent.y !== transit.source.y);
    transit.phase = 'exiting';
    transit.timer = 0;
    playSound('portal', transit.exit);
    return;
  }
  transit.timer += dt;
  if (transit.timer < 0.4) return;
  const g = getGridPos(transit.exit.x, transit.exit.y), used = new Set();
  const exits = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    .map(([dx, dy]) => ({ x: transit.exit.x + dx * TILE_SIZE, y: transit.exit.y + dy * TILE_SIZE, gx: g.gx + dx, gy: g.gy + dy }))
    .filter(point => !isTileBlockedForEnemyStrict(point.gx, point.gy));
  for (const [index, enemy] of enemies.entries()) {
    const spot = exits.find(point => !used.has(`${point.gx},${point.gy}`));
    if (spot) {
      used.add(`${spot.gx},${spot.gy}`);
      enemy.x = spot.x;
      enemy.y = spot.y;
    } else {
      enemy.x = transit.exit.x + Math.cos(index * 2.4) * 12;
      enemy.y = transit.exit.y + Math.sin(index * 2.4) * 12;
    }
    delete enemy.portalTransit;
    delete enemy.prepWave;
    delete enemy.muster;
    delete enemy.musterRoute;
    enemy.musterUntil = 0;
  }
  game.demonWaveTransit = null;
  invalidateAllPaths();
}

function stageWaveForMarch(seconds) {
  stageWaveAtPlayerEdge();
  const waveEnemies = game.enemies.concat(...game.enemyRafts
    .filter(raft => raft.phase === 'arriving').map(raft => raft.units));
  for (const enemy of waveEnemies) if (enemy.fromWave && enemy.hp > 0 &&
      enemy.prepWave === game.wavePreparation?.wave) {
    enemy.musterUntil = game.pathTick + Math.round(seconds * 60);
  }
  if (game.wavePreparation) game.wavePreparation.stage = 'march';
}

function moveWaveBuildSiteNearBuilder(enemy) {
  const site = enemy.tentBuildTarget;
  if (!site || Math.hypot(site.x - enemy.x, site.y - enemy.y) <= GAME_CONFIG.enemyTents.buildDistance) return;
  const rally = enemy.muster;
  enemy.muster = { x: enemy.x, y: enemy.y };
  delete enemy.tentBuildTarget;
  const nearby = getNearbyEnemyTentSite(enemy);
  enemy.muster = rally;
  if (nearby && Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y) <= GAME_CONFIG.enemyTents.buildDistance) {
    nearby.builder = enemy;
    nearby.waveActive = true;
    enemy.tentBuildTarget = nearby;
  } else {
    enemy.tentBuildTarget = site;
  }
}

// (#279) a wave big enough has a commander: a melee fighter, preferring a normal unit over a big one
function pickCaptain(size) {
  if (size < GAME_CONFIG.waveMuster.captainFrom || game.enemies.some(en => en.captain && en.hp > 0)) return;
  const pick = game.enemies.filter(en => en.fromWave && !en.buildTarget && !en.tentBuildTarget &&
    en.type !== 'archer' && !getEnemyDef(en).pet &&
    !getEnemyDef(en).healer && !getEnemyDef(en).necromancer && !getEnemyDef(en).ranged)
    .map(en => ({ en, near: game.enemies.filter(o => o.muster && en.muster && Math.hypot(o.muster.x - en.muster.x, o.muster.y - en.muster.y) < 120).length }))
    .sort((a, b) => (a.en.type === 'big' ? 1 : 0) - (b.en.type === 'big' ? 1 : 0) || b.near - a.near)[0];
  if (pick) pick.en.captain = true;
}

// Most factions gather at 30 s and stage outside at 15 s; demons open their camp portal at 15 s.
export function tickWaveTimer(dt) {
  tickDemonWaveTransit(dt);
  const before = game.waveTimer;
  game.waveTimer -= dt;
  const muster = GAME_CONFIG.waveMuster;
  const camps = game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
  const preparationSeconds = getEnemyFaction().portalSpawns
    ? Math.min(muster.departureSeconds, game.waveInterval)
    : Math.min(muster.preparationSeconds, game.waveInterval);
  const departureSeconds = getEnemyFaction().portalSpawns
    ? muster.departureSeconds
    : Math.min(muster.departureSeconds, preparationSeconds / 2);
  const canPrepareWave = !getEnemyFaction().portalSpawns || camps.length > 0;
  if (canPrepareWave && !game.wavePreparation && before >= preparationSeconds && game.waveTimer <= preparationSeconds) {
    game.wavePreparation = { wave: game.waveNum, stage: getEnemyFaction().portalSpawns ? 'portal' : 'gather' };
    startNextWave(true);
    if (!getEnemyFaction().portalSpawns && game.waveInterval <= muster.departureSeconds) {
      stageWaveForMarch(preparationSeconds);
    }
  }
  if (!getEnemyFaction().portalSpawns && game.wavePreparation && game.wavePreparation.stage === 'gather' &&
      before > departureSeconds && game.waveTimer <= departureSeconds) {
    stageWaveForMarch(muster.departureSeconds);
  }
  // one warning, 15 s before the wave (holds of the timer in tests keep it above)
  if (before > WAVE_WARNING_SECONDS && game.waveTimer <= WAVE_WARNING_SECONDS) {
    showNotification(t('wave.warning', { seconds: WAVE_WARNING_SECONDS }), true);
    someoneSays(game.settlers.filter(s => !s.asleep), getPlayerFaction().id, 'wave', true); // (#252)
  }
  if (game.waveTimer <= 0) {
    if (game.wavePreparation) {
      if (getEnemyFaction().portalSpawns) beginDemonWaveTransit();
      activateEnemyTents();
      const activeWaveUnits = game.enemies.concat(...game.enemyRafts
        .filter(raft => raft.phase === 'arriving').map(raft => raft.units));
      for (const enemy of activeWaveUnits) if (enemy.prepWave === game.wavePreparation.wave) {
        enemy.musterUntil = 0;
        delete enemy.prepWave;
        delete enemy.waveTentBuilder;
        if (enemy.tentBuildTarget) {
          moveWaveBuildSiteNearBuilder(enemy);
          enemy.buildTarget = enemy.tentBuildTarget;
          delete enemy.tentBuildTarget;
        }
      }
      game.portalWavePrep = null;
      game.waveNum++;
      game.wavePreparation = null;
      if (game.gameMode === 'endless') playSound('horn');
    } else startNextWave();
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

  if (game.wavePreparation || (!game.enemyTents.some(tent => tent.waveActive && tent.summonsLeft > 0) &&
      !game.enemies.some(enemy => enemy.fromWave || enemy.waveSummoned))) return;

  game.enemyTents.forEach(et => {
    if (et.campStructure || !et.waveActive) return;
    et.summonTimer = (et.summonTimer || 0) + dt;
    const tentConfig = GAME_CONFIG.enemyTents;
    if ((et.summonsLeft || 0) > 0 && et.summonTimer >= tentConfig.summonInterval && game.enemies.length < tentConfig.maxEnemies) {
      const wave = et.summonWave || Math.max(1, game.waveNum - 1);
      const factionId = getEnemyFaction().id;
      const pool = getWavePresetPool(factionId, wave);
      const picked = pickWavePreset(pool);
      const def = picked && GAME_CONFIG.enemies[picked.enemyKey];
      if (!def) throw new Error(`No wave preset available for ${getEnemyFaction().id} in wave ${wave}`);
      const groupSize = getWavePresetGroupSize(factionId, picked.preset);
      if (game.enemies.length + groupSize > tentConfig.maxEnemies) return;
      et.summonTimer = 0;
      et.summonsLeft--;
      for (let member = 0; member < groupSize; member++) {
        const spawnPos = {
          x: Math.max(15, Math.min(game.WORLD_WIDTH - 15, et.x + (rand() - 0.5) * 30)),
          y: Math.max(15, Math.min(game.WORLD_HEIGHT - 15, et.y + (rand() - 0.5) * 30))
        };
        const summoned = createConfiguredEnemy(spawnPos, def.id);
        summoned.summoned = true; // from a tent, not the wave: doesn't call off an assault on the tents
        summoned.waveSummoned = true;
        dressForWave(summoned, def);
        if (isNight() && rand() < GAME_CONFIG.daytime.enemyTorchShare) summoned.torch = true;
        game.enemies.push(summoned);
      }
    }
  });
}

// What a fallen enemy drops (GAME_CONFIG.loot, #210, #232): for each thing it held, now and then the thing
// itself, more often part of what it costs; a pile on the ground the settlers pick up
export function dropLoot(en) {
  if (game.gameMode !== 'endless' || game.plagueMode) return;
  const loot = GAME_CONFIG.loot;
  const held = [];
  // (#326: an archer drops its bow, even with its dagger out; a crossbowman its crossbow)
  const weapon = getEnemyDef(en).ranged ? getEnemyDef(en).weapon : en.weapon;
  if (weapon && weapon !== 'fist' && GAME_CONFIG.weapons[weapon]) held.push(['weapons', weapon]);
  if (armorOf(en)) held.push(['gear', armorOf(en).id]);
  if (en.shield) held.push(['gear', 'shield']);
  if (en.helmet) held.push(['gear', 'helmet']);
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
      markEnemyKillForPlague(en);
      if (!en.crumbled) { grantEnemyReward(en); addCorpse(en, 'enemy', en.enemyKey); dropLoot(en); }
    }
  });
  game.enemies = game.enemies.filter(en => en.hp > 0);
  game.enemyTentBlueprints = game.enemyTentBlueprints.filter(site => game.enemies.includes(site.builder));
}
