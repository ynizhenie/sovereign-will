// The colony's unit kinds, and how fast everyone moves

export const unitsConfig = {
  // (#306) how they look: a woman femaleChance of the time; five looks each (male: cropped, bald, bearded, long
  // tied back, hooded; female: long, a braid, a bun, a ponytail, a bob), the commoner the bigger its weight;
  // their hair one of their kind's colours
  looks: {
    femaleChance: 0.4, male: [30, 18, 20, 18, 14], female: [28, 20, 20, 18, 14],
    hair: {
      humans: ['#3e2723', '#6d4c41', '#c49a6c', '#212121', '#a1887f', '#8d5524'],
      undead: ['#6b6b5e', '#4f5b4a', '#8a8a7a', '#3d3d33'],
      demons: ['#1b1b1f', '#5c1a1a', '#2c2c2c', '#7b241c']
    }
  },
  // how far everyone moves per game step, times their own speed (settlers, enemies, boars). 2 is the pace
  // the game was tuned at on a 120 Hz screen, before updates became a fixed 60 per second
  movementScale: 2,

  // kinds of settlers: stats, how many population slots they take, damage multiplier, and what hiring / upgrading costs.
  // carryLoads: how many gathered loads (one tree, one boulder, one boar...) it carries before going home
  settlerTypes: {
    normal: { id: 'normal', icon: 'worker', hp: 100, speed: 1.0, radius: 11, visualRadius: 11, population: 1, damageMultiplier: 1, carryLoads: 1, hireCost: { food: 15 } },
    big: { id: 'big', icon: 'giant', big: true, hp: 250, speed: 0.7, radius: 13, visualRadius: 18, population: 2, damageMultiplier: 1.8, carryLoads: 2, hireCost: { food: 30, wood: 15 }, upgradeCost: { food: 15, wood: 15 } },
    // the undead's. archer: hired with a bow and a quiver. necromancer: see enemies.undead_necromancer;
    // raised zombies take population like hired ones
    zombie: { id: 'zombie', icon: 'zombie', hp: 100, speed: 0.85, radius: 11, visualRadius: 11, population: 1, damageMultiplier: 1, carryLoads: 1, hireCost: { bones: 8, rot: 3 } },
    big_zombie: { id: 'big_zombie', icon: 'big_zombie', big: true, hp: 250, speed: 0.6, radius: 13, visualRadius: 18, population: 2, damageMultiplier: 1.8, carryLoads: 2, hireCost: { bones: 20, rot: 8 }, upgradeCost: { bones: 12, rot: 5 } },
    // the demons'. eatsCorpses: heals by eating a corpse (eatSeconds) when not fighting.
    // fireArrows: its arrows set what they hit burning (see GAME_CONFIG.burning)
    imp: { id: 'imp', icon: 'imp', eatsCorpses: true, hp: 90, speed: 1.1, radius: 11, visualRadius: 11, population: 1, damageMultiplier: 1, carryLoads: 1, hireCost: { food: 15 } },
    demon: { id: 'demon', icon: 'demon', big: true, eatsCorpses: true, hp: 260, speed: 0.75, radius: 13, visualRadius: 18, population: 2, damageMultiplier: 1.9, carryLoads: 2, hireCost: { food: 30, stone: 10 }, upgradeCost: { food: 15, stone: 10 } },
  }
};
