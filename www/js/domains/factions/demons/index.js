// The door of domains/factions/demons/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { eatCorpse, goToSacrifice } from './demons.behaviours.js';
export { carryCaptive, catchForCage, tendCorpses, tickDemonCamp } from './demons.camp.js';
export { drawHorn, drawHorns, drawPortal } from './demons.draw.js';
export { openDemonPortal, takePortal } from './demons.rules.js';
