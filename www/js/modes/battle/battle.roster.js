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
  .map(({ preset, unit }) => ({ id: `${f.id}:${preset.id}`, preset: preset.id, ...unit })));

// buildings any faction has, then each faction's own (those with `factions` in GAME_CONFIG.buildings); (#279)
// all of them now, but a fish trap (on water) and crops
export const BATTLE_BUILDINGS = ['wall_wood', 'wall_stone', 'door', 'iron_door', 'spikes', 'iron_trap', 'watchtower', 'dummy', 'warehouse', 'workshop', 'smithy', 'smelter',
  'tent', 'campfire', 'torch', 'dung_heap', 'grave', 'demon_den', 'sacrifice_circle', 'portal', 'corpse_pit', 'cage'];

export function getBattlePreset(id) {
  return BATTLE_PRESETS.find(p => p.id === id);
}

// What a preset is called: a human one by its own name (Unarmed, Club, Archer...), another faction's by its
// kind and what it carries (a pet by its kind)
export function battlePresetLabel(preset) {
  const kind = GAME_CONFIG.settlerTypes[preset.type];
  if (kind.pet) return kind.label; // (#314: a pet has no weapon to name it by)
  if (preset.faction === 'humans') return t(`preset.${preset.preset}`);
  const parts = [kind.label];
  if (preset.tool) parts.push(getDefinition('tools', preset.tool).label);
  else if (preset.weapon !== 'fist') parts.push(getDefinition('weapons', preset.weapon).label.toLowerCase()); // (a bow too, #249: no archer kinds of their own)
  return parts.join(', ');
}

// The buildings a faction has: the common ones (no `factions`) for null, else that faction's own
/** @param {string | null} [faction] */
export function getBattleBuildings(faction = null) {
  return BATTLE_BUILDINGS.filter(id => { const f = getDefinition('buildings', id).factions; return faction ? !!f && f.includes(faction) : !f; });
}
