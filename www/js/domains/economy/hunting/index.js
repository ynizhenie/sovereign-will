// The door of domains/economy/hunting/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { huntBoar } from './hunting.behaviours.js';
export { drawBoars } from './hunting.draw.js';
export { makeBoarFlee, tickBoarRespawn, tickBoars, woundBoar } from './hunting.rules.js';
