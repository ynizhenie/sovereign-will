// Fishers fetch bait, fish at the marked spots, collect worms

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/state.js';
import { addCarryLoad, giveResourceToSettler } from '../../colony/storage/storage.rules.js';
import { moveEntityTowards } from '../../../engine/movement/steering.js';
import { isInSafeArea } from '../../conflict/combat/combat.rules.js';
import { faceTowards } from '../../colony/settlers/settlers.draw.js';
import { corpseHasWorms, getFishingBait, takeFishingBait } from './fishing.rules.js';
import { findNearestStorage, isAtStorage, walkToStorage } from '../../colony/storage/storage.behaviours.js';
import { canGather } from '../gathering/gathering.behaviours.js';

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
    fishSpot.fishTimer = (fishSpot.fishTimer || 0) + dt;
    s.working = 0.1;
    faceTowards(s, fishSpot.x, fishSpot.y);
    if (fishSpot.fishTimer >= GAME_CONFIG.fishing.seconds) {
      for (const [item, amount] of Object.entries(GAME_CONFIG.fishing.catch)) giveResourceToSettler(s, item, amount);
      addCarryLoad(s);
      s.bait = false;
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
