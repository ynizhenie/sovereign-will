// Carrying things home: to the nearest storage, and fetching from it

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { addFood, getStorages, hasRoomToCarry, isFoodKind, moveSettlerToTownHall, stock, stockLeft } from './storage.rules.js';
import { getPlayerFaction } from '../../factions/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { takeFishingBait } from '../../economy/fishing/index.js';
import { deliveryStorage, findStorageWithRoom, roomIn, storeInto } from './storage.stores.js';
import { playSound } from '../../../app/index.js';

// Carry whatever the settler holds to the town hall and add it to the stock. With room for more loads
// (a backpack, a big settler) it keeps gathering first, unless a wave is on; see deliverWhenNothingToDo.
export function deliverCarrying(s, tick) {
  if (!s.carrying || (hasRoomToCarry(s) && !tick.isWaveActive)) return false;
  goDeliver(s, tick);
  return true;
}

// A part-filled load goes home too once there's nothing left to gather
export function deliverWhenNothingToDo(s, tick) {
  if (!s.carrying) return false;
  goDeliver(s, tick);
  return true;
}

// To the nearest storage, the town hall or a warehouse, and into the stock
export function goDeliver(s, tick) {
  // a pile carried in (#248): to a storage with room
  // (#279) a load of one kind to its own storage (with more than one), else the nearest with room
  const t = s.carrying.type, one = s.carrying.items ? null : GAME_CONFIG.resources[t] ? t : isFoodKind(t) ? 'food' : null;
  // (#298) the one it set off for, while it has room: chosen afresh each step, halfway between two it turned
  // back and forth and went nowhere (a mixed load: the nearest with room)
  const kept = storageChoice.get(s);
  const storage = kept && game.pathTick - kept.tick <= 60 && getStorages().includes(kept.storage) && roomIn(kept.storage) >= 1
    ? kept.storage : deliveryStorage(s, one) || findNearestStorage(s);
  storageChoice.set(s, { storage, tick: game.pathTick });
  if (!isAtStorage(s, storage)) { walkToStorage(s, storage, tick.dt); return; }
  if (s.carrying.counted) { storeInto(storage, s.carrying.type, s.carrying.amount); s.carrying = null; return; } // (in the stock already)
  const into = getPlayerFaction().foodInto; // the undead: food turns into bones or rot
  for (const item of s.carrying.items || [s.carrying]) {
    const isFood = isFoodKind(item.type) || ['food', 'rawMeat', 'rawFish', 'wheat'].includes(item.type);
    const type = into && isFood ? (into[item.type] || into.default) : item.type;
    if (type.startsWith('armory:')) game.armory[type.slice(7)] = (game.armory[type.slice(7)] || 0) + item.amount; // (loot, #261)
    else if (GAME_CONFIG.resources[type]) { stock[type] += item.amount; storeInto(storage, type, item.amount); }
    else if (isFoodKind(type)) { addFood(type, item.amount); storeInto(storage, 'food', item.amount); }
  }
  s.carrying = null;
  playSound('deliver', s);
  takeFishingBait(s);
}

// ---- Storages: the town hall and warehouses (see getStorages in storage.rules.js)

// The town hall or the warehouse nearest the settler. Once it heads for one it keeps to it while it keeps
// asking (every tick on the way), so halfway between two it doesn't turn back and forth and go nowhere.
// A second without asking, and it picks afresh.
export const storageChoice = new WeakMap(); // settler -> { storage, tick }; kept off the settler, so not in saves
export function findNearestStorage(s) {
  const kept = storageChoice.get(s);
  if (kept && game.pathTick - kept.tick <= 60 && getStorages().includes(kept.storage)) { kept.tick = game.pathTick; return kept.storage; }
  /** @type {import('../../../engine/world/types.js').Building | import('../../../engine/world/types.js').TownHall} */
  let best = townHall, bestDist = Infinity;
  for (const storage of getStorages()) {
    const d = Math.hypot(storage.x - s.x, storage.y - s.y);
    if (d < bestDist) { bestDist = d; best = storage; }
  }
  storageChoice.set(s, { storage: best, tick: game.pathTick });
  return best;
}

export function isAtStorage(s, storage) {
  const d = Math.hypot(storage.x - s.x, storage.y - s.y);
  return storage === townHall ? d <= townHall.radius + s.radius + 4 : d <= 34;
}

export function walkToStorage(s, storage, dt) {
  if (storage === townHall) moveSettlerToTownHall(s, s.speed, dt);
  else moveEntityTowards(s, storage.x, storage.y, s.speed, false, dt);
  s.patrolTarget = null;
}

// Walk to the nearest storage for some `id` from the stock; once there, take(). False if there's none.
export function fetchFromStorage(s, id, dt, take) {
  if (!(stockLeft(id) > 0)) return false;
  const storage = findNearestStorage(s);
  if (isAtStorage(s, storage)) take(storage);
  else walkToStorage(s, storage, dt);
  return true;
}
