// The door of modes/endless/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { initEndlessGenerator } from './endless.generator.js';
export { initEndlessRules, isCameraLocked, isDefeated, updateDefeat } from './endless.rules.js';
export { initEndlessSaves } from './endless.saves.js';
export { initEndlessSetup, mapSource, renderFactionPicker } from './endless.setup.js';
