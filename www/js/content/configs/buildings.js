// Buildings and their repairs

export const buildingsConfig = {
  // tab: which tab of the bottom panel its button goes in: 'build' (default) or 'farming'.
  // Arrows stop at buildings, except arrowsPass ones; towerArrowsPass ones only stop arrows shot from the ground.
  // group: the section of the Building tab it's in: defense / homes / economy
  buildings: {
    wall_wood: { id: 'wall_wood', group: 'defense', icon: 'wall_wood', cost: { wood: 5 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 }, towerArrowsPass: true },
    wall_stone: { id: 'wall_stone', group: 'defense', icon: 'wall_stone', cost: { stone: 5 }, demolishRefund: { stone: 3 }, build: { maxProgress: 120, hp: 300 }, towerArrowsPass: true },
    // trap: every unit stepping onto it takes `damage`, and standDps a second while it stands on it; each step
    // onto it uses one of its `uses` (standing doesn't), and with none left it's broken, harmless, until
    // repaired (#232, #248). Settlers walk around it; enemies too, unless there's no other way (then it's
    // cheaper for them than a wall)
    spikes: { id: 'spikes', group: 'defense', icon: 'spikes', cost: { wood: 4, iron: 1 }, build: { maxProgress: 40, trap: { damage: 25, uses: 5, standDps: 10 } }, arrowsPass: true, walkable: true },
    // door: settlers walk through it, enemies break it. upgrades: it can be built right on one of these,
    // which it replaces once it's built (#248: a door into a wall, an iron door over a door)
    door: { id: 'door', group: 'defense', icon: 'door', cost: { wood: 6 }, demolishRefund: { wood: 3 }, door: true, upgrades: ['wall_wood', 'wall_stone'], build: { maxProgress: 80, hp: 150 }, towerArrowsPass: true },
    iron_door: { id: 'iron_door', group: 'defense', icon: 'iron_door', cost: { wood: 4, iron: 4 }, demolishRefund: { iron: 2 }, door: true, upgrades: ['wall_wood', 'wall_stone', 'door'], build: { maxProgress: 110, hp: 350 }, towerArrowsPass: true },
    // an iron trap (#248): baited with the first of `bait` the stock has, it draws boars within lureRange and catches one at
    // boarChance (otherwise the boar eats the bait); an enemy stepping on it takes enemyDamage and is held
    // holdSeconds, then it's free and the trap sets itself again in rearmSeconds. Settlers walk round it,
    // enemies don't see it
    iron_trap: { id: 'iron_trap', group: 'defense', icon: 'iron_trap', cost: { wood: 2, iron: 3 }, demolishRefund: { iron: 1 }, walkable: true, arrowsPass: true,
      ironTrap: { bait: [{ food: 1 }, { rawMeat: 1 }, { bones: 1 }], lureRange: 240, boarChance: 0.5, enemyDamage: 60, holdSeconds: 6, rearmSeconds: 4 }, build: { maxProgress: 40, hp: 80 } },
    // tent: +population to the limit; settlers heal at it (healPerSecond), workers mend it (repairPerSecond)
    // factions: only these factions build it; tents are the humans', graves the undead's
    tent: { id: 'tent', group: 'homes', icon: 'tent', factions: ['humans'], cost: { wood: 10, leather: 2, rope: 1 }, demolishRefund: { wood: 5 }, population: 3, healPerSecond: 20, repairPerSecond: 15, build: { maxProgress: 70, hp: 80 } },
    // a grave: the undead's tent, also where necromancers get their raises back; it makes bones
    // the demons': a sacrificial circle adds population, and a settler sent into it heals everyone;
    // portals come in pairs (the 1st with the 2nd, the 3rd with the 4th...) and settlers step through
    sacrifice_circle: { id: 'sacrifice_circle', group: 'homes', icon: 'sacrifice_circle', factions: ['demons'], cost: { stone: 15 }, demolishRefund: { stone: 7 }, population: 3, sacrifice: true, build: { maxProgress: 80, hp: 150 } },
    portal: { id: 'portal', group: 'homes', icon: 'portal', factions: ['demons'], cost: { stone: 10, iron: 2 }, demolishRefund: { stone: 5 }, portal: true, build: { maxProgress: 100, hp: 120 } },
    grave: { id: 'grave', group: 'homes', icon: 'grave', factions: ['undead'], cost: { stone: 10 }, demolishRefund: { stone: 5 }, population: 1, healPerSecond: 20, repairPerSecond: 15, build: { maxProgress: 70, hp: 100 } },
    campfire: { id: 'campfire', group: 'economy', icon: 'campfire', factions: ['humans', 'demons'], cost: { wood: 5 }, build: { maxProgress: 40, hp: 60, campfire: true }, arrowsPass: true },
    smelter: { id: 'smelter', group: 'economy', icon: 'smelter', cost: { wood: 15, stone: 10 }, build: { maxProgress: 100, hp: 160,
      // holds at most maxOre ore and maxCoal coal; one ore + one coal make one iron every `seconds`, up to
      // maxIron waiting to be picked up. One settler at a time brings it ore/coal, one takes its iron.
      smelter: { maxOre: 6, maxCoal: 6, maxIron: 6, seconds: 4 } } },
    watchtower: { id: 'watchtower', group: 'defense', icon: 'watchtower', cost: { wood: 25, stone: 20, rope: 2 }, demolishRefund: { wood: 12, stone: 10 }, build: { maxProgress: 140, hp: 220, tower: { capacity: 1, minEnemies: 2, range: 320, arrowCapacity: 12, damage: 18, cooldown: 1.2, projectileSpeed: 4.5 } } },
    // crafts: where things are made (#211, #248): the workshop everything without iron in it, the smithy
    // everything with
    workshop: { id: 'workshop', group: 'economy', icon: 'workshop', cost: { wood: 10, stone: 4 }, demolishRefund: { wood: 5 }, crafts: 'workshop', build: { maxProgress: 80, hp: 150 } },
    smithy: { id: 'smithy', group: 'economy', icon: 'hammer', cost: { wood: 10, stone: 15 }, demolishRefund: { stone: 7 }, crafts: 'smithy', build: { maxProgress: 100, hp: 180 } },
    // a training dummy (#199): idle soldiers and archers between waves train at it, a little more damage
    // each time (GAME_CONFIG.idle.trainPerSecond, up to trainMax); trainers: at most this many at once
    dummy: { id: 'dummy', group: 'defense', icon: 'dummy', cost: { wood: 8 }, demolishRefund: { wood: 4 }, trainers: 2, build: { maxProgress: 40, hp: 80 } },
    // a fish trap (#199): on a water tile a fisher could fish from (onWater, #248); baited, it catches a fish
    // every fishTrap.seconds, holding up to fishTrap.holds, and a bait (what a fisher uses,
    // GAME_CONFIG.fishing.bait) lasts baitCatches fish. Fishers empty it (anyone with free hands once it's
    // full) and bait it (anyone with free hands too)
    fish_trap: { id: 'fish_trap', group: 'economy', icon: 'fish_trap', cost: { wood: 6, rope: 1 }, demolishRefund: { wood: 4 }, onWater: true, fishTrap: { seconds: 25, holds: 4, baitCatches: 3 }, build: { maxProgress: 50, hp: 60 } },
    // a place nearer than the town hall to bring resources to and fetch them from
    warehouse: { id: 'warehouse', group: 'economy', icon: 'warehouse', cost: { wood: 5 }, demolishRefund: { wood: 2 }, build: { maxProgress: 80, hp: 150 } },
    // a compost heap (#232): settlers with nothing to do bring it the dung lying in the base, up to
    // dungCapacity; farmers with a backpack take it from there to fertilise. Without one nobody gathers dung
    dung_heap: { id: 'dung_heap', icon: 'dung_heap', factions: ['humans', 'demons'], cost: { wood: 6 }, demolishRefund: { wood: 3 }, dungCapacity: 5, build: { maxProgress: 40, hp: 60 }, tab: 'farming', arrowsPass: true },
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
