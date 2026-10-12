// Factions (#43): the colony's faction and the enemy's, each with its colour, chosen in the Endless menu
// and remembered on the device. The enemy's faction decides what its waves and spawners are made of
// (GAME_CONFIG.factions); every unit is drawn in its side's colour, and the two sides never share one.

// the two sides (#43, factions.js): GAME_CONFIG.factions ids and the colours their units are drawn in
const sides = { player: { faction: 'humans', color: '#e9c46a' }, enemy: { faction: 'humans', color: '#e8572a' } };

// in the map editor, the faction the map is made for (#170)
function getPlayerFaction() {
  if (game.gameMode === 'editor' && typeof editor !== 'undefined') return GAME_CONFIG.factions[editor.faction];
  if (game.gameMode === 'menu' && typeof menuWorld !== 'undefined') return GAME_CONFIG.factions[menuWorld.faction]; // #193
  return GAME_CONFIG.factions[sides.player.faction];
}

function getEnemyFaction() { return GAME_CONFIG.factions[sides.enemy.faction]; }

const FACTION_STORAGE_KEY = 'sovereign-will-factions';

// In battle mode the sides stay green and red, as the field is marked
// Soldiers (and archers) a shade darker than workers, so they stand out in any colour (#167)
function getSettlerColor(s) {
  const color = game.gameMode === 'battle' ? '#27ae60' : game.gameMode === 'menu' ? getPlayerFaction().color : sides.player.color;
  return s && s.role !== 'worker' ? shadeColor(color, -0.28) : color;
}

function getEnemyColor(en) {
  const color = game.gameMode === 'battle' ? '#e74c3c' : sides.enemy.color;
  return en && en.type === 'big' ? shadeColor(color, -0.25) : color;
}

// A colour made lighter (amount > 0) or darker (< 0), amount -1..1
function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = c => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// The first colour of the palette the other side doesn't have, starting from `wanted`
function freeColor(wanted, other) {
  if (wanted !== other) return wanted;
  return GAME_CONFIG.factionColors.find(c => c !== other);
}

// The faction a custom map in Endless fixes for the player (#170), or null
function getLockedPlayerFaction() {
  return typeof mapSource !== 'undefined' && mapSource === 'custom' && game.customMap && game.customMap.faction ? game.customMap.faction : null;
}

function setSideFaction(side, faction) {
  if (!GAME_CONFIG.factions[faction] || !GAME_CONFIG.factions[faction].ready) return;
  const locked = side === 'player' && getLockedPlayerFaction();
  if (locked && faction !== locked) return;
  const other = side === 'player' ? sides.enemy : sides.player;
  sides[side].faction = faction;
  sides[side].color = freeColor(GAME_CONFIG.factions[faction].color, other.color);
  saveSides();
  renderFactionPicker();
}

function setSideColor(side, color) {
  const other = side === 'player' ? sides.enemy : sides.player;
  if (color === other.color || !GAME_CONFIG.factionColors.includes(color)) return;
  sides[side].color = color;
  saveSides();
  renderFactionPicker();
}

function saveSides() {
  try { localStorage.setItem(FACTION_STORAGE_KEY, JSON.stringify(sides)); } catch (e) { /* not remembered */ }
}

function loadSides() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(FACTION_STORAGE_KEY)); } catch (e) { /* none */ }
  for (const side of ['player', 'enemy']) {
    const s = saved && saved[side];
    if (s && GAME_CONFIG.factions[s.faction] && GAME_CONFIG.factions[s.faction].ready) sides[side].faction = s.faction;
    if (s && GAME_CONFIG.factionColors.includes(s.color)) sides[side].color = s.color;
  }
  if (sides.enemy.color === sides.player.color) sides.enemy.color = freeColor(sides.enemy.color, sides.player.color);
}
