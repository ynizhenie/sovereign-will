// Enemies, their tents, and how waves grow

export const enemiesConfig = {
  // type: normal / big / archer — how it behaves (big: hits everyone around its target and breaks any wall,
  //   cactus or ore in its way; archer: shoots from range instead of melee). radius: body size.
  // waveKey: its name in attackGroups. buildsTents: can be sent to build an enemy tent.
  // damage: per second in melee (per arrow for archers). reach: melee reach beyond touching.
  // siege: hp per second it takes off buildings, and off trees / boulders (cacti / ore for big) in its way.
  // ranged: range, keepAway (stops walking this close to its target), cooldown, arrowSpeed, arrowLife.
  // splash: radius, share of the damage dealt to everyone else around.
  // quiver: arrows it spawns with; tentStock: arrows it adds to the shared stock in enemy tents;
  //   refill: arrows taken from a tent at once; melee: the enemy it fights like when out of arrows
  //   and no tent has any left.
  // healer: walks up to the most hurt of its own side within range px and heals it by healPerSecond from
  //   healRange; tool: what it's drawn holding instead of a weapon.
  // reward: added to the stock when it dies. Waves spawn kinds in this order.
  enemies: {
    raider_club: { id: 'raider_club', hp: 50, speed: 0.95, damage: 10, reward: { food: 1 }, weapon: 'club',
      type: 'normal', radius: 10, waveKey: 'club', buildsTents: true, reach: 6, siege: { buildings: 10, resources: 2 } },
    // a savage with nothing in his hands: the battles' roster has him (bare-handed), no wave sends one
    // (no waveKey, so the wave kinds leave him out)
    raider_fist: { id: 'raider_fist', hp: 50, speed: 0.95, damage: 8, reward: { food: 1 }, weapon: 'fist',
      type: 'normal', radius: 10, reach: 6, siege: { buildings: 5, resources: 1 } },
    raider: { id: 'raider', hp: 70, speed: 0.9, damage: 20, reward: { food: 1 }, weapon: 'sword',
      type: 'normal', radius: 10, waveKey: 'raider', reach: 12, siege: { buildings: 10, resources: 2 } },
    brute: { id: 'brute', hp: 120, speed: 0.7, damage: 25, reward: { food: 2 }, weapon: 'spear',
      type: 'big', radius: 18, waveKey: 'brute', reach: 24, siege: { buildings: 25, resources: 4 }, splash: { radius: 70, share: 0.6 } },
    raider_archer: { id: 'raider_archer', hp: 60, speed: 0.8, damage: 30, reward: { food: 1 }, weapon: 'bow',
      type: 'archer', radius: 11, waveKey: 'archer', reach: 6, siege: { buildings: 10, resources: 2 },
      ranged: { range: 180, keepAway: 150, cooldown: 1.5, arrowSpeed: 3.8, arrowLife: 75 },
      quiver: { arrows: 12, tentStock: 12, refill: 6, melee: 'raider_club' } },
    // a medic with a bag of herbs: heals the other raiders (#203)
    raider_medic: { id: 'raider_medic', hp: 55, speed: 0.9, damage: 6, reward: { food: 1 }, weapon: 'fist', tool: 'medbag',
      type: 'normal', radius: 10, waveKey: 'raider', waveScale: 0.5, reach: 6, siege: { buildings: 5, resources: 1 },
      healer: { range: 220, healRange: 30, healPerSecond: 10 } },
    // the undead: slow zombies, big zombies, zombie archers, and necromancers that raise the dead
    // (necromancer: raises before they're spent, within range px, raiseSeconds each; heals the wounded
    // within healRange by healPerSecond). waveScale: share of its waveKey's count in a wave.
    undead_zombie: { id: 'undead_zombie', hp: 60, speed: 0.7, damage: 12, reward: { food: 1 }, weapon: 'fist',
      type: 'normal', radius: 10, waveKey: 'club', buildsTents: true, reach: 6, siege: { buildings: 10, resources: 2 } },
    // a zombie that picked up a sword (#203)
    undead_zombie_sword: { id: 'undead_zombie_sword', hp: 60, speed: 0.7, damage: 18, reward: { food: 1 }, weapon: 'sword',
      type: 'normal', radius: 10, waveKey: 'raider', waveScale: 0.66, reach: 12, siege: { buildings: 10, resources: 2 } },
    undead_big_zombie: { id: 'undead_big_zombie', hp: 150, speed: 0.55, damage: 25, reward: { food: 2 }, weapon: 'fist',
      type: 'big', radius: 18, waveKey: 'brute', reach: 20, siege: { buildings: 25, resources: 4 }, splash: { radius: 60, share: 0.5 } },
    // an archer of theirs is a zombie with a bow (#249: no skeletons)
    undead_zombie_archer: { id: 'undead_zombie_archer', hp: 45, speed: 0.9, damage: 25, reward: { food: 1 }, weapon: 'bow',
      type: 'archer', radius: 11, waveKey: 'archer', reach: 6, siege: { buildings: 10, resources: 2 },
      ranged: { range: 180, keepAway: 150, cooldown: 1.5, arrowSpeed: 3.8, arrowLife: 75 },
      quiver: { arrows: 12, tentStock: 12, refill: 6, melee: 'undead_zombie' } },
    undead_necromancer: { id: 'undead_necromancer', hp: 50, speed: 0.8, damage: 6, reward: { food: 1 }, weapon: 'fist',
      type: 'normal', radius: 10, waveKey: 'raider', waveScale: 0.34, reach: 6, siege: { buildings: 5, resources: 1 },
      necromancer: { raises: 5, range: 200, raiseReach: 110, raiseSeconds: 1.5, healRange: 80, healPerSecond: 6 } },
    // the demons: quick imps, big demons that hit all around, imp archers. They
    // come out of portals anywhere on the map (see factions.demons). waveKey can list several.
    demon_imp: { id: 'demon_imp', hp: 55, speed: 1.05, damage: 12, reward: { food: 1 }, weapon: 'fist',
      type: 'normal', radius: 10, waveKey: 'club', reach: 6, siege: { buildings: 10, resources: 2 } },
    // an imp with a sword; the big demon carries a spear, not a club (#203)
    demon_imp_sword: { id: 'demon_imp_sword', hp: 55, speed: 1.05, damage: 18, reward: { food: 1 }, weapon: 'sword',
      type: 'normal', radius: 10, waveKey: 'raider', reach: 12, siege: { buildings: 10, resources: 2 } },
    demon_brute: { id: 'demon_brute', hp: 140, speed: 0.7, damage: 28, reward: { food: 2 }, weapon: 'spear',
      type: 'big', radius: 18, waveKey: 'brute', reach: 24, siege: { buildings: 25, resources: 4 }, splash: { radius: 70, share: 0.6 } },
    // an imp with a bow, as the humans' archer (#249: no fire arrows for now)
    demon_imp_archer: { id: 'demon_imp_archer', hp: 50, speed: 0.95, damage: 26, reward: { food: 1 }, weapon: 'bow',
      type: 'archer', radius: 10, waveKey: 'archer', reach: 6, siege: { buildings: 10, resources: 2 },
      ranged: { range: 170, keepAway: 140, cooldown: 1.4, arrowSpeed: 3.8, arrowLife: 75 },
      quiver: { arrows: 12, tentStock: 12, refill: 6, melee: 'demon_imp' } }
  },

  // (#279) a wave as it comes: its enemies first gather by where they came in for musterSeconds (shouting at the
  // settlers; one that a settler comes within musterBreak px of fights at once), then attack. A wave of at least
  // captainFrom enemies has a commander with a banner: every everySeconds it tells one of its own within reach
  // px which settler to go for, one each, the nearest to it first
  waveMuster: { musterSeconds: 6, musterBreak: 140, captainFrom: 6, captain: { everySeconds: 2, reach: 260 } },
  // (#279) scouts: between waves (from wave fromWave), every checkSeconds a chance of one (at most max at a time)
  // walking the map's edge for staySeconds, never past it; they don't fight and settlers leave them be. One the
  // player points at is hunted; any settler within fleeTiles of one, it runs off the map
  scouts: { fromWave: 2, checkSeconds: 40, chance: 0.5, max: 2, staySeconds: 40, fleeTiles: 5 },

  // loot (#210, #232): for each thing a fallen enemy held (its weapon, armour, shield), itemChance it drops
  // that thing itself, lying on the ground (into the armory once carried in); a fallen settler's too (#279)
  loot: { itemChance: 0.35 },

  // armour and shields in waves (#203): once the player has made armour (a shield), each wave enemy from
  // wave fromWave wears it with a chance growing by perWave a wave, up to max. Shields: melee, not big
  enemyGear: { fromWave: 4, perWave: 0.04, max: 0.5 },

  // enemy tents: builders put them up near the map edge; each summons extra enemies during a wave
  enemyTents: {
    hp: 60, buildWork: 180, buildRate: 20, buildDistance: 28,
    summonEnemy: 'raider', summonsPerWave: 2, summonInterval: 5, maxEnemies: 60
  },

  // wave size: attackGroups counts grow by growthPerDifficulty every wavesPerDifficulty waves, a little each
  // wave from growFromWave; the first is firstWave of that, rampPerWave more each wave up to full; each wave
  // sends newTents (min-max) tent builders, up to difficulty + 1 tents on the map, never more than maxTents
  // and every wave is scaled by the player's army: 1 at
  // army.base settlers, perUnit more (or less) for each one over (under) it, within min..max. A wave
  // always has at least one enemy.
  waveScaling: { wavesPerDifficulty: 5, growthPerDifficulty: 0.5, maxTents: 8, newTents: { min: 1, max: 2 },
    firstWave: 0.8, rampPerWave: 0.07, growFromWave: 3, army: { base: 6, perUnit: 0.08, min: 0.6, max: 3 } },

  attackGroups: [
    // base squad templates (for the starting difficulty)
    { club: 4, raider: 4, brute: 0, archer: 0 }, // melee crowd
    { club: 4, raider: 2, brute: 1, archer: 1 }, // crowd with support
    { club: 3, raider: 2, brute: 0, archer: 3 }, // archer-heavy
    { club: 3, raider: 2, brute: 2, archer: 1 }, // brute-heavy
    { club: 2, raider: 2, brute: 2, archer: 2 }  // balanced mixed squad
  ]
};
