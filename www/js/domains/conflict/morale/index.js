// The door of domains/conflict/morale/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { boarsPanic, enemyPanic, necromancerKeepsBack, panic } from './morale.behaviours.js';
export { drawMoraleMarks } from './morale.draw.js';
export { baseMorale, getMorale, ghostScare, liftMorale, onUnitDeath, shakeMorale, shakeOnHit, tickMorale } from './morale.rules.js';
