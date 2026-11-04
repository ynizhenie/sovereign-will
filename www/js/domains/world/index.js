// The door of domains/world/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { CHUNK, chunkStats, drawChunks, markFishingChanged, drawGrassGround, drawMapBorder, drawOreVeins, drawRocks, drawSand, drawWater, isGroundCached, paintRockShadows, tileVariantHash, wasChunkDrawn } from './world.draw.js';
export { drawPaths, isPathTile, tickPaths } from './world.paths.js';
export { inReliefZone, reliefZoneSpot, toggleZone, zonesOf } from './world.zones.js';
export { drawWeatherScreen, drawWeatherWorld, getWeather, rainLevel, setStandingWeather, tickWeather, windSway } from './world.weather.js';
export { areShadowsEnabled, beginShadowFrame, castShadow, drawShadowLayer, drawShadowPath, drawDarkness, getDarkness, getDayPhase, getLights, getSun, endShadowFrame, isNight, MIN_SHADOW_ALPHA, nightProgress, setShadowsEnabled, tickDaytime, timeOfPhase } from './world.daytime.js';
export { ORE_KINDS, generateMap, generateMapSteps, getMapCount, getOreSpawnerRadius, getOreSpawners, getOreSpotsAround, isDesertTile, isWaterReachable, placeBeaches, placeOre, pointIn, spawnForestAware, spawnResource, startingBoarCount } from './world.generator.js';
export { isContinentMap } from './world.continent.js';
export { drawTerritory, getFrontier, getFrontierTiles, getTerritoryBox, hasTerritory, inTerritory, isOutskirts, setTerritoryEnabled } from './world.territory.js';
export { drawFog, exportFog, fogAt, hasFog, importFog, isExplored, isVisible, resetFog, tickFog } from './world.fog.js';
