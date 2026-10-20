// The door of domains/colony/storage/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { deliverCarrying, deliverWhenNothingToDo, fetchFromStorage, findNearestStorage, goDeliver, isAtStorage, walkToStorage } from './storage.behaviours.js';
export { addCarryLoad, addResources, canAfford, formatCost, getCarryCapacity, getFreeStock, getMissingCost, getResourceAmount, giveResourceToSettler, hasRoomToCarry, mixStartFood, moveSettlerToTownHall, payCost, showCostError, stock, syncFoodMix, takeStock } from './storage.rules.js';
export { dropStoreContents, haulPiles, keepStoresInStep, roomIn, storeCapacity, storeHome, storedTotal } from './storage.stores.js';
export { drawPiles, drawStoreContents } from './storage.draw.js';
