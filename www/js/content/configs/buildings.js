// Buildings and their repairs

export const buildingsConfig = {
  // tab: which tab of the bottom panel its button goes in: 'build' (default) or 'farming'.
  // Arrows stop at buildings, except arrowsPass ones; towerArrowsPass ones only stop arrows shot from the ground.
  // group: the section of the Building tab it's in (#181): defense / homes / economy
  buildings: {
    wall_wood: { id: 'wall_wood', group: 'defense', icon: 'wall_wood', cost: { wood: 5 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 }, towerArrowsPass: true },
    wall_stone: { id: 'wall_stone', group: 'defense', icon: 'wall_stone', cost: { stone: 5 }, demolishRefund: { stone: 3 }, build: { maxProgress: 120, hp: 300 }, towerArrowsPass: true },
    // trap: every unit stepping onto it takes `damage`; it breaks after `uses` steps. Settlers walk
    // around it; enemies too, unless there's no other way (then it's cheaper for them than a wall)
    spikes: { id: 'spikes', group: 'defense', icon: 'spikes', cost: { wood: 6, iron: 2 }, build: { maxProgress: 40, trap: { damage: 25, uses: 5 } }, arrowsPass: true },
    door: { id: 'door', group: 'defense', icon: 'door', cost: { wood: 6 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 }, towerArrowsPass: true },
    // tent: +population to the limit; settlers heal at it (healPerSecond), workers mend it (repairPerSecond)
    // factions: only these factions build it (#43); tents are the humans', graves the undead's
    tent: { id: 'tent', group: 'homes', icon: 'tent', factions: ['humans'], cost: { wood: 10, leather: 3 }, demolishRefund: { wood: 5 }, population: 3, healPerSecond: 20, repairPerSecond: 15, build: { maxProgress: 70, hp: 80 } },
    // a grave: the undead's tent, also where necromancers get their raises back; it makes bones
    // the demons' (#43): a sacrificial circle adds population, and a settler sent into it heals everyone;
    // portals come in pairs (the 1st with the 2nd, the 3rd with the 4th...) and settlers step through
    sacrifice_circle: { id: 'sacrifice_circle', group: 'homes', icon: 'sacrifice_circle', factions: ['demons'], cost: { stone: 15 }, demolishRefund: { stone: 7 }, population: 3, sacrifice: true, build: { maxProgress: 80, hp: 150 } },
    portal: { id: 'portal', group: 'homes', icon: 'portal', factions: ['demons'], cost: { stone: 10, iron: 2 }, demolishRefund: { stone: 5 }, portal: true, build: { maxProgress: 100, hp: 120 } },
    grave: { id: 'grave', group: 'homes', icon: 'grave', factions: ['undead'], cost: { stone: 10 }, demolishRefund: { stone: 5 }, population: 1, healPerSecond: 20, repairPerSecond: 15, build: { maxProgress: 70, hp: 100 } },
    campfire: { id: 'campfire', group: 'economy', icon: 'campfire', factions: ['humans', 'demons'], cost: { wood: 5 }, build: { maxProgress: 40, hp: 60, campfire: true }, arrowsPass: true },
    smelter: { id: 'smelter', group: 'economy', icon: 'smelter', cost: { wood: 15, stone: 10 }, build: { maxProgress: 100, hp: 160,
      // holds at most maxOre ore and maxCoal coal; one ore + one coal make one iron every `seconds`, up to
      // maxIron waiting to be picked up. One settler at a time brings it ore/coal, one takes its iron.
      smelter: { maxOre: 6, maxCoal: 6, maxIron: 6, seconds: 4 } } },
    watchtower: { id: 'watchtower', group: 'defense', icon: 'watchtower', cost: { wood: 25, stone: 20 }, demolishRefund: { wood: 12, stone: 10 }, build: { maxProgress: 140, hp: 220, tower: { capacity: 1, minEnemies: 2, range: 320, arrowCapacity: 12, damage: 18, cooldown: 1.2, projectileSpeed: 4.5 } } },
    // a place nearer than the town hall to bring resources to and fetch them from (#36, #141)
    warehouse: { id: 'warehouse', group: 'economy', icon: 'warehouse', cost: { wood: 5 }, demolishRefund: { wood: 2 }, build: { maxProgress: 80, hp: 150 } },
    wheat: { id: 'wheat', icon: 'wheat', cost: { wheatSeeds: 1 }, build: { maxProgress: 40 }, tab: 'farming', arrowsPass: true },
    sapling: { id: 'sapling', icon: 'saplings', cost: { saplings: 1 }, build: { maxProgress: 40 }, tab: 'farming', arrowsPass: true },
    apple_sapling: { id: 'apple_sapling', icon: 'appleSaplings', cost: { appleSaplings: 1 }, build: { maxProgress: 40 }, tab: 'farming', arrowsPass: true }
  },

  // what one repair step costs and restores (buildings: one step per `interval` seconds per worker).
  // Buildings are repaired when the player orders it (tap it, or Repair all). Buildings without their own entry use `buildings`: costShare of what the building
  // cost (rounded up) for hpShare of its hp. Tents mend themselves for free (tent.repairPerSecond).
  repairs: {
    townHall: { cost: { wood: 15, stone: 15 }, hp: 35 },
    buildings: { costShare: 0.2, hpShare: 0.25, interval: 1 }
  }
};
