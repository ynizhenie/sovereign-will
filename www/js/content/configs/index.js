// The game's data: every kind of resource, building, unit, weapon, enemy and faction, and the numbers
// each mechanic is tuned by. GAME_CONFIG is filled by the other files of this folder, one per topic.
// Data only: what the game does with it lives in domains/.

const GAME_CONFIG = {};

globalThis.GAME_CONFIG = GAME_CONFIG;

function getDefinition(category, key) {
  return (GAME_CONFIG[category] && GAME_CONFIG[category][key]) || null;
}
