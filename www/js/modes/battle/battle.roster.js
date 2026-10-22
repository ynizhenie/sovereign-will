// What can be placed in a battle: each faction's units (colony kinds with a weapon), enemies, buildings

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { t } from '../../engine/platform/index.js';
import { enemyPlayerUnit } from '../../domains/conflict/waves/index.js';
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
    { id: 'bow', type: 'normal', weapon: 'bow' }, { id: 'big_club', type: 'big', weapon: 'club' }, { id: 'big_spear', type: 'big', weapon: 'spear' },
    { id: 'dog', type: 'dog', weapon: 'fist' } // (#314: the pets)
  ],
  undead: [
    { id: 'zombie', type: 'zombie', weapon: 'fist' }, { id: 'zombie_club', type: 'zombie', weapon: 'club' },
    { id: 'zombie_sword', type: 'zombie', weapon: 'sword' }, { id: 'zombie_bow', type: 'zombie', weapon: 'bow' },
    { id: 'necromancer', type: 'zombie', weapon: 'fist', tool: 'necro_staff' }, { id: 'big_zombie', type: 'big_zombie', weapon: 'club' },
    { id: 'ghost', type: 'ghost', weapon: 'fist' }
  ],
  demons: [
    { id: 'imp_fist', type: 'imp', weapon: 'fist' }, { id: 'imp', type: 'imp', weapon: 'club' },
    { id: 'imp_sword', type: 'imp', weapon: 'sword' }, { id: 'imp_spear', type: 'imp', weapon: 'spear' },
    { id: 'imp_bow', type: 'imp', weapon: 'bow' }, { id: 'demon', type: 'demon', weapon: 'club' },
    { id: 'demon_spear', type: 'demon', weapon: 'spear' }, { id: 'beast', type: 'beast', weapon: 'fist' }
  ]
};

export const BATTLE_PRESETS = [
  ...Object.entries(BATTLE_PLAYER_UNITS).flatMap(([faction, units]) => units.map(u => ({ ...u, faction }))),
  ...Object.values(GAME_CONFIG.factions).filter(f => f.ready && f.enemies).flatMap(f => f.enemies.map(id => ({ id, enemy: id, faction: f.id })))
];

// buildings any faction has, then each faction's own (those with `factions` in GAME_CONFIG.buildings); (#279)
// all of them now, but a fish trap (on water) and crops
export const BATTLE_BUILDINGS = ['wall_wood', 'wall_stone', 'door', 'iron_door', 'spikes', 'iron_trap', 'watchtower', 'dummy', 'warehouse', 'workshop', 'smithy', 'smelter',
  'tent', 'campfire', 'torch', 'dung_heap', 'grave', 'demon_den', 'sacrifice_circle', 'portal', 'corpse_pit', 'cage'];

export function getBattlePreset(id) {
  return BATTLE_PRESETS.find(p => p.id === id);
}

// What a preset is called: by the player's own unit of its kind and what it carries, an enemy by the very
// same name; a human preset by its own (Unarmed, Club, Archer...)
export function battlePresetLabel(preset) {
  const unit = preset.enemy ? enemyPlayerUnit(GAME_CONFIG.enemies[preset.enemy]) : preset;
  const kind = GAME_CONFIG.settlerTypes[unit.type];
  if (kind.pet) return kind.label; // (#314: a pet has no weapon to name it by)
  const own = unit.faction === 'humans'
    ? BATTLE_PLAYER_UNITS.humans.find(u => u.type === unit.type && u.weapon === unit.weapon && (u.tool || 'none') === (unit.tool || 'none'))
    : null;
  if (own) return t(`preset.${own.id}`);
  const parts = [kind.label];
  if (unit.tool) parts.push(getDefinition('tools', unit.tool).label);
  else if (unit.weapon !== 'fist') parts.push(getDefinition('weapons', unit.weapon).label.toLowerCase()); // (a bow too, #249: no archer kinds of their own)
  return parts.join(', ');
}

// The presets the panel shows now: the category's side, the chosen faction's
export function getBattlePresetsShown() {
  return BATTLE_PRESETS.filter(p => !!p.enemy === (battle.category === 'enemy') && p.faction === battle.faction);
}

export function getBattleBuildings() {
  return BATTLE_BUILDINGS.filter(id => { const f = getDefinition('buildings', id).factions; return !f || f.includes(battle.faction); });
}
