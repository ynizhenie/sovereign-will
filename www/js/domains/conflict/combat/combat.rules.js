// Fighting: a strike, arrows and what stops them, blood, burning, spikes, corpses, and the base's defence
// before and during a wave

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game, getGridPos, getTileIndex, isDoor, onceThisTick, someNear, thingAt, TILE_SIZE, townHall, keepWhere } from '../../../engine/world/index.js';
import { armorOf, getWeaponStats, helmetOf, isArrowWeapon, isCrossbowWeapon, isRangedWeapon, usesDagger } from '../../colony/equipment/index.js';
import { damageSettler, faceTowards, getUnitHuntingDamageMultiplier, getUnitLevel, getUnitWeaponProgressionTrack, isBigBody, isUntouchable, speak, startSwing } from '../../colony/settlers/index.js';
import { getReachSteps, getSettlerReach, isTileBlockedForSettler } from '../../../engine/movement/index.js';
import { woundBoar } from '../../economy/hunting/index.js';
import { removeBuilding } from '../../economy/building/index.js';
import { territoryRadiusToward, tileVariantHash } from '../../world/index.js';
import { getEnemyFaction } from '../../factions/index.js';
import { playSound } from '../../../app/index.js';
import { shakeOnHit } from '../morale/index.js';

// Whether an arrow is stopped on tile (gx, gy). fromTower: shot from a watchtower, over walls and doors.
export function isArrowBlockedTile(gx, gy, fromTower) {
  const tiles = getTileIndex();
  const key = `${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`;
  return tiles.arrowBlockers.has(key) || (fromTower ? tiles.towerArrowBuildings : tiles.arrowBuildings).has(key);
}

export function isArrowBlockedAt(x, y, fromTower) {
  const g = getGridPos(x, y);
  return isArrowBlockedTile(g.gx, g.gy, fromTower);
}

export function getProjectileAimPoint(shooter, target, projectileSpeed, projectileLife = Infinity, originX = shooter.x, originY = shooter.y) {
  const point = { x: target.x, y: target.y };
  if (!['bow', 'crossbow', 'rifle'].includes(shooter.weapon) || getUnitLevel(shooter, 'ranged') < 2 || projectileSpeed <= 0) return point;

  const dx = target.x - originX, dy = target.y - originY;
  const vx = target.aimVx || 0, vy = target.aimVy || 0;
  const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;
  let flight = null;
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) > 1e-8) {
      const time = -c / b;
      if (time > 0) flight = time;
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const times = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(time => time > 0);
      if (times.length) flight = Math.min(...times);
    }
  }
  if (flight === null) flight = Math.hypot(dx, dy) / projectileSpeed;
  flight = Math.min(flight, projectileLife);
  return { x: target.x + vx * flight, y: target.y + vy * flight };
}

export function areAdjacentTiles(a, b) {
  const first = getGridPos(a.x, a.y), second = getGridPos(b.x, b.y);
  return Math.max(Math.abs(first.gx - second.gx), Math.abs(first.gy - second.gy)) <= 1;
}

export function shouldUseRangedDagger(unit, target, weaponId, wasHitByMelee) {
  const dagger = (getDefinition('weapons', weaponId) || {}).dagger;
  if (!isArrowWeapon(weaponId) || !target || !dagger) {
    unit.daggerTarget = null;
    return false;
  }
  const distance = Math.hypot(unit.x - target.x, unit.y - target.y);
  const lockRange = dagger.closeTiles * TILE_SIZE + TILE_SIZE;
  const keepDagger = unit.daggerTarget === target && distance <= lockRange;
  const useDagger = areAdjacentTiles(unit, target) || (wasHitByMelee && distance <= lockRange) || keepDagger;
  unit.daggerTarget = useDagger ? target : null;
  return useDagger;
}

// Whether an arrow from (x1, y1) would fly to (x2, y2) unstopped. Walks every tile the line touches
// (not just points along it), so an arrow never clips a corner the check missed. The shooter's own
// tile doesn't count.
// (#326) A blow from a to b doesn't go through a door or a wall between them (the tiles the line crosses, not
// their own): no fighting through a shut door
export function hasMeleeReach(a, b) {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false;
  let gx = Math.floor(a.x / TILE_SIZE), gy = Math.floor(a.y / TILE_SIZE);
  const endGx = Math.floor(b.x / TILE_SIZE), endGy = Math.floor(b.y / TILE_SIZE);
  const own = new Set([`${gx},${gy}`, `${endGx},${endGy}`]);
  const dx = b.x - a.x, dy = b.y - a.y;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  let nextX = stepX ? ((stepX > 0 ? gx + 1 : gx) * TILE_SIZE - a.x) / dx : Infinity;
  let nextY = stepY ? ((stepY > 0 ? gy + 1 : gy) * TILE_SIZE - a.y) / dy : Infinity;
  const tileX = stepX ? TILE_SIZE / Math.abs(dx) : Infinity;
  const tileY = stepY ? TILE_SIZE / Math.abs(dy) : Infinity;
  const blocked = (x, y) => {
    if (own.has(`${x},${y}`)) return false;
    const building = thingAt(game.buildings, x * TILE_SIZE + 15, y * TILE_SIZE + 15);
    return !!building && (isDoor(building) || !(getDefinition('buildings', building.type) || {}).walkable);
  };
  let stepsLeft = Math.abs(endGx - gx) + Math.abs(endGy - gy) + 1;
  while ((gx !== endGx || gy !== endGy) && stepsLeft-- > 0) {
    if (Math.min(nextX, nextY) >= 1 - 1e-9) {
      gx = endGx; gy = endGy;
      break;
    }
    if (Math.abs(nextX - nextY) < 1e-9) {
      if (blocked(gx + stepX, gy) || blocked(gx, gy + stepY)) return false;
      gx += stepX; gy += stepY; nextX += tileX; nextY += tileY;
    } else if (nextX < nextY) {
      gx += stepX; nextX += tileX;
    } else {
      gy += stepY; nextY += tileY;
    }
    if (blocked(gx, gy)) return false;
  }
  return gx === endGx && gy === endGy;
}

export function hasLineOfFire(x1, y1, x2, y2, fromTower = false) {
  let gx = Math.floor(x1 / TILE_SIZE), gy = Math.floor(y1 / TILE_SIZE);
  const endGx = Math.floor(x2 / TILE_SIZE), endGy = Math.floor(y2 / TILE_SIZE);
  const dx = x2 - x1, dy = y2 - y1;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  // how far along the line (0..1) the next vertical / horizontal tile border is, and one tile's worth
  let nextX = stepX ? ((stepX > 0 ? gx + 1 : gx) * TILE_SIZE - x1) / dx : Infinity;
  let nextY = stepY ? ((stepY > 0 ? gy + 1 : gy) * TILE_SIZE - y1) / dy : Infinity;
  const tileX = stepX ? TILE_SIZE / Math.abs(dx) : Infinity;
  const tileY = stepY ? TILE_SIZE / Math.abs(dy) : Infinity;
  while (gx !== endGx || gy !== endGy) {
    if (Math.abs(nextX - nextY) < 1e-9) {
      // exactly through a corner: both side tiles count
      if (isArrowBlockedTile(gx + stepX, gy, fromTower) || isArrowBlockedTile(gx, gy + stepY, fromTower)) return false;
      gx += stepX; gy += stepY; nextX += tileX; nextY += tileY;
    } else if (nextX < nextY) {
      gx += stepX; nextX += tileX;
    } else {
      gy += stepY; nextY += tileY;
    }
    if (nextX > 1 + tileX && nextY > 1 + tileY) break; // safety: past the end
    if (isArrowBlockedTile(gx, gy, fromTower)) return false;
  }
  return true;
}

export function performAttack(attacker, targetX, targetY, useDaggerForStructure = false, target = null) {
  if (game.plagueMode && attacker.plagueHero) return;
  const pet = attacker.role === 'pet';
  if (!pet) attacker.struckAt = game.pathTick; // (fighting: a torch in hand goes to its side, #279)
  if (attacker.attackCooldown > 0) return;
  if (pet) attacker.struckAt = game.pathTick; // (a bite animation starts on the actual strike, not each cooldown tick)
  faceTowards(attacker, targetX, targetY);

  const rangedWeapon = isRangedWeapon(attacker.weapon);
  const dagger = isArrowWeapon(attacker.weapon) && (useDaggerForStructure || usesDagger(attacker))
    ? (getDefinition('weapons', attacker.weapon) || {}).dagger
    : null;
  const normalStats = getWeaponStats(attacker, 'combat');
  const stats = dagger ? { ...dagger, multiplier: normalStats.multiplier } : normalStats;
  const attackCooldown = game.gameMode === 'battle' ? stats.cooldown / (attacker.battleAttackSpeed || 1) : stats.cooldown;

  if (rangedWeapon && !dagger && !usesDagger(attacker)) { // (#326: out of arrows, its dagger in melee)
    const rifle = attacker.weapon === 'rifle';
    if (rifle && (attacker.rifleAmmo || 0) <= 0) return;
    if (!rifle && (!attacker.quiver || (attacker.arrows || 0) <= 0)) return;
    const bolt = isCrossbowWeapon(attacker.weapon);
    const aim = target ? getProjectileAimPoint(attacker, target, stats.projectileSpeed, stats.projectileLife) : { x: targetX, y: targetY };
    let angle = Math.atan2(aim.y - attacker.y, aim.x - attacker.x);
    game.projectiles.push({ 
      x: attacker.x, 
      y: attacker.y, 
      vx: Math.cos(angle) * stats.projectileSpeed, 
      vy: Math.sin(angle) * stats.projectileSpeed, 
      damage: stats.damage * stats.multiplier * (target && game.boars.includes(target) ? getUnitHuntingDamageMultiplier(attacker) : 1),
      life: stats.projectileLife, 
      fromEnemy: false, 
      owner: attacker,
      progressionTrack: getUnitWeaponProgressionTrack(attacker),
      bolt,
      bullet: rifle,
      training: !!(attacker.idle && attacker.idle.act === 'train') // (#326) at a dummy: it sticks in it
    });
    playSound(rifle ? 'rifle' : bolt ? 'crossbow' : 'bow', attacker);
    if (game.gameMode !== 'battle' && !game.plagueMode) attacker.arrows--; // arrows don't run out in battles (#404: nor in the Plague)
    if (rifle) {
      attacker.rifleAmmo--;
      attacker.attackCooldown = attacker.rifleAmmo === 0 ? stats.reload : attackCooldown;
    } else attacker.attackCooldown = attackCooldown;
    attacker.shotAt = game.pathTick; attacker.shotLen = attackCooldown; // (its next arrow drawn, #306)
    attacker.swingWeapon = null;
    startSwing(attacker, 0.3);
  } else {
    attacker.swingWeapon = dagger ? 'dagger' : null;
    const range = stats.range;
    const dmg = stats.damage * stats.multiplier;
    const inReach = (o, pad) => Math.hypot(o.x - attacker.x, o.y - attacker.y) <= range + pad;
    // everything within reach of the blow, and what hitting it does
    const struck = [
      ...game.enemies.filter(en => !en.ghostly && inReach(en, en.radius) && hasMeleeReach(attacker, en)).map(en => ({ at: en, hit: () => { en.lastHitBy = attacker; en.lastHitTrack = getUnitWeaponProgressionTrack(attacker) || undefined; damageEnemy(en, dmg); en.struckBy = attacker; en.struckTick = game.pathTick; bleed(en, attacker, dagger ? 'dagger' : attacker.weapon); playSound('hit', en); } })),
      ...game.enemyTents.filter(et => (!et.campStructure || (game.raidActive && et.campId === game.raidCampId)) && inReach(et, 15)).map(et => ({ at: et, hit: () => { et.hp -= dmg; } })),
      // (#326) the enemy's buildings (a battle's red half, a raid's camp): broken through when in the way
      ...game.buildings.filter(b => b.side === 'red' && (!b.enemyCampStructure || (game.raidActive && b.campId === game.raidCampId)) && b.type !== 'spikes' && inReach(b, 15) && !(getDefinition('buildings', b.type) || {}).walkable)
        .map(b => ({ at: b, hit: () => { b.hp -= dmg; if (b.hp <= 0) removeBuilding(b); } })),
      ...game.boars.filter(b => !b.isCarcass && !b.hidden && !b.hideTarget && inReach(b, 12) && !((b.fleeTimer || 0) > 0 && b.sprinting))
        .map(b => ({ at: b, hit: () => {
          woundBoar(b, dmg * getUnitHuntingDamageMultiplier(attacker), attacker, attacker.x, attacker.y);
        } }))
    ];
    // a big settler's blow hits up to splashMax round it, the one aimed at first (#209); anyone else hits
    // one: the one aimed at
    const toAim = target => Math.hypot(target.at.x - targetX, target.at.y - targetY);
    if (isBigBody(attacker)) struck.sort((a, b) => toAim(a) - toAim(b)).slice(0, GAME_CONFIG.combatAI.splashMax).forEach(target => target.hit());
    else if (struck.length > 0) struck.reduce((best, target) => (toAim(target) < toAim(best) ? target : best)).hit();

    attacker.attackCooldown = attackCooldown;
    startSwing(attacker, Math.min(0.35, attackCooldown * 0.8));
    playSound('swing', attacker);
  }
}

// A unit was hurt: blood on it, a splat under it (at most every half second per unit) and on the melee
// weapon that did it (GAME_CONFIG.blood)
export function bleed(unit, attacker, weapon = attacker?.weapon) {
  unit.bloodAge = 0;
  if (attacker && !isRangedWeapon(weapon) && Math.hypot(attacker.x - unit.x, attacker.y - unit.y) < 80) attacker.weaponBloodAge = 0;
  if (game.pathTick - (unit.lastBleedTick ?? -Infinity) < 30) return;
  unit.lastBleedTick = game.pathTick;
  const h = tileVariantHash(game.pathTick, game.bloodSplats.length);
  game.bloodSplats.push({ x: unit.x + (h % 11) - 5, y: unit.y + ((h >>> 8) % 11) - 5, r: 3 + (h >>> 16) % 4, age: 0 });
  if (game.bloodSplats.length > GAME_CONFIG.blood.maxSplats) game.bloodSplats.shift();
}

// Stepping in a pool of blood or in dung: the unit then leaves footprints for a few steps. Footprints
// themselves don't smear further. Whoever left the dung can't step in it until it has walked off first.
export function trackFootprints(unit) {
  for (const pile of game.dung) {
    if (pile.by === unit && !pile.byLeft && Math.hypot(unit.x - pile.x, unit.y - pile.y) > 20) pile.byLeft = true;
  }
  if (!unit.smear || unit.smear.steps <= 0) {
    const pool = game.bloodSplats.find(b => b.kind !== 'trail' && Math.hypot(unit.x - b.x, unit.y - b.y) < b.r + 4);
    const pile = game.dung.find(p => !p.inZone && (p.by !== unit || p.byLeft) && Math.hypot(unit.x - p.x, unit.y - p.y) < 9); // (not in a relief zone, #279)
    if (pool || pile) unit.smear = { color: pile ? 'dung' : 'blood', steps: GAME_CONFIG.smears.steps, x: unit.x, y: unit.y };
    return;
  }
  if (Math.hypot(unit.x - unit.smear.x, unit.y - unit.smear.y) < GAME_CONFIG.smears.stepGap) return;
  unit.smear.x = unit.x; unit.smear.y = unit.y;
  unit.smear.steps--;
  game.bloodSplats.push({ x: unit.x, y: unit.y, r: 2.2, age: 0, kind: 'trail', color: unit.smear.color });
  if (game.bloodSplats.length > GAME_CONFIG.blood.maxSplats) game.bloodSplats.shift();
}

// How visible the blood on a unit's body is: it doesn't dry while the unit is badly wounded
export function bodyBloodAlpha(unit) {
  if (unit.bloodAge === undefined) return 0;
  return bloodAlpha(unit.bloodAge, unit.hp <= unit.maxHp * GAME_CONFIG.blood.woundedShare);
}

// How visible blood of this age is (1..0); `wounded` blood on a badly hurt unit never fades
export function bloodAlpha(age, wounded = false) {
  if (age === undefined) return 0;
  const blood = GAME_CONFIG.blood;
  if (wounded || age <= blood.fadeAfter) return 1;
  return Math.max(0, 1 - (age - blood.fadeAfter) / blood.fadeSeconds);
}

// Burning arrows: what they hit burns a few seconds
export function setBurning(unit) {
  if (!(unit.burning > 0)) playSound('ignite', unit);
  unit.burning = GAME_CONFIG.burning.seconds;
}

export function updateBurning(dt) {
  for (const unit of [...game.settlers, ...game.enemies]) {
    const burning = unit.burning || 0;
    if (!(burning > 0)) continue;
    unit.burning = burning - dt;
    if (game.settlers.includes(/** @type {any} */ (unit))) damageSettler(/** @type {any} */ (unit), GAME_CONFIG.burning.dps * dt, null);
    else unit.hp -= GAME_CONFIG.burning.dps * dt;
  }
}

// Spike traps: a unit stepping onto a spike tile takes its damage once per visit; each visit uses one
// of the trap's uses, and it breaks when they run out. Runs once a tick after movement.
export function applySpikeTraps(dt = 1 / 60) {
  const tiles = getTileIndex();
  if (tiles.spikes.size === 0) return;
  const spikesAt = new Map(game.buildings.filter(b => b.type === 'spikes').map(b => [`${b.x},${b.y}`, b]));
  const trapDef = getDefinition('buildings', 'spikes').build.trap;
  const step = (unit, hurt) => {
    const g = getGridPos(unit.x, unit.y);
    const key = `${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`;
    const trap = spikesAt.get(key);
    if (!trap) { unit.spikeTile = null; return; }
    const usesLeft = trap.usesLeft || 0;
    if (usesLeft <= 0) { unit.spikeTile = key; return; } // broken: harmless till repaired
    // standing on them hurts all the while, without wearing them (#248)
    if (unit.spikeTile === key) { hurt(trapDef.standDps * dt); return; }
    // a step onto them: a full blow, and one use worn (#232: broken ones stay to be repaired)
    unit.spikeTile = key;
    hurt(trapDef.damage);
    trap.usesLeft = trap.hp = usesLeft - 1;
  };
  for (const s of game.settlers) if (!s.towerAssignment) step(s, damage => damageSettler(s, damage));
  for (const en of game.enemies) step(en, damage => { damageEnemy(en, damage); bleed(en, null); });
}

// ---- Corpses: where a settler or enemy fell, grey, until GAME_CONFIG.corpses.seconds pass. A
// later mechanic (e.g. raising the dead) can use one up by removing it from `corpses`.
export function addCorpse(unit, side, kind) {
  playSound('death', unit, side === 'enemy');
  const big = isBigBody(unit);
  // (#314) a pet leaves its own body: a dog's or a hellhound's, not a man's (an enemy's kind is its enemyKey)
  const def = getDefinition(side === 'enemy' ? 'enemies' : 'settlerTypes', kind) || {};
  const weapon = side === 'enemy' && def.ranged ? def.weapon : unit.weapon;
  const corpse = {
    x: unit.x, y: unit.y, radius: unit.visualRadius || unit.radius, side, kind, age: 0, big, wormsTaken: false,
    look: unit.look, type: unit.type, enemyKey: unit.enemyKey, bigBody: unit.bigBody || big,
    experience: unit.experience || 0, progression: unit.progression ? { ...unit.progression } : undefined,
    weapon, tool: unit.tool, shield: unit.shield, armor: unit.armor, helmet: unit.helmet, helmetGear: helmetOf(unit)?.id,
    pet: def.pet, stuck: unit.stuck
  }; // (its look and body type, #306; its arrows stay in it, #326)
  game.corpses.push(corpse);
  return corpse;
}

/**
 * @param {ReturnType<typeof addCorpse>} corpse
 * @param {{ yield: Record<string, number>, items: string[] }} pile
 * @param {number} [index]
 */
export function addCorpseLoot(corpse, pile, index = 0) {
  const radius = Math.min(corpse.radius || 11, 16);
  const angle = index * 2.1;
  const distance = radius * 0.9 + index * 14;
  const preferred = {
    x: corpse.x + Math.cos(angle) * distance,
    y: corpse.y + Math.sin(angle) * distance + 4
  };
  const reach = getSettlerReach({ x: townHall.x, y: townHall.y }, true);
  const reachable = (x, y) => {
    const grid = getGridPos(x, y);
    return getReachSteps(reach, grid.gx, grid.gy) >= 0 && !isTileBlockedForSettler(grid.gx, grid.gy);
  };
  let position = reachable(preferred.x, preferred.y) ? preferred : null;
  const origin = getGridPos(preferred.x, preferred.y);
  for (let ring = 0; !position && ring <= 8; ring++) {
    let bestDistance = Infinity;
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = (origin.gx + dx) * TILE_SIZE + TILE_SIZE / 2;
      const y = (origin.gy + dy) * TILE_SIZE + TILE_SIZE / 2;
      if (!reachable(x, y)) continue;
      const candidateDistance = Math.hypot(x - preferred.x, y - preferred.y);
      if (candidateDistance < bestDistance) {
        position = { x, y };
        bestDistance = candidateDistance;
      }
    }
  }
  if (!position) {
    let bestDistance = Infinity;
    for (let gy = 0; gy < game.ROWS; gy++) for (let gx = 0; gx < game.COLS; gx++) {
      if (getReachSteps(reach, gx, gy) <= 0) continue;
      const x = gx * TILE_SIZE + TILE_SIZE / 2;
      const y = gy * TILE_SIZE + TILE_SIZE / 2;
      const candidateDistance = Math.hypot(x - preferred.x, y - preferred.y);
      if (candidateDistance < bestDistance) {
        position = { x, y };
        bestDistance = candidateDistance;
      }
    }
  }
  game.loot.push({
    ...pile,
    ...(position || preferred),
    hp: 1, maxHp: 1, priority: 0, corpseDropAge: 0
  });
}

export function updateCorpses(dt) {
  const lifetime = GAME_CONFIG.corpses.seconds;
  for (const corpse of game.corpses) corpse.age += dt;
  game.corpses = keepWhere(game.corpses, corpse => corpse.age < lifetime);
  for (const pile of game.loot) if (pile.corpseDropAge !== undefined) pile.corpseDropAge += dt;
  game.loot = keepWhere(game.loot, pile => pile.corpseDropAge === undefined || pile.corpseDropAge < lifetime);
}

// Damage to an enemy, less what its armour, shield and helmet take, as a settler's (#203)
export function damageEnemy(en, amount) {
  if (getDefinition('enemies', en.enemyKey)?.pet === 'ghost') return; // (a ghost, #314)
  let damage = armorOf(en) ? amount * (1 - armorOf(en).damageReduction) : amount;
  if (en.shield) damage *= 1 - GAME_CONFIG.gear.shield.damageReduction;
  const helmet = helmetOf(en);
  if (helmet) damage *= 1 - helmet.damageReduction; // (#326, 27.10, 27)
  en.hp -= damage;
  if (damage > 0) shakeOnHit(en); // (#207)
  if (en.hp > 0 && en.hp < en.maxHp * 0.3 && !en.hurtVoiceSpoken &&
      speak(en, getEnemyFaction().id, 'hurt', true)) en.hurtVoiceSpoken = true;
}

// a normal settler's drawn radius plus a normal enemy's: what melee `approach` distances are set for
export const NORMAL_BODIES = 21;

// ---- Pre-wave deployment

// From deploySeconds before a wave until its enemies are beaten, not in battle mode
// (#322: once a tick: it was asked for every resource every settler looked at)
const alertOnce = onceThisTick();
export function isDefenseAlert() {
  if (game.gameMode === 'battle' || !game.gameStarted) return false;
  return alertOnce(() => game.waveTimer <= GAME_CONFIG.defense.deploySeconds ||
    game.enemies.some(en => en.fromWave && !en.prepWave));
}

// How far the base reaches from the town hall that way: the farthest building in a narrow cone (at most
// 40°, with a two-tile half-width), at least minRadius tiles and no farther than the player's territory.
// (#322: each building's angle and distance from the hall worked out once a tick: at night with no torch every settler asked
// this for every resource it looked at, two arctangents a building each time)
const bearingsOnce = onceThisTick();
const buildingBearings = () => bearingsOnce(() => {
  const own = game.buildings.filter(b => b.side !== 'red');
  const angles = new Float64Array(own.length), distances = new Float64Array(own.length);
  own.forEach((b, i) => { angles[i] = Math.atan2(b.y - townHall.y, b.x - townHall.x); distances[i] = Math.hypot(b.x - townHall.x, b.y - townHall.y); });
  return { angles, distances };
});
const TURN = Math.PI * 2, MAX_BUILDING_CONE = Math.PI * 40 / 180, BUILDING_HALF_WIDTH = 2 * TILE_SIZE;
export function baseRadiusToward(angle, padding = 0) {
  const { angles, distances } = buildingBearings();
  let far = 0;
  for (let i = 0; i < angles.length; i++) {
    if (distances[i] <= far) continue;
    let d = Math.abs(angles[i] - angle) % TURN; // (the angle between them, the short way round)
    if (d > Math.PI) d = TURN - d;
    const cone = Math.min(MAX_BUILDING_CONE, Math.atan2(BUILDING_HALF_WIDTH, distances[i]));
    if (d <= cone) far = distances[i];
  }
  const radius = Math.max(far, GAME_CONFIG.defense.minRadius * TILE_SIZE);
  return Math.min(radius, Math.max(0, territoryRadiusToward(angle, radius + padding) - padding));
}

// How far the base reaches from the town hall: its farthest building, at least minRadius tiles
// (#322: worked out once a tick, not for every resource looked at)
const baseRadiusOnce = onceThisTick();
export function getBaseRadius() {
  return baseRadiusOnce(() => {
    const far = game.buildings.reduce((max, b) => b.side === 'red' ? max : Math.max(max, Math.hypot(b.x - townHall.x, b.y - townHall.y)), 0);
    return Math.max(far, GAME_CONFIG.defense.minRadius * TILE_SIZE);
  });
}

// From the warning until the wave is beaten, settlers go no farther from the town hall than the base's
// farthest building (plus a tile) on their own; only what the player marked takes them farther
export function getSafeRadius() {
  return isDefenseAlert() ? getBaseRadius() + TILE_SIZE : Infinity;
}

export function isInSafeArea(x, y) {
  return Math.hypot(x - townHall.x, y - townHall.y) <= getSafeRadius();
}

// Where the wave comes from (#202): the arc of the wave's enemies on the map as seen from the town hall,
// widened by threatMargin and rounded to sixteenths of a turn (so the posts don't move every step); null
// with no wave enemy on the map, or when they come from all round
export function getThreatArc() {
  const wave = game.enemies.filter(en => en.fromWave && en.hp > 0);
  if (!wave.length) return null;
  const angles = wave.map(en => Math.atan2(en.y - townHall.y, en.x - townHall.x));
  const centre = Math.atan2(angles.reduce((sum, a) => sum + Math.sin(a), 0), angles.reduce((sum, a) => sum + Math.cos(a), 0));
  const half = Math.max(...angles.map(a => Math.abs(Math.atan2(Math.sin(a - centre), Math.cos(a - centre))))) + GAME_CONFIG.defense.threatMargin;
  if (half >= Math.PI * 0.75) return null;
  const step = Math.PI / 8;
  return { centre: Math.round(centre / step) * step, half: Math.ceil(half / step) * step };
}

// An enemy close enough to threaten one of the base's structures
export function isNearBaseStructure(en) {
  const near = GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE;
  return Math.hypot(en.x - townHall.x, en.y - townHall.y) <= near + townHall.radius ||
    someNear(game.buildings, en.x, en.y, near, b => b.side !== 'red' && Math.hypot(en.x - b.x, en.y - b.y) <= near);
}

// An enemy inside the directional base zone, or next to one of its buildings or the town hall
export function isInsideBase(en) {
  const dx = en.x - townHall.x, dy = en.y - townHall.y;
  const distance = Math.hypot(dx, dy);
  // Use the same directional boundary as the base zone; a distant building must not make the whole base a circle.
  return distance <= baseRadiusToward(Math.atan2(dy, dx)) + GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE + townHall.radius ||
    isNearBaseStructure(en);
}

// Squads and their posts, rebuilt when the soldiers, the buildings or the wave's side change: squads of
// squadSize melee soldiers (plus an archer each while there are any), posts at the doors first, the rest
// spread evenly around the town hall at the base's radius, each on a tile a settler can stand on. Once
// the wave is on the map, only on the side it comes from (getThreatArc, #202): doors on that side, the rest
// spread along that arc
export function getDefensePlan() {
  const allMelee = game.settlers.filter(s => s.role === 'soldier' && !s.isPossessed);
  const allArchers = game.settlers.filter(s => s.role === 'archer' && !s.isPossessed && !s.towerAssignment);
  const arc = getThreatArc();
  const facing = a => !arc || Math.abs(Math.atan2(Math.sin(a - arc.centre), Math.cos(a - arc.centre))) <= arc.half;
  const zones = game.postZones || [];
  const key = [...allMelee, ...allArchers].map(s => s.id).join(',') + '|' + game.buildings.length + '|' + (arc ? `${arc.centre},${arc.half}` : 'all') + '|' + zones.map(z => `${z.x},${z.y}`).join(';');
  if (game.defensePlan && game.defensePlan.key === key) return game.defensePlan;
  // (#279) the tiles marked as posts first: one soldier each, the nearest free one (melee before archers);
  // those left over get posts as ever
  const zoned = new Map();
  for (const z of zones) {
    const free = [...allMelee, ...allArchers].filter(s => !zoned.has(s));
    if (!free.length) break;
    const s = free.sort((a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y))[0];
    zoned.set(s, { post: { x: z.x, y: z.y }, slot: 0 });
  }
  const melee = allMelee.filter(s => !zoned.has(s)), archers = allArchers.filter(s => !zoned.has(s));
  const size = GAME_CONFIG.defense.squadSize;
  // too few for two squads: everyone on a post of their own round the base
  const singles = melee.length < 2 * size;
  const count = singles ? melee.length + archers.length : Math.ceil(melee.length / size);
  const hallReach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const standable = (x, y) => {
    const g = getGridPos(x, y);
    for (let ring = 0; ring <= 3; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (getReachSteps(hallReach, g.gx + dx, g.gy + dy) >= 0) return { x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 };
        }
      }
    }
    return { x, y };
  };
  const posts = [];
  for (const door of game.buildings.filter(b => isDoor(b) && facing(Math.atan2(b.y - townHall.y, b.x - townHall.x)))) {
    if (posts.length >= count) break;
    // just inside the door, on the town hall's side
    const angle = Math.atan2(door.y - townHall.y, door.x - townHall.x);
    posts.push(standable(door.x - Math.cos(angle) * TILE_SIZE, door.y - Math.sin(angle) * TILE_SIZE));
  }
  const ring = count - posts.length;
  for (let i = 0; i < ring; i++) {
    const angle = arc ? arc.centre - arc.half + ((i + 0.5) / ring) * 2 * arc.half : (i / ring) * Math.PI * 2 - Math.PI / 2;
    const r = baseRadiusToward(angle);
    posts.push(standable(townHall.x + Math.cos(angle) * r, townHall.y + Math.sin(angle) * r));
  }
  const squadOf = new Map();
  if (singles) {
    [...melee, ...archers].forEach((s, i) => squadOf.set(s, { post: posts[i], slot: 0 }));
  } else {
    melee.forEach((s, i) => squadOf.set(s, { post: posts[Math.floor(i / size)], slot: i % size }));
    archers.forEach((s, i) => squadOf.set(s, { post: posts[i % posts.length], slot: size + Math.floor(i / posts.length) }));
  }
  for (const [s, place] of zoned) { squadOf.set(s, place); posts.push(place.post); }
  game.defensePlan = { key, posts, squadOf };
  return game.defensePlan;
}

// (#326) An arrow that stopped stays: in the unit it hit (the same place on it as it moves), or on the ground
// where it fell. It fades after a while, in a corpse it goes with it. Nobody can pick it up (a dummy's, its
// trainers collect).
function stickInto(host, proj) {
  if (proj.bullet) return;
  const keep = GAME_CONFIG.stuckArrows, arrow = { x: proj.x - host.x, y: proj.y - host.y, a: Math.atan2(proj.vy, proj.vx), age: 0, fromEnemy: !!proj.fromEnemy, bolt: !!proj.bolt };
  if (!host.stuck) host.stuck = [];
  if (host.stuck.length >= keep.perUnit) host.stuck.shift();
  host.stuck.push(arrow);
}
function dropOnGround(proj) {
  if (proj.fire || proj.bullet) return;
  const keep = GAME_CONFIG.stuckArrows;
  game.stuckArrows.push({ x: proj.x, y: proj.y, a: Math.atan2(proj.vy, proj.vx), age: 0, fromEnemy: !!proj.fromEnemy, bolt: !!proj.bolt });
  if (game.stuckArrows.length > keep.ground) game.stuckArrows.shift();
}

// Arrows age: those lying and those in the living go after GAME_CONFIG.stuckArrows.seconds
export function ageStuckArrows(dt) {
  const seconds = GAME_CONFIG.stuckArrows.seconds;
  for (const a of game.stuckArrows) a.age += dt;
  if (game.stuckArrows.length && game.stuckArrows[0].age > seconds) game.stuckArrows = game.stuckArrows.filter(a => a.age <= seconds);
  for (const list of [game.settlers, game.enemies]) {
    for (const u of list) {
      if (!u.stuck) continue;
      for (const a of u.stuck) a.age += dt;
      u.stuck = u.stuck.filter(a => a.age <= seconds);
      if (!u.stuck.length) u.stuck = undefined;
    }
  }
}

// Arrows fly, hit what they reach (settlers and the town hall, or enemies, tents and boars), stop at obstacles
// (#322) dt: a step's length in seconds (the speeds are for 1/60 s)
export function tickProjectiles(dt = 1 / 60) {
  const k = dt * 60;
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    let proj = game.projectiles[i];
    if (!proj.startTile) proj.startTile = getGridPos(proj.x, proj.y);
    proj.x += proj.vx * k; proj.y += proj.vy * k; proj.life -= k;
    if (proj.x < 0 || proj.y < 0 || proj.x >= game.WORLD_WIDTH || proj.y >= game.WORLD_HEIGHT) {
      game.projectiles.splice(i, 1);
      continue;
    }
    let hit = false, host = null;

    if (proj.fromEnemy) {
      if (!proj.skipTownHall && !game.plagueMode && Math.hypot(townHall.x - proj.x, townHall.y - proj.y) < townHall.radius) {
        townHall.hp -= proj.damage;
        hit = true;
      }
      for (let s of game.settlers) {
        if (hit) break;
        if (isUntouchable(s)) continue; // (through a ghost, #314)
        if (Math.hypot(s.x - proj.x, s.y - proj.y) < s.radius + 3) {
          damageSettler(s, proj.damage, proj.owner, proj.progressionTrack);
          if (proj.fire) setBurning(s);
          hit = true; host = s;
        }
      }
    } else {
      for (let j = game.enemies.length - 1; j >= 0 && !hit; j--) {
        let en = game.enemies[j];
        if (Math.hypot(en.x - proj.x, en.y - proj.y) < en.radius + 3) {
          damageEnemy(en, proj.damage);
          if (proj.owner) {
            en.lastHitBy = proj.owner;
            en.lastHitTrack = proj.progressionTrack || getUnitWeaponProgressionTrack(proj.owner);
            en.struckBy = proj.owner;
            en.struckTick = game.pathTick;
          } // (who it turns on in the fog, #326)
          bleed(en, proj.owner, null);
          playSound('arrowHit', en);
          if (proj.fire) setBurning(en);
          hit = true; host = en;
        }
      }
      // (#326) an archer's practice: the dummy takes the arrow and keeps it (a few), hurt by none
      for (const d of proj.training && !hit ? game.buildings : []) {
        if (d.type !== 'dummy' || Math.abs(d.x - proj.x) > TILE_SIZE / 2 || Math.abs(d.y - proj.y) > TILE_SIZE / 2) continue; // (its tile: a shut one stops an arrow the moment it's in it)
        if (!d.arrowsStuck) d.arrowsStuck = [];
        if (d.arrowsStuck.length < GAME_CONFIG.stuckArrows.dummy) d.arrowsStuck.push({ x: proj.x - d.x, y: proj.y - d.y, a: Math.atan2(proj.vy, proj.vx), age: 0, fromEnemy: false, bolt: !!proj.bolt });
        else dropOnGround(proj);
        hit = true; host = d;
        break;
      }
      for (let j = game.enemyTents.length - 1; j >= 0 && !hit; j--) {
        let et = game.enemyTents[j];
        if (Math.hypot(et.x - proj.x, et.y - proj.y) < 18) {
          et.hp -= proj.damage;
          hit = true;
        }
      }
      for (let j = game.boars.length - 1; j >= 0 && !hit; j--) {
        let b = game.boars[j];
        if (!b.isCarcass && !b.hidden && !b.hideTarget && Math.hypot(b.x - proj.x, b.y - proj.y) < 12) {
          woundBoar(b, proj.damage, proj.owner || null, proj.owner ? proj.owner.x : proj.x, proj.owner ? proj.owner.y : proj.y);
          hit = true;
        }
      }
    }
    // gone: it hit something, flew its full range, or struck an obstacle past its shooter's own tile
    const tile = getGridPos(proj.x, proj.y);
    const leftStartTile = tile.gx !== proj.startTile.gx || tile.gy !== proj.startTile.gy;
    const stops = hit || proj.life <= 0 || (leftStartTile && isArrowBlockedAt(proj.x, proj.y, !!proj.fromTower));
    if (stops) {
      if (host && host.type === 'dummy') { /* kept by the dummy */ } else if (host) stickInto(host, proj); else dropOnGround(proj);
      game.projectiles.splice(i, 1);
    }
  }
}

// Blood on the ground dries; dung goes after a while
export function ageBloodAndDung(dt) {
  for (const splat of game.bloodSplats) splat.age += dt;
  game.bloodSplats = keepWhere(game.bloodSplats, splat => bloodAlpha(splat.age) > 0);
  for (const pile of game.dung) pile.age += dt;
  game.dung = keepWhere(game.dung, pile => pile.age < GAME_CONFIG.relief.dungSeconds);
}

// Units stepping in blood or dung leave footprints
export function trackAllFootprints() {
  for (const unit of game.settlers) trackFootprints(unit);
  for (const unit of game.enemies) trackFootprints(unit);
}
