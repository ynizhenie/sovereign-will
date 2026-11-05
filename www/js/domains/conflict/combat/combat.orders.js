// Orders in a fight the player commands (#255): a raid's camp, a battle. Taps: a unit of the player's picks
// it (again: not); an enemy, a tent or an outpost is the target of the picked one, or of everyone with none
// picked; a spot of ground, where the picked one goes to stand. Each unit fights what it was told to, else
// whoever hits it or comes close, else holds its spot; or, with the auto battle on, the nearest enemy, then
// the tents.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { getWeaponStats, isRangedWeapon } from '../../colony/equipment/index.js';
import { faceTowards, getRecentAttacker, getSelectedSettler, getSelection, toggleInGroup } from '../../colony/settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { hasLineOfFire, performAttack } from './combat.rules.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (from, list) => list.reduce((best, o) => (!best || dist(o, from) < dist(best, from) ? o : best), null);
const targetableEnemy = enemy => !enemy.campGuard ||
  (game.raidActive && enemy.campId === game.raidCampId);
const targetableTent = tent => !tent.campStructure ||
  (game.raidActive && tent.campId === game.raidCampId);
const targetableCampBuilding = building => !building.enemyCampStructure ||
  (game.raidActive && building.campId === game.raidCampId);
const alive = o => (game.enemies.includes(o) && o.hp > 0 && targetableEnemy(o)) ||
  (game.enemyTents.includes(o) && targetableTent(o)) ||
  (game.buildings.includes(o) && o.hp > 0 && o.side === 'red' && targetableCampBuilding(o));

const nearbyTargets = (x, y) => {
  const near = (o, r) => Math.hypot(o.x - x, o.y - y) < r;
  return [
    ...game.enemies.filter(en => en.hp > 0 && targetableEnemy(en) && near(en, en.radius + 12)),
    ...game.enemyTents.filter(et => targetableTent(et) && near(et, et.outpost ? 30 : 20)),
    ...game.buildings.filter(building => building.side === 'red' && building.enemyCampStructure &&
      targetableCampBuilding(building) && near(building, (building.radius || 15) + 10))
  ];
};

// A tap in such a fight; true: it was an order
export function orderTap(x, y) {
  const near = (o, r) => Math.hypot(o.x - x, o.y - y) < r;
  const unit = nearest({ x, y }, game.settlers.filter(s => near(s, (s.visualRadius || s.radius) + 8))); // (the nearest: they stand close)
  // (#326) picked with a group: adding to it (the card's button), or another picked instead
  if (unit && game.addingToGroup && getSelectedSettler()) { toggleInGroup(unit); return true; }
  if (unit) { game.selectedSettler = game.selectedSettler === unit ? null : unit; game.selectedGroup = []; game.addingToGroup = false; return true; }
  const target = nearest({ x, y }, nearbyTargets(x, y));
  const picked = getSelection();
  if (target) {
    const told = picked.length ? picked : game.settlers;
    // (#279) tapped again, the one it was already given to (or all of them): the order's taken off
    if (target.markedTarget && told.every(s => s.orderTarget === target)) {
      for (const s of told) s.orderTarget = null;
      target.markedTarget = game.settlers.some(s => s.orderTarget === target);
      return true;
    }
    for (const s of told) s.orderTarget = target;
    target.markedTarget = true;
    return true;
  }
  if (picked.length) { for (const s of picked) { s.orderTarget = null; s.orderSpot = { x, y }; } return true; }
  return false;
}

// Walk up to a target and strike it (an archer: from where it has a clear shot; a tent from its reach)
function strike(s, target, dt) {
  const structure = game.enemyTents.includes(target) || game.buildings.includes(target);
  const ranged = structure && isRangedWeapon(s.weapon);
  const weapon = GAME_CONFIG.weapons[s.weapon] || GAME_CONFIG.weapons.fist;
  const combat = ranged ? weapon.dagger : getWeaponStats(s, 'combat');
  const tent = game.enemyTents.includes(target);
  const reach = tent ? combat.tentReach + (target.outpost ? 10 : 0)
    : structure ? combat.approach + (target.radius || 15)
      : combat.approach + (target.radius || 10);
  const bow = isRangedWeapon(s.weapon);
  if (dist(s, target) > reach || (bow && !ranged && !hasLineOfFire(s.x, s.y, target.x, target.y))) moveEntityTowards(s, target.x, target.y, s.speed, false, dt);
  else { faceTowards(s, target.x, target.y); performAttack(s, target.x, target.y, ranged); }
}

// One unit's tick under orders (auto: the auto battle). Its spot: where it stood when the fight began,
// unless it was told another
export function fightByOrders(s, dt, auto) {
  if (!s.orderSpot) s.orderSpot = { x: s.x, y: s.y };
  if (s.orderTarget && !alive(s.orderTarget)) s.orderTarget = null;
  const outOfArrows = game.gameMode !== 'battle' && isRangedWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0);
  const attacker = getRecentAttacker(s);
  const hitter = attacker && game.enemies.includes(attacker) && targetableEnemy(attacker) ? attacker : null;
  let target = null;
  // (#326) told to break a tent or an outpost and hit meanwhile: the one hitting it first, then back to the tent
  const told = s.orderTarget && hitter && game.enemyTents.includes(s.orderTarget) ? hitter : s.orderTarget;
  const structureOrder = s.orderTarget &&
    (game.enemyTents.includes(s.orderTarget) || game.buildings.includes(s.orderTarget));
  if (outOfArrows) target = structureOrder ? s.orderTarget : null;
  else {
    if (auto) target = told || hitter || nearest(s, game.enemies.filter(en => en.hp > 0 && targetableEnemy(en))) || nearest(s, game.enemyTents.filter(targetableTent));
    else target = told || hitter || nearest(s, game.enemies.filter(en => en.hp > 0 && targetableEnemy(en) && dist(en, s) < 90));
  }
  if (target) { strike(s, target, dt); return; }
  if (dist(s, s.orderSpot) > 8) moveEntityTowards(s, s.orderSpot.x, s.orderSpot.y, s.speed, false, dt);
}

// (#326) In Endless, the player's own orders by tap (the selected settler and its group): an enemy (or a tent) to
// fight till it's down, then back to work; a spot to go to and stand at while it's picked, fighting what comes
// close; picked no more, back to work, unless it was told to hold (its card's Hold: till Free). A behaviour of
// every settler's (and a pet's), after a panic
export function followCommand(s, tick) {
  if (game.gameMode !== 'endless' || s.raider || (!s.orderTarget && !s.orderSpot)) return false;
  if (s.orderSpot && !s.holdOrder && !getSelection().includes(s)) { delete s.orderSpot; if (!s.orderTarget) return false; }
  if (s.asleep) { s.asleep = false; s.sleepSpot = null; }
  const spotGiven = !!s.orderSpot;
  fightByOrders(s, tick.dt, false);
  if (!spotGiven) {
    delete s.orderSpot;
    if (!s.orderTarget) return false; // (down: back to work)
  }
  s.patrolTarget = null;
  return true;
}

// (#326) Orders by tap for those picked in Endless: an enemy (or a tent) at (x, y) is theirs to fight, else they go
// and hold the spot. True when it was an order
export function commandTap(picked, x, y) {
  if (!picked.length) return false;
  const near = (o, r) => Math.hypot(o.x - x, o.y - y) < r;
  const target = nearest({ x, y }, nearbyTargets(x, y));
  for (const s of picked) {
    if (target) s.orderTarget = target;
    else { s.orderTarget = null; s.orderSpot = { x, y }; }
    s.path = null;
  }
  if (target) target.markedTarget = true;
  return true;
}

// Orders off a unit (the fight over)
export function clearOrders(s) {
  delete s.orderTarget; delete s.orderSpot; delete s.holdOrder;
}

// (#326) The card's Hold: those picked stand where they are (or where they were sent) till Free, picked or not
export function holdPosition(s) {
  if (!s.orderSpot) s.orderSpot = { x: s.x, y: s.y };
  s.holdOrder = true; s.path = null;
}
