// What can be placed in a battle: units (every faction's, the same for either side) and buildings

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { t } from '../../engine/platform/index.js';
import { presetUnit } from '../../domains/conflict/waves/index.js';
import { battle } from './battle.setup.js';

// The panel's categories (#326: one for the units of both sides: the half of the field tapped says whose)
export const BATTLE_CATEGORIES = ['units', 'buildings'];

// (#326) The units: every faction's, by GAME_CONFIG.unitPresets in that order, a faction after another; each
// placed on the green half is one of yours, on the red half an enemy (the very same unit, see presetEnemyKey).
// Its id: "faction:preset". Armour, a shield and a banner come from the panel's toggles
export const BATTLE_PRESETS = Object.values(GAME_CONFIG.factions).filter(f => f.ready).flatMap(f => GAME_CONFIG.unitPresets
  .map(p => ({ preset: p, unit: presetUnit(f.id, p) }))
  .filter(({ unit }) => unit)
  .map(({ preset, unit }) => ({ id: `${f.id}:${preset.id}`, preset: preset.id, size: preset.size, ...unit })));

// buildings any faction has, then each faction's own (those with `factions` in GAME_CONFIG.buildings); (#279)
// all of them now, but a fish trap (on water) and crops
export const BATTLE_BUILDINGS = ['wall_wood', 'wall_stone', 'door', 'iron_door', 'spikes', 'iron_trap', 'watchtower', 'dummy', 'warehouse', 'workshop', 'smithy', 'smelter',
  'tent', 'campfire', 'torch', 'dung_heap', 'grave', 'demon_den', 'sacrifice_circle', 'portal', 'corpse_pit', 'cage'];

// (#326) The big one of a unit, when the panel's Big switch is on: the same weapon in the faction's big body
// (none for a pet)
export function bigPresetOf(preset) {
  return preset.size === 'normal' ? BATTLE_PRESETS.find(p => p.id === `${preset.faction}:big_${preset.preset}`) : undefined;
}

export function getBattlePreset(id) {
  return BATTLE_PRESETS.find(p => p.id === id);
}

// What a preset is called: every faction's as the humans' (Unarmed, Club, Archer...; 27.10, 32: an archer, not
// "Imp, bow"), a big one with its big kind first (Giant, club); a pet by its kind
export function battlePresetLabel(preset) {
  const kind = GAME_CONFIG.settlerTypes[preset.type];
  if (kind.pet) return kind.label; // (#314: a pet has no weapon to name it by)
  const name = t(`preset.${preset.preset.replace(/^big_/, '')}`);
  return preset.size === 'big' ? `${kind.label}, ${name.toLowerCase()}` : name;
}

// The buildings a faction has: the common ones (no `factions`) for null, else that faction's own
/** @param {string | null} [faction] */
export function getBattleBuildings(faction = null) {
  return BATTLE_BUILDINGS.filter(id => { const f = getDefinition('buildings', id).factions; return faction ? !!f && f.includes(faction) : !f; });
}
