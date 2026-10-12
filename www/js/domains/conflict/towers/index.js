// The door of domains/conflict/towers/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { guardTower, loadTowerArrows } from './towers.behaviours.js';
export { assignTowerArchers, findNearestArrowTower, refillArcherFromTower } from './towers.rules.js';
