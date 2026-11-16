// Experience thresholds update a unit's level, fixed health bonus, and attack speed.
function progression() {
  const unit = { hp: 100, maxHp: 100, experience: 0 };
  const levels = [];
  for (const experience of [9.99, 10, 24.99, 25]) {
    setUnitExperience(unit, experience);
    levels.push({
      level: getUnitLevel(unit),
      maxHp: unit.maxHp,
      attackSpeed: getUnitAttackSpeedMultiplier(unit)
    });
  }
  return levels;
}

sim.progression = progression;

function butcherProgression() {
  const demon = { type: 'imp', weapon: 'sword', workKind: 'butcher', butcherTarget: {}, progression: { melee: 25, hunting: 0 } };
  const hunter = { type: 'normal', weapon: 'sword', workKind: 'butcher', progression: { melee: 0, hunting: 10 } };
  const demonTrack = getUnitDisplayProgressionTrack(demon), hunterTrack = getUnitDisplayProgressionTrack(hunter);
  return {
    demon: { track: demonTrack, level: getUnitLevel(demon, demonTrack) },
    hunter: { track: hunterTrack, level: getUnitLevel(hunter, hunterTrack) }
  };
}

sim.butcherProgression = butcherProgression;

function progressionCombatStats() {
  const unit = createSettler('normal', 9002, 0, 0, { weapon: 'sword', role: 'soldier' });
  const base = getWeaponStats(unit, 'combat');
  setUnitExperience(unit, 10);
  const levelTwo = getWeaponStats(unit, 'combat');
  return {
    base: { damage: base.damage * base.multiplier, cooldown: base.cooldown },
    levelTwo: { damage: levelTwo.damage * levelTwo.multiplier, cooldown: levelTwo.cooldown }
  };
}

sim.progressionCombatStats = progressionCombatStats;

function projectileLead() {
  const shooter = { type: 'normal', weapon: 'bow', experience: 0, x: 0, y: 0 };
  const target = { x: 100, y: 0, aimVx: 1, aimVy: 0 };
  const levelOne = getProjectileAimPoint(shooter, target, 5, 80);
  setUnitExperience(shooter, 10);
  const levelTwo = getProjectileAimPoint(shooter, target, 5, 80);
  shooter.weapon = 'sword';
  const melee = getProjectileAimPoint(shooter, target, 5, 80);
  return { levelOne, levelTwo, melee };
}

sim.projectileLead = projectileLead;

function ghostProgression() {
  const ghost = createSettler('ghost', 9001, 0, 0);
  const enemyGhost = createConfiguredEnemy({ x: 0, y: 0 }, 'undead_ghost');
  ghost.experience = 25;
  ghost.level = 3;
  enemyGhost.experience = 25;
  enemyGhost.level = 3;
  setUnitExperience(ghost, 25);
  addUnitExperience(enemyGhost);
  return {
    ghost: { hasProgression: hasUnitProgression(ghost), experience: Object.hasOwn(ghost, 'experience'), level: Object.hasOwn(ghost, 'level'), attackSpeed: getUnitAttackSpeedMultiplier(ghost) },
    enemyGhost: { hasProgression: hasUnitProgression(enemyGhost), experience: Object.hasOwn(enemyGhost, 'experience'), level: Object.hasOwn(enemyGhost, 'level'), attackSpeed: getUnitAttackSpeedMultiplier(enemyGhost) }
  };
}

sim.ghostProgression = ghostProgression;

function progressionSkills() {
  const unit = { type: 'normal', weapon: 'bow', tool: 'rod', quiver: true, arrows: 8, hp: 100, maxHp: 100 };
  for (const track of ['ranged', 'melee', 'healing', 'hunting', 'fishing', 'farming', 'axe', 'pickaxe', 'building']) {
    const experience = ['ranged', 'melee', 'healing', 'hunting'].includes(track) ? 10 : 30;
    setUnitExperience(unit, experience, track);
  }
  return {
    levels: Object.fromEntries(UNIT_PROGRESSION_TRACKS.map(track => [track, getUnitLevel(unit, track)])),
    speed: {
      healing: getUnitHealingSpeedMultiplier(unit),
      fishing: getUnitWorkSpeedMultiplier(unit, 'fishing'),
      farming: getUnitWorkSpeedMultiplier(unit, 'farming'),
      axe: getUnitWorkSpeedMultiplier(unit, 'axe'),
      pickaxe: getUnitWorkSpeedMultiplier(unit, 'pickaxe'),
      building: getUnitWorkSpeedMultiplier(unit, 'building')
    },
    huntingDamage: getUnitHuntingDamageMultiplier(unit),
    meleeHealth: unit.maxHp
  };
}

sim.progressionSkills = progressionSkills;

function huntingProgression() {
  const hunter = { type: 'normal', weapon: 'bow', progression: {} };
  return [9.99, 10, 24.99, 25].map(experience => {
    setUnitExperience(hunter, experience, 'hunting');
    return getUnitLevel(hunter, 'hunting');
  });
}

sim.huntingProgression = huntingProgression;

function petDamage() {
  return {
    dog: GAME_CONFIG.settlerTypes.dog.bite.damage,
    hellhound: GAME_CONFIG.settlerTypes.beast.bite.damage,
    enemyDog: GAME_CONFIG.enemies.raider_dog.damage,
    enemyHellhound: GAME_CONFIG.enemies.demon_beast.damage
  };
}

sim.petDamage = petDamage;
