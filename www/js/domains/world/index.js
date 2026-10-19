// The door of domains/world/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { drawGrassGround, drawMapBorder, drawOreVeins, drawRocks, drawSand, drawWater, tileVariantHash } from './world.draw.js';
export { drawPaths, tickPaths } from './world.paths.js';
export { drawDarkness, getDarkness, getDayPhase, getLights, isNight, nightProgress, tickDaytime } from './world.daytime.js';
export { ORE_KINDS, generateMap, getMapCount, getOreSpawnerRadius, getOreSpawners, getOreSpotsAround, isDesertTile, isWaterReachable, placeBeaches, placeOre, spawnForestAware, spawnResource } from './world.generator.js';
