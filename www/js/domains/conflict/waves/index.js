// The door of domains/conflict/waves/: what it gives to the rest of the game. Other folders import from
// here, never from its files directly (ESLint checks it); a name not listed is the folder's own business.

export { tickEnemies } from './waves.behaviours.js';
export { drawEnemies, drawEnemyRafts, drawEnemyShadows, drawEnemyTentSites, drawEnemyTents, drawLoot } from './waves.draw.js';
export { createConfiguredEnemy, dressForWave, enemyFactionOf, enemyPlayerUnit, enemyStats, getPlayerDevelopment, getWaveEnemyCount, getWaveGearChance, getWavePresetPool, getWavePresetWeight, presetEnemyKey, presetUnit, dropLoot, getEnemyDef, removeDeadEnemies, tickEnemyRafts, tickEnemyTents, tickPortalWave, tickWaveTimer } from './waves.rules.js';
export { scoutTapped, tickScouts } from './waves.scouts.js';
