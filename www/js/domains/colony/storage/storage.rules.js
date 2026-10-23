// The colony's stock and its storages (the town hall and warehouses): taking and adding, prices and
// whether they can be paid, food by kind, and what a settler carries

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { getResourceIcon, showCostOnButton, showNotification } from '../../../ui/index.js';
import { t } from '../../../engine/platform/index.js';
import { STRUCTURE_COLLISION_HALF_SIZE, TILE_SIZE, game, getGridPos, rand, townHall } from '../../../engine/world/index.js';
import { getReservedForBlueprints } from '../../economy/building/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';

// ---- The colony's stock: amount per resource id of GAME_CONFIG.resources, shared by the
// whole colony (set from GAME_CONFIG.start by resetGame). The town hall and warehouses are where
// settlers bring what they gather and fetch what they need: whichever is nearest.
export const stock = Object.fromEntries(Object.keys(GAME_CONFIG.resources).map(id => [id, 0]));

// The town hall and the warehouses: worked out again only when the buildings change (a building added or
// taken away: a new list or a new length) or a tick has passed, not on every call (every settler carrying
// something asks, every tick)
/** @type {{ buildings: Object[] | null, length: number, tick: number, list: (import('../../../engine/world/types.js').Building | import('../../../engine/world/types.js').TownHall)[] }} */
const storages = { buildings: null, length: -1, tick: -1, list: [] };
export function getStorages() {
  if (storages.buildings !== game.buildings || storages.length !== game.buildings.length || storages.tick !== game.pathTick) {
    Object.assign(storages, { buildings: game.buildings, length: game.buildings.length, tick: game.pathTick,
      list: [townHall, ...game.buildings.filter(b => b.type === 'warehouse')] });
  }
  return storages.list;
}

// Take up to `amount` of a resource out of the stock; returns how much there was
export function takeStock(id, amount) {
  const got = Math.max(0, Math.min(amount, stock[id] || 0));
  stock[id] -= got;
  return got;
}

// What there is of a resource to fetch: ready food of a kind lies in the mix (game.foodMix), not in the
// stock by kind
export function stockLeft(id) {
  return isFoodKind(id) ? (game.foodMix[id] || 0) : (stock[id] || 0);
}

// Take ready food of a kind out of Food and the mix, or a raw thing out of the stock; returns how much
export function takeFood(id, amount = 1) {
  if (!isFoodKind(id)) return takeStock(id, amount);
  const got = Math.max(0, Math.min(amount, game.foodMix[id] || 0, stock.food));
  stock.food -= got;
  game.foodMix[id] = (game.foodMix[id] || 0) - got;
  return got;
}

// Back into the stock: ready food of a kind into Food and the mix, anything else into the stock
export function returnFood(id, amount) {
  if (isFoodKind(id)) addFood(id, amount);
  else stock[id] = (stock[id] || 0) + amount;
}

// Shown in the HUD: the stock, plus for arrows the ones already loaded in towers and quivers
export function getResourceAmount(resourceKey) {
  let amount = stock[resourceKey] || 0;
  if (resourceKey === 'arrows') {
    amount += game.buildings.filter(building => building.type === 'watchtower').reduce((sum, tower) => sum + (tower.arrows || 0), 0) +
      game.settlers.reduce((sum, settler) => sum + (settler.arrows || 0), 0);
  }
  return amount;
}

// ---- Food kinds (GAME_CONFIG.foodKinds): all Food, remembered by kind for the HUD

export function isFoodKind(type) {
  return !!GAME_CONFIG.foodKinds[type];
}

// Ready food of a kind into the stock
// The start's food as a random mix of kinds
export function mixStartFood() {
  const kinds = Object.keys(GAME_CONFIG.foodKinds);
  game.foodMix = {};
  for (let i = 0; i < Math.floor(stock.food); i++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    game.foodMix[kind] = (game.foodMix[kind] || 0) + 1;
  }
  syncFoodMix();
}

export function addFood(kind, amount) {
  syncFoodMix();
  stock.food += amount;
  game.foodMix[kind] = (game.foodMix[kind] || 0) + amount;
}

// Keep the kinds adding up to stock.food: food added without a kind goes, a piece at a time, to whichever
// kind there's least of; food spent or eaten comes off the kinds in GAME_CONFIG.foodKinds order
export function syncFoodMix() {
  const kinds = Object.keys(GAME_CONFIG.foodKinds);
  let diff = stock.food - kinds.reduce((sum, k) => sum + (game.foodMix[k] || 0), 0);
  while (diff > 1e-9) {
    const least = kinds.reduce((a, b) => ((game.foodMix[b] || 0) < (game.foodMix[a] || 0) ? b : a));
    const piece = Math.min(1, diff);
    game.foodMix[least] = (game.foodMix[least] || 0) + piece;
    diff -= piece;
  }
  for (const kind of kinds) {
    if (diff >= 0) break;
    const take = Math.min(game.foodMix[kind] || 0, -diff);
    game.foodMix[kind] = (game.foodMix[kind] || 0) - take;
    diff += take;
  }
}

export function formatCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, value]) => (GAME_CONFIG.resources[key] ? `{{${key}:${value}}}` : `${value}${getResourceIcon(key)}`))
    .join(' ');
}

export function canAfford(cost = {}) {
  return Object.entries(cost).every(([key, amount]) => Number(stock[key] || 0) >= Number(amount || 0));
}

export const getFreeStock = id => Number(stock[id] || 0) - getReservedForBlueprints(id);

// Take / give a cost ({ resourceId: amount }) from / to the stock
export function payCost(cost = {}) {
  for (const [resource, amount] of Object.entries(cost)) stock[resource] = Number(stock[resource] || 0) - Number(amount || 0);
}

export function addResources(amounts = {}) {
  for (const [resource, amount] of Object.entries(amounts)) stock[resource] = Number(stock[resource] || 0) + Number(amount || 0);
}

// have: how much of a resource counts as there (the whole stock, or for buildings what's not promised)
export function getMissingCost(cost, have = id => Number(stock[id] || 0)) {
  return Object.entries(cost)
    .filter(([key, amount]) => have(key) < Number(amount || 0))
    // in whole pieces: a stock that trickles in (the undead's bones) shows no 0.0000001 (#204)
    .map(([key, amount]) => `${Math.max(1, Math.ceil(Number(amount) - have(key)))}${getResourceIcon(key)}`)
    .join(', ');
}

export function showCostError(cost, prefix, have) {
  if (showCostOnButton()) return; // on the item's own card, by its button (#232)
  showNotification(t('cost.missing', { prefix, cost: formatCost(cost), missing: getMissingCost(cost, have) }), true);
}

export function giveResourceToSettler(s, type, amount) {
  if (!s) return;
  if (!s.carrying) {
    s.carrying = { type: type, amount: amount };
  } else if (s.carrying.type === type) {
    s.carrying.amount += amount;
  } else if (s.carrying.items) {
    let item = s.carrying.items.find(entry => entry.type === type);
    if (item) item.amount += amount;
    else s.carrying.items.push({ type: type, amount: amount });
  } else {
    s.carrying = { type: 'bundle', items: [{ type: s.carrying.type, amount: s.carrying.amount }, { type: type, amount: amount }] };
  }
}

// How many gathered loads this settler carries before heading home: its type's carryLoads, plus a
// backpack's. Fishers bring each catch home (they pick up bait there).
export function getCarryCapacity(s) {
  if (s.tool === 'rod') return 1;
  const type = getDefinition('settlerTypes', s.type) || GAME_CONFIG.settlerTypes.normal;
  return (type.carryLoads || 1) + (s.backpack ? GAME_CONFIG.gear.backpack.extraLoads : 0);
}

// Count one more gathered load on what the settler carries
export function addCarryLoad(s) {
  if (s && s.carrying) s.carrying.loads = (s.carrying.loads || 0) + 1;
}

// Carrying gathered loads but room for more (smelter runs etc. have no loads: always full)
export function hasRoomToCarry(s) {
  return !!s.carrying && s.carrying.loads !== undefined && s.carrying.loads < getCarryCapacity(s);
}

const townHallApproaches = new WeakMap();

export function getTownHallApproachPoint(settler) {
  const previous = townHallApproaches.get(settler);
  if (previous) {
    const g = getGridPos(previous.x, previous.y);
    if (!isTileBlockedForSettler(g.gx, g.gy)) return previous;
    townHallApproaches.delete(settler);
  }
  let dx = settler.x - townHall.x;
  let dy = settler.y - townHall.y;
  let distance = Math.hypot(dx, dy);
  if (distance === 0) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  const approachDistance = STRUCTURE_COLLISION_HALF_SIZE + TILE_SIZE / 2 + 1;
  // Approach a free tile outside the square footprint, favoring the side facing the settler.
  const angle = Math.atan2(dy, dx);
  const sides = [
    { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 }, { x: 1, y: -1 }
  ].sort((a, b) =>
    (b.x * Math.cos(angle) + b.y * Math.sin(angle)) / Math.hypot(b.x, b.y) -
    (a.x * Math.cos(angle) + a.y * Math.sin(angle)) / Math.hypot(a.x, a.y));
  for (const side of sides) {
    const p = { x: townHall.x + side.x * approachDistance, y: townHall.y + side.y * approachDistance };
    const g = getGridPos(p.x, p.y);
    if (!isTileBlockedForSettler(g.gx, g.gy)) {
      townHallApproaches.set(settler, p);
      return p;
    }
  }
  const fallback = { x: townHall.x + (dx / distance) * approachDistance, y: townHall.y + (dy / distance) * approachDistance };
  townHallApproaches.set(settler, fallback);
  return fallback;
}

export function isAtTownHall(settler) {
  const at = Math.max(Math.abs(settler.x - townHall.x), Math.abs(settler.y - townHall.y)) <=
    STRUCTURE_COLLISION_HALF_SIZE + TILE_SIZE / 2 + settler.radius + 4;
  if (at) townHallApproaches.delete(settler);
  return at;
}

export function moveSettlerToTownHall(settler, speed, dt) {
  let approachPoint = getTownHallApproachPoint(settler);
  moveEntityTowards(settler, approachPoint.x, approachPoint.y, speed, false, dt);
}
