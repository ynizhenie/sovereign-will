// The door of domains/conflict/waves/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { tickEnemies } from './waves.behaviours.js';
export { drawEnemies, drawEnemyTentSites, drawEnemyTents, drawLoot } from './waves.draw.js';
export { createConfiguredEnemy, enemyFactionOf, enemyStats, dropLoot, getEnemyDef, removeDeadEnemies, tickEnemyTents, tickPortalWave, tickWaveTimer } from './waves.rules.js';
