// The door of domains/economy/gathering/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { canGather, getWorkPriority, isFreeHands, harvest, workResource } from './gathering.behaviours.js';
export { drawCactiBouldersGrassBushes, drawHarvestProgress, drawPriorityMarks, drawSticksPebblesOre, drawTrees } from './gathering.draw.js';
export { addMapResource, finishHarvest, getHarvestableResources, getMapResourceDef, getMapResourceKind, scheduleRespawn, updatePendingRespawns } from './gathering.rules.js';
