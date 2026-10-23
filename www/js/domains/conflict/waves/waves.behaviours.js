// What enemies do by themselves, each tick

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game, getGridPos, rand, STRUCTURE_COLLISION_HALF_SIZE, TILE_SIZE, townHall } from '../../../engine/world/index.js';
import { getFrontier, isNight, nightProgress } from '../../world/index.js';
import { isBuildingSingle, removeBuilding } from '../../economy/building/index.js';
import { enemyDamagePerSecond, findNearestEnemyTent, getEnemyDef } from './waves.rules.js';
import { getEnemyFaction } from '../../factions/index.js';
import { damageSettler, faceTowards, isUntouchable, speak, startSwing } from '../../colony/settlers/index.js';
import { scheduleRespawn } from '../../economy/gathering/index.js';
import { isShelter } from '../healing/index.js';
import { enemyNecromancy } from '../../factions/undead/index.js';
import { clampEntityToBounds, collidesWithBoxList, collidesWithWall, collidesWithWater, invalidateAllPaths, isTileBlockedForEnemyStrict, moveEntityTowards, rescueEnemyFromResource } from '../../../engine/movement/index.js';
import { hasLineOfFire } from '../combat/index.js';
import { playSound } from '../../../app/index.js';
import { enemyPanic, necromancerKeepsBack, shakeMorale } from '../morale/index.js';
import { getViewRect } from '../../../engine/platform/index.js';

// Every enemy's tick, last first
export function tickEnemies(dt) {
  for (let i = game.enemies.length - 1; i >= 0; i--) tickEnemy(game.enemies[i], dt);
}

/** @typedef {import('../../../engine/world/types.js').Settler} Settler */
/** @typedef {import('../../../engine/world/types.js').TownHall} TownHall */

// An enemy medic (#203): walks up to the most hurt of its side within range and heals it; with a settler
// at it, or nobody hurt, it fights like the rest (weakly). True while it heals
function enemyHeal(en, healer, dt) {
  if (game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < 50)) return false;
  let patient = null;
  for (const other of game.enemies) {
    if (other === en || other.hp >= other.maxHp || Math.hypot(other.x - en.x, other.y - en.y) > healer.range) continue;
    if (!patient || other.hp / other.maxHp < patient.hp / patient.maxHp) patient = other;
  }
  if (!patient) return false;
  if (Math.hypot(patient.x - en.x, patient.y - en.y) > healer.healRange + patient.radius) {
    moveEntityTowards(en, patient.x, patient.y, en.speed, true, dt);
  } else {
    patient.hp = Math.min(patient.maxHp, patient.hp + healer.healPerSecond * dt);
    faceTowards(en, patient.x, patient.y);
  }
  return true;
}

// (#255) Who the camp's defenders turn on: a party raiding the camp, or anyone who has walked inside its
// palisade. The colony's people working near the camp are not set upon, so a camp standing on the map is no
// call to arms by itself (the raid is the player's to declare).
function campDefenderTargets(en) {
  const camp = game.enemyTents.find(et => et.outpost && et.campId === en.campId);
  const post = en.guard || en;
  const cx = camp ? camp.x : post.x, cy = camp ? camp.y : post.y;
  const ground = (GAME_CONFIG.raid.wallTiles + 1) * 30;
  return game.settlers.filter(s => s.hp > 0 && !isUntouchable(s) &&
    (s.raider || Math.hypot(cx - s.x, cy - s.y) < ground));
}

// (#314) An enemy ghost: straight at the nearest settler not in a panic, through anything; into it, it panics
// and the ghost is gone (no corpse, no spoils)
function enemyGhost(en) {
  /** @type {{ x: number, y: number } | null} */
  let target = null, best = Infinity;
  const targets = en.campDefender ? campDefenderTargets(en) : game.settlers;
  for (const s of targets) {
    const d = Math.hypot(s.x - en.x, s.y - en.y);
    if (!s.panic && !isUntouchable(s) && s.hp > 0 && d < best) { best = d; target = s; }
  }
  if (!target) {
    if (en.campDefender) return;
    if (game.gameMode === 'battle') return; // (no town hall in a battle: stay, don't fly off the field)
    target = townHall;
  }
  const d = Math.hypot(target.x - en.x, target.y - en.y), step = GAME_CONFIG.pets.ghost.diveSpeed * GAME_CONFIG.movementScale;
  faceTowards(en, target.x, target.y);
  if (d > Math.max(14, step)) { en.x += (target.x - en.x) / d * step; en.y += (target.y - en.y) / d * step; return; }
  if (target !== townHall) shakeMorale(target, 9999, 'settler', true);
  Object.assign(en, { hp: 0, crumbled: true, rewardGranted: true, fled: true });
}

// One enemy: builds its tent, or picks a target (a settler near it or the town hall), shoots or walks up,
// breaks through what blocks its way, and strikes
export function tickEnemy(en, dt) {
  clampEntityToBounds(en);
  if (en.trapped) return; // held in an iron trap (#248): it can't move or strike till it's free
  if (rescueEnemyFromResource(en)) return;
  if (en.campDefender && !tickOffscreenCampResident(en, dt)) return;
  if (enemyPanic(en, dt)) { en.buildTarget = null; return; } // in a panic: away to heal (#207)
  if (en.buildTarget) { buildEnemyTent(en, dt); return; }
  if (en.wavePrepared) {
    if (!game.wavePrepared && !game.waveMarchPaused) {
      en.wavePrepared = false;
      en.muster = { x: en.x, y: en.y };
      en.musterUntil = game.pathTick + Math.round(GAME_CONFIG.waveMuster.musterSeconds * 60);
    }
  }
  if (en.wavePrepared) {
    if (game.waveMarchPaused) {
      if (game.settlers.some(s => s.raider && Math.hypot(s.x - en.x, s.y - en.y) < GAME_CONFIG.raid.guardTiles * 30)) {
        en.wavePrepared = false;
        en.guardOff = true;
      } else {
        const at = en.waveStart || en;
        if (Math.hypot(at.x - en.x, at.y - en.y) > 8) moveEntityTowards(en, at.x, at.y, en.speed, true, dt);
        else faceTowards(en, townHall.x, townHall.y);
        return;
      }
    } else {
      const target = en.waveTarget || en;
      if (Math.hypot(target.x - en.x, target.y - en.y) > 8) moveEntityTowards(en, target.x, target.y, en.speed, true, dt);
      else faceTowards(en, townHall.x, townHall.y);
      return;
    }
  }
  if (en.guard && holdGuardPost(en, dt)) return; // (a defender of an enemy camp, #255)
  if (getEnemyDef(en).pet === 'ghost') { enemyGhost(en); return; } // (#314)
  if (en.scout) { scoutFlees(en, dt); return; } // (a scout the player pointed at: it only runs, #279)
  if (en.captain) captainOrdersEnemies(en, dt); // (gathering too: the one it tells goes at once)
  if (en.musterUntil && musterHold(en, dt)) return; // (a wave gathering first, #279)

  const enemyDef = getEnemyDef(en);
  if (enemyDef.necromancer && enemyNecromancy(en, enemyDef.necromancer, dt)) return;
  if (enemyDef.necromancer && necromancerKeepsBack(en, dt)) return; // behind its own (#207)
  if (enemyDef.healer && enemyHeal(en, enemyDef.healer, dt)) return;
  const { target, minDist } = chooseEnemyTarget(en);
  const { shooting, meleeDef, moveTarget } = chooseEnemyAttack(en, enemyDef, target);
  en.weapon = meleeDef.weapon || 'sword';
  const inMelee = !shooting && moveTarget === target;
  // an archer with no clear shot walks closer instead of standing off
  const clearShot = shooting && hasLineOfFire(en.x, en.y, target.x, target.y);
  const keepsAway = clearShot && minDist < enemyDef.ranged.keepAway;
  if (shooting) enemyShoot(en, enemyDef, target, minDist, clearShot, dt);

  // a melee enemy close enough to strike stands and fights instead of walking into its target
  // the drawn size of a settler: a big one is pushed off further (see separateSettlersFromEnemies)
  const attackDist = target === townHall
    ? Math.hypot(Math.max(0, Math.abs(en.x - townHall.x) - STRUCTURE_COLLISION_HALF_SIZE),
      Math.max(0, Math.abs(en.y - townHall.y) - STRUCTURE_COLLISION_HALF_SIZE))
    : minDist;
  const attackRange = target === townHall
    ? en.radius + meleeDef.reach
    : (/** @type {Settler} */ (target).visualRadius || target.radius) + en.radius + meleeDef.reach;
  const holdsGround = keepsAway || (inMelee && attackDist < attackRange);
  walkOrBreakThrough(en, enemyDef, moveTarget, holdsGround, dt);
  if (inMelee && attackDist < attackRange) enemyStrike(en, enemyDef, meleeDef, target, dt);
}

function tickOffscreenCampResident(en, dt) {
  const camp = game.enemyTents.find(et => et.outpost && et.campId === en.campId);
  if (!camp || campDefenderTargets(en).length || campIsOnScreen(camp)) return true;
  en.asleep = campGuardSleeps(en, camp);
  if (camp.offscreenTick !== game.pathTick) {
    camp.offscreenTick = game.pathTick;
    const defenders = game.enemies.filter(other => other.campDefender && other.campId === camp.campId && other.hp > 0 &&
      !getEnemyDef(other).pet).length;
    // (#...) the undead make no meals: no cooking is worked out for their camp offscreen either
    if (campCooks()) {
      camp.offscreenCookProgress = (camp.offscreenCookProgress || 0) + dt * Math.max(1, defenders) / GAME_CONFIG.cooking.seconds;
      while (camp.offscreenCookProgress >= 1) {
        camp.offscreenCookProgress--;
        camp.campMeals = (camp.campMeals || 0) + GAME_CONFIG.cooking.makes;
      }
    }
    camp.offscreenEatProgress = (camp.offscreenEatProgress || 0) + dt * defenders / GAME_CONFIG.meals.seconds;
    while (camp.offscreenEatProgress >= 1 && camp.campMeals > 0) {
      camp.offscreenEatProgress--;
      camp.campMeals--;
    }
  }
  en.campActivity = null;
  en.campTarget = null;
  en.campCarrying = null;
  return false;
}

function campIsOnScreen(camp) {
  const view = getViewRect(80);
  return camp.x >= view.x0 && camp.x <= view.x1 && camp.y >= view.y0 && camp.y <= view.y1;
}

function campGuardSleeps(en, camp) {
  if (!camp || !isNight()) return false;
  const guards = game.enemies.filter(other => other.hp > 0 && other.campDefender && other.campId === camp.campId &&
    !getEnemyDef(other).pet);
  const shiftIndex = guards.indexOf(en);
  if (shiftIndex < 0 || guards.length < 2) return false;
  return (shiftIndex % 2 === 0) !== (nightProgress() < 0.5);
}

// A defender of an enemy camp (#255): at its post till a settler comes within guardTiles of it, or of itself.
// True while it holds the post
// (#279) once off its post it goes after them, a retreat or a scout running too (guardOff), till the camp's
// gone back to
function holdGuardPost(en, dt) {
  const reach = GAME_CONFIG.raid.guardTiles * 30;
  if (en.campDefender) {
    const post = en.guard || en;
    const threatNearby = campDefenderTargets(en).some(s =>
      Math.hypot(post.x - s.x, post.y - s.y) < reach ||
      Math.hypot(en.x - s.x, en.y - s.y) < reach * 0.6);
    if (isNight() && !threatNearby) {
      const camp = game.enemyTents.find(et => et.outpost && et.campId === en.campId);
      en.asleep = campGuardSleeps(en, camp);
      en.campActivity = null;
      en.campTarget = null;
      en.campCarrying = null;
      en.guardOff = false;
      if (!en.asleep && Math.hypot(post.x - en.x, post.y - en.y) > 6) moveEntityTowards(en, post.x, post.y, en.speed, true, dt);
      return true;
    }
    en.asleep = false;
    if (!threatNearby) {
      en.guardOff = false;
      tickCampLife(en, dt);
      return true;
    }
    en.guardOff = true;
    return false;
  }
  if (en.guardOff) return false;
  if (game.settlers.some(s => Math.hypot(s.x - en.guard.x, s.y - en.guard.y) < reach || Math.hypot(s.x - en.x, s.y - en.y) < reach * 0.6)) { en.guardOff = true; return false; }
  if (Math.hypot(en.guard.x - en.x, en.guard.y - en.y) > 6) moveEntityTowards(en, en.guard.x, en.guard.y, en.speed, true, dt);
  return true;
}

// (#...) the undead eat nothing (factions.eats): their camp keeps its fire for light and warmth, but
// nothing is cooked on it
const campCooks = () => getEnemyFaction().eats !== false;

function tickCampLife(en, dt) {
  const camp = game.enemyTents.find(et => et.outpost && et.campId === en.campId);
  if (!camp) {
    const post = en.guard || en;
    if (Math.hypot(post.x - en.x, post.y - en.y) > 6) moveEntityTowards(en, post.x, post.y, en.speed, true, dt);
    return;
  }
  if (camp.campMeals === undefined) camp.campMeals = 0;

  if (en.campActivity === 'eat') {
    en.campActivityTimer -= dt;
    if (en.campActivityTimer > 0) return;
    speak(en, getEnemyFaction().id, 'ate');
    en.campActivity = null;
  }
  if (en.campActivity === 'cook') {
    if (tickCampCooking(en, camp, dt)) return;
    en.campActivity = null;
    return;
  }
  if (en.campActivity === 'talk') {
    en.campActivityTimer -= dt;
    const partner = game.enemies.find(other => other !== en && other.campId === en.campId &&
      other.hp > 0 && !getEnemyDef(other).pet &&
      Math.hypot(other.x - en.x, other.y - en.y) < 80);
    if (partner) faceTowards(en, partner.x, partner.y);
    if (en.campActivityTimer <= 0) {
      speak(en, getEnemyFaction().id, 'idle');
      en.campActivity = null;
    } else return;
  }
  if (en.campActivity === 'wander' && en.campTarget) {
    const arrived = Math.hypot(en.x - en.campTarget.x, en.y - en.campTarget.y) <= 18;
    // a spot it can't get to round its own buildings: give up after a while instead of pressing at a wall
    const gaveUp = game.pathTick >= (en.campTargetUntil || 0);
    if (!arrived && !gaveUp) {
      moveEntityTowards(en, en.campTarget.x, en.campTarget.y, en.speed * 0.45, true, dt);
      return;
    }
    en.campActivity = null;
    en.campTarget = null;
    en.campTargetUntil = 0;
  }
  en.campActivityTimer = 5 + rand() * 8;
  const friends = game.enemies.filter(other => other !== en && other.campId === en.campId &&
    other.hp > 0 && !getEnemyDef(other).pet && Math.hypot(other.x - en.x, other.y - en.y) < 120);
  const fires = game.buildings.filter(b => b.campId === camp.campId && b.type === 'campfire');
  const choices = ['wander'];
  if (fires.length && campCooks()) choices.push('cook');
  if (fires.length && camp.campMeals > 0) choices.push('eat');
  if (friends.length) choices.push('talk', 'talk');
  en.campActivity = choices[Math.floor(rand() * choices.length)];

  if (en.campActivity === 'eat') {
    camp.campMeals--;
    en.campActivityTimer = 3;
    return;
  }
  if (en.campActivity === 'cook') {
    en.campCarrying = { rawMeat: 0, firewood: 0 };
    en.campTarget = null;
    en.campFireX = undefined;
    en.campFireY = undefined;
    tickCampCooking(en, camp, dt);
    return;
  }
  if (en.campActivity === 'talk') {
    en.campActivityTimer = 3 + rand() * 4;
    return;
  }

  const center = getGridPos(camp.x, camp.y);
  const radius = Math.max(1, GAME_CONFIG.raid.wallTiles - (camp.layout === 'fort' ? 3 : 1));
  for (let attempt = 0; attempt < 12; attempt++) {
    const gx = center.gx + Math.floor(rand() * (radius * 2 + 1)) - radius;
    const gy = center.gy + Math.floor(rand() * (radius * 2 + 1)) - radius;
    const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
    if (Math.max(Math.abs(gx - center.gx), Math.abs(gy - center.gy)) >= radius ||
        isTileBlockedForEnemyStrict(gx, gy) || collidesWithWall(x, y, Math.min(en.radius, 13)) ||
        collidesWithWater(x, y, Math.min(en.radius, 13))) continue;
    en.campTarget = { x, y };
    en.campTargetUntil = game.pathTick + 8 * 60;
    en.campActivity = 'wander';
    moveEntityTowards(en, en.campTarget.x, en.campTarget.y, en.speed * 0.45, true, dt);
    return;
  }
  const post = en.guard || en;
  if (Math.hypot(post.x - en.x, post.y - en.y) > 6) moveEntityTowards(en, post.x, post.y, en.speed, true, dt);
}

function tickCampCooking(en, camp, dt) {
  if (!campCooks()) return false; // (the undead cook nothing)
  const fires = game.buildings.filter(b => b.campId === camp.campId && b.type === 'campfire');
  if (!fires.length) return false;
  for (const fire of fires) {
    if ((fire.fuelLeft || 0) >= 1e6) { fire.fuelLeft = 0; fire.burning = 0; }
  }

  const enemyIndex = game.enemies.indexOf(en);
  const activeCook = fire => {
    const other = game.enemies[fire.campCookerIndex];
    return other && other !== en && other.hp > 0 && other.campId === camp.campId &&
      other.campActivity === 'cook' && game.pathTick - (fire.campCookerTick || 0) <= 1;
  };
  const canReachFire = fire => !!findCampApproachPoint(en, fire.x, fire.y, 32);
  let fire = fires.find(f => f.x === en.campFireX && f.y === en.campFireY);
  if (!fire || activeCook(fire) || !canReachFire(fire)) {
    fire = fires.filter(f => !activeCook(f) && canReachFire(f))
      .sort((a, b) => Math.hypot(a.x - en.x, a.y - en.y) - Math.hypot(b.x - en.x, b.y - en.y))[0];
    if (!fire) return false;
    en.campFireX = fire.x;
    en.campFireY = fire.y;
  }
  fire.campCookerIndex = enemyIndex;
  fire.campCookerTick = game.pathTick;

  const supplies = en.campCarrying || (en.campCarrying = { rawMeat: 0, firewood: 0 });
  const fetch = kind => {
    const store = en.campTarget || (en.campTarget = { x: camp.x, y: camp.y + 36 });
    if (!moveNearCampTarget(en, store.x, store.y, 28, dt)) return;
    supplies[kind]++;
    en.campTarget = null;
    en.working = 0.1;
  };

  if (!((fire.fuelLeft || 0) > 0) && supplies.firewood > 0) {
    if (!moveNearCampTarget(en, fire.x, fire.y, 32, dt)) return true;
    fire.fuelLeft = (fire.fuelLeft || 0) + GAME_CONFIG.cooking.fuel.firewood * supplies.firewood;
    fire.burning = 1;
    supplies.firewood = 0;
    en.working = 0.1;
    playSound('ignite', fire);
    return true;
  }
  if (!((fire.fuelLeft || 0) > 0)) {
    fetch('firewood');
    return true;
  }
  if (supplies.rawMeat <= 0) {
    fetch('rawMeat');
    return true;
  }
  if (!moveNearCampTarget(en, fire.x, fire.y, 32, dt)) return true;

  en.working = 0.1;
  faceTowards(en, fire.x, fire.y);
  fire.cookProgress = (fire.cookProgress || 0) + dt / GAME_CONFIG.cooking.seconds;
  if (fire.cookProgress >= 1) {
    fire.cookProgress = 0;
    supplies.rawMeat--;
    camp.campMeals = (camp.campMeals || 0) + GAME_CONFIG.cooking.makes;
    speak(en, getEnemyFaction().id, 'cooked');
    playSound('sizzle', fire);
    if (supplies.rawMeat <= 0) {
      en.campCarrying = null;
      en.campFireX = undefined;
      en.campFireY = undefined;
      return false;
    }
  }
  return true;
}

function findCampApproachPoint(en, targetX, targetY, interactionRange) {
  const bodyRadius = Math.min(en.radius, 13);
  const currentDistance = Math.hypot(en.x - targetX, en.y - targetY);
  if (currentDistance <= interactionRange && !collidesWithWall(en.x, en.y, bodyRadius) &&
      !collidesWithWater(en.x, en.y, bodyRadius)) return { x: en.x, y: en.y };

  const center = getGridPos(targetX, targetY), points = [];
  for (let gy = center.gy - 2; gy <= center.gy + 2; gy++) {
    for (let gx = center.gx - 2; gx <= center.gx + 2; gx++) {
      const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
      if (Math.hypot(x - targetX, y - targetY) > interactionRange - 1 ||
          isTileBlockedForEnemyStrict(gx, gy) || collidesWithWall(x, y, bodyRadius) ||
          collidesWithWater(x, y, bodyRadius)) continue;
      points.push({ x, y, distance: Math.hypot(x - en.x, y - en.y) });
    }
  }
  return points.sort((a, b) => a.distance - b.distance)[0] || null;
}

function moveNearCampTarget(en, targetX, targetY, interactionRange, dt) {
  const approach = findCampApproachPoint(en, targetX, targetY, interactionRange);
  if (!approach) return false;
  if (Math.hypot(en.x - targetX, en.y - targetY) <= interactionRange &&
      !collidesWithWall(en.x, en.y, Math.min(en.radius, 13))) return true;
  moveEntityTowards(en, approach.x, approach.y, en.speed * 0.45, true, dt);
  return Math.hypot(en.x - targetX, en.y - targetY) <= interactionRange &&
    !collidesWithWall(en.x, en.y, Math.min(en.radius, 13));
}

// (#279) a wave's enemy gathering where it came in before it attacks: it stands facing the base and shouts at
// the settlers now and then; a settler coming close, or the time up, and it's off. True while it gathers
function musterHold(en, dt) {
  const m = GAME_CONFIG.waveMuster;
  if (game.pathTick >= en.musterUntil || en.hp < en.maxHp) {
    en.musterUntil = 0;
    return false;
  }
  if (Math.hypot(en.muster.x - en.x, en.muster.y - en.y) > 6) moveEntityTowards(en, en.muster.x, en.muster.y, en.speed, true, dt);
  else faceTowards(en, townHall.x, townHall.y);
  if (Math.random() < dt * 0.12) speak(en, getEnemyFaction().id, 'taunt');
  return true;
}

// (#279) an enemy commander: every everySeconds it tells one of its own within reach, in turn, which settler
// to go for, one each, the nearest to it first (as the player's captain does, settlers.commanders.js)
function captainOrdersEnemies(en, dt) {
  const c = GAME_CONFIG.waveMuster.captain;
  en.orderIn = (en.orderIn ?? 0) - dt;
  if (en.orderIn > 0) return;
  en.orderIn = c.everySeconds;
  const squad = game.enemies.filter(o => o !== en && o.hp > 0 && !o.scout && Math.hypot(o.x - en.x, o.y - en.y) < c.reach);
  if (!squad.length) return;
  en.orderTurn = ((en.orderTurn || 0) + 1) % squad.length;
  const to = squad[en.orderTurn];
  const taken = new Set(squad.filter(o => o !== to).map(o => o.attackTarget).filter(Boolean));
  const target = game.settlers.filter(s => !taken.has(s)).sort((a, b) => Math.hypot(a.x - en.x, a.y - en.y) - Math.hypot(b.x - en.x, b.y - en.y))[0];
  if (!target) return;
  to.attackTarget = target;
  to.musterUntil = 0; // (told: it goes)
  to.orderBubble = { icon: 'swords', until: game.pathTick + 60 };
  en.orderBubble = { icon: 'swords', until: game.pathTick + 40 };
}

// (#279) a scout the player pointed at: off to the nearest edge of the map as fast as it can, gone there
// (#279: not at once: it stays looking till one of them comes within fleeTiles of it, or it's hit)
function scoutFlees(en, dt) {
  if (!en.fleeing) {
    if (en.hp < en.maxHp || game.settlers.some(s => Math.hypot(s.x - en.x, s.y - en.y) < GAME_CONFIG.scouts.fleeTiles * 30)) en.fleeing = true;
    else { faceTowards(en, townHall.x, townHall.y); return; }
  }
  // (#299: off past the frontier, a default map's edge)
  const f = getFrontier(), X0 = f.x0, Y0 = f.y0, W = f.x1, H = f.y1;
  const out = [{ x: X0 - 40, y: en.y, d: en.x - X0 }, { x: W + 40, y: en.y, d: W - en.x }, { x: en.x, y: Y0 - 40, d: en.y - Y0 }, { x: en.x, y: H + 40, d: H - en.y }].sort((a, b) => a.d - b.d)[0];
  moveEntityTowards(en, out.x, out.y, en.speed * 1.2, true, dt);
  if (en.x < X0 + 18 || en.y < Y0 + 18 || en.x > W - 18 || en.y > H - 18) { en.fled = true; en.crumbled = true; en.hp = 0; } // (gone: no corpse, no spoils)
}

// A tent builder walks to its site and builds; the tent stands once the work is done
function buildEnemyTent(en, dt) {
  let site = en.buildTarget;
  if (!game.enemyTentBlueprints.includes(site)) {
    en.buildTarget = null;
    return;
  }
  const tentConfig = GAME_CONFIG.enemyTents;
  let distToSite = Math.hypot(site.x - en.x, site.y - en.y);
  if (distToSite > tentConfig.buildDistance) {
    moveEntityTowards(en, site.x, site.y, en.speed, true, dt);
  } else {
    site.progress += dt * tentConfig.buildRate;
    if (site.progress >= site.maxProgress) {
      game.enemyTents.push({ x: site.x, y: site.y, hp: tentConfig.hp, maxHp: tentConfig.hp, summonTimer: 0, summonsLeft: tentConfig.summonsPerWave });
      playSound('tentUp', site);
      game.enemyTentBlueprints.splice(game.enemyTentBlueprints.indexOf(site), 1);
      en.buildTarget = null;
      invalidateAllPaths();
    }
  }
}

// What the enemy goes for: the settler it locked onto (unless another is much closer), the closest
// settler, or the town hall; and how far that is
/** @returns {{ target: Settler | TownHall, minDist: number }} */
function chooseEnemyTarget(en) {
  /** @type {Settler | TownHall} */
  let target = townHall;
  let minDist = Math.hypot(en.x - townHall.x, en.y - townHall.y);
  let closestSettler = /** @type {Settler | null} */ (null);
  const targets = en.campDefender ? campDefenderTargets(en) : game.settlers;

  targets.forEach(s => {
    if (isUntouchable(s)) return; // (a ghost: nothing to hit, #314)
    let d = Math.hypot(en.x - s.x, en.y - s.y);
    if (d < minDist) { minDist = d; closestSettler = s; }
  });

  let lockedTarget = en.attackTarget;
  if (lockedTarget && (!targets.includes(lockedTarget) || isUntouchable(lockedTarget))) lockedTarget = null;
  if (lockedTarget) {
    let lockedDist = Math.hypot(en.x - lockedTarget.x, en.y - lockedTarget.y);
    if (!closestSettler || lockedDist <= minDist + 40) {
      target = lockedTarget;
      minDist = lockedDist;
    } else {
      target = closestSettler;
      en.attackTarget = closestSettler;
      minDist = Math.hypot(en.x - closestSettler.x, en.y - closestSettler.y);
    }
  } else if (closestSettler) {
    target = closestSettler;
    en.attackTarget = closestSettler;
    minDist = Math.hypot(en.x - closestSettler.x, en.y - closestSettler.y);
  }
  return { target, minDist };
}

// How it attacks: an archer shoots; with an empty quiver it walks to the nearest enemy tent for more
// arrows, or fights like its melee enemy when the tents have none left. moveTarget: where it walks.
/** @returns {{ shooting: boolean, meleeDef: Object, moveTarget: { x: number, y: number } }} */
function chooseEnemyAttack(en, enemyDef, target) {
  let shooting = en.type === 'archer';
  let meleeDef = enemyDef;
  /** @type {{ x: number, y: number }} */
  let moveTarget = target;
  const quiver = enemyDef.quiver;
  if (quiver && en.arrows <= 0) {
    const tent = game.enemyArrowStock > 0 ? findNearestEnemyTent(en) : null;
    if (tent) {
      if (Math.hypot(tent.x - en.x, tent.y - en.y) <= GAME_CONFIG.enemyTents.buildDistance) {
        const taken = Math.min(quiver.refill, game.enemyArrowStock);
        en.arrows += taken;
        game.enemyArrowStock -= taken;
      } else {
        shooting = false;
        moveTarget = tent;
      }
    } else {
      shooting = false;
      meleeDef = getDefinition('enemies', quiver.melee) || enemyDef;
    }
  }
  return { shooting, meleeDef, moveTarget };
}

// An archer's shot, when its cooldown is over and it has a clear line within range
function enemyShoot(en, enemyDef, target, minDist, clearShot, dt) {
  const ranged = enemyDef.ranged;
  en.attackCooldown = (en.attackCooldown || 0) - dt;
  if (clearShot && minDist < ranged.range && en.attackCooldown <= 0) {
    let angle = Math.atan2(target.y - en.y, target.x - en.x);
    playSound('bow', en);
    game.projectiles.push({ x: en.x, y: en.y, vx: Math.cos(angle) * ranged.arrowSpeed, vy: Math.sin(angle) * ranged.arrowSpeed, damage: en.damage * (en.panic && getEnemyFaction().id === 'undead' ? GAME_CONFIG.morale.panicDamage : 1), life: ranged.arrowLife, fromEnemy: true, owner: en });
    startSwing(en, 0.3);
    faceTowards(en, target.x, target.y);
    en.attackCooldown = en.shotCooldown || ranged.cooldown; // (a bow's rate in a settler's hands, #255)
    en.shotAt = game.pathTick; en.shotLen = en.attackCooldown; // (its next arrow drawn, #306)
    if (enemyDef.quiver && game.gameMode !== 'battle') en.arrows--;
  }
}

// Walking on, or breaking what's in the way: a building it touches, or (on a blocked path) a resource
function walkOrBreakThrough(en, enemyDef, moveTarget, holdsGround, dt) {
  // box distance, not center distance: an enemy pressed against a wall off-center is still touching it.
  // Use the same collision body as movement, so big enemies don't hit things beside the corridor.
  const contactRadius = Math.min(en.radius, 13) + 2;
  // spikes are walked over, not besieged
  let touchingBuilding = game.buildings.find(b => !(getDefinition('buildings', b.type) || {}).walkable && collidesWithBoxList(en.x, en.y, contactRadius, [b], 15));
  if (touchingBuilding) {
    // its own: a camp's buildings, or (in a battle) what stands on the red side it fights from
    const own = (en.campId && touchingBuilding.campId === en.campId) ||
      (game.gameMode === 'battle' && touchingBuilding.side === 'red');
    if (own) {
      const dx = en.x - touchingBuilding.x, dy = en.y - touchingBuilding.y;
      const dist = Math.hypot(dx, dy) || 1;
      const minDist = en.radius + 16;
      if (dist < minDist) {
        en.x += dx / dist * (minDist - dist);
        en.y += dy / dist * (minDist - dist);
      }
      // It knows its own camp: don't walk into it and get pushed back next tick (a defender by its own
      // campfire or palisade stood shaking). Drop the path; the next plan goes round.
      en.path = null;
      en.pathRetryTimer = Math.max(en.pathRetryTimer || 0, 0.2);
    } else if (isShelter(touchingBuilding)) {
      breakBuilding(touchingBuilding, enemyDef, dt);
    } else if (en.type === 'big' || en.isBlockedPath || (!isBuildingSingle(touchingBuilding) && !en.pathViaSpikes)) {
      // a lone wall can be walked around, unless it's what blocks the only way in; an enemy on its
      // way in over spikes squeezes past the walls beside them
      breakBuilding(touchingBuilding, enemyDef, dt);
    } else {
      let dx = en.x - touchingBuilding.x;
      let dy = en.y - touchingBuilding.y;
      let dist = Math.hypot(dx, dy);
      let minDist = en.radius + 15;
      if (dist < minDist && dist > 0) {
        en.x += (dx / dist) * (minDist - dist);
        en.y += (dy / dist) * (minDist - dist);
      }
      if (!holdsGround) moveEntityTowards(en, moveTarget.x, moveTarget.y, en.speed, true, dt);
    }
    return;
  }
  const blockedRes = en.isBlockedPath ? findBlockingResource(en, contactRadius) : null;
  if (blockedRes) breakResource(en, blockedRes, enemyDef, dt);
  else if (!holdsGround) moveEntityTowards(en, moveTarget.x, moveTarget.y, en.speed, true, dt);
}

function breakBuilding(building, enemyDef, dt) {
  building.hp -= dt * enemyDef.siege.buildings;
  if (building.hp <= 0) removeBuilding(building);
}

// The resource in the way on a blocked path: trees, boulders, bushes and grass; a big one breaks cacti
// and ore too (not natural rock: paths never go through rock, so a brute only ever grazed rock beside its
// corridor and then spent ~25s chewing through 100 hp instead of walking on)
function findBlockingResource(en, contactRadius) {
  let destroyableResources = [
    ...game.trees.filter(t => !t.isGrowing),
    ...game.boulders,
    ...game.berryBushes,
    ...game.grassList
  ];
  if (en.type === 'big') destroyableResources.push(...game.cacti, ...game.ironOres, ...game.coalOres);
  for (let r of destroyableResources) {
    if (collidesWithBoxList(en.x, en.y, contactRadius, [r], 15)) return r;
  }
  return null;
}

// Trees and boulders take a while and grow back; bushes and grass go at once; a big one wears down the rest
function breakResource(en, blockedRes, enemyDef, dt) {
  if (game.trees.includes(blockedRes)) {
    blockedRes.hp -= dt * enemyDef.siege.resources;
    if (blockedRes.hp <= 0) {
      game.trees.splice(game.trees.indexOf(blockedRes), 1);
      scheduleRespawn('tree');
      invalidateAllPaths();
    }
  } else if (game.boulders.includes(blockedRes)) {
    blockedRes.hp -= dt * enemyDef.siege.resources;
    if (blockedRes.hp <= 0) {
      game.boulders.splice(game.boulders.indexOf(blockedRes), 1);
      scheduleRespawn('boulder');
      invalidateAllPaths();
    }
  } else if (game.berryBushes.includes(blockedRes)) {
    game.berryBushes.splice(game.berryBushes.indexOf(blockedRes), 1);
    scheduleRespawn('berry_bush');
    invalidateAllPaths();
  } else if (game.grassList.includes(blockedRes)) {
    game.grassList.splice(game.grassList.indexOf(blockedRes), 1);
    scheduleRespawn('grass');
    invalidateAllPaths();
  } else if (en.type === 'big') {
    blockedRes.hp -= dt * enemyDef.siege.resources;
    if (blockedRes.hp <= 0) {
      const resourceLists = [game.cacti, game.ironOres, game.coalOres, game.naturalRocks];
      const list = resourceLists.find(resources => resources.includes(blockedRes));
      if (list) list.splice(list.indexOf(blockedRes), 1);
      invalidateAllPaths();
    }
  }
}

// A melee strike at its target; a big one hits the nearest others round it (or the hall) too, up to
// splashMax in all (#209)
function enemyStrike(en, enemyDef, meleeDef, target, dt) {
  // the undead fight on in a panic, weaker (#232: morale.panicDamage); an archer out of arrows and tents
  // fights at its melee kind's strength, as the player's own would (#255)
  const shaken = en.panic && getEnemyFaction().id === 'undead' ? GAME_CONFIG.morale.panicDamage : 1;
  const meleeDamage = (meleeDef === enemyDef ? en.damage : (en.meleeDamage ?? (en.meleeDamage = enemyDamagePerSecond(meleeDef)))) * shaken;
  faceTowards(en, target.x, target.y);
  if (!(en.swingT > 0)) startSwing(en, 0.5); // keeps swinging while it hits
  if (en.type === 'big') {
    let splashRadius = enemyDef.splash.radius;
    let splashDamage = dt * en.damage * shaken * enemyDef.splash.share;
    if (target === townHall) townHall.hp -= dt * en.damage * shaken;
    else damageSettler(target, dt * en.damage * shaken, en);

    /** @type {any[]} */
    const around = game.settlers.filter(s => s !== target && Math.hypot(en.x - s.x, en.y - s.y) < splashRadius + s.radius);
    if (target !== townHall && Math.hypot(en.x - townHall.x, en.y - townHall.y) < splashRadius + townHall.radius) around.push(townHall);
    const edge = o => Math.hypot(en.x - o.x, en.y - o.y) - (o.radius || 0);
    for (const o of around.sort((a, b) => edge(a) - edge(b)).slice(0, GAME_CONFIG.combatAI.splashMax - 1)) {
      if (o === townHall) townHall.hp -= splashDamage;
      else damageSettler(o, splashDamage, en);
    }
  } else {
    if (target === townHall) townHall.hp -= dt * meleeDamage;
    else damageSettler(target, dt * meleeDamage, en);
  }
}
