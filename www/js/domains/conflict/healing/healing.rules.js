// Shelters: where settlers heal (the humans' tent, the undead's grave)

import { getDefinition } from '../../../content/configs/index.js';

// A shelter: a building settlers heal at (the humans' tent, the undead's grave)
export function isShelter(building) {
  return !!(getDefinition('buildings', building.type) || {}).healPerSecond;
}
