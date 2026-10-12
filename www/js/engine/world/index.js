// The door of engine/world/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { getGridPos, getMapAreaScale, getTileIndex, isBorderZone, resetTileIndex, setWorldSize } from './grid.js';
export { applySeedFromUI, createDefaultSeed, createWorldSeed, initRng, rand } from './rng.js';
export { BOAR_LIMIT, BORDER_MARGIN, TILE_SIZE, TOWN_HALL_HP, WORLD_LISTS, game, townHall } from './state.js';
