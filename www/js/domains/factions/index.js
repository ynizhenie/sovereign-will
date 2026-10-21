// The door of domains/factions/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { applyFactionCosts, setBattleColor, getEnemyColor, getEnemyFaction, getLockedPlayerFaction, getPlayerFaction, getSettlerColor, isForPlayerFaction, loadSides, setSideColor, setSideFaction, shadeColor, sides } from './factions.rules.js';
