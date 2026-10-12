// Orders for the possessed settler (#16, #133). Its AI is off (see playerControlled): a tap on something
// is an order to walk there and do what the settler can with what it has in hand. Each kind of order is
// one entry here, tried in this order; the first whose find() matches the tap takes it.
//
// - find(p, near): what the tap is on for this order, or null. near(o, r): the tap is within r of o.
// - check(p, target): null when the settler can do it, otherwise the text key of why not (shown).
// - step(s, target, tick): one tick of carrying it out; false once it's done or can't go on.
//
// A settler type can be limited to some kinds of orders (GAME_CONFIG.settlerTypes[type].orders);
// without that list it takes them all. An archer's tap on nothing else shoots there.

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/i18n.js';
import { game, townHall } from '../../../engine/world/state.js';
import { getWeaponStats, hasAxeTool, hasToolFamily, isBowWeapon } from '../equipment/equipment.rules.js';
import { canAfford, hasRoomToCarry, moveSettlerToTownHall, payCost, takeStock } from '../storage/storage.rules.js';
import { getMissingMaterial, getRepairStep } from '../../economy/building/building.rules.js';
import { showNotification } from '../../../ui/toasts.js';
import { joystick, keys } from '../../../engine/platform/input.js';
import { getPossessed } from './settlers.rules.js';
import { getHarvestableResources, getMapResourceDef, getMapResourceKind } from '../../economy/gathering/gathering.rules.js';
import { collidesWithWall } from '../../../engine/movement/collision.js';
import { getResourceApproachPoint, moveEntityTowards } from '../../../engine/movement/steering.js';
import { performAttack } from '../../conflict/combat/combat.rules.js';
import { faceTowards } from './settlers.draw.js';
import { getFishingBait } from '../../economy/fishing/fishing.rules.js';
import { fetchBait, fishAt } from '../../economy/fishing/fishing.behaviours.js';
import { fetchFromStorage, goDeliver } from '../storage/storage.behaviours.js';
import { workResource } from '../../economy/gathering/gathering.behaviours.js';
import { huntBoar } from '../../economy/hunting/hunting.behaviours.js';
import { deliverMaterials, repairStep, workBlueprint } from '../../economy/building/building.behaviours.js';
import { pickApplesFrom } from '../../economy/farming/farming.behaviours.js';

export const handsFull = p => p.carrying && !hasRoomToCarry(p);
export const walkTo = (s, x, y, tick) => moveEntityTowards(s, x, y, s.speed, false, tick.dt);

export const ORDERS = [
  {
    kind: 'attack',
    find: (p, near) => game.enemies.find(en => near(en, en.radius + 15)) || game.enemyTents.find(et => near(et, 25)),
    step: (s, target, tick) => {
      if (!game.enemies.includes(target) && !game.enemyTents.includes(target)) return false;
      if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
      const combat = getWeaponStats(s, 'combat');
      const reach = game.enemyTents.includes(target) ? combat.tentReach : combat.approach + target.radius;
      if (Math.hypot(target.x - s.x, target.y - s.y) > reach) walkTo(s, target.x, target.y, tick);
      else performAttack(s, target.x, target.y);
      return true;
    }
  },
  {
    kind: 'hunt',
    find: (p, near) => game.boars.find(b => near(b, 25) && !b.hidden && !b.hideTarget && !(b.isCarcass && b.collector && b.collector !== p)),
    step: (s, target, tick) => {
      if (!game.boars.includes(target) || target.hidden || target.hideTarget) return false;
      if (target.isCarcass && handsFull(s)) return false;
      huntBoar(s, target, tick);
      return true;
    }
  },
  {
    // hand in what it carries at a warehouse or the town hall (#36)
    kind: 'deliver',
    find: (p, near) => (!p.carrying ? null
      : game.buildings.find(b => b.type === 'warehouse' && near(b, 18)) || (near(townHall, townHall.radius + 10) ? townHall : null)),
    step: (s, target, tick) => {
      if (!s.carrying) return false;
      goDeliver(s, tick);
      return true;
    }
  },
  {
    kind: 'repairHall',
    find: (p, near) => (near(townHall, townHall.radius + 10) && townHall.hp < townHall.maxHp ? townHall : null),
    step: (s, target, tick) => {
      const repair = GAME_CONFIG.repairs.townHall;
      if (townHall.hp >= townHall.maxHp || !canAfford(repair.cost)) return false;
      if (Math.hypot(townHall.x - s.x, townHall.y - s.y) > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
      } else {
        payCost(repair.cost);
        townHall.hp = Math.min(townHall.maxHp, townHall.hp + repair.hp);
      }
      return true;
    }
  },
  {
    kind: 'build',
    find: (p, near) => game.blueprints.find(bp => near(bp, 18)),
    step: (s, target, tick) => {
      if (!game.blueprints.includes(target)) return false;
      // its materials first, from storage (#36)
      if (s.carrying && s.carrying.forBlueprint === target) return deliverMaterials(s, tick);
      const missing = getMissingMaterial(target);
      if (missing) {
        if (s.carrying) return false;
        const [id, amount] = missing;
        return fetchFromStorage(s, id, tick.dt, () => {
          s.carrying = { type: id, amount: takeStock(id, Math.min(amount, GAME_CONFIG.storage.carryMaterials)), forBlueprint: target };
        });
      }
      if (Math.hypot(target.x - s.x, target.y - s.y) > 30) walkTo(s, target.x, target.y, tick);
      else if (Object.keys(target.needs || {}).length === 0) workBlueprint(s, target, tick.dt);
      return true;
    }
  },
  {
    kind: 'repair',
    find: (p, near) => game.buildings.find(b => near(b, 18) && b.hp < b.maxHp),
    check: (p, target) => (canAfford(getRepairStep(target).cost) ? null : 'possess.noRepairCost'),
    step: (s, target, tick) => {
      if (!game.buildings.includes(target) || target.hp >= target.maxHp || !canAfford(getRepairStep(target).cost)) return false;
      if (Math.hypot(target.x - s.x, target.y - s.y) > 34) walkTo(s, target.x, target.y, tick);
      else repairStep(target, tick.dt);
      return true;
    }
  },
  {
    // an apple tree with apples, and no axe to fell it with: pick them
    kind: 'apples',
    find: (p, near) => game.trees.find(tr => near(tr, 25) && tr.apple && tr.applesReady && !hasAxeTool(p.tool)),
    check: p => (handsFull(p) ? 'possess.handsFull' : null),
    step: (s, target, tick) => {
      if (!game.trees.includes(target) || !target.applesReady || handsFull(s)) return false;
      return pickApplesFrom(s, target, tick.dt);
    }
  },
  {
    kind: 'harvest',
    find: (p, near) => getHarvestableResources().find(r => near(r, 25)),
    check: (p, target) => {
      const kind = getMapResourceKind(target);
      const def = getMapResourceDef(kind);
      if (def.tool && (!hasToolFamily(p.tool, def.tool) || target.isGrowing)) return `possess.needs.${def.tool}`;
      if (kind === 'farm' && !(target.growth >= 100)) return 'possess.notRipe';
      return handsFull(p) ? 'possess.handsFull' : null;
    },
    step: (s, target, tick) => {
      const kind = tick.resourceKind.get(target);
      if (!kind || !game[getMapResourceDef(kind).list].includes(target) || handsFull(s)) return false;
      const spot = getResourceApproachPoint(s, target);
      if (!spot) return false;
      if (Math.hypot(spot.x - s.x, spot.y - s.y) > 10) walkTo(s, spot.x, spot.y, tick);
      else workResource(s, target, tick);
      return true;
    }
  },
  {
    kind: 'fish',
    find: (p, near) => game.waterTiles.find(w => near(w, 20)),
    check: p => {
      if (p.tool !== 'rod') return 'possess.needsRod';
      if (!p.bait && !getFishingBait()) return 'possess.noBait';
      return handsFull(p) ? 'possess.handsFull' : null;
    },
    step: (s, target, tick) => {
      if (s.tool !== 'rod' || handsFull(s)) return false;
      if (!s.bait) return fetchBait(s, tick.dt); // bait first, from a storage
      fishAt(s, target, tick.dt);
      return true;
    }
  }
];

// The orders this settler's type takes
export function canTakeOrder(p, kind) {
  const allowed = (getDefinition('settlerTypes', p.type) || {}).orders;
  return !allowed || allowed.includes(kind);
}

// A tap while possessing: an order for the possessed settler. Returns false if the tap wasn't on
// anything for it, so the tap goes on as usual.
export function orderPossessed(p, x, y) {
  const near = (o, r) => Math.hypot(x - o.x, y - o.y) < r;
  for (const order of ORDERS) {
    if (!canTakeOrder(p, order.kind)) continue;
    const target = order.find(p, near);
    if (!target) continue;
    const refusal = order.check && order.check(p, target);
    if (refusal) { showNotification(t(refusal), true); return true; }
    p.order = { kind: order.kind, target };
    p.path = null;
    return true;
  }
  if (isBowWeapon(p.weapon)) {
    p.order = null;
    performAttack(p, x, y);
    return true;
  }
  return false;
}

// One tick of the possessed settler's order; false once it's done or can't be carried on
export function followOrder(s, tick) {
  const order = ORDERS.find(o => o.kind === s.order.kind);
  return !!order && order.step(s, s.order.target, tick);
}

// The possessed settler moves by the joystick or WASD (a diagonal isn't faster than straight)
export function movePossessed(dt) {
  const p = getPossessed();
  if (p) {
    let dx = joystick.x, dy = joystick.y;
    if (keys['w'] || keys['ц']) dy -= 1;
    if (keys['s'] || keys['ы']) dy += 1;
    if (keys['a'] || keys['ф']) dx -= 1;
    if (keys['d'] || keys['в']) dx += 1;
    const push = Math.hypot(dx, dy);
    if (push > 1) { dx /= push; dy /= push; }
    if (push > 0.1) {
      p.order = null; // moving by hand cancels a tap order
      faceTowards(p, p.x + dx, p.y + dy);
      let vx = dx * p.speed * GAME_CONFIG.movementScale;
      let vy = dy * p.speed * GAME_CONFIG.movementScale;
      if (!collidesWithWall(p.x + vx, p.y, p.radius)) p.x += vx;
      if (!collidesWithWall(p.x, p.y + vy, p.radius)) p.y += vy;
    }
  }
}
