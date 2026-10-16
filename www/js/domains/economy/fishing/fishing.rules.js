// Fishing bait, and worms on corpses

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { canAfford, payCost } from '../../colony/storage/index.js';

// A fisher at the town hall takes one seed as bait for the next catch
// The bait a fisher would take now: the first of GAME_CONFIG.fishing.bait the stock has (worms first)
export function getFishingBait() {
  return GAME_CONFIG.fishing.bait.find(bait => canAfford(bait)) || null;
}

// A fisher at a storage takes one bait for the next catch
export function takeFishingBait(s) {
  const bait = getFishingBait();
  if (s.tool === 'rod' && !s.bait && bait) {
    payCost(bait);
    s.bait = true;
  }
}

// Worms show up on a corpse that has lain for GAME_CONFIG.worms.after of its time, until a fisher takes them
export function corpseHasWorms(corpse) {
  return !corpse.wormsTaken && corpse.age >= GAME_CONFIG.corpses.seconds * GAME_CONFIG.worms.after;
}

// Fish traps (#199) catch by themselves: a fish every fishTrap.seconds, up to fishTrap.holds
export function tickFishTraps(dt) {
  const trap = GAME_CONFIG.buildings.fish_trap.fishTrap;
  for (const b of game.buildings) {
    if (b.type !== 'fish_trap' || (b.fish || 0) >= trap.holds) continue;
    const timer = (b.fishTimer || 0) + dt;
    b.fishTimer = timer >= trap.seconds ? 0 : timer;
    if (timer >= trap.seconds) b.fish = (b.fish || 0) + 1;
  }
}
