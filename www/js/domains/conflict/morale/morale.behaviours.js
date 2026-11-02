// What a panicking unit does (#207, morale.rules.js): settlers run to the town hall, enemies fall back to
// heal at their own tents (or leave the map if they have none), boars run from the nearest settler. A
// wounded demon in a panic strikes an ally next to it to heal on it, never to the death. And the enemy's
// necromancer keeps behind its own

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, getTileIndex, townHall } from '../../../engine/world/index.js';
import { getFrontier, isOutskirts, isVisible } from '../../world/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { moveSettlerToTownHall } from '../../colony/storage/index.js';
import { faceTowards, getRecentAttacker, startSwing } from '../../colony/settlers/index.js';
import { collidesWithWall, findPathAStar, isTileBlockedForEnemyStrict, isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { makeBoarFlee } from '../../economy/hunting/index.js';
import { liftMorale } from './morale.rules.js';
import { getEnemyDef } from '../waves/index.js';
import { healAtTent } from '../healing/index.js';

const config = () => GAME_CONFIG.morale;
const supportSpotCache = new WeakMap();

// the one of `list` nearest to `unit`, or null
/** @template T @param {T[]} list @param {{ x: number, y: number }} unit @returns {T | null} */
function nearest(list, unit) {
  let best = null, bestD = Infinity;
  for (const o of list) {
    const d = Math.hypot(/** @type {any} */ (o).x - unit.x, /** @type {any} */ (o).y - unit.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

// A wounded demon in a panic heals on an ally next to it: true if it did this step
function healOnAlly(unit, allies, dt) {
  const c = config();
  if (unit.hp >= unit.maxHp * 0.5) return false;
  const ally = allies.find(o => o !== unit && o.hp > 1 && Math.hypot(o.x - unit.x, o.y - unit.y) < 34);
  if (!ally) return false;
  const bite = Math.min(c.demonHeal * dt, ally.hp - 1); // never to the death
  ally.hp -= bite;
  unit.hp = Math.min(unit.maxHp, unit.hp + bite);
  faceTowards(unit, ally.x, ally.y);
  if (startSwing) startSwing(unit);
  return true;
}

// A settler in a panic (a behaviour, after the player's own control): wounded, to a tent to heal; else to
// the town hall, out of the fight.
// In battle mode, where there's no hall to run to, away from the nearest enemy
export function panic(s, tick) {
  if (!s.panic || s.isPossessed) return false;
  // the undead don't run: they fight on in a panic, weaker (getWeaponStats, morale.panicDamage, #232)
  const faction = Object.values(GAME_CONFIG.factions).find(f => f.units.includes(s.type))?.id || getPlayerFaction().id;
  if (faction === 'undead') return false;
  if (faction === 'demons' && healOnAlly(s, game.settlers, tick.dt)) return true;
  s.patrolTarget = null;
  if (game.gameMode === 'battle') {
    const foe = nearest(game.enemies.filter(en => en.hp > 0), s) || s.ghostPanicFrom;
    if (foe) moveEntityTowards(s, s.x + (s.x - foe.x), s.y + (s.y - foe.y), s.speed, false, tick.dt);
    const g = getGridPos(s.x, s.y);
    if (isOutskirts(g.gx, g.gy)) Object.assign(s, { hp: 0, crumbled: true, rewardGranted: true, fled: true });
    return true;
  }
  // cornered: hit just now with its attacker at hand, it fights back (strikeBack)
  const attacker = getRecentAttacker(s);
  if (attacker && game.pathTick - (s.lastAttackedTick || 0) < 60 && Math.hypot(attacker.x - s.x, attacker.y - s.y) < 45) return false;
  // wounded, it runs to heal at a tent (a grave...), not just to the town hall (#232)
  if (s.hp < s.maxHp && tick.tents.length > 0) {
    s.healing = true;
    if (healAtTent(s, tick)) return true;
  }
  if (Math.hypot(townHall.x - s.x, townHall.y - s.y) > townHall.radius + 20) moveSettlerToTownHall(s, s.speed, tick.dt);
  return true;
}

// An enemy in a panic: to its nearest tent (grave, portal) to heal and steady, or off the map's edge.
// True: it took the step
export function enemyPanic(en, dt) {
  if (!en.panic) return false;
  if (getEnemyFaction().id === 'undead') return false; // they fight on, weaker (enemyStrike, #232)
  if (getEnemyFaction().id === 'demons' && healOnAlly(en, game.enemies, dt)) return true;
  const tent = nearest(game.enemyTents, en);
  if (tent) {
    if (Math.hypot(tent.x - en.x, tent.y - en.y) > 30) {
      moveEntityTowards(en, tent.x, tent.y, en.speed, true, dt);
    } else {
      en.hp = Math.min(en.maxHp, en.hp + config().tentHealPerSecond * dt);
      liftMorale(en, config().recoverPerSecond * 2 * dt, 'enemy');
    }
    return true;
  }
  // no tent: away, and gone at the edge (no reward, no corpse)
  const edge = nearestEdge(en);
  moveEntityTowards(en, edge.x, edge.y, en.speed, true, dt);
  const g = getGridPos(en.x, en.y);
  // (#299: on a big map, out of the colony's sight is gone too: the edge it runs for may be over the sea)
  const f = getFrontier(), big = f.x0 > 0 || f.y0 > 0 || f.x1 < game.WORLD_WIDTH || f.y1 < game.WORLD_HEIGHT;
  if (isOutskirts(g.gx, g.gy) || (big && !isVisible(en.x, en.y))) { en.hp = 0; en.crumbled = true; en.rewardGranted = true; en.fled = true; }
  return true;
}

// (#299: the frontier's, a default map's edge)
function nearestEdge(unit) {
  const f = getFrontier(), band = BORDER_MARGIN * TILE_SIZE;
  const edges = [
    { x: unit.x, y: f.y0 + band - 10 }, { x: unit.x, y: f.y1 - band + 10 },
    { x: f.x0 + band - 10, y: unit.y }, { x: f.x1 - band + 10, y: unit.y }
  ];
  return edges.reduce((a, b) => (Math.hypot(a.x - unit.x, a.y - unit.y) < Math.hypot(b.x - unit.x, b.y - unit.y) ? a : b));
}

// Boars in a panic keep running from the nearest settler
export function boarsPanic() {
  for (const boar of game.boars) {
    if (!boar.panic || boar.isCarcass || (boar.fleeTimer || 0) > 0) continue;
    const s = nearest(game.settlers, boar);
    if (s && Math.hypot(s.x - boar.x, s.y - boar.y) < 300) makeBoarFlee(boar, s.x, s.y);
  }
}

function chooseSupportAnchor(unit, allies, supports) {
  const claimed = supports
    .filter(other => other !== unit && other.hp > 0 && allies.includes(other.supportAnchor))
    .map(other => other.supportAnchor);
  const unclaimed = allies.filter(ally => !claimed.includes(ally));
  const candidates = unclaimed.length ? unclaimed : allies;
  candidates.sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y));
  return candidates[0];
}

function supportBacklineSpot(anchor, opponents, enemySide) {
  const isBattle = game.gameMode === 'battle';
  const origin = isBattle
    ? nearest(opponents.filter(unit => unit.hp > 0), anchor) || { x: game.WORLD_WIDTH / 2, y: game.WORLD_HEIGHT / 2 }
    : townHall;
  const direction = isBattle || enemySide ? 1 : -1;
  const distance = Math.max(1, Math.hypot(anchor.x - origin.x, anchor.y - origin.y));
  return {
    x: anchor.x + (anchor.x - origin.x) / distance * 50 * direction,
    y: anchor.y + (anchor.y - origin.y) / distance * 50 * direction
  };
}

function reachableSupportSpot(unit, anchor, desired, enemySide) {
  const tile = getGridPos(desired.x, desired.y);
  const key = `${tile.gx},${tile.gy}`;
  const signature = getTileIndex().signature;
  const blocked = enemySide ? isTileBlockedForEnemyStrict : isTileBlockedForSettler;
  const collides = point => collidesWithWall(point.x, point.y, unit.radius, enemySide);
  if (!blocked(tile.gx, tile.gy) && !collides(desired)) {
    supportSpotCache.delete(unit);
    return desired;
  }

  const cached = supportSpotCache.get(unit);
  if (cached?.anchor === anchor && cached.key === key && cached.signature === signature) return cached.position;

  const candidates = [];
  for (let radius = 1; radius <= 3; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const gx = tile.gx + dx, gy = tile.gy + dy;
      const point = { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
      candidates.push({ gx, gy, point, distance: Math.hypot(point.x - desired.x, point.y - desired.y) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);

  let position = null;
  for (const candidate of candidates) {
    if (blocked(candidate.gx, candidate.gy) || collides(candidate.point)) continue;
    if (!findPathAStar(unit.x, unit.y, candidate.point.x, candidate.point.y, enemySide).path.length) continue;
    position = candidate.point;
    break;
  }
  supportSpotCache.set(unit, { anchor, key, signature, position });
  return position;
}

function enemySupports() {
  return game.enemies.filter(unit => {
    const def = getEnemyDef(unit);
    return unit.hp > 0 && (def.healer || def.necromancer);
  });
}

function playerSupports() {
  return game.settlers.filter(unit => unit.hp > 0 && (unit.tool === 'medbag' || unit.tool === 'necro_staff'));
}

function enemySoldiers(unit) {
  return game.enemies.filter(ally => {
    if (ally === unit || ally.hp <= 0) return false;
    const def = getEnemyDef(ally);
    return !def.pet && !def.healer && !def.necromancer;
  });
}

function playerSoldiers(unit) {
  return game.settlers.filter(ally => ally !== unit && ally.hp > 0 && ally.role !== 'pet' &&
    ally.tool !== 'medbag' && ally.tool !== 'necro_staff' &&
    (ally.weapon !== 'fist' || ally.type === 'zombie' || ally.type === 'big_zombie'));
}

function keepSupportBehind(unit, dt, allies, supports, opponents, enemySide, smooth = false) {
  if (!allies.length) {
    unit.supportAnchor = null;
    supportSpotCache.delete(unit);
    return false;
  }
  const anchor = chooseSupportAnchor(unit, allies, supports);
  unit.supportAnchor = anchor;
  const spot = reachableSupportSpot(unit, anchor, supportBacklineSpot(anchor, opponents, enemySide), enemySide);
  if (!spot) {
    if (smooth) { unit.moveVx = 0; unit.moveVy = 0; }
    return true;
  }
  if (Math.hypot(spot.x - unit.x, spot.y - unit.y) > 12) {
    moveEntityTowards(unit, spot.x, spot.y, unit.speed, enemySide, dt, smooth);
  } else if (smooth) {
    unit.moveVx = 0;
    unit.moveVy = 0;
  }
  return true;
}

// The enemy's necromancer keeps behind its fighters (#207), but fights when an opponent gets too close.
export function necromancerKeepsBack(en, dt, staysBackUnderThreat = false) {
  if (!staysBackUnderThreat && game.settlers.some(o => Math.hypot(o.x - en.x, o.y - en.y) < config().necroKeepBack)) {
    en.supportAnchor = null;
    return false;
  }
  return keepSupportBehind(en, dt, enemySoldiers(en), enemySupports(),
    game.settlers.filter(unit => unit.hp > 0), true);
}

// Enemy medics keep behind a fighter when no wounded ally needs their attention.
export function enemyMedicKeepsBack(en, dt) {
  return keepSupportBehind(en, dt, enemySoldiers(en), enemySupports(),
    game.settlers.filter(unit => unit.hp > 0), true);
}

function playerSupportKeepsBack(s, dt, isAlly, smooth = false, staysBackUnderThreat = false) {
  if (!staysBackUnderThreat && game.enemies.some(en => en.hp > 0 && Math.hypot(en.x - s.x, en.y - s.y) < config().necroKeepBack)) {
    s.supportAnchor = null;
    return false;
  }
  return keepSupportBehind(s, dt, playerSoldiers(s).filter(isAlly), playerSupports(),
    game.enemies.filter(unit => unit.hp > 0), false, smooth);
}

// The player's necromancer keeps behind its own fighters too, but advances to fight when left alone.
export function playerNecromancerKeepsBack(s, dt) {
  return playerSupportKeepsBack(s, dt, o => o.tool !== 'necro_staff' && o.role !== 'pet', true);
}

// A medic keeps behind armed allies and necromancers, but advances to fight when left alone.
export function playerMedicKeepsBack(s, dt) {
  return playerSupportKeepsBack(s, dt, o => o.role !== 'pet' && (o.weapon !== 'fist' || o.tool === 'necro_staff'), true, true);
}
