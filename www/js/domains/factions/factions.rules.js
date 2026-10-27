// Factions: the colony's faction and the enemy's, each with its colour, chosen in the Endless menu
// and remembered on the device. The enemy's faction decides what its waves and spawners are made of
// (GAME_CONFIG.factions); every unit is drawn in its side's colour, and the two sides never share one.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { game } from '../../engine/world/index.js';
import { mapSource, renderFactionPicker } from '../../modes/endless/index.js';
import { editor } from '../../modes/editor/index.js';
import { menuWorld } from '../../modes/menu/index.js';
import { loadData, saveData } from '../../engine/platform/index.js';

// the two sides: GAME_CONFIG.factions ids and the colours their units are drawn in
// (#306) battle: the colours of Battles' two sides, chosen in its settings
export const sides = { player: { faction: 'humans', color: '#e9c46a' }, enemy: { faction: 'humans', color: '#c0392b' }, battle: { green: '#2ecc71', red: '#c0392b' } };

// in the map editor, the faction the map is made for
export function getPlayerFaction() {
  if (game.gameMode === 'editor' && typeof editor !== 'undefined') return GAME_CONFIG.factions[editor.faction];
  if (game.gameMode === 'menu' && typeof menuWorld !== 'undefined') return GAME_CONFIG.factions[menuWorld.faction];
  return GAME_CONFIG.factions[sides.player.faction];
}

export function getEnemyFaction() { return GAME_CONFIG.factions[sides.enemy.faction]; }

// In battle mode the sides stay green and red, as the field is marked
// Soldiers (and archers) a shade darker than workers, so they stand out in any colour
export function getSettlerColor(s) {
  const color = game.gameMode === 'battle' ? sides.battle.green : game.gameMode === 'menu' ? getPlayerFaction().color : sides.player.color;
  return s && s.role !== 'worker' ? shadeColor(color, -0.28) : color;
}

// (#326) A building's side's colour: in a battle, the side of the field it stands on (a portal on the red half is
// red's); else the player's
export function getBuildingColor(b) {
  if (game.gameMode === 'battle') return b.x >= game.WORLD_WIDTH / 2 ? sides.battle.red : sides.battle.green;
  return getSettlerColor(null);
}

export function getEnemyColor(en) {
  const color = game.gameMode === 'battle' ? sides.battle.red : sides.enemy.color;
  return en && en.type === 'big' ? shadeColor(color, -0.25) : color;
}

// A colour made lighter (amount > 0) or darker (< 0), amount -1..1
export function shadeColor(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = c => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// `wanted`, or if the other side has it the next colour along the palette (round the colour wheel: the
// nearest, #326)
export function freeColor(wanted, other) {
  if (wanted !== other) return wanted;
  const all = GAME_CONFIG.factionColors, i = all.indexOf(wanted);
  return all[(i + 1) % all.length];
}

// The faction a custom map in Endless fixes for the player, or null
export function getLockedPlayerFaction() {
  return typeof mapSource !== 'undefined' && mapSource === 'custom' && game.customMap && game.customMap.faction ? game.customMap.faction : null;
}

export function setSideFaction(side, faction) {
  if (!GAME_CONFIG.factions[faction] || !GAME_CONFIG.factions[faction].ready) return;
  const locked = side === 'player' && getLockedPlayerFaction();
  if (locked && faction !== locked) return;
  const other = side === 'player' ? sides.enemy : sides.player;
  sides[side].faction = faction;
  sides[side].color = freeColor(GAME_CONFIG.factions[faction].color, other.color);
  saveSides();
  renderFactionPicker();
}

export function setSideColor(side, color) {
  const other = side === 'player' ? sides.enemy : sides.player;
  if (color === other.color || !GAME_CONFIG.factionColors.includes(color)) return;
  sides[side].color = color;
  saveSides();
  renderFactionPicker();
}

export function saveSides() {
  saveData('factions', sides);
}

export function loadSides() {
  const saved = loadData('factions', null);
  for (const side of ['player', 'enemy']) {
    const s = saved && saved[side];
    if (s && GAME_CONFIG.factions[s.faction] && GAME_CONFIG.factions[s.faction].ready) sides[side].faction = s.faction;
    if (s && GAME_CONFIG.factionColors.includes(s.color)) sides[side].color = s.color;
  }
  if (sides.enemy.color === sides.player.color) sides.enemy.color = freeColor(sides.enemy.color, sides.player.color);
  const b = saved && saved.battle;
  for (const side of ['green', 'red']) if (b && GAME_CONFIG.factionColors.includes(b[side])) sides.battle[side] = b[side];
  if (sides.battle.red === sides.battle.green) sides.battle.red = freeColor(sides.battle.red, sides.battle.green);
}

// (#306) a colour for one of Battles' sides (not the other's)
export function setBattleColor(side, color) {
  const other = side === 'green' ? sides.battle.red : sides.battle.green;
  if (color === other || !GAME_CONFIG.factionColors.includes(color)) return;
  sides.battle[side] = color;
  saveSides();
}

// Whether the player's faction has this (a resource, building, tool, gear...): yes unless the item names
// the factions it's for (`factions`) and the player's isn't one of them
export function isForPlayerFaction(item) {
  return !item.factions || item.factions.includes(sides.player.faction);
}

// (#279) what a building costs the player's faction: as in GAME_CONFIG, and for one with buildBones (the undead)
// bones on top, a share of the rest. Set on each building's `cost` (its own kept as `baseCost`) when the HUD is
// made for the faction (renderConfigHud), so whatever reads a cost reads the faction's
export function applyFactionCosts() {
  const extra = (GAME_CONFIG.factions[sides.player.faction] || {}).buildBones;
  for (const def of Object.values(GAME_CONFIG.buildings)) {
    if (!def.cost && !def.baseCost) continue;
    if (!def.baseCost) def.baseCost = def.cost;
    const base = def.baseCost, rest = Object.values(base).reduce((sum, n) => sum + n, 0);
    def.cost = extra && rest > 0 && !base.bones ? { ...base, bones: Math.max(extra.min, Math.round(rest * extra.share)) } : base;
  }
}
