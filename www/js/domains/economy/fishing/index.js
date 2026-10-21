// The door of domains/economy/fishing/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { collectWorms, emptyFishTrap, fetchBait, fish, fishAt } from './fishing.behaviours.js';
export { corpseHasWorms, getFishingBait, takeFishingBait, tickFishPopulation, tickFishTraps } from './fishing.rules.js';
