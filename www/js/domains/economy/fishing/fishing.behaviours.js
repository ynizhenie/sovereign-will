// Fishers fetch bait, fish at the marked spots, collect worms

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { addCarryLoad, findNearestStorage, giveResourceToSettler, isAtStorage, walkToStorage } from '../../colony/storage/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { isInSafeArea } from '../../conflict/combat/index.js';
import { faceTowards, noteDay } from '../../colony/settlers/index.js';
import { corpseHasWorms, getFishingBait, takeFishingBait } from './fishing.rules.js';
import { canGather } from '../gathering/index.js';
import { playSound } from '../../../app/index.js';

// Walk to the nearest storage and take one bait; false if the stock has none
export function fetchBait(s, dt) {
  if (!getFishingBait()) return false;
  const storage = findNearestStorage(s);
  if (isAtStorage(s, storage)) takeFishingBait(s);
  else walkToStorage(s, storage, dt);
  return true;
}

// Fishers with a rod fish at a spot the player marked; every catch uses one seed as bait,
// picked up at the town hall. No seeds, no fishing.
export function fish(s, tick) {
  if (!canGather(s, tick) || s.role !== 'worker' || s.tool !== 'rod') return false;
  const dt = tick.dt;
  let fishSpot = tick.activeWaterSpots[tick.assignedFishersCount];
  if (fishSpot && !s.bait && !getFishingBait()) fishSpot = null;
  if (fishSpot && !s.bait) {
    tick.assignedFishersCount++;
    fetchBait(s, dt);
    s.patrolTarget = null;
    return true;
  }
  if (fishSpot) {
    tick.assignedFishersCount++;
    fishAt(s, fishSpot, dt);
    return true;
  }
  return false;
}

// Walk to a fishing spot and fish there (the settler has bait)
export function fishAt(s, fishSpot, dt) {
  let dist = Math.hypot(fishSpot.x - s.x, fishSpot.y - s.y);
  if (dist > 32) {
    moveEntityTowards(s, fishSpot.x, fishSpot.y, s.speed, false, dt);
  } else {
    if (!(fishSpot.fishCount > 0)) {
      fishSpot.fishTimer = 0;
      s.patrolTarget = null;
      return;
    }
    fishSpot.fishTimer = (fishSpot.fishTimer || 0) + dt;
    s.working = 0.1;
    faceTowards(s, fishSpot.x, fishSpot.y);
    if (fishSpot.fishTimer >= GAME_CONFIG.fishing.seconds) {
      for (const [item, amount] of Object.entries(GAME_CONFIG.fishing.catch)) giveResourceToSettler(s, item, amount);
      playSound('catch', s);
      noteDay(s, 'fished'); // (its day, #306)
      addCarryLoad(s);
      s.bait = false;
      fishSpot.fishCount--;
      fishSpot.fishTimer = 0;
    }
  }
  s.patrolTarget = null;
}

// ---- Worms

// Fishers pick worms off corpses that have them (see corpseHasWorms) and carry them home as bait
export function collectWorms(s, tick) {
  if (s.role !== 'worker' || s.tool !== 'rod' || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  let target = null, best = Infinity;
  for (const c of game.corpses) {
    if (!corpseHasWorms(c) || tick.wormAssignments.has(c) || !isInSafeArea(c.x, c.y)) continue;
    const d = Math.hypot(c.x - s.x, c.y - s.y);
    if (d < best) { best = d; target = c; }
  }
  if (!target) return false;
  tick.wormAssignments.add(target);
  if (best > 16) {
    moveEntityTowards(s, target.x, target.y, s.speed, false, tick.dt);
  } else {
    const worms = GAME_CONFIG.worms;
    target.wormsTaken = true;
    giveResourceToSettler(s, 'worms', target.big ? worms.perBigCorpse : worms.perCorpse);
  }
  s.patrolTarget = null;
  return true;
}

// ---- Fish traps (#199)

// A fisher empties a fish trap with two or more fish in it, anyone with free hands a full one; between
// waves. The fish are carried home like a catch
export function emptyFishTrap(s, tick) {
  if (s.role !== 'worker' || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  const holds = GAME_CONFIG.buildings.fish_trap.fishTrap.holds;
  const fisher = s.tool === 'rod';
  if (!fisher && !(s.tool === 'none' && s.weapon === 'fist')) return false;
  let trap = null, best = Infinity;
  for (const b of game.buildings) {
    if (b.type !== 'fish_trap' || (b.fish || 0) < (fisher ? 2 : holds) || tick.trapAssignments.has(b)) continue;
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d < best) { best = d; trap = b; }
  }
  if (!trap) return false;
  tick.trapAssignments.add(trap);
  s.patrolTarget = null;
  if (best > 32) { moveEntityTowards(s, trap.x, trap.y, s.speed, false, tick.dt); return true; }
  faceTowards(s, trap.x, trap.y);
  giveResourceToSettler(s, 'rawFish', trap.fish);
  addCarryLoad(s);
  if (s.carrying) s.carrying.loads = 99; // (straight home with it)
  trap.fish = 0;
  playSound('catch', s);
  return true;
}
