// The door of domains/world/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { drawGrassGround, drawMapBorder, drawOreVeins, drawRocks, drawSand, drawWater, isGroundCached, tileVariantHash } from './world.draw.js';
export { drawPaths, tickPaths } from './world.paths.js';
export { inReliefZone, reliefZoneSpot, toggleZone, zonesOf } from './world.zones.js';
export { drawWeatherScreen, drawWeatherWorld, getWeather, rainLevel, tickWeather, windSway } from './world.weather.js';
export { castShadow, drawDarkness, getDarkness, getDayPhase, getLights, getSun, isNight, nightProgress, tickDaytime } from './world.daytime.js';
export { ORE_KINDS, generateMap, getMapCount, getOreSpawnerRadius, getOreSpawners, getOreSpotsAround, isDesertTile, isWaterReachable, placeBeaches, placeOre, pointIn, spawnForestAware, spawnResource } from './world.generator.js';
export { drawTerritory, getFrontier, getFrontierTiles, getTerritoryBox, hasTerritory, inTerritory, isOutskirts, setTerritoryEnabled } from './world.territory.js';
