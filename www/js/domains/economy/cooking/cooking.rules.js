// Campfires

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';

// (#298) a campfire with fuel on it burns: its fuel goes down by itself, someone cooking at it or not (it
// lights the night, warms those sitting by it), and once it's gone the fire's out
export function tickCampfires(dt) {
  for (const b of game.buildings) {
    if (b.type !== 'campfire') continue;
    if ((b.fuelLeft || 0) > 0) {
      b.fuelLeft = Math.max(0, (b.fuelLeft || 0) - dt / GAME_CONFIG.cooking.fuelSeconds);
      b.burning = 1;
    } else b.burning = Math.max(0, (b.burning || 0) - dt);
  }
}
