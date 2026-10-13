// The door of domains/economy/farming/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { farmerGathersGrass, fertilize, findZoneBlockers, pickApples, pickApplesFrom, tendFarmZones, waterCrops } from './farming.behaviours.js';
export { drawFarmPlots, drawFarmZones } from './farming.draw.js';
export { growCrops, makeAppleTree, placeAppleTrees, toggleFarmZone } from './farming.rules.js';
