// What's where (#248): the stock is one number per resource, as ever, but it lies somewhere: in the town
// hall (the most room) or a warehouse (less), `store` on each; what doesn't fit lies on the ground by it, a
// pile per kind (game.piles), and counts all the same, so it's never "too full to build". What's spent
// comes off the piles first (they take what lies about), then the warehouses, then the hall. A settler with
// nothing to do carries piles into a storage with room. A warehouse that's gone drops what it held.
// keepStoresInStep() puts any change of the stock made without a place (a cost paid, a refund) in step.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, getTileIndex, townHall } from '../../../engine/world/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { getStorages, stock } from './storage.rules.js';

const EPS = 1e-6;
const config = () => GAME_CONFIG.storage;

/** @param {any} storage */
export function storeCapacity(storage) {
  return storage === townHall ? config().capacity.hall : config().capacity.warehouse;
}

/** @param {any} storage */
export function storedTotal(storage) {
  return Object.values(storage.store || {}).reduce((sum, n) => sum + n, 0);
}

/** @param {any} storage */
export function roomIn(storage) {
  return Math.max(0, storeCapacity(storage) - storedTotal(storage));
}

// The storage nearest `from` with room, or null
export function findStorageWithRoom(from) {
  let best = null, bestD = Infinity;
  for (const storage of getStorages()) {
    if (roomIn(storage) < 1) continue;
    const d = Math.hypot(storage.x - from.x, storage.y - from.y);
    if (d < bestD) { bestD = d; best = storage; }
  }
  return best;
}

// Put `amount` of `id` into a storage; what doesn't fit goes on a pile by it
/** @param {any} storage */
export function storeInto(storage, id, amount) {
  if (!(amount > 0)) return;
  storage.store = storage.store || {};
  const into = Math.min(amount, roomIn(storage));
  if (into > 0) storage.store[id] = (storage.store[id] || 0) + into;
  if (amount - into > EPS) dropPile(storage, id, amount - into);
}

// A pile of `id` by `near` (a storage, a fallen warehouse): onto the one of that kind already by it, or a
// new one on free ground close by
export function dropPile(near, id, amount) {
  const reach = (near === townHall ? townHall.radius : 0) + 2 * TILE_SIZE;
  const same = game.piles.find(p => p.type === id && Math.hypot(p.x - near.x, p.y - near.y) <= reach);
  if (same) { same.amount += amount; return; }
  const spot = freeSpotBy(near);
  game.piles.push({ x: spot.x, y: spot.y, type: id, amount });
}

// A free tile next to it (out from the town hall's walls), with no pile on it yet if there's one like that
function freeSpotBy(near) {
  const g = getGridPos(near.x, near.y);
  const ring0 = near === townHall ? Math.ceil(townHall.radius / TILE_SIZE) + 1 : 1;
  const tiles = getTileIndex();
  let fallback = null;
  for (let ring = ring0; ring <= ring0 + 3; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = (g.gx + dx) * TILE_SIZE + 15, y = (g.gy + dy) * TILE_SIZE + 15;
        if (isTileBlockedForSettler(g.gx + dx, g.gy + dy) || tiles.buildings.has(`${x},${y}`)) continue;
        if (!game.piles.some(p => p.x === x && p.y === y)) return { x, y };
        fallback = fallback || { x, y };
      }
    }
  }
  return fallback || { x: near.x, y: near.y + TILE_SIZE };
}

// What a fallen or demolished warehouse held: onto the ground where it stood
/** @param {any} building */
export function dropStoreContents(building) {
  for (const [id, amount] of Object.entries(building.store || {})) {
    if (amount > EPS) game.piles.push({ x: building.x, y: building.y, type: id, amount });
  }
  building.store = {};
}

// Keep what lies where in step with the stock (Endless only): more in the stock than lies anywhere (a
// refund, a recipe's yield, the start) goes into the hall (on a pile by it if full); less (a cost paid,
// food eaten) comes off the piles, then the warehouses, then the hall. Piles of nothing go
export function keepStoresInStep() {
  if (game.gameMode !== 'endless') return;
  townHall.store = townHall.store || {};
  const storages = getStorages();
  /** @type {Object<string, number>} */
  const lying = {};
  const count = (id, n) => { lying[id] = (lying[id] || 0) + n; };
  for (const storage of storages) for (const [id, n] of Object.entries(storage.store || {})) count(id, n);
  for (const p of game.piles) count(p.type, p.amount);
  for (const s of game.settlers) if (s.carrying && s.carrying.counted) count(s.carrying.type, s.carrying.amount);
  for (const id of Object.keys(GAME_CONFIG.resources)) {
    const have = Math.max(0, Number(stock[id] || 0)), there = lying[id] || 0;
    if (have > there + EPS) storeInto(townHall, id, have - there);
    else if (have < there - EPS) takeOff(id, there - have, storages);
  }
  game.piles = game.piles.filter(p => p.amount > EPS);
}

function takeOff(id, amount, storages) {
  let left = amount;
  const from = (holder, get, set) => { const take = Math.min(left, get()); if (take > 0) { set(get() - take); left -= take; } };
  for (const p of game.piles) { if (left <= EPS) return; if (p.type === id) from(p, () => p.amount, v => { p.amount = v; }); }
  for (const storage of [...storages.filter(s => s !== townHall), townHall]) {
    if (left <= EPS) return;
    const store = storage.store || {};
    if (store[id]) from(storage, () => store[id], v => { if (v > EPS) store[id] = v; else delete store[id]; });
  }
}

// A settler with nothing to do carries a pile into a storage with room: up to carryMaterials of it, already
// counted in the stock (`counted`: goDeliver only moves it in)
export function haulPiles(s, tick) {
  if (s.role !== 'worker' || s.isPossessed || s.carrying || tick.isWaveActive || !s.wasIdle && !s.pileTarget || game.gameMode !== 'endless') { s.pileTarget = null; return false; }
  let pile = s.pileTarget && game.piles.includes(s.pileTarget) ? s.pileTarget : null;
  const taken = new Set(game.settlers.filter(o => o !== s && o.pileTarget).map(o => o.pileTarget));
  if (!pile) {
    let best = Infinity;
    for (const p of game.piles) {
      if (taken.has(p)) continue;
      if (!findStorageWithRoom(p)) continue;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < best) { best = d; pile = p; }
    }
  }
  s.pileTarget = pile;
  if (!pile) return false;
  s.patrolTarget = null;
  if (Math.hypot(pile.x - s.x, pile.y - s.y) > 14) { moveEntityTowards(s, pile.x, pile.y, s.speed, false, tick.dt); return true; }
  const amount = Math.min(pile.amount, config().carryMaterials);
  pile.amount -= amount;
  if (pile.amount <= EPS) game.piles.splice(game.piles.indexOf(pile), 1);
  s.carrying = { type: pile.type, amount, counted: true, loads: 99 };
  s.pileTarget = null;
  return true;
}
