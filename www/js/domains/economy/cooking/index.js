// The door of domains/economy/cooking/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { cook } from './cooking.behaviours.js';
export { tickCampfires } from './cooking.rules.js';
