import { GAME_CONFIG } from '../../../content/configs/index.js';

const progression = GAME_CONFIG.unitProgression;
export const UNIT_PROGRESSION_TRACKS = ['ranged', 'melee', 'healing', 'hunting', 'fishing', 'farming', 'axe', 'pickaxe', 'building'];
const RANGED_WEAPONS = new Set(['bow', 'crossbow', 'rifle']);
const TOOL_TRACKS = {
  axe: 'axe', iron_axe: 'axe',
  pickaxe: 'pickaxe', iron_pickaxe: 'pickaxe',
  rod: 'fishing',
  hoe: 'farming'
};

export function hasUnitProgression(unit) {
  const settlerType = GAME_CONFIG.settlerTypes[unit?.type];
  const enemyType = GAME_CONFIG.enemies[unit?.enemyKey];
  return !!unit && settlerType?.pet !== 'ghost' && enemyType?.pet !== 'ghost' && unit.pet !== 'ghost';
}

export function getUnitWeaponProgressionTrack(unit) {
  if (!hasUnitProgression(unit)) return null;
  if (unit.weapon === 'dagger' || (RANGED_WEAPONS.has(unit.weapon) && unit.quiver && (unit.arrows || 0) <= 0)) return 'melee';
  return RANGED_WEAPONS.has(unit.weapon) ? 'ranged' : 'melee';
}

export function getUnitProgressionTrack(unit) {
  if (!hasUnitProgression(unit)) return null;
  const enemyType = GAME_CONFIG.enemies[unit.enemyKey];
  if (unit.tool === 'medbag' || unit.tool === 'necro_staff' || enemyType?.healer || enemyType?.necromancer) return 'healing';
  if (TOOL_TRACKS[unit.tool]) return TOOL_TRACKS[unit.tool];
  return getUnitWeaponProgressionTrack(unit);
}

export function getUnitDisplayProgressionTrack(unit) {
  if (unit?.workKind === 'build') return 'building';
  if (unit?.workKind === 'butcher' && !unit.butcherTarget) return 'hunting';
  if (unit?.workKind === 'heal') return 'healing';
  return getUnitProgressionTrack(unit);
}

function progressionData(unit) {
  if (!unit.progression || typeof unit.progression !== 'object' || Array.isArray(unit.progression)) {
    const legacyExperience = Math.max(0, unit.experience || 0);
    const track = getUnitWeaponProgressionTrack(unit);
    unit.progression = track ? { [track]: legacyExperience } : {};
    if (track !== 'melee' && unit.maxHp > 0) {
      const oldLevel = unit.level || (legacyExperience >= 15 ? 3 : legacyExperience >= 5 ? 2 : 1);
      const oldHealthBonus = getUnitHealthBonus(oldLevel);
      unit.maxHp = Math.max(1, unit.maxHp - oldHealthBonus);
      unit.hp = Math.min(unit.hp, unit.maxHp);
    }
    delete unit.experience;
    delete unit.level;
  }
  return unit.progression;
}

export function getUnitExperience(unit, track = getUnitProgressionTrack(unit)) {
  if (!unit || !track || !hasUnitProgression(unit)) return 0;
  return Math.max(0, progressionData(unit)[track] || 0);
}

export function getUnitLevel(unit, track = getUnitProgressionTrack(unit)) {
  const experience = getUnitExperience(unit, track);
  if (experience >= progression.experienceToLevel[2]) return 3;
  if (experience >= progression.experienceToLevel[1]) return 2;
  return 1;
}

export function getUnitExperienceForLevel(level) {
  return progression.experienceToLevel[Math.max(0, Math.min(2, level - 1))];
}

export function getUnitHealthBonus(level) {
  return progression.healthBonus[Math.max(0, Math.min(2, level - 1))];
}

export function getUnitAttackSpeedMultiplier(unit, track = getUnitWeaponProgressionTrack(unit)) {
  if (track !== 'ranged' && track !== 'melee') return 1;
  return 1 + progression.attackSpeedBonus[getUnitLevel(unit, track) - 1];
}

export function getUnitHealingSpeedMultiplier(unit) {
  return 1 + progression.healingSpeedBonus[getUnitLevel(unit, 'healing') - 1];
}

export function getUnitWorkSpeedMultiplier(unit, track = getUnitProgressionTrack(unit)) {
  if (!['fishing', 'farming', 'axe', 'pickaxe', 'building'].includes(track)) return 1;
  return 1 + progression.workSpeedBonus[getUnitLevel(unit, track) - 1];
}

export function getUnitHuntingDamageMultiplier(unit) {
  return 1 + progression.huntingDamageBonus[getUnitLevel(unit, 'hunting') - 1];
}

export function setUnitExperience(unit, experience, track = getUnitProgressionTrack(unit)) {
  if (!hasUnitProgression(unit) || !track) {
    if (unit) {
      delete unit.progression;
      delete unit.experience;
      delete unit.level;
      if (unit.battleEntry) {
        delete unit.battleEntry.progression;
        delete unit.battleEntry.level;
        delete unit.battleEntry.experience;
      }
    }
    return 1;
  }
  const previousLevel = getUnitLevel(unit, track);
  const previousHealthBonus = track === 'melee' ? getUnitHealthBonus(previousLevel) : 0;
  const nextExperience = Math.max(0, Math.min(progression.experienceToLevel[2], experience));
  progressionData(unit)[track] = nextExperience;
  const nextLevel = getUnitLevel(unit, track);
  unit.level = nextLevel;
  unit.experience = nextExperience;
  if (track === 'melee' && nextLevel !== previousLevel && unit.maxHp > 0) {
    const healthIncrease = getUnitHealthBonus(nextLevel) - previousHealthBonus;
    unit.maxHp += healthIncrease;
    unit.hp = Math.min(unit.maxHp, unit.hp + healthIncrease);
  }
  if (unit.battleEntry) {
    unit.battleEntry.progression = { ...(unit.battleEntry.progression || {}), [track]: nextExperience };
    unit.battleEntry.level = nextLevel;
    unit.battleEntry.experience = nextExperience;
  }
  return nextLevel;
}

export function copyUnitProgression(unit, source) {
  const sourceData = source && (source.progression || source.experience !== undefined) ? progressionData(source) : null;
  if (sourceData) {
    for (const track of UNIT_PROGRESSION_TRACKS) {
      if (sourceData[track] > 0) setUnitExperience(unit, sourceData[track], track);
    }
  }
}

export function getUnitLevelForTrack(unit, track) {
  return getUnitLevel(unit, track);
}

export function addUnitExperience(unit, amount = 1, track = getUnitWeaponProgressionTrack(unit)) {
  if (!unit) return;
  if (!hasUnitProgression(unit)) {
    setUnitExperience(unit, 0);
    return;
  }
  if (!track || amount <= 0 || getUnitLevel(unit, track) >= 3) return;
  setUnitExperience(unit, getUnitExperience(unit, track) + amount, track);
}
