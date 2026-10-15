// Soldiers fight: the enemy the player marked, their post in a squad, whoever attacks, and the enemy tents

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, townHall } from '../../../engine/world/index.js';
import { getWeaponStats, hasAxeTool, hasPickaxeTool, isBowWeapon } from '../../colony/equipment/index.js';
import { findNearestStorage, isAtStorage, moveSettlerToTownHall, stock, takeStock, walkToStorage } from '../../colony/storage/index.js';
import { getRecentAttacker } from '../../colony/settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { NORMAL_BODIES, getDefensePlan, getStance, hasLineOfFire, isDefenseAlert, isInsideBase, performAttack } from './combat.rules.js';
import { findNearestArrowTower, refillArcherFromTower } from '../towers/index.js';

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
// to a building), or hits it; then it fights that enemy (fightEnemies) and comes back afterwards. Its stance
// (#212): holding, it doesn't go for enemies in the base far from its post; attacking, it keeps no post
export function holdPost(s, tick) {
  if ((s.role !== 'soldier' && s.role !== 'archer') || s.isPossessed || s.towerAssignment || s.carrying || !isDefenseAlert()) return false;
  const stance = getStance(s);
  if (stance === 'attack') return false;
  const place = getDefensePlan().squadOf.get(s);
  if (!place || !place.post) return false;
  if (getRecentAttacker(s)) return false;
  // an enemy the player pointed at: a few soldiers leave their posts for it
  const marked = takeMarkedTarget(s, tick);
  if (marked) { s.postTarget = marked; return false; }
  if (goForMarkedTent(s, tick)) return true; // a tent the player pointed at, too (#203)
  const engage = GAME_CONFIG.defense.engageTiles * TILE_SIZE;
  let nearest = null, best = engage;
  for (const en of game.enemies) {
    const d = Math.hypot(en.x - place.post.x, en.y - place.post.y);
    if (d < best) { best = d; nearest = en; }
  }
  // nothing near the post: the nearest enemy that got into the base, wherever that is (not when holding)
  if (!nearest && stance !== 'hold') {
    best = Infinity;
    for (const en of game.enemies) {
      const d = Math.hypot(en.x - place.post.x, en.y - place.post.y);
      if (d < best && isInsideBase(en)) { best = d; nearest = en; }
    }
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

// Fight enemies: strike back at an attacker first, otherwise the enemy closest to the town hall.
// Archers restock arrows from towers or the town hall; unarmed settlers shelter at the town hall
// while there are defenders, unless they're being attacked themselves.
export function fightEnemies(s, tick) {
  const dt = tick.dt;
  const choice = chooseSettlerTarget(s, tick);
  if (!choice) return false; // on the way to the enemy tents, with nothing in the way
  const { targetEnemy, attacker } = choice;
  if (isBowWeapon(s.weapon) && s.quiver && restockArrows(s, dt)) return true;
  // an archer with nothing to shoot waits
  if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) {
    s.patrolTarget = null;
    return true;
  }
  return engageEnemy(s, tick, targetEnemy, attacker, dt);
}

// The enemy a settler fights: the one most dangerous to the base, an enemy the player marked, the one near
// its post, or whoever is hitting it right now. On the way to the enemy tents, only what's in the way
// (null: nothing is). attacker: the one hitting it, if any.
function chooseSettlerTarget(s, tick) {
  let targetEnemy = null;
  let minBaseDist = Infinity;
  // attacking (#212): simply the nearest enemy; otherwise the one most dangerous to the base
  const attacking = s.role !== 'worker' && getStance(s) === 'attack';
  game.enemies.forEach(en => {
    let dToTown = Math.hypot(en.x - townHall.x, en.y - townHall.y);
    let dToSettler = Math.hypot(en.x - s.x, en.y - s.y);
    let score = attacking ? dToSettler : dToTown + (dToSettler < 180 ? 0 : dToSettler * 0.4);
    if (score < minBaseDist) { minBaseDist = score; targetEnemy = en; }
  });
  // enemies the player marked with the Point tool come first, for up to markedSquad of the armed (a
  // squad soldier already got its own from holdPost)...
  if (s.weapon !== 'fist' && !(s.postTarget && s.postTarget.markedTarget && game.enemies.includes(s.postTarget))) {
    const marked = takeMarkedTarget(s, tick);
    if (marked) targetEnemy = marked;
  }
  // ...but whoever is hitting this settler right now comes first of all
  const attacker = getRecentAttacker(s);
  // a squad soldier goes for the enemy that came near its post (see holdPost)
  if (!attacker && s.postTarget && game.enemies.includes(s.postTarget)) targetEnemy = s.postTarget;
  if (attacker) targetEnemy = attacker;
  // on the way to the enemy tents: only fight what's in the way, then carry on (clearEnemyTents)
  const assaulting = tick.tentAssault && joinsTentAssault(s, tick);
  if (assaulting && !attacker) {
    targetEnemy = null;
    let nearest = TENT_ASSAULT_FIGHT_DISTANCE;
    game.enemies.forEach(en => {
      const d = Math.hypot(en.x - s.x, en.y - s.y);
      if (d < nearest) { nearest = d; targetEnemy = en; }
    });
    if (!targetEnemy) return null;
  }
  return { targetEnemy, attacker };
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

  let isUnarmedOrRod = (s.weapon === 'fist');
  let isToolWorker = isUnarmedOrRod && (hasAxeTool(s.tool) || hasPickaxeTool(s.tool));
  let enemyNearTownHall = targetEnemy && Math.hypot(targetEnemy.x - townHall.x, targetEnemy.y - townHall.y) < 240;
  // tent-summoned enemies alone don't call workers off their work, unless they come close
  // workers keep working through a wave and only react to an enemy close by
  const alarm = tick.isWaveActive && !tick.tentAssault ? GAME_CONFIG.defense.workerAlarm : 260;
  if (targetEnemy && (distToClosestEn < alarm || s.role !== 'worker')) {
    // (in battle mode there's no town hall to shelter at: the unarmed fight too)
    if (isUnarmedOrRod && tick.defendersCount > 0 && !(isToolWorker && enemyNearTownHall) && !attacker && game.gameMode !== 'battle') {
      let distToTown = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTown > townHall.radius + 15) {
        moveSettlerToTownHall(s, s.speed, dt);
      }
      s.patrolTarget = null;
      return true;
    }

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
    } else {
      moveEntityTowards(s, targetEnemy.x, targetEnemy.y, s.speed, false, dt);
    }
    s.patrolTarget = null;
    return true;
  }
  return false;
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
  // attacking (#212): the armed go for the tents at any time; holding: only when the player marks one
  const stance = s.role !== 'worker' ? getStance(s) : 'defend';
  if (stance === 'hold') return false;
  const assault = (tick.tentAssault && joinsTentAssault(s, tick)) || (stance === 'attack' && s.weapon !== 'fist' && !s.isPossessed && !s.towerAssignment);
  if (!assault) return false;
  let tent = null, minDist = Infinity;
  game.enemyTents.forEach(et => {
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
  const dist = Math.hypot(tent.x - s.x, tent.y - s.y);
  const attackDist = getWeaponStats(s, 'combat').tentReach;
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
