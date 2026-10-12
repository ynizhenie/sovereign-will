// What can be placed in a battle: each faction's units (colony kinds with a weapon), enemies, buildings

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { t } from '../../engine/platform/index.js';
import { isBowWeapon } from '../../domains/colony/equipment/index.js';
import { battle } from './battle.setup.js';

// The panel's categories: the player's units (green side), enemies (red side), buildings (either side);
// each by faction
export const BATTLE_CATEGORIES = ['own', 'enemy', 'buildings'];

// The player's units by faction: a settler kind with a weapon (and a tool: the undead's necromancer);
// armour and a shield come from the panel's toggles. Enemies: the enemy kinds of each faction, with their
// own stats (GAME_CONFIG.factions[f].enemies).
export const BATTLE_PLAYER_UNITS = {
  humans: [
    { id: 'fist', type: 'normal', weapon: 'fist' }, { id: 'club', type: 'normal', weapon: 'club' },
    { id: 'sword', type: 'normal', weapon: 'sword' }, { id: 'spear', type: 'normal', weapon: 'spear' },
    { id: 'iron_sword', type: 'normal', weapon: 'iron_sword' }, { id: 'iron_spear', type: 'normal', weapon: 'iron_spear' },
    { id: 'bow', type: 'normal', weapon: 'bow' }, { id: 'big_club', type: 'big', weapon: 'club' }, { id: 'big_spear', type: 'big', weapon: 'spear' }
  ],
  undead: [
    { id: 'zombie', type: 'zombie', weapon: 'fist' }, { id: 'zombie_club', type: 'zombie', weapon: 'club' },
    { id: 'zombie_sword', type: 'zombie', weapon: 'sword' }, { id: 'skeleton', type: 'skeleton', weapon: 'bow' },
    { id: 'necromancer', type: 'zombie', weapon: 'fist', tool: 'necro_staff' }, { id: 'big_zombie', type: 'big_zombie', weapon: 'club' }
  ],
  demons: [
    { id: 'imp', type: 'imp', weapon: 'club' }, { id: 'imp_sword', type: 'imp', weapon: 'sword' },
    { id: 'imp_spear', type: 'imp', weapon: 'spear' }, { id: 'fire_imp', type: 'fire_imp', weapon: 'bow' },
    { id: 'demon', type: 'demon', weapon: 'club' }, { id: 'demon_spear', type: 'demon', weapon: 'spear' }
  ]
};

export const BATTLE_PRESETS = [
  ...Object.entries(BATTLE_PLAYER_UNITS).flatMap(([faction, units]) => units.map(u => ({ ...u, faction }))),
  ...Object.values(GAME_CONFIG.factions).filter(f => f.ready && f.enemies).flatMap(f => f.enemies.map(id => ({ id, enemy: id, faction: f.id })))
];

// buildings any faction has, then each faction's own (those with `factions` in GAME_CONFIG.buildings)
export const BATTLE_BUILDINGS = ['wall_wood', 'wall_stone', 'door', 'spikes', 'watchtower', 'tent', 'grave', 'sacrifice_circle', 'portal'];

export function getBattlePreset(id) {
  return BATTLE_PRESETS.find(p => p.id === id);
}

// What a preset is called: a human one by its own name, an enemy by its kind, the others kind + weapon
export function battlePresetLabel(preset) {
  if (preset.enemy) return GAME_CONFIG.enemies[preset.enemy].label;
  if (preset.faction === 'humans') return t(`preset.${preset.id}`);
  const parts = [GAME_CONFIG.settlerTypes[preset.type].label];
  if (preset.tool) parts.push(getDefinition('tools', preset.tool).label);
  else if (preset.weapon !== 'fist' && !isBowWeapon(preset.weapon)) parts.push(getDefinition('weapons', preset.weapon).label.toLowerCase());
  return parts.join(', ');
}

// The presets the panel shows now: the category's side, the chosen faction's
export function getBattlePresetsShown() {
  return BATTLE_PRESETS.filter(p => !!p.enemy === (battle.category === 'enemy') && p.faction === battle.faction);
}

export function getBattleBuildings() {
  return BATTLE_BUILDINGS.filter(id => { const f = getDefinition('buildings', id).factions; return !f || f.includes(battle.faction); });
}
