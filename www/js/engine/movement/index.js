// The door of engine/movement/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { clampEntityToBounds, collidesWithBoxList, collidesWithWall, collidesWithWater, ejectEntitiesFromTile, separateAllies, separateSettlersFromEnemies } from './collision.js';
export { forEachSettlerNear, someEnemyNear, someSettlerNear } from './neighbours.js';
export { getEnemyReach, getReachDistanceToResource, getReachSteps, getSettlerReach, invalidateAllPaths, isTileBlockedForEnemyStrict, isTileBlockedForSettler, setReachBounds } from './pathfinding.js';
export { getResourceApproachPoint, moveEntityTowards, rescueSettlerFromResource } from './steering.js';
