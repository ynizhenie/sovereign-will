// Making things (#211): a tool, a weapon or a piece of gear is made by a worker. It's paid for when it's
// ordered; the worker fetches what it costs from a storage, carries it to where it's made (the town hall,
// or the smithy for anything with iron in it) and works on it there (GAME_CONFIG.crafting). Made, it goes
// into the armory and on to a settler free to take it.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { canAfford, findNearestStorage, isAtStorage, payCost, walkToStorage } from '../storage/index.js';
import { faceTowards } from '../settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { playWorkSound } from '../../../app/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';

// Where it's made: the smithy if there's iron in it, otherwise the town hall
export function craftPlace(category, id) {
  const item = GAME_CONFIG[category][id];
  return item && item.cost && item.cost.iron ? 'smithy' : 'hall';
}

// The nearest place of that kind to `from`: the town hall, or a smithy (null with none built)
export function findWorkplace(place, from = townHall) {
  if (place === 'hall') return townHall;
  let best = null, bestD = Infinity;
  for (const b of game.buildings) {
    if (GAME_CONFIG.buildings[b.type] && GAME_CONFIG.buildings[b.type].crafts === place) {
      const d = Math.hypot(b.x - from.x, b.y - from.y);
      if (d < bestD) { bestD = d; best = b; }
    }
  }
  return best;
}

// Order one made: 'ordered', or why not ('noSmithy', 'cantAfford'). handOut: when it's made, to a settler
// free to take it
export function orderCraft(category, id, handOut = true) {
  if (craftPlace(category, id) === 'smithy' && !findWorkplace('smithy')) return 'noSmithy';
  const cost = GAME_CONFIG[category][id].cost || {};
  if (!canAfford(cost)) return 'cantAfford';
  payCost(cost);
  game.craftOrders.push({ key: `${category}:${id}`, category, id, crafter: null, stage: 'fetch', progress: 0, handOut });
  return 'ordered';
}

/** @type {((order: any) => void) | null} */
let handOutMade = null;
// what hands a made thing out (equipment.rules.js: the same as a button, from the armory, nothing said)
export function onCraftMade(handler) { handOutMade = handler; }

// A settler on an order (see SETTLER_BEHAVIOURS): to a storage for what it takes, to where
// it's made, and at it until it's done
export function craftItem(s, tick) {
  // a worker; a soldier or archer too between waves (a colony of soldiers still makes its things)
  if (s.isPossessed || s.towerAssignment || (s.role !== 'worker' && (tick.isWaveActive || isDefenseAlert()))) return false;
  let order = game.craftOrders.find(o => o.crafter === s);
  if (!order) {
    if (s.carrying) return false;
    // its own first; one for someone else only once that one's gone (#232: who it's for makes it)
    const open = o => !o.crafter || !game.settlers.includes(o.crafter);
    order = game.craftOrders.find(o => open(o) && o.for === s) ||
      game.craftOrders.find(o => open(o) && (!o.for || !game.settlers.includes(o.for)));
    if (!order) return false;
  }
  const place = findWorkplace(craftPlace(order.category, order.id), s);
  if (!place) { order.crafter = null; return false; } // its smithy is gone: it waits for another
  order.crafter = s;
  s.patrolTarget = null;
  if (order.stage === 'fetch') {
    const storage = findNearestStorage(s);
    if (isAtStorage(s, storage)) {
      s.carrying = { type: 'bundle', amount: 1, forCraft: order };
      order.stage = 'carry';
    } else {
      walkToStorage(s, storage, tick.dt);
    }
    return true;
  }
  const reach = (place.radius || 15) + s.radius + 10;
  if (Math.hypot(place.x - s.x, place.y - s.y) > reach) {
    moveEntityTowards(s, place.x, place.y, s.speed, false, tick.dt);
    return true;
  }
  order.stage = 'work';
  faceTowards(s, place.x, place.y);
  s.working = 0.1;
  playWorkSound(s, 'hammer', 0.5);
  // quicker at the town hall: nothing with iron is made there (#232)
  const seconds = (GAME_CONFIG.crafting.seconds[order.category] || 5) * (place === townHall ? GAME_CONFIG.crafting.hallShare : 1);
  order.progress += tick.dt / seconds;
  // what's drawn: a hammer in its hands, the thing on an anvil in front of it, how far along (#232)
  s.crafting = { icon: (GAME_CONFIG[order.category][order.id] || {}).icon, progress: Math.min(1, order.progress), until: game.pathTick + 2 };
  if (order.progress >= 1) {
    game.craftOrders.splice(game.craftOrders.indexOf(order), 1);
    s.carrying = null;
    game.armory[order.key] = (game.armory[order.key] || 0) + 1;
    if (order.handOut && handOutMade) handOutMade(order);
  }
  return true;
}
