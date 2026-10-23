// The door of engine/world/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { getGridPos, getMapAreaScale, getTileIndex, isBorderZone, isDoor, isTownHallSpawnTile, markTilesChanged, resetTileIndex, setWorldSize } from './grid.js';
export { applySeedFromUI, createDefaultSeed, createWorldSeed, initRng, rand } from './rng.js';
export { BOAR_LIMIT, BORDER_MARGIN, DEFAULT_MAP_TILES, OUTPOST_COLLISION_HALF_HEIGHT, OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_OFFSET_Y, STRUCTURE_COLLISION_HALF_SIZE, TILE_SIZE, TOWN_HALL_HP, WORLD_LISTS, game, townHall } from './state.js';
export { onceThisTick } from './once.js';
export { anyWithin, forEachInRect, listStamp, someNear, thingAt } from './spatial.js';
