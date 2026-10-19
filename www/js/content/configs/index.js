// The game's data: every kind of resource, building, unit, weapon, enemy and faction, and the numbers
// each mechanic is tuned by. GAME_CONFIG gathers the other files of this folder, one per topic.
// Data only: what the game does with it lives in domains/.

import { resourcesConfig } from './resources.js';
import { equipmentConfig } from './equipment.js';
import { buildingsConfig } from './buildings.js';
import { enemiesConfig } from './enemies.js';
import { factionsConfig } from './factions.js';
import { unitsConfig } from './units.js';
import { difficultyConfig } from './difficulty.js';
import { cardsConfig } from './cards.js';
import { mapConfig } from './map.js';
import { mechanicsConfig } from './mechanics.js';
import { musicConfig } from './music.js';

export const GAME_CONFIG = { ...resourcesConfig, ...equipmentConfig, ...buildingsConfig, ...enemiesConfig, ...factionsConfig, ...unitsConfig, ...difficultyConfig, ...cardsConfig, ...mapConfig, ...mechanicsConfig, ...musicConfig };

globalThis.GAME_CONFIG = GAME_CONFIG;

export function getDefinition(category, key) {
  return (GAME_CONFIG[category] && GAME_CONFIG[category][key]) || null;
}
