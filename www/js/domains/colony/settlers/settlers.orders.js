// Orders for the possessed settler. Its AI is off (see playerControlled): a tap on something
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
import { t } from '../../../engine/platform/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { getWeaponStats, hasAxeTool, hasToolFamily, isRangedWeapon } from '../equipment/index.js';
import { canAfford, fetchFromStorage, goDeliver, hasRoomToCarry, moveSettlerToTownHall, payCost, stock, takeStock } from '../storage/index.js';
import { deliverMaterials, getHallRepairStep, getMissingMaterial, getRepairStep, hallRepairStep, repairStep, workBlueprint } from '../../economy/building/index.js';
import { showNotification } from '../../../ui/index.js';
import { getPossessed, petKindOf } from './settlers.rules.js';
import { devour, haunt } from '../pets/index.js';
import { getHarvestableResources, getMapResourceDef, getMapResourceKind, workResource } from '../../economy/gathering/index.js';
import { getResourceApproachPoint, moveEntityTowards } from '../../../engine/movement/index.js';
import { performAttack } from '../../conflict/combat/index.js';
import { faceTowards } from './settlers.draw.js';
import { fetchBait, fishAt, getFishingBait } from '../../economy/fishing/index.js';
import { huntBoar } from '../../economy/hunting/index.js';
import { pickApplesFrom, tendFarmZones, waterCrops } from '../../economy/farming/index.js';
import { cook } from '../../economy/cooking/index.js';
import { craftItem } from '../equipment/index.js';
import { getNecromancy, raiseTemporaryZombie, zombiesOf } from '../../factions/undead/index.js';
import { getCorpseHeap } from './settlers.corpses.js';
import { lightTorches } from './settlers.night.js';
import { cleanDung } from './settlers.idle.js';

export const handsFull = p => p.carrying && !hasRoomToCarry(p);
export const walkTo = (s, x, y, tick) => moveEntityTowards(s, x, y, s.speed, false, tick.dt);

export const ORDERS = [
  {
    kind: 'attack',
    find: (p, near) => game.enemies.find(en => near(en, en.radius + 15)) || game.enemyTents.find(et => near(et, 25)),
    step: (s, target, tick) => {
      if (!game.enemies.includes(target) && !game.enemyTents.includes(target)) return false;
      if (isRangedWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
      const combat = getWeaponStats(s, 'combat');
      const reach = game.enemyTents.includes(target) ? combat.tentReach : combat.approach + target.radius;
      if (Math.hypot(target.x - s.x, target.y - s.y) > reach) walkTo(s, target.x, target.y, tick);
      else performAttack(s, target.x, target.y);
      return true;
    }
  },
  // (#314) a pet's own: a hellhound eats a corpse; a ghost flies into an enemy
  {
    kind: 'devour',
    find: (p, near) => (petKindOf(p) === 'beast' ? game.corpses.find(c => near(c, 18)) : null),
    step: (s, target, tick) => devour(s, target, tick)
  },
  {
    kind: 'dive',
    find: (p, near) => (petKindOf(p) === 'ghost' ? game.enemies.find(en => near(en, en.radius + 15)) : null),
    step: (s, target) => {
      if (!game.enemies.includes(target) || s.ghostGone > 0) return false;
      const d = Math.hypot(target.x - s.x, target.y - s.y), step = GAME_CONFIG.pets.ghost.diveSpeed * GAME_CONFIG.movementScale;
      if (d <= Math.max(14, step)) { haunt(s, target); return false; }
      s.x += (target.x - s.x) / d * step; s.y += (target.y - s.y) / d * step;
      faceTowards(s, target.x, target.y);
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
    // hand in what it carries at a warehouse or the town hall
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
      const repair = getHallRepairStep();
      if (townHall.hp >= townHall.maxHp || !canAfford(repair.cost)) return false;
      if (Math.hypot(townHall.x - s.x, townHall.y - s.y) > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
        return true;
      }
      return hallRepairStep(s, tick, repair);
    }
  },
  {
    kind: 'build',
    find: (p, near) => game.blueprints.find(bp => near(bp, 18)),
    step: (s, target, tick) => {
      if (!game.blueprints.includes(target)) return false;
      // its materials first, from storage
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
      // (#326) as it does by itself: a soldier or an archer gathers nothing (it hunts, and brings in its own kill)
      if (p.role !== 'worker' && kind !== 'boar' && !target.isCarcass) return 'possess.notWorker';
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
  // (#279) the rest of what a settler does by itself, by hand too
  {
    // a medic: a hurt one tapped, healed with herbs from its bag (filled at a storage first)
    kind: 'heal',
    find: (p, near) => (hasToolFamily(p.tool, 'medic') ? game.settlers.find(o => o !== p && near(o, (o.visualRadius || o.radius) + 6) && o.hp < o.maxHp) : null),
    check: p => (!(p.bagHerbs > 0) && !(stock.herbs > 0) ? 'possess.noHerbs' : null),
    step: (s, target, tick) => {
      if (!game.settlers.includes(target) || target.hp >= target.maxHp) return false;
      const medic = GAME_CONFIG.medic;
      if (!(s.bagHerbs > 0)) return fetchFromStorage(s, 'herbs', tick.dt, () => { s.bagHerbs = takeStock('herbs', medic.bagSize); });
      if (Math.hypot(target.x - s.x, target.y - s.y) > medic.range + target.radius) { walkTo(s, target.x, target.y, tick); return true; }
      s.working = 0.1; faceTowards(s, target.x, target.y);
      s.healTimer = (s.healTimer || 0) + tick.dt;
      if (s.healTimer >= medic.healSeconds) { s.healTimer = 0; s.bagHerbs--; target.hp = Math.min(target.maxHp, target.hp + medic.healPerHerb); }
      return true;
    }
  },
  {
    // a necromancer: a corpse tapped, raised (one of its raises)
    kind: 'raise',
    find: (p, near) => (getNecromancy(p) ? game.corpses.find(c => near(c, 18)) : null),
    check: p => ((p.raisesLeft ?? 1) > 0 && zombiesOf(p).length < (getNecromancy(p)?.maxZombies ?? Infinity) ? null : 'possess.noRaises'),
    step: (s, target, tick) => {
      const necro = getNecromancy(s);
      if (!necro || !game.corpses.includes(target) || (s.raisesLeft ?? necro.raises) <= 0) return false;
      if (Math.hypot(target.x - s.x, target.y - s.y) > necro.raiseReach) { walkTo(s, target.x, target.y, tick); return true; }
      s.working = 0.1; faceTowards(s, target.x, target.y);
      s.raising = { x: target.x, y: target.y, until: game.pathTick + 2 };
      s.raiseTimer = (s.raiseTimer || 0) + tick.dt;
      if (s.raiseTimer < necro.raiseSeconds) return true;
      s.raiseTimer = 0; s.raisesLeft = (s.raisesLeft ?? necro.raises) - 1;
      raiseTemporaryZombie(target, s);
      return false;
    }
  },
  {
    // a corpse tapped: carried out of the base to the heap
    kind: 'corpse',
    find: (p, near) => (!p.carrying ? game.corpses.find(c => near(c, 16)) : null),
    step: (s, target, tick) => {
      if (!(s.carrying && s.carrying.type === 'corpse')) {
        if (!game.corpses.includes(target) || s.carrying) return false;
        if (Math.hypot(target.x - s.x, target.y - s.y) > 14) { walkTo(s, target.x, target.y, tick); return true; }
        game.corpses.splice(game.corpses.indexOf(target), 1);
        s.carrying = { type: 'corpse', amount: 1, corpse: target };
        return true;
      }
      const heap = getCorpseHeap();
      if (heap && Math.hypot(heap.x - s.x, heap.y - s.y) > 14) { walkTo(s, heap.x, heap.y, tick); return true; }
      game.corpses.push(Object.assign(s.carrying.corpse, { x: s.x, y: s.y }));
      s.carrying = null;
      return false;
    }
  },
  {
    // a pack lying by a storage: carried into one with room
    kind: 'pile',
    find: (p, near) => (!p.carrying ? game.piles.find(pl => near(pl, 10)) : null),
    step: (s, target, tick) => {
      if (s.carrying) { if (!s.carrying.counted) return false; goDeliver(s, tick); return !!s.carrying; }
      if (!game.piles.includes(target)) return false;
      if (Math.hypot(target.x - s.x, target.y - s.y) > 14) { walkTo(s, target.x, target.y, tick); return true; }
      const amount = Math.min(target.amount, GAME_CONFIG.storage.carryMaterials);
      target.amount -= amount;
      if (target.amount <= 1e-6) game.piles.splice(game.piles.indexOf(target), 1);
      s.carrying = { type: target.type, amount, counted: true, loads: 99 };
      return true;
    }
  },
  {
    // a building's work tapped: done as the settler does it by itself (cooking at a campfire, planting a farm
    // zone, watering the crops, lighting a torch post, carrying dung to the heap, making what's ordered at a
    // workshop or a smithy), till there's no more of it
    kind: 'job',
    find: (p, near) => {
      const b = game.buildings.find(o => near(o, 18));
      if (b && b.type === 'campfire') return { job: cook };
      if (b && b.type === 'torch' && !b.lit) return { job: lightTorches };
      if (b && b.type === 'dung_heap') return { job: cleanDung };
      if (b && GAME_CONFIG.buildings[b.type] && GAME_CONFIG.buildings[b.type].crafts) return { job: craftItem };
      const zone = game.farmZones.find(z => near(z, 15));
      if (zone && hasToolFamily(p.tool, 'hoe')) return { job: tendFarmZones };
      const plot = game.farmPlots.find(f => near(f, 15) && f.growth < 100);
      if (plot && p.wateringCan) return { job: waterCrops };
      return null;
    },
    // (its behaviour runs with the AI's hands for a moment: as if not possessed)
    step: (s, target, tick) => {
      s.isPossessed = false; s.wasIdle = true;
      const going = target.job(s, tick);
      s.isPossessed = true;
      if (going) return true;
      // the work done, what came of it (food off the fire...) taken home
      if (s.carrying && s.carrying.type !== 'corpse') { goDeliver(s, tick); return true; }
      return false;
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
  },
  {
    // (#326) a tap on nothing it can work: it walks there (a ghost straight, through anything). Never found by
    // a tap on something (see orderPossessed)
    kind: 'walk',
    find: () => null,
    step: (s, target, tick) => {
      const d = Math.hypot(target.x - s.x, target.y - s.y);
      if (d < 6) return false;
      if (petKindOf(s) === 'ghost') {
        const step = Math.min(d, s.speed * GAME_CONFIG.movementScale);
        faceTowards(s, target.x, target.y);
        s.x += (target.x - s.x) / d * step; s.y += (target.y - s.y) / d * step;
      } else walkTo(s, target.x, target.y, tick);
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
  // (#326) on nothing for it: it walks there (the possessed move by taps, no joystick or keys)
  p.order = { kind: 'walk', target: { x, y } };
  p.path = null;
  return true;
}

// One tick of the possessed settler's order; false once it's done or can't be carried on
export function followOrder(s, tick) {
  const order = ORDERS.find(o => o.kind === s.order.kind);
  return !!order && order.step(s, s.order.target, tick);
}
