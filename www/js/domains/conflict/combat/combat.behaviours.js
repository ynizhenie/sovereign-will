// Soldiers fight: the enemy the player marked, their post in a squad, whoever attacks, and the enemy tents

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { OUTPOST_COLLISION_HALF_HEIGHT, OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_OFFSET_Y, TILE_SIZE, game, townHall } from '../../../engine/world/index.js';
import { getWeaponStats, hasAxeTool, hasPickaxeTool, isBowWeapon } from '../../colony/equipment/index.js';
import { findNearestStorage, isAtStorage, isAtTownHall, moveSettlerToTownHall, stock, takeStock, walkToStorage } from '../../colony/storage/index.js';
import { faceTowards, getRecentAttacker } from '../../colony/settlers/index.js';
import { forEachEnemyNear, moveEntityTowards } from '../../../engine/movement/index.js';
import { NORMAL_BODIES, getBaseRadius, getDefensePlan, hasLineOfFire, isDefenseAlert, isInsideBase, performAttack } from './combat.rules.js';
import { findNearestArrowTower, refillArcherFromTower } from '../towers/index.js';
import { getNecromancy } from '../../factions/undead/index.js';
import { getEnemyDef } from '../waves/index.js';

// An enemy the player pointed at, for this soldier, while fewer than markedSquad soldiers go for it
export function takeMarkedTarget(s, tick) {
  let best = null;
  for (const en of game.enemies) {
    if (!en.markedTarget || (tick.markedAssignments.get(en) || 0) >= GAME_CONFIG.defense.markedSquad) continue;
    if (!best || Math.hypot(en.x - s.x, en.y - s.y) < Math.hypot(best.x - s.x, best.y - s.y)) best = en;
  }
  if (best) tick.markedAssignments.set(best, (tick.markedAssignments.get(best) || 0) + 1);
  return best;
}

// A soldier in a squad holds its post until an enemy comes near the post, gets into the base (or next
// to a building), or hits it; then it fights that enemy (fightEnemies) and comes back afterwards
export function holdPost(s, tick) {
  if ((s.role !== 'soldier' && s.role !== 'archer') || s.isPossessed || s.towerAssignment || s.carrying || !isDefenseAlert()) return false;
  if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false; // no arrows: no post (#232, fightEnemies)
  const place = getDefensePlan().squadOf.get(s);
  if (!place || !place.post) return false;
  if (getRecentAttacker(s)) return false;
  // an enemy the player pointed at: a few soldiers leave their posts for it
  const marked = takeMarkedTarget(s, tick);
  if (marked) { s.postTarget = marked; return false; }
  if (goForMarkedTent(s, tick)) return true; // a tent the player pointed at, too (#203)
  const engage = GAME_CONFIG.defense.engageTiles * TILE_SIZE;
  // an archer counts as near the post while it can shoot at it (#279: it stood off past the post's reach and
  // shot, the soldiers ran at it, gave up half way as too far from the post, went back, and so on)
  const reachOf = en => engage + (en.type === 'archer' ? ((getEnemyDef(en).ranged || {}).range || 0) : 0);
  if (s.postTarget && (!game.enemies.includes(s.postTarget) || !canFightDuringDefense(s, tick, s.postTarget, null))) {
    s.postTarget = null;
  }
  if (s.postTarget && s.postTarget.type === 'archer' &&
    distanceTo(s.postTarget, place.post.x, place.post.y) < reachOf(s.postTarget)) return false;
  let nearest = null, best = Infinity;
  // only what could be near enough to count, not every enemy on the map (the fewest a big wave has)
  const reach = maxEnemyReach(tick);
  forEachEnemyNear(place.post.x, place.post.y, reach, en => {
    if (!canFightDuringDefense(s, tick, en, null)) return;
    const d = distanceTo(en, place.post.x, place.post.y);
    if (d < reachOf(en) && d < best) { best = d; nearest = en; }
  });
  // nothing near the post: the nearest enemy that got into the base, wherever that is
  if (!nearest) {
    best = Infinity;
    const baseReach = getBaseRadius() + GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE + townHall.radius;
    forEachEnemyNear(townHall.x, townHall.y, baseReach, en => {
      if (!canFightDuringDefense(s, tick, en, null)) return;
      const d = distanceTo(en, place.post.x, place.post.y);
      if (d < best && isInsideBase(en)) { best = d; nearest = en; }
    });
  }
  if (nearest) { s.postTarget = nearest; return false; }
  s.postTarget = null;
  // squad members stand around the post
  const angle = place.slot * 2.1;
  const spot = { x: place.post.x + Math.cos(angle) * 14 * Math.min(1, place.slot), y: place.post.y + Math.sin(angle) * 14 * Math.min(1, place.slot) };
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > 8) moveEntityTowards(s, spot.x, spot.y, s.speed, false, tick.dt);
  s.patrolTarget = null;
  return true;
}

// Hit right now (#208): whatever it was about (carrying, building, on its way to a job), it turns on whoever
// hit it in the last second and a half. Tower guards keep shooting from up there; an archer with no arrows
// can't; the possessed are the player's
export function strikeBack(s, tick) {
  if (s.isPossessed || s.towerAssignment || (game.gameMode === 'menu' && !game.enemies.length)) return false; // (the menu's fight: yes, #256)
  const attacker = getRecentAttacker(s);
  if (!attacker || game.pathTick - (s.lastAttackedTick || 0) > 90) return false;
  if (attacker === s.catchTarget || (attacker.toCatch && attacker.toCatch !== s.id)) return false; // (one being caught for a cage, #250)
  if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
  return engageEnemy(s, tick, attacker, attacker, tick.dt);
}

// Fight enemies: strike back at an attacker first, otherwise the enemy closest to the town hall.
// Archers restock arrows from towers or the town hall; unarmed settlers shelter at the town hall
// while there are defenders, unless they're being attacked themselves.
export function fightEnemies(s, tick) {
  const dt = tick.dt;
  const choice = chooseSettlerTarget(s, tick);
  if (!choice) return false; // on the way to the enemy tents, with nothing in the way
  const { targetEnemy, attacker } = choice;
  if (isBowWeapon(s.weapon) && s.quiver && restockArrows(s, dt)) return true;
  // an archer with nothing to shoot keeps out of the fight at the town hall while there's an enemy about
  // (#232: it went out to its post empty); with none, it gets on with its other work
  if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0) &&
      (targetEnemy || (tick.isWaveActive && game.enemies.length > 0))) {
    s.patrolTarget = null;
    if (!isAtTownHall(s)) moveSettlerToTownHall(s, s.speed, dt);
    return true;
  }
  // (#279) the menu's fight: the squad keeps by the warehouse, guarding it, and lets those further off come
  if (game.gameMode === 'menu' && !targetEnemy && game.enemies.length) {
    s.patrolTarget = null;
    if (Math.hypot(townHall.x - s.x, townHall.y - s.y) > MENU_GUARD * 0.5) moveSettlerToTownHall(s, s.speed, dt);
    return true;
  }
  return engageEnemy(s, tick, targetEnemy, attacker, dt);
}

const MENU_GUARD = 4 * 30; // (how far from the menu's warehouse its squad goes for a zombie)

// Enemies ordered by how close they are to the town hall, worked out once a tick: a soldier's pick is
// mostly about that order, and walking the whole list for every soldier was a large part of a big
// fight's cost. An enemy further from the town hall than the best score so far cannot beat it, so the
// list is left at that point.
function enemiesByBaseDistance(tick) {
  if (tick.enemiesByBase) return tick.enemiesByBase;
  tick.enemiesByBase = game.enemies
    .map(en => ({ en, d: Math.hypot(en.x - townHall.x, en.y - townHall.y) }))
    .sort((a, b) => a.d - b.d);
  return tick.enemiesByBase;
}

// Plain distance: Math.hypot is dear when asked a few hundred thousand times a second
function distanceTo(unit, x, y) {
  const dx = unit.x - x, dy = unit.y - y;
  return Math.sqrt(dx * dx + dy * dy);
}

// The farthest an enemy on the map can reach from where it stands, worked out once a tick: a soldier at
// its post only needs to look at enemies that could be that close to the post
function maxEnemyReach(tick) {
  if (tick.maxEnemyReach === undefined) {
    const engage = GAME_CONFIG.defense.engageTiles * TILE_SIZE;
    let max = engage;
    for (const en of game.enemies) {
      const reach = engage + (en.type === 'archer' ? ((getEnemyDef(en).ranged || {}).range || 0) : 0);
      if (reach > max) max = reach;
    }
    tick.maxEnemyReach = max;
  }
  return tick.maxEnemyReach;
}

// The enemy a settler fights: the one most dangerous to the base, an enemy the player marked, the one near
// its post, or whoever is hitting it right now. On the way to the enemy tents, only what's in the way
// (null: nothing is). attacker: the one hitting it, if any.
function chooseSettlerTarget(s, tick) {
  let targetEnemy = null;
  let minBaseDist = Infinity;
  const attacker = getRecentAttacker(s);
  for (const { en, d: dToTown } of enemiesByBaseDistance(tick)) {
    if (dToTown > minBaseDist) break;
    if (en.toCatch && en.toCatch !== s.id) continue; // (one being caught for a cage, #250)
    if (!canFightDuringDefense(s, tick, en, attacker)) continue;
    const dToSettler = distanceTo(en, s.x, s.y);
    const score = dToTown + (dToSettler < 180 ? 0 : dToSettler * 0.4);
    if (score < minBaseDist) { minBaseDist = score; targetEnemy = en; }
  }
  // enemies the player marked with the Point tool come first, for up to markedSquad of the armed (a
  // squad soldier already got its own from holdPost)...
  if (s.weapon !== 'fist' && !(s.postTarget && s.postTarget.markedTarget && game.enemies.includes(s.postTarget))) {
    const marked = takeMarkedTarget(s, tick);
    if (marked) targetEnemy = marked;
  }
  // ...but whoever is hitting this settler right now comes first of all
  // a squad soldier goes for the enemy that came near its post (see holdPost)
  if (s.postTarget && (!game.enemies.includes(s.postTarget) ||
      !canFightDuringDefense(s, tick, s.postTarget, attacker))) s.postTarget = null;
  if (!attacker && s.postTarget) targetEnemy = s.postTarget;
  // ...or the one its captain gave it (#248), unless the player marked one for it
  if (s.captainTarget && !game.enemies.includes(s.captainTarget)) s.captainTarget = null;
  if (s.captainTarget && !canFightDuringDefense(s, tick, s.captainTarget, attacker)) s.captainTarget = null;
  if (!attacker && s.captainTarget && !(targetEnemy && targetEnemy.markedTarget)) targetEnemy = s.captainTarget;
  if (attacker) targetEnemy = attacker;
  if (targetEnemy && !canFightDuringDefense(s, tick, targetEnemy, attacker)) targetEnemy = null;
  // in melee, not a heap on one enemy: one that has enough on it already gives way to the next best (#208)
  if (targetEnemy && !attacker && !isBowWeapon(s.weapon) && !targetEnemy.markedTarget && meleeFull(targetEnemy, tick)) {
    let next = null, nearest = 300;
    for (const en of game.enemies) {
      if (en === targetEnemy || meleeFull(en, tick) ||
          !canFightDuringDefense(s, tick, en, attacker)) continue;
      const d = distanceTo(en, s.x, s.y);
      if (d < nearest) { nearest = d; next = en; }
    }
    if (next) targetEnemy = next;
  }
  // on the way to the enemy tents: only fight what's in the way, then carry on (clearEnemyTents); but an
  // enemy the player marked, or one at the base, comes first (#261: they went for the tents past both)
  const assaulting = tick.tentAssault && joinsTentAssault(s, tick);
  if (assaulting && !attacker && !(targetEnemy && (targetEnemy.markedTarget || isInsideBase(targetEnemy)))) {
    let nearest = Infinity;
    targetEnemy = null;
    for (const en of game.enemies) {
      if (!isInsideBase(en)) continue;
      const d = distanceTo(en, s.x, s.y);
      if (d < nearest) { nearest = d; targetEnemy = en; }
    }
    if (targetEnemy) return { targetEnemy, attacker };
    let nearestWay = TENT_ASSAULT_FIGHT_DISTANCE;
    game.enemies.forEach(en => {
      const d = distanceTo(en, s.x, s.y);
      if (d < nearestWay) { nearestWay = d; targetEnemy = en; }
    });
    if (!targetEnemy) return null;
  }
  if (game.gameMode === 'menu' && targetEnemy && !attacker && Math.hypot(targetEnemy.x - townHall.x, targetEnemy.y - townHall.y) > MENU_GUARD) targetEnemy = null; // (#279)
  return { targetEnemy, attacker };
}

function isCampEnemy(enemy) {
  return enemy.campDefender || (enemy.campId && !enemy.fromWave);
}

function canFightDuringDefense(s, tick, enemy, attacker) {
  if (enemy === attacker || enemy.markedTarget || s.raider) return true;
  if (isCampEnemy(enemy) && !s.raider) return false;
  if (game.gameMode === 'battle') return true;
  if (!tick.isWaveActive && !isDefenseAlert()) return true;
  if (enemy.fromWave && (enemy.wavePrepared || enemy.musterUntil > game.pathTick)) return false;
  if (distanceTo(enemy, s.x, s.y) <= 3 * TILE_SIZE) return true;
  if (isInsideBase(enemy)) return true;
  const hallReach = getBaseRadius() + GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE + townHall.radius + TILE_SIZE;
  if (distanceTo(enemy, townHall.x, townHall.y) <= hallReach) return true;
  const nearBuilding = GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE + TILE_SIZE;
  return game.buildings.some(b => !b.campId && distanceTo(enemy, b.x, b.y) <= nearBuilding);
}

// Enough settlers in melee on that enemy this tick already (GAME_CONFIG.combatAI)
function meleeFull(en, tick) {
  const ai = GAME_CONFIG.combatAI;
  return (tick.meleeOn.get(en) || 0) >= (en.type === 'big' ? ai.meleePerBig : ai.meleePerEnemy);
}

// An archer's arrows: from a tower close by, from the storage it's at, or it walks to a storage when
// empty. True while that keeps it busy.
function restockArrows(s, dt) {
  let currentArrows = s.arrows || 0;
  let capacity = s.quiverCapacity || 12;
  let nearbyTower = findNearestArrowTower(s);
  // arrows from the nearest storage, if the stock has any
  const arrowStore = stock.arrows > 0 ? findNearestStorage(s) : null;
  const atArrowStore = !!arrowStore && isAtStorage(s, arrowStore);
  let towerDistance = nearbyTower ? Math.hypot(nearbyTower.x - s.x, nearbyTower.y - s.y) : Infinity;

  if (nearbyTower && currentArrows < capacity) {
    if (towerDistance > 32) {
      moveEntityTowards(s, nearbyTower.x, nearbyTower.y, s.speed, false, dt);
      s.patrolTarget = null;
      return true;
    }
    refillArcherFromTower(s, nearbyTower);
    currentArrows = s.arrows;
  }

  if (atArrowStore && currentArrows < capacity) {
    s.arrows = currentArrows + takeStock('arrows', capacity - currentArrows);
    currentArrows = s.arrows;
  }

  if (currentArrows === 0 && arrowStore && !atArrowStore) {
    walkToStorage(s, arrowStore, dt);
    return true;
  }
  return false;
}

// Fight the enemy if it's close enough (or it's not a worker): the unarmed shelter at the town hall while
// there are defenders; the rest walk up and strike (an archer shoots from where it has a clear line).
// False when there's nothing to fight.
function engageEnemy(s, tick, targetEnemy, attacker, dt) {
  let distToClosestEn = targetEnemy ? Math.hypot(targetEnemy.x - s.x, targetEnemy.y - s.y) : Infinity;

  // (a necromancer's staff fights: it doesn't shelter at the town hall, #232)
  let isUnarmedOrRod = (s.weapon === 'fist') && !getNecromancy(s);
  let isToolWorker = isUnarmedOrRod && (hasAxeTool(s.tool) || hasPickaxeTool(s.tool));
  let enemyNearTownHall = targetEnemy && Math.hypot(targetEnemy.x - townHall.x, targetEnemy.y - townHall.y) < 240;
  // tent-summoned enemies alone don't call workers off their work, unless they come close
  // workers keep working through a wave and only react to an enemy close by
  const alarm = tick.isWaveActive && tick.defendersCount === 0 ? Infinity
    : tick.isWaveActive && !tick.tentAssault ? GAME_CONFIG.defense.workerAlarm : 260;
  if (targetEnemy && (distToClosestEn < alarm || s.role !== 'worker')) {
    // (in battle mode there's no town hall to shelter at: the unarmed fight too)
    const armedDefender = game.settlers.some(other => other !== s &&
      (other.weapon !== 'fist' || hasAxeTool(other.tool) || hasPickaxeTool(other.tool) || getNecromancy(other)));
    if (isUnarmedOrRod && armedDefender && !(isToolWorker && enemyNearTownHall) && !attacker && game.gameMode !== 'battle') {
      if (!isAtTownHall(s)) {
        moveSettlerToTownHall(s, s.speed, dt);
      }
      s.patrolTarget = null;
      return true;
    }
    if (attackHostileStructureOnPath(s, targetEnemy, dt)) return true;

    let dist = distToClosestEn;
    // approach: how close to walk before striking (bows: shoot from under this distance)
    const approach = getWeaponStats(s, 'combat').approach;
    // bows need a clear line of fire too, or they walk closer. Melee approach is set for a normal settler
    // against a normal enemy (bodies 21 px apart): bigger bodies keep their centres further apart (see
    // separateSettlersFromEnemies), so a big settler or a brute counts as in reach that much sooner
    const extraBody = Math.max(0, (s.visualRadius || s.radius) + targetEnemy.radius - NORMAL_BODIES);
    const inReach = isBowWeapon(s.weapon)
      ? dist < approach && hasLineOfFire(s.x, s.y, targetEnemy.x, targetEnemy.y)
      : dist <= approach + extraBody;
    if (inReach) {
      performAttack(s, targetEnemy.x, targetEnemy.y);
    } else if (!isBowWeapon(s.weapon)) {
      // in melee each takes a side of its own round the enemy (#208)
      const slot = tick.meleeOn.get(targetEnemy) || 0;
      const around = Math.atan2(s.y - targetEnemy.y, s.x - targetEnemy.x) + (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 0.9;
      const near = dist < approach * 3;
      moveEntityTowards(s, near ? targetEnemy.x + Math.cos(around) * approach * 0.8 : targetEnemy.x, near ? targetEnemy.y + Math.sin(around) * approach * 0.8 : targetEnemy.y, s.speed, false, dt);
    } else {
      moveEntityTowards(s, targetEnemy.x, targetEnemy.y, s.speed, false, dt);
    }
    if (!isBowWeapon(s.weapon)) tick.meleeOn.set(targetEnemy, (tick.meleeOn.get(targetEnemy) || 0) + 1);
    s.patrolTarget = null;
    return true;
  }
  return false;
}

function attackHostileStructureOnPath(s, target, dt) {
  const dx = target.x - s.x, dy = target.y - s.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1) return false;
  const sideX = s.battleEntry ? s.battleEntry.x : s.x;
  const side = sideX < game.WORLD_WIDTH / 2 ? 'green' : 'red';
  const structures = game.gameMode === 'battle'
    ? game.buildings.filter(b => b.side && b.side !== side)
    : game.enemyTents.filter(b => b.hp > 0);
  let blocker = null, nearest = Infinity;
  for (const structure of structures) {
    const x = structure.x;
    const y = structure.y + (structure.outpost ? OUTPOST_COLLISION_OFFSET_Y : 0);
    const along = ((x - s.x) * dx + (y - s.y) * dy) / lengthSquared;
    if (along <= 0 || along >= 1) continue;
    const distance = Math.hypot(x - (s.x + along * dx), y - (s.y + along * dy));
    const width = structure.outpost ? OUTPOST_COLLISION_HALF_WIDTH : 15;
    const height = structure.outpost ? OUTPOST_COLLISION_HALF_HEIGHT : 15;
    if (distance > Math.hypot(width, height) + 12 || along >= nearest) continue;
    nearest = along;
    blocker = structure;
  }
  if (!blocker) return false;

  const x = blocker.x;
  const y = blocker.y + (blocker.outpost ? OUTPOST_COLLISION_OFFSET_Y : 0);
  const weapon = getWeaponStats(s, 'combat');
  const weaponRange = isBowWeapon(s.weapon) ? weapon.approach : weapon.range;
  const reach = weaponRange + (blocker.outpost
    ? Math.hypot(OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_HALF_HEIGHT) + s.radius
    : 20);
  if (Math.hypot(x - s.x, y - s.y) <= reach) {
    performAttack(s, x, y);
  } else {
    moveEntityTowards(s, x, y, s.speed, false, dt);
  }
  s.patrolTarget = null;
  return true;
}

// Who goes to destroy enemy tents: anyone armed, and unarmed workers only when nobody is armed
export function joinsTentAssault(s, tick) {
  return s.role !== 'worker' || s.weapon !== 'fist' || tick.workersHelpTents;
}

// Enemies closer than this to a settler on its way to the enemy tents get fought on the way
export const TENT_ASSAULT_FIGHT_DISTANCE = 150;

// Once a wave is down to its last few enemies, go destroy enemy tents, the nearest first; a tent the
// player pointed at first of all (goForMarkedTent)
export function clearEnemyTents(s, tick) {
  if (goForMarkedTent(s, tick)) return true;
  if (!tick.tentAssault || !joinsTentAssault(s, tick)) return false;
  if (game.enemies.some(isInsideBase)) return false; // (they're fought first, #261)
  let tent = null, minDist = Infinity;
  game.enemyTents.forEach(et => {
    if (et.campId) return; // (the enemy camp's tents are the raid's business, not the wave's)
    const d = Math.hypot(et.x - s.x, et.y - s.y);
    if (d < minDist) { minDist = d; tent = et; }
  });
  if (!tent) return false;
  attackTent(s, tent, tick);
  return true;
}

// A tent the player pointed at (#203): up to markedSquad of the armed go and destroy it, any time, off
// their posts in a wave too (holdPost). True when this settler is one of them
export function goForMarkedTent(s, tick) {
  if (s.weapon === 'fist' || s.isPossessed || s.towerAssignment) return false;
  const tent = takeMarkedTent(s, tick);
  if (!tent) return false;
  attackTent(s, tent, tick);
  return true;
}

// Walk up to a tent and strike it (an archer: from where it has a clear shot)
function attackTent(s, tent, tick) {
  const dx = tent.outpost ? Math.max(0, Math.abs(s.x - tent.x) - OUTPOST_COLLISION_HALF_WIDTH) : Math.abs(s.x - tent.x);
  const dy = tent.outpost ? Math.max(0, Math.abs(s.y - (tent.y + OUTPOST_COLLISION_OFFSET_Y)) - OUTPOST_COLLISION_HALF_HEIGHT) : Math.abs(s.y - tent.y);
  const dist = Math.hypot(dx, dy);
  const attackDist = getWeaponStats(s, 'combat').tentReach + (tent.outpost ? s.radius : 0);
  const blockedShot = isBowWeapon(s.weapon) && !hasLineOfFire(s.x, s.y, tent.x, tent.y);
  if (dist > attackDist || blockedShot) {
    moveEntityTowards(s, tent.x, tent.y, s.speed, false, tick.dt);
  } else {
    performAttack(s, tent.x, tent.y);
  }
  s.patrolTarget = null;
}

// A tent the player pointed at, for this settler, while fewer than markedSquad go for it
function takeMarkedTent(s, tick) {
  let best = null;
  for (const et of game.enemyTents) {
    if (!et.markedTarget || (tick.markedAssignments.get(et) || 0) >= GAME_CONFIG.defense.markedSquad) continue;
    if (!best || Math.hypot(et.x - s.x, et.y - s.y) < Math.hypot(best.x - s.x, best.y - s.y)) best = et;
  }
  if (best) tick.markedAssignments.set(best, (tick.markedAssignments.get(best) || 0) + 1);
  return best;
}

// ---- Guarding gatherers (#199)

// A worker far out: more than guardBeyondTiles past the edge of the base
function isFarOut(w) {
  const dx = w.x - townHall.x, dy = w.y - townHall.y;
  return Math.sqrt(dx * dx + dy * dy) > getBaseRadius() + GAME_CONFIG.idle.guardBeyondTiles * TILE_SIZE;
}

// Workers far out and the ids already guarded, worked out once a tick (a soldier looking for someone to
// guard was going over every settler it passed, and a colony has many soldiers)
function farOutWorkers(tick) {
  if (!tick.farOutWorkers) tick.farOutWorkers = game.settlers.filter(o => o.role === 'worker' && !o.isIdle && !o.isPossessed && isFarOut(o));
  return tick.farOutWorkers;
}

function guardedIds(tick) {
  if (!tick.guardedIds) {
    tick.guardedIds = new Set();
    for (const o of game.settlers) if (o.guardingId) tick.guardedIds.add(o.guardingId);
  }
  return tick.guardedIds;
}

// Between waves, a soldier or archer with nothing else to do guards a worker gathering far out of the base:
// one each, keeping within guardRange of it on the base's side, facing out (an enemy coming at them it
// fights, as ever: fightEnemies comes first)
export function escortGatherers(s, tick) {
  // (an archer with no arrows guards nobody, #232)
  if ((s.role !== 'soldier' && s.role !== 'archer') || s.isPossessed || s.towerAssignment || s.carrying || tick.isWaveActive || isDefenseAlert() ||
    (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0))) {
    if (s.guardingId) guardedIds(tick).delete(s.guardingId);
    s.guardingId = null;
    return false;
  }
  const guarded = guardedIds(tick);
  let w = s.guardingId ? game.settlers.find(o => o.id === s.guardingId) : null;
  if (!w || w.role !== 'worker' || w.isIdle || !isFarOut(w)) {
    if (s.guardingId) guarded.delete(s.guardingId); // (it let that one go: it's free for another)
    w = null;
    let nearest = Infinity;
    for (const o of farOutWorkers(tick)) {
      if (guarded.has(o.id)) continue;
      const d = distanceTo(o, s.x, s.y);
      if (d < nearest) { nearest = d; w = o; }
    }
  }
  s.guardingId = w ? w.id : null;
  if (w) guarded.add(w.id);
  if (!w) return false;
  const range = GAME_CONFIG.idle.guardRange;
  const d = Math.max(1, Math.hypot(w.x - townHall.x, w.y - townHall.y));
  const spot = { x: w.x + (townHall.x - w.x) / d * range * 0.6, y: w.y + (townHall.y - w.y) / d * range * 0.6 };
  s.patrolTarget = null;
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > range * 0.4) moveEntityTowards(s, spot.x, spot.y, s.speed, false, tick.dt);
  else faceTowards(s, w.x + (w.x - townHall.x), w.y + (w.y - townHall.y));
  return true;
}

// An archer fills its quiver at a storage (#232: it stood at its post empty before a wave with arrows in the
// stock): with a wave coming, up to full; otherwise once it's empty. Not with an enemy close (then it fights,
// restocking from a tower or the storage it's at in fightEnemies), nor on a tower (the tower's arrows)
export function restockQuiver(s, tick) {
  if (!isBowWeapon(s.weapon) || !s.quiver || s.isPossessed || s.towerAssignment || s.carrying || !(stock.arrows > 0)) return false;
  const capacity = s.quiverCapacity || 12, have = s.arrows || 0;
  if (!(isDefenseAlert() ? have < capacity : have <= 0)) return false;
  if (getRecentAttacker(s) || game.enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 160)) return false;
  const store = findNearestStorage(s);
  s.patrolTarget = null;
  if (isAtStorage(s, store)) { s.arrows = have + takeStock('arrows', capacity - have); return true; }
  walkToStorage(s, store, tick.dt);
  return true;
}
