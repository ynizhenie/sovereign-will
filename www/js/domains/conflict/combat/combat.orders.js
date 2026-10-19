// Orders in a fight the player commands (#255): a raid's camp, a battle. Taps: a unit of the player's picks
// it (again: not); an enemy, a tent or an outpost is the target of the picked one, or of everyone with none
// picked; a spot of ground, where the picked one goes to stand. Each unit fights what it was told to, else
// whoever hits it or comes close, else holds its spot; or, with the auto battle on, the nearest enemy, then
// the tents.

import { game } from '../../../engine/world/index.js';
import { getWeaponStats, isBowWeapon } from '../../colony/equipment/index.js';
import { faceTowards, getRecentAttacker } from '../../colony/settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { hasLineOfFire, performAttack } from './combat.rules.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (from, list) => list.reduce((best, o) => (!best || dist(o, from) < dist(best, from) ? o : best), null);
const alive = o => (game.enemies.includes(o) && o.hp > 0) || game.enemyTents.includes(o);

// A tap in such a fight; true: it was an order
export function orderTap(x, y) {
  const near = (o, r) => Math.hypot(o.x - x, o.y - y) < r;
  const unit = nearest({ x, y }, game.settlers.filter(s => near(s, (s.visualRadius || s.radius) + 8))); // (the nearest: they stand close)
  if (unit) { game.selectedSettler = game.selectedSettler === unit ? null : unit; return true; }
  const target = nearest({ x, y }, [...game.enemies.filter(en => en.hp > 0 && near(en, en.radius + 12)), ...game.enemyTents.filter(et => near(et, et.outpost ? 30 : 20))]);
  const picked = game.selectedSettler && game.settlers.includes(game.selectedSettler) ? game.selectedSettler : null;
  if (target) {
    for (const s of picked ? [picked] : game.settlers) s.orderTarget = target;
    target.markedTarget = true;
    return true;
  }
  if (picked) { picked.orderTarget = null; picked.orderSpot = { x, y }; return true; }
  return false;
}

// Walk up to a target and strike it (an archer: from where it has a clear shot; a tent from its reach)
function strike(s, target, dt) {
  const combat = getWeaponStats(s, 'combat');
  const tent = game.enemyTents.includes(target);
  const reach = tent ? combat.tentReach + (target.outpost ? 10 : 0) : combat.approach + (target.radius || 10);
  const bow = isBowWeapon(s.weapon);
  if (dist(s, target) > reach || (bow && !hasLineOfFire(s.x, s.y, target.x, target.y))) moveEntityTowards(s, target.x, target.y, s.speed, false, dt);
  else { faceTowards(s, target.x, target.y); performAttack(s, target.x, target.y); }
}

// One unit's tick under orders (auto: the auto battle). Its spot: where it stood when the fight began,
// unless it was told another
export function fightByOrders(s, dt, auto) {
  if (!s.orderSpot) s.orderSpot = { x: s.x, y: s.y };
  if (s.orderTarget && !alive(s.orderTarget)) s.orderTarget = null;
  const outOfArrows = isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0);
  const attacker = getRecentAttacker(s);
  const hitter = attacker && game.enemies.includes(attacker) ? attacker : null;
  let target = null;
  if (!outOfArrows) {
    if (auto) target = s.orderTarget || hitter || nearest(s, game.enemies.filter(en => en.hp > 0)) || nearest(s, game.enemyTents);
    else target = s.orderTarget || hitter || nearest(s, game.enemies.filter(en => en.hp > 0 && dist(en, s) < 90));
  }
  if (target) { strike(s, target, dt); return; }
  if (dist(s, s.orderSpot) > 8) moveEntityTowards(s, s.orderSpot.x, s.orderSpot.y, s.speed, false, dt);
}

// Orders off a unit (the fight over)
export function clearOrders(s) {
  delete s.orderTarget; delete s.orderSpot;
}
