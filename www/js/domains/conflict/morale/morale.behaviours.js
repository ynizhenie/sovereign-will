// What a panicking unit does (#207, morale.rules.js): settlers run to the town hall, enemies fall back to
// heal at their own tents (or leave the map if they have none), boars run from the nearest settler. A
// wounded demon in a panic strikes an ally next to it to heal on it, never to the death. And the enemy's
// necromancer keeps behind its own

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, townHall } from '../../../engine/world/index.js';
import { getFrontier, isOutskirts, isVisible } from '../../world/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../factions/index.js';
import { moveSettlerToTownHall } from '../../colony/storage/index.js';
import { faceTowards, getRecentAttacker, startSwing } from '../../colony/settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { makeBoarFlee } from '../../economy/hunting/index.js';
import { liftMorale } from './morale.rules.js';
import { getEnemyDef } from '../waves/index.js';
import { healAtTent } from '../healing/index.js';

const config = () => GAME_CONFIG.morale;

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
  if (getPlayerFaction().id === 'undead') return false;
  // cornered: hit just now with its attacker at hand, it fights back (strikeBack)
  const attacker = getRecentAttacker(s);
  if (attacker && game.pathTick - (s.lastAttackedTick || 0) < 60 && Math.hypot(attacker.x - s.x, attacker.y - s.y) < 45) return false;
  if (getPlayerFaction().id === 'demons' && healOnAlly(s, game.settlers, tick.dt)) return true;
  // wounded, it runs to heal at a tent (a grave...), not just to the town hall (#232)
  if (s.hp < s.maxHp && tick.tents.length > 0) {
    s.healing = true;
    if (healAtTent(s, tick)) return true;
  }
  s.patrolTarget = null;
  if (game.gameMode === 'battle') {
    const foe = nearest(game.enemies, s);
    if (foe) moveEntityTowards(s, s.x + (s.x - foe.x), s.y + (s.y - foe.y), s.speed, false, tick.dt);
    return true;
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

// The enemy's necromancer keeps behind its own (#207), a little behind the ally nearest the hall. It doesn't
// run from a settler that comes for it (#261: it led the soldiers far off and they went back to their
// posts): one within keepBack px it fights, as any enemy. True: it took the step
export function necromancerKeepsBack(en, dt) {
  if (game.settlers.some(o => Math.hypot(o.x - en.x, o.y - en.y) < config().necroKeepBack)) return false;
  // amid its own, a little behind their middle (#232: behind the front one it was off on its own, its own
  // out of its reach and panicking): the allies within reach of it, else all of them
  const allies = game.enemies.filter(o => o !== en && o.hp > 0 && !getEnemyDef(o).necromancer);
  if (!allies.length) return false;
  const group = allies.filter(o => Math.hypot(o.x - en.x, o.y - en.y) < config().necroRange * 2.5);
  const mid = (group.length ? group : allies).reduce((m, o, i, list) => ({ x: m.x + o.x / list.length, y: m.y + o.y / list.length }), { x: 0, y: 0 });
  const d = Math.max(1, Math.hypot(mid.x - townHall.x, mid.y - townHall.y));
  const spot = { x: mid.x + (mid.x - townHall.x) / d * 50, y: mid.y + (mid.y - townHall.y) / d * 50 };
  if (Math.hypot(spot.x - en.x, spot.y - en.y) > 12) moveEntityTowards(en, spot.x, spot.y, en.speed, true, dt);
  return true;
}
