// The door of domains/factions/undead/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { necromancy } from './undead.behaviours.js';
export { drawBlight, drawRaising, drawStaff } from './undead.draw.js';
export { enemyNecromancy, fadeClearedBlight, getNecromancy, isBlighted, makeBonesAndRot, raiseOnBlight, toggleBlightZone, updateTemporaryZombies } from './undead.rules.js';
