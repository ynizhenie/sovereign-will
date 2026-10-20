// The door of domains/conflict/healing/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { healAtTent, repairTent, treatWounded } from './healing.behaviours.js';
export { isShelter } from './healing.rules.js';
