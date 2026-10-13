// Campfires

import { game } from '../../../engine/world/index.js';

// A lit campfire burns down when nobody cooks at it
export function tickCampfires(dt) {
  game.buildings.forEach(b => { if (b.type === 'campfire' && (b.burning || 0) > 0) b.burning = Math.max(0, (b.burning || 0) - dt); });
}
