// Making things (#211, #248): a tool, a weapon or a piece of gear is made by a worker. It's paid for when
// it's ordered; the worker fetches what it costs from a storage, carries it to where it's made (the town
// hall for what's made by hand, a workshop, or a smithy for anything with iron in it) and works on it there
// (GAME_CONFIG.crafting). Made, it goes into the armory, to be handed out from there.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { canAfford, findNearestStorage, isAtStorage, payCost, stock, walkToStorage } from '../storage/index.js';
import { faceTowards } from '../settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { playSound, playWorkSound } from '../../../app/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';
import { isLocked } from '../../../modes/endless/index.js';

// Where it's made: by hand (madeBy: 'hand', at the town hall, #261), the smithy if there's iron in it,
// otherwise the workshop
/** @returns {'hand' | 'workshop' | 'smithy'} */
export function craftPlace(category, id) {
  const item = GAME_CONFIG[category][id];
  if (item && item.madeBy === 'hand') return 'hand';
  return item && item.cost && item.cost.iron ? 'smithy' : 'workshop';
}

// The nearest place of that kind to `from`: a workshop or a smithy (null with none built); by hand, the
// town hall
export function findWorkplace(place, from = townHall) {
  if (place === 'hand') return townHall;
  let best = null, bestD = Infinity;
  for (const b of game.buildings) {
    if (GAME_CONFIG.buildings[b.type] && GAME_CONFIG.buildings[b.type].crafts === place) {
      const d = Math.hypot(b.x - from.x, b.y - from.y);
      if (d < bestD) { bestD = d; best = b; }
    }
  }
  return best;
}

// Order one made: 'ordered', or why not ('noSmithy', 'noWorkshop', 'cantAfford'). Made, it waits in the
// armory to be handed out (#248)
export function orderCraft(category, id) {
  if (isLocked(category, id)) return 'locked'; // (a card opens it, #255)
  const place = craftPlace(category, id);
  if (!findWorkplace(place)) return place === 'smithy' ? 'noSmithy' : 'noWorkshop'; // (by hand: always)
  const cost = GAME_CONFIG[category][id].cost || {};
  if (!canAfford(cost)) return 'cantAfford';
  payCost(cost);
  game.craftOrders.push({ key: `${category}:${id}`, category, id, crafter: null, stage: 'fetch', progress: 0 });
  return 'ordered';
}


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
    // arrows are the archers' to make while there are any (#249)
    const archers = game.settlers.some(o => o.role === 'archer' && !o.towerAssignment && !o.isPossessed);
    const mine = o => !(o.id === 'arrows' && archers && s.role !== 'archer');
    order = game.craftOrders.find(o => open(o) && o.for === s) ||
      game.craftOrders.find(o => open(o) && mine(o) && (!o.for || !game.settlers.includes(o.for)));
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
  // quicker at a workshop: nothing with iron is made there (#232)
  const seconds = (GAME_CONFIG.crafting.seconds[order.category] || 5) * (craftPlace(order.category, order.id) === 'workshop' ? GAME_CONFIG.crafting.workshopShare : 1);
  order.progress += tick.dt / seconds;
  // what's drawn: a hammer in its hands, the thing on an anvil in front of it, how far along (#232)
  s.crafting = { icon: (GAME_CONFIG[order.category][order.id] || {}).icon, progress: Math.min(1, order.progress), until: game.pathTick + 2 };
  if (order.progress >= 1) {
    game.craftOrders.splice(game.craftOrders.indexOf(order), 1);
    s.carrying = null;
    // arrows (#249) go into the stock; a thing into the armory, and on to whoever it's for
    if (order.yields) { for (const [id, n] of Object.entries(order.yields)) stock[id] = (stock[id] || 0) + n; return true; }
    game.armory[order.key] = (game.armory[order.key] || 0) + 1;
    playSound('craftDone', s); // (#252)
  }
  return true;
}
