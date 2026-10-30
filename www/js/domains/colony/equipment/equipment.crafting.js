// Making things (#211, #248): a tool, a weapon or a piece of gear is made by a worker. It's paid for when
// it's ordered; the worker fetches what it costs from a storage, carries it to where it's made (the town
// hall for what's made by hand, a workshop, or a smithy for anything with iron in it) and works on it there
// (GAME_CONFIG.crafting). Made, it goes into the armory, to be handed out from there.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, onceThisTick, townHall } from '../../../engine/world/index.js';
import { canAfford, findNearestStorage, isAtStorage, payCost, stock, walkToStorage } from '../storage/index.js';
import { faceTowards, noteDay } from '../settlers/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { playSound, playWorkSound } from '../../../app/index.js';
import { isDefenseAlert } from '../../conflict/combat/index.js';
import { isLocked } from '../../../modes/endless/index.js';
import { isForPlayerFaction } from '../../factions/index.js';
import { hasToolFamily } from './equipment.rules.js';

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

// Expand missing recipe outputs into prerequisite jobs; their ingredients are paid for with the final order.
function craftOrderPlan(category, id) {
  const totalCost = {}, available = { ...stock }, planned = {}, recipeOrders = [];
  const resolveCost = (cost, waitFor, ancestors = new Set()) => {
    for (const [resource, amount] of Object.entries(cost)) {
      let missing = Number(amount || 0);
      const fromStock = Math.min(missing, Number(available[resource] || 0));
      if (fromStock > 0) {
        available[resource] -= fromStock;
        totalCost[resource] = (totalCost[resource] || 0) + fromStock;
        missing -= fromStock;
      }
      const fromPlanned = Math.min(missing, Number(planned[resource] || 0));
      if (fromPlanned > 0) {
        planned[resource] -= fromPlanned;
        waitFor[resource] = (waitFor[resource] || 0) + fromPlanned;
        missing -= fromPlanned;
      }
      if (missing <= 0) continue;

      const recipe = Object.values(GAME_CONFIG.recipes).find(candidate =>
        candidate.produces[resource] && isForPlayerFaction(candidate) && !isLocked('recipes', candidate.id) &&
        findWorkplace(craftPlace('recipes', candidate.id)));
      const batches = recipe && (recipe.batches || 1);
      const perJob = recipe && Number(recipe.produces[resource]) / batches;
      if (!recipe || !perJob || ancestors.has(resource)) {
        totalCost[resource] = (totalCost[resource] || 0) + missing;
        continue;
      }

      const jobs = Math.ceil(missing / perJob);
      for (let i = 0; i < jobs; i++) {
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(resource);
        const jobWait = {};
        resolveCost(Object.fromEntries(Object.entries(recipe.cost || {}).map(([key, value]) => [key, value / batches])), jobWait, nextAncestors);
        recipeOrders.push({
          key: `recipes:${recipe.id}`, category: 'recipes', id: recipe.id, crafter: null,
          stage: Object.keys(jobWait).length ? 'waitResources' : 'fetch', progress: 0, waitFor: jobWait,
          yields: Object.fromEntries(Object.entries(recipe.produces).map(([key, value]) => [key, value / batches]))
        });
        planned[resource] = (planned[resource] || 0) + perJob;
      }
      const fromRecipes = Math.min(missing, Number(planned[resource] || 0));
      if (fromRecipes > 0) {
        planned[resource] -= fromRecipes;
        waitFor[resource] = (waitFor[resource] || 0) + fromRecipes;
        missing -= fromRecipes;
      }
      if (missing > 0) totalCost[resource] = (totalCost[resource] || 0) + missing;
    }
  };
  const waitFor = {};
  resolveCost(GAME_CONFIG[category][id].cost || {}, waitFor);
  return { totalCost, recipeOrders, waitFor };
}

export function getCraftOrderCost(category, id) {
  return craftOrderPlan(category, id).totalCost;
}

// Order one made: 'ordered', or why not ('noSmithy', 'noWorkshop', 'cantAfford'). Made, it waits in the
// armory to be handed out (#248)
export function orderCraft(category, id) {
  if (isLocked(category, id)) return 'locked'; // (a card opens it, #255)
  const place = craftPlace(category, id);
  if (!findWorkplace(place)) return place === 'smithy' ? 'noSmithy' : 'noWorkshop'; // (by hand: always)
  const { totalCost, recipeOrders, waitFor } = craftOrderPlan(category, id);
  if (!canAfford(totalCost)) return 'cantAfford';
  payCost(totalCost);
  game.craftOrders.push(...recipeOrders);
  game.craftOrders.push({
    key: `${category}:${id}`, category, id, crafter: null,
    stage: Object.keys(waitFor).length ? 'waitResources' : 'fetch', progress: 0, waitFor
  });
  return 'ordered';
}


// A settler on an order (see SETTLER_BEHAVIOURS): to a storage for what it takes, to where
// it's made, and at it until it's done
const archersOnce = onceThisTick();
export function craftItem(s, tick) {
  // a worker; a soldier or archer too between waves (a colony of soldiers still makes its things)
  if (s.isPossessed || s.towerAssignment || (s.role !== 'worker' && (tick.isWaveActive || isDefenseAlert()))) return false;
  let order = game.craftOrders.find(o => o.crafter === s);
  if (!order) {
    // (#326) making a thing comes before cooking: one on its way to a fire with food puts it back for it
    if (s.carrying && !s.carrying.forFire) return false;
    // its own first; one for someone else only once that one's gone (#232: who it's for makes it)
    const open = o => !o.crafter || !game.settlers.includes(o.crafter);
    // arrows are the archers' to make while there are any (#249; #306: looked for once a tick)
    const archers = archersOnce(() => game.settlers.some(o => o.role === 'archer' && !o.towerAssignment && !o.isPossessed));
    // (#326) a recipe with a tool (firewood: an axe) only for one holding it
    const needs = o => (GAME_CONFIG[o.category] && GAME_CONFIG[o.category][o.id] || {}).tool;
    const mine = o => !(o.id === 'arrows' && archers && s.role !== 'archer') && (!needs(o) || hasToolFamily(s.tool, needs(o)));
    const ready = o => o.stage === 'waitRope'
      ? (stock.rope || 0) >= o.ropeNeeded
      : o.stage !== 'waitResources' || Object.entries(o.waitFor || {}).every(([resource, amount]) => (stock[resource] || 0) >= amount);
    order = game.craftOrders.find(o => open(o) && ready(o) && o.for === s) ||
      game.craftOrders.find(o => open(o) && ready(o) && mine(o) && (!o.for || !game.settlers.includes(o.for)));
    if (!order) return false;
    if (s.carrying) { stock[s.carrying.type] = (stock[s.carrying.type] || 0) + (s.carrying.amount || 0); s.carrying = null; }
  }
  if (order.stage === 'waitResources') {
    if (!Object.entries(order.waitFor || {}).every(([resource, amount]) => (stock[resource] || 0) >= amount)) { order.crafter = null; return false; }
    payCost(order.waitFor);
    order.waitFor = {};
    order.stage = 'fetch';
  } else if (order.stage === 'waitRope') {
    if ((stock.rope || 0) < order.ropeNeeded) { order.crafter = null; return false; }
    payCost({ rope: order.ropeNeeded });
    order.stage = 'fetch';
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
  // (#279) a small thing made by hand has its own time (craftSeconds: a whistle)
  const own = (GAME_CONFIG[order.category][order.id] || {}).craftSeconds;
  const seconds = own ?? (GAME_CONFIG.crafting.seconds[order.category] || 5) * (craftPlace(order.category, order.id) === 'workshop' ? GAME_CONFIG.crafting.workshopShare : 1);
  order.progress += tick.dt / seconds;
  // what's drawn: a hammer in its hands, the thing on an anvil in front of it, how far along (#232)
  s.crafting = { icon: (GAME_CONFIG[order.category][order.id] || {}).icon, progress: Math.min(1, order.progress), until: game.pathTick + 2 };
  if (order.progress >= 1) {
    game.craftOrders.splice(game.craftOrders.indexOf(order), 1);
    s.carrying = null;
    noteDay(s, 'crafted'); // (its day, #306)
    // arrows (#249) go into the stock; a thing into the armory, and on to whoever it's for
    if (order.yields) { for (const [id, n] of Object.entries(order.yields)) stock[id] = (stock[id] || 0) + n; return true; }
    game.armory[order.key] = (game.armory[order.key] || 0) + 1;
    playSound('craftDone', s); // (#252)
  }
  return true;
}
