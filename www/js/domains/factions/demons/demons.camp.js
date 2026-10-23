// The demons' camp (#250): what's done with the bodies. Corpses go into corpse pits, where they keep (up to
// `holds` a pit); with the pits full and nobody wounded to eat them, soldiers cut them up for raw meat after
// a wave. At a wave's end a soldier catches a badly wounded enemy and carries it to a free cage, to be eaten
// later; one left there too long dies, a corpse. A wounded demon eats from a pit or a cage as from a corpse
// lying about (eatCorpse).

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game, getGridPos } from '../../../engine/world/index.js';
import { getReachSteps, getSettlerReach, moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards, hasPlayerOrderFor } from '../../colony/settlers/index.js';
import { giveResourceToSettler } from '../../colony/storage/index.js';
import { getPlayerFaction } from '../index.js';
import { playSound } from '../../../app/index.js';

const camp = () => GAME_CONFIG.demonCamp;
const isDemons = () => getPlayerFaction().id === 'demons';
const isFighter = s => (s.role === 'soldier' || s.role === 'archer') && !s.isPossessed && !s.towerAssignment;
export const pits = () => game.buildings.filter(b => b.type === 'corpse_pit');
export const cages = () => game.buildings.filter(b => b.type === 'cage');
const pitRoom = b => GAME_CONFIG.buildings.corpse_pit.corpsePit.holds - (b.corpses || []).length;
const reachable = (s, p) => { const g = getGridPos(p.x, p.y); return getReachSteps(getSettlerReach(s), g.gx, g.gy) >= 0; };
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Each tick: corpses in a pit age slower; a caged enemy left long enough dies there, a corpse by the cage
export function tickDemonCamp(dt) {
  const lifetime = GAME_CONFIG.corpses.seconds;
  for (const pit of pits()) {
    const keep = GAME_CONFIG.buildings.corpse_pit.corpsePit.keepShare;
    pit.corpses = (pit.corpses || []).filter(c => (c.age += dt * keep) < lifetime);
  }
  for (const cage of cages()) {
    if (!cage.captive) continue;
    cage.captive.age = (cage.captive.age || 0) + dt;
    if (cage.captive.age >= GAME_CONFIG.buildings.cage.cage.captiveSeconds) {
      game.corpses.push({ x: cage.x + 6, y: cage.y + 4, radius: cage.captive.radius || 11, side: 'enemy', kind: cage.captive.enemyKey, age: 0, big: !!cage.captive.big, wormsTaken: false });
      cage.captive = null;
    }
  }
}

// ---- Catching one for a cage

// At a wave's end (down to its last few), a soldier goes for a badly wounded enemy, one each, while a cage
// is free; the others leave it be (chooseSettlerTarget). Caught, it's carried to the cage
export function catchForCage(s, tick) {
  if (!isDemons() || !isFighter(s) || s.carrying || !tick.isWaveActive) { if (s.catchTarget) release(s); return false; }
  const c = camp();
  const cage = cages().find(b => !b.captive && !game.settlers.some(o => o !== s && (o.catchCage === b || (o.carrying && o.carrying.forCage === b))));
  if (!cage || game.enemies.filter(en => !en.summoned).length > c.lastFew) { if (s.catchTarget) release(s); return false; }
  let target = s.catchTarget && game.enemies.includes(s.catchTarget) ? s.catchTarget : null;
  if (!target) {
    target = game.enemies.filter(en => en.hp > 0 && en.hp < en.maxHp * c.catchBelow && !en.trapped && (!en.toCatch || en.toCatch === s.id) && reachable(s, en))
      .sort((a, b) => near(a, s) - near(b, s))[0] || null;
  }
  if (!target) return false;
  s.catchTarget = target; s.catchCage = cage; target.toCatch = s.id;
  s.patrolTarget = null;
  if (near(target, s) > s.radius + (target.radius || 11) + 6) { moveEntityTowards(s, target.x, target.y, s.speed, false, tick.dt); return true; }
  // caught: off the map's enemies, in its arms
  game.enemies.splice(game.enemies.indexOf(target), 1);
  s.carrying = { type: 'captive', amount: 1, forCage: cage, captive: { enemyKey: target.enemyKey, hp: target.hp, maxHp: target.maxHp, radius: target.radius, big: target.type === 'big', age: 0, enemy: target } };
  s.catchTarget = null; s.catchCage = null;
  return true;
}

function release(s) {
  if (s.catchTarget) delete s.catchTarget.toCatch;
  s.catchTarget = null; s.catchCage = null;
}

// Carrying one caught to its cage; the cage gone or taken, it gets away (back on the map, where it is)
export function carryCaptive(s, tick) {
  const load = s.carrying && s.carrying.type === 'captive' ? s.carrying : null;
  if (!load) return false;
  const cage = load.forCage;
  if (!game.buildings.includes(cage) || cage.captive) {
    const en = load.captive.enemy;
    Object.assign(en, { x: s.x + 12, y: s.y, toCatch: undefined });
    game.enemies.push(en);
    s.carrying = null;
    return false;
  }
  s.patrolTarget = null;
  if (near(cage, s) > 50) { moveEntityTowards(s, cage.x, cage.y, s.speed * GAME_CONFIG.corpseHaul.speed, false, tick.dt); return true; }
  const { enemy, ...captive } = load.captive;
  void enemy;
  cage.captive = captive;
  playSound('cageLock', cage);
  s.carrying = null;
  return true;
}

// ---- The corpses after a wave

// Between waves, with no demon wounded (they'd eat them), a soldier carries a corpse lying about into a
// corpse pit with room; with none, it cuts it up for raw meat, carried home
export function tendCorpses(s, tick) {
  if (!isDemons() || !isFighter(s) || tick.isWaveActive) { s.butcherTarget = null; return false; }
  const load = s.carrying && s.carrying.type === 'corpse' && s.carrying.forPit ? s.carrying : null;
  if (load) {
    const pit = load.forPit;
    if (!game.buildings.includes(pit) || pitRoom(pit) <= 0) { delete load.forPit; return false; } // (to the heap, carryCorpse)
    s.patrolTarget = null;
    if (near(pit, s) > 50) { moveEntityTowards(s, pit.x, pit.y, s.speed * GAME_CONFIG.corpseHaul.speed, false, tick.dt); return true; }
    (pit.corpses = pit.corpses || []).push(load.corpse);
    s.carrying = null;
    return true;
  }
  if (s.carrying || hasPlayerOrderFor(s, tick)) return false; // (an order of the player's first, #279)
  const wounded = game.settlers.some(o => (getDefinition('settlerTypes', o.type) || {}).eatsCorpses && o.hp < o.maxHp);
  if (wounded) { s.butcherTarget = null; return false; } // (theirs to eat)
  let corpse = s.butcherTarget && game.corpses.includes(s.butcherTarget) ? s.butcherTarget : null;
  if (!corpse) {
    corpse = game.corpses.filter(c => !tick.raiseAssignments.has(c) && reachable(s, c)).sort((a, b) => near(a, s) - near(b, s))[0] || null;
  }
  s.butcherTarget = corpse;
  if (!corpse) return false;
  tick.raiseAssignments.add(corpse);
  s.patrolTarget = null;
  if (near(corpse, s) > 16) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); s.butcherTimer = 0; return true; }
  const pit = pits().filter(p => pitRoom(p) > 0 && !game.settlers.some(o => o !== s && o.carrying && o.carrying.forPit === p && pitRoom(p) <= 1))
    .sort((a, b) => near(a, s) - near(b, s))[0];
  if (pit) {
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
    s.carrying = { type: 'corpse', amount: 1, corpse, forPit: pit };
    s.butcherTarget = null;
    return true;
  }
  // cut up: a while at it, then the meat in its hands
  faceTowards(s, corpse.x, corpse.y);
  s.working = 0.1; s.workKind = 'butcher'; // (#279)
  s.butcherTimer = (s.butcherTimer || 0) + tick.dt;
  if (s.butcherTimer < camp().butcherSeconds) return true;
  s.butcherTimer = 0;
  game.corpses.splice(game.corpses.indexOf(corpse), 1);
  giveResourceToSettler(s, 'rawMeat', corpse.big ? camp().bigMeat : camp().meat);
  playSound('butcher', s);
  if (s.carrying) s.carrying.loads = 99; // (straight home with it)
  s.butcherTarget = null;
  return true;
}

// For eatCorpse: a pit with a corpse in it, or a cage with someone in it, as somewhere to eat; take() eats it
export function campMeals() {
  return [
    ...pits().filter(p => (p.corpses || []).length).map(p => ({ x: p.x, y: p.y, take: () => { (p.corpses || []).shift(); } })),
    ...cages().filter(c => c.captive).map(c => ({ x: c.x, y: c.y, take: () => { c.captive = null; } }))
  ];
}
