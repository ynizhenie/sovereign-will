// The door of domains/economy/building/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { drawDenArt, drawGraveArt, drawTentArt } from './building.art.js';
export { breakOutOfSealedBase, build, collectSmelterIron, deliverMaterials, deliverToSmelter, repairBuilding, repairStep, repairTownHall, supplySmelter, workBlueprint } from './building.behaviours.js';
export { drawBlueprints, drawBuildGrid, drawBuildings, drawTownHall, drawUpgrades } from './building.draw.js';
export { canBuild, claimBuildingJob, createBuildingBlueprint, findDoorBlockers, getMissingMaterial, getRepairStep, getReservedForBlueprints, isBaseSealed, isBuildLocationAllowed, isBuildingJobFree, isBuildingSingle, isSpawnSpotFree, isTileOccupied, removeBuilding, repairAllBuildings, tickSmelters, toggleBuildingRepair } from './building.rules.js';
export { renderBuildTab } from './building.panel.js';
