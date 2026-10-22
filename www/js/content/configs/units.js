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
    // (#314) each faction's pet (GAME_CONFIG.pets): pet: which; bite: how it fights (a weapon's combat
    // stats); orders: what it takes when possessed
    dog: { id: 'dog', icon: 'dog', pet: 'dog', hp: 70, speed: 1.35, radius: 9, visualRadius: 10, population: 1, damageMultiplier: 1, carryLoads: 0, hireCost: { food: 20 },
      bite: { damage: 7, range: 24, cooldown: 0.45, approach: 18, tentReach: 22 }, orders: ['attack'] },
    beast: { id: 'beast', icon: 'beast', pet: 'beast', hp: 90, speed: 1.3, radius: 10, visualRadius: 11, population: 1, damageMultiplier: 1, carryLoads: 0, hireCost: { food: 20, stone: 5 },
      bite: { damage: 9, range: 24, cooldown: 0.5, approach: 18, tentReach: 22 }, orders: ['attack', 'devour'] },
    ghost: { id: 'ghost', icon: 'ghost', pet: 'ghost', hp: 50, speed: 1.6, radius: 8, visualRadius: 10, population: 1, damageMultiplier: 1, carryLoads: 0, hireCost: { bones: 10, rot: 5 },
      orders: ['dive'] }
  },

  // (#314) pets: hungry every hungerSeconds (slower asleep), then fed by a settler with one of `foods` from the
  // stock (a beast eats a corpse by itself too); hungry, it moves at hungryPace and bites at hungryBite. It
  // keeps near the nearest soldier (followTiles), goes for an enemy within guardTiles of it, and with no enemy
  // about now and then (sleepChance a second) sleeps sleepSeconds. A dog flushes a boar hidden in the grass
  // within flushTiles (every flushSeconds at most). A ghost hovers by a grave, goes with a necromancer to a
  // fight (`carry` to one), flies into an enemy within diveTiles (at diveSpeed, through anything): it panics,
  // and the ghost is gone backSeconds, back by a grave. coats: each pet's colours; a female drawn femaleScale
  pets: {
    hungerSeconds: 120, hungryPace: 0.7, hungryBite: 0.6, foods: ['rawMeat', 'rawFish', 'cookedMeat', 'cookedFish', 'bread'],
    followTiles: 1.5, guardTiles: 6, sleepChance: 0.015, sleepSeconds: [20, 40], flushTiles: 8, flushSeconds: 15, devourSeconds: 3,
    ghost: { diveTiles: 5, diveSpeed: 2.6, backSeconds: 30, carry: 3 },
    coats: {
      dog: [['#8d6e63', '#5d4037'], ['#d7ccc8', '#8d6e63'], ['#424242', '#212121'], ['#c8a165', '#8a6a3a'], ['#eeeeee', '#9e9e9e']],
      beast: [['#7b241c', '#3b0f0b'], ['#2c2c2c', '#7b241c'], ['#5d4037', '#e8572a'], ['#4a1c40', '#c0392b']],
      ghost: [['#ecf0f1', '#aeb6bf'], ['#d6eaf8', '#85c1e9'], ['#e8daef', '#a569bd']]
    },
    femaleChance: 0.5, femaleScale: 0.88
  }
};
