// What's where (#248): the stock is one number per resource, as ever, but it lies somewhere: in the town
// hall (the most room) or a warehouse (less), `store` on each; what doesn't fit lies on the ground by it
// (game.piles) and counts all the same, so it's never "too full to build". (#279) It lies in packs of
// pack.size of one kind, pack.perTile to a tile (3 by 3) on the tiles round the storage, a second layer on
// top once those are full; all of them full, the packs there of that kind take any more. With more than one
// storage each group of resources has one of its own (storeHome): it's brought there, and one with nothing
// to do carries what lies in the wrong one over. What's spent
// comes off the piles first (they take what lies about), then the warehouses, then the hall. A settler with
// nothing to do carries piles into a storage with room. A warehouse that's gone drops what it held.
// keepStoresInStep() puts any change of the stock made without a place (a cost paid, a refund) in step.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, getTileIndex, onceThisTick, townHall } from '../../../engine/world/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { getStorages, moveSettlerToTownHall, stock } from './storage.rules.js';
import { getPlayerFaction } from '../../factions/index.js';

const EPS = 1e-6;
const config = () => GAME_CONFIG.storage;

/** @param {any} storage */
export function storeCapacity(storage) {
  if (game.gameMode === 'menu') return Infinity;
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

// Packs of `id` by `near` (a storage, a fallen warehouse): the packs of that kind there filled up first, then
// new ones in the free places round it (the ground layer, then on top); none free, onto the packs of that
// kind there (or the nearest pack) past their size
export function dropPile(near, id, amount) {
  const c = config().pack;
  const here = packPlaces(near);
  const by = p => here.some(q => q.x === p.x && q.y === p.y && q.layer === (p.layer || 0));
  let left = amount;
  for (const p of game.piles) {
    if (left <= EPS) return;
    if (p.type !== id || p.amount >= c.size - EPS || !by(p)) continue;
    const add = Math.min(left, c.size - p.amount);
    p.amount += add; left -= add;
  }
  for (const place of here) {
    if (left <= EPS) return;
    if (game.piles.some(p => p.x === place.x && p.y === place.y && (p.layer || 0) === place.layer)) continue;
    const add = Math.min(left, c.size);
    game.piles.push({ x: place.x, y: place.y, type: id, amount: add, layer: place.layer });
    left -= add;
  }
  if (left <= EPS) return;
  const same = game.piles.filter(p => p.type === id && by(p));
  const onto = same[same.length - 1] || null;
  if (onto) onto.amount += left;
  else game.piles.push({ x: near.x, y: near.y + TILE_SIZE, type: id, amount: left, layer: 0 });
}

// The places for packs by a storage: on each free tile within a tile of it (the town hall: of its walls), 3 by
// 3 to a tile, the ground layer first, then the one on top; the nearest tiles first
function packPlaces(near) {
  const c = config().pack;
  const g = getGridPos(near.x, near.y);
  const body = near === townHall ? townHall.radius : TILE_SIZE / 2;
  const tiles = getTileIndex();
  const free = [];
  const span = Math.ceil(body / TILE_SIZE) + 1;
  for (let dy = -span - 1; dy <= span + 1; dy++) {
    for (let dx = -span - 1; dx <= span + 1; dx++) {
      const gx = g.gx + dx, gy = g.gy + dy, x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
      const d = Math.max(Math.abs(x - near.x), Math.abs(y - near.y));
      if (d <= body || d > body + TILE_SIZE * 1.05) continue; // (round it, a tile out at most)
      if (isTileBlockedForSettler(gx, gy) || tiles.buildings.has(`${x},${y}`)) continue;
      free.push({ x, y, d: Math.hypot(x - near.x, y - near.y) });
    }
  }
  free.sort((a, b) => a.d - b.d);
  const side = Math.round(Math.sqrt(c.perTile)), step = 9;
  const out = [];
  for (let layer = 0; layer < c.layers; layer++) {
    for (const t of free) {
      for (let k = 0; k < c.perTile; k++) {
        out.push({ x: t.x + ((k % side) - (side - 1) / 2) * step, y: t.y + (Math.floor(k / side) - (side - 1) / 2) * step, layer });
      }
    }
  }
  return out;
}

// What a fallen or demolished warehouse held: in packs where it stood
/** @param {any} building */
export function dropStoreContents(building) {
  const at = { x: building.x, y: building.y };
  for (const [id, amount] of Object.entries(building.store || {})) if (amount > EPS) dropPile(at, id, amount);
  building.store = {};
}

// ---- (#279) each group of resources a storage of its own, with more than one

// The storage a resource belongs in: with one storage, null (anywhere); with more, its group's (the groups
// of GAME_CONFIG.resourceGroups shared out over the storages in turn: the town hall first, then the
// warehouses as they were built)
export function storeHome(id) {
  const storages = getStorages();
  if (storages.length < 2) return null;
  const faction = getPlayerFaction().id;
  const groups = GAME_CONFIG.resourceGroups.filter(gr => !gr.held && gr.members.length && (!gr.factions || gr.factions.includes(faction)));
  const k = groups.findIndex(gr => /** @type {string[]} */ (gr.members).includes(id));
  return storages[(k < 0 ? 0 : k) % storages.length];
}

// Where a load of `id` goes: its home if there's room, else the nearest with room, else the nearest
export function deliveryStorage(s, id) {
  const home = id ? storeHome(id) : null;
  if (home && roomIn(home) >= 1) return home;
  return findStorageWithRoom(s) || null;
}

// Something lying in a storage that isn't its home, where its home has room: [from, id] or null
function misplaced(taken, storages) {
  for (const storage of storages) {
    for (const [id, n] of Object.entries(storage.store || {})) {
      if (n < 1 || taken.has(`${id}@${storages.indexOf(storage)}`)) continue;
      const home = storeHome(id);
      if (home && home !== storage && roomIn(home) >= 1) return { from: storage, id };
    }
  }
  return null;
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
    if (GAME_CONFIG.resources[id].intangible) continue; // (#326: souls lie nowhere)
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
const pileTakersOnce = onceThisTick();
const pileTakers = () => pileTakersOnce(() => new Set(game.settlers.filter(o => o.pileTarget).map(o => o.pileTarget)));
const roomOnce = onceThisTick();
// (#306) whether there's a storage with room for a pile, once a tick per pile: every settler looking for a
// pile asked for every pile it passed
function roomNear(pile) {
  const byPile = roomOnce(() => new Map());
  let found = byPile.get(pile);
  if (found === undefined) { found = findStorageWithRoom(pile); byPile.set(pile, found); }
  return found;
}
export function haulPiles(s, tick, chosen = false) {
  if (s.role !== 'worker' || s.isPossessed || s.carrying || tick.isWaveActive || (!chosen && !s.wasIdle && !s.pileTarget && !s.sortJob) || game.gameMode !== 'endless') { s.pileTarget = null; s.sortJob = null; return false; }
  let pile = s.pileTarget && game.piles.includes(s.pileTarget) ? s.pileTarget : null;
  // (#306) the piles others have gone for, once a tick: the list was made again for every settler
  const taken = pileTakers();
  if (!pile) {
    let best = Infinity;
    for (const p of game.piles) {
      if (taken.has(p)) continue;
      if (!roomNear(p)) continue;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < best) { best = d; pile = p; }
    }
  }
  s.pileTarget = pile;
  if (pile) taken.add(pile);
  if (!pile) return sortStores(s, tick);
  s.patrolTarget = null;
  if (Math.hypot(pile.x - s.x, pile.y - s.y) > 14) { moveEntityTowards(s, pile.x, pile.y, s.speed, false, tick.dt); return true; }
  const amount = Math.min(pile.amount, config().carryMaterials);
  pile.amount -= amount;
  if (pile.amount <= EPS) game.piles.splice(game.piles.indexOf(pile), 1);
  s.carrying = { type: pile.type, amount, counted: true, loads: 99 };
  s.pileTarget = null;
  return true;
}

// (#279) piles lying about while a storage somewhere has room for them: one worker (two with more than
// haulersFrom piles), the nearest not carrying anything, carries them in before going back to its work, not
// only one with nothing to do (they always had something); never the colony's only worker. Worked out once a
// tick
/** @type {{ tick: number, set: Set<object> }} */
let haulers = { tick: -1, set: new Set() };
function pileHaulers() {
  // (#322: chosen again a few times a second, not every tick; and a storage with room looked for only while
  // there's room anywhere)
  if (game.pathTick - haulers.tick < 15 && haulers.tick <= game.pathTick) return haulers.set;
  const set = new Set();
  const room = getStorages().some(st => roomIn(st) > 0);
  const movable = room ? game.piles.filter(p => findStorageWithRoom(p)) : [];
  if (movable.length) {
    const nearest = new Map();
    const near = s => {
      if (!nearest.has(s)) { let best = Infinity; for (const p of movable) best = Math.min(best, Math.hypot(p.x - s.x, p.y - s.y)); nearest.set(s, best); }
      return nearest.get(s);
    };
    const workers = game.settlers.filter(s => s.role === 'worker' && !s.isPossessed && !s.asleep && !s.drowsy && (!s.carrying || s.pileTarget))
      .sort((a, b) => (b.pileTarget ? 1 : 0) - (a.pileTarget ? 1 : 0) || near(a) - near(b));
    // (never the only worker there is: it keeps gathering, and carries piles when it has nothing to do)
    const all = game.settlers.filter(s => s.role === 'worker').length;
    workers.slice(0, Math.min(all - 1, movable.length > config().haulersFrom ? 2 : 1)).forEach(s => set.add(s));
  }
  haulers = { tick: game.pathTick, set };
  return set;
}

// A behaviour, before gathering: one of those (pileHaulers) carries a pile in
export function haulPilesFirst(s, tick) {
  if (!pileHaulers().has(s)) return false;
  return haulPiles(s, tick, true);
}

// (#279) one with nothing to do carries what lies in a storage that isn't its home over to its home: up to
// carryMaterials of it, already counted in the stock
const sortJobsOnce = onceThisTick();
// (#306) the sorting jobs taken this tick, looked for once
const sortJobsTaken = storages => sortJobsOnce(() => {
  const taken = new Set();
  for (const o of game.settlers) if (o.sortJob) taken.add(`${o.sortJob.id}@${storages.indexOf(o.sortJob.from)}`);
  return taken;
});
function sortStores(s, tick) {
  // (#306) the storages and the jobs others have taken, once a tick: they were gathered again for every
  // settler with nothing to do, and that gathering went through all the settlers itself
  const storages = getStorages(), taken = sortJobsTaken(storages);
  let job = s.sortJob && storages.includes(s.sortJob.from) && (s.sortJob.from.store || {})[s.sortJob.id] >= 1 ? s.sortJob : null;
  if (!job) job = misplaced(taken, storages);
  s.sortJob = job;
  if (!job) return false;
  taken.add(`${job.id}@${storages.indexOf(job.from)}`);
  s.patrolTarget = null;
  const at = job.from === townHall ? Math.hypot(townHall.x - s.x, townHall.y - s.y) <= townHall.radius + s.radius + 4 : Math.hypot(job.from.x - s.x, job.from.y - s.y) <= 34;
  if (!at) { if (job.from === townHall) moveSettlerToTownHall(s, s.speed, tick.dt); else moveEntityTowards(s, job.from.x, job.from.y, s.speed, false, tick.dt); return true; }
  const store = job.from.store, amount = Math.min(store[job.id], config().carryMaterials);
  store[job.id] -= amount;
  if (store[job.id] <= EPS) delete store[job.id];
  s.carrying = { type: job.id, amount, counted: true, loads: 99 };
  s.sortJob = null;
  return true;
}
