// The map: how it's generated, what grows on it

export const mapConfig = {
  // ---- Things on the map to gather
  //
  // list: the world list they live in. tool: tool family needed (axe / pickaxe); without one it's
  // gathered by hand, by settlers who have no tool (or anyone, if the player marks it).
  // markOnly: settlers only work it when the player marks it. hp: toughness. blocksArrows: arrows stop at it.
  // yield: what finishing it gives; bonusChance: { resource: chance } of one extra.
  // regrow: where it grows back after map.respawnDelay ('forest', 'anywhere', 'nearby' = around where
  // it was, 'spawner' = around an ore spawner, after map.oreRespawnDelay); none = gone for good.
  // forestShare: share of regrowth in a forest (default map.forestUndergrowthShare).
  // clearsPath: removing it can open a way (paths are re-planned).
  //
  // work (settlers): pickup — taken at once; seconds — takes that long (per tool if an object);
  //   chop — loses hp per second by settler type, times toolBonus; drain — loses hp per second by tool.
  mapResources: {
    // (#279) fellInTwo: felled, it falls (fallSeconds) and gives `first` of its yield; the log lying there is cut
    // up (logHp of its hp) for the rest
    tree: { list: 'trees', blocksArrows: true, tool: 'axe', hp: 3, yield: { wood: 3 }, bonusChance: { saplings: 0.5 }, regrow: 'forest', forestShare: 1,
      fellInTwo: { logHp: 0.6, fallSeconds: 0.8, pieces: 2 },
      work: { chop: { normal: 1.5, big: 2.5 }, toolBonus: { iron_axe: 1.9 } } },
    cactus: { list: 'cacti', blocksArrows: true, tool: 'axe', hp: 2, yield: { wood: 1 }, regrow: 'nearby',
      work: { chop: { normal: 1.5, big: 2.5 }, toolBonus: { iron_axe: 1.9 } } },
    boulder: { list: 'boulders', blocksArrows: true, tool: 'pickaxe', hp: 4, yield: { stone: 3 }, regrow: 'anywhere',
      work: { chop: { normal: 1.5, big: 2.5 } } },
    iron_ore: { list: 'ironOres', blocksArrows: true, tool: 'pickaxe', hp: 5, yield: { ironOre: 3 }, regrow: 'spawner',
      work: { seconds: { pickaxe: 3.0, iron_pickaxe: 2.0 } } },
    coal_ore: { list: 'coalOres', blocksArrows: true, tool: 'pickaxe', hp: 5, yield: { coal: 3 }, regrow: 'spawner',
      work: { seconds: { pickaxe: 2.5, iron_pickaxe: 1.7 } } },
    // spawnerWork (#248): an ore spawner (rock too) marked is mined for one of its ore every `seconds`, never
    // used up
    natural_rock: { list: 'naturalRocks', blocksArrows: true, tool: 'pickaxe', markOnly: true, hp: 100, yield: { stone: 15 }, clearsPath: true,
      work: { drain: { pickaxe: 25, iron_pickaxe: 38 } }, spawnerWork: { seconds: { pickaxe: 9, iron_pickaxe: 6 } } },
    stick: { list: 'sticks', hp: 1, yield: { wood: 1 }, regrow: 'forest', work: { pickup: true } },
    pebble: { list: 'pebbles', hp: 1, yield: { stone: 1 }, regrow: 'anywhere', work: { pickup: true } },
    // a piece of a felled tree's log (#298): picked up, its own yield (its share of the tree's wood); no regrowth
    log: { list: 'logs', hp: 1, yield: { wood: 1 }, work: { pickup: true } },
    // what a fallen enemy dropped (#210): picked up like a stick; its yield and items are its own
    loot: { list: 'loot', hp: 1, yield: {}, work: { pickup: true } },
    grass: { list: 'grassList', hp: 1, yield: { herbs: 1 }, bonusChance: { wheatSeeds: 0.5 }, regrow: 'forest', work: { seconds: 1.5 } },
    berry_bush: { list: 'berryBushes', blocksArrows: true, hp: 1, yield: { berries: 2 }, regrow: 'forest', work: { seconds: 2.0 } },
    farm: { list: 'farmPlots', yield: { wheat: 4, wheatSeeds: 1 }, work: { seconds: 2.5 } },
    // boars are hunted rather than worked (see huntBoar); this is what one gives.
    // wary: how close a settler can get before a calm boar bolts (see boars.forEach in update()).
    boar: { list: 'boars', hp: 40, yield: { rawMeat: 6, leather: 2 }, clearsPath: true,
      // wary: backs off from a settler this close, at waryFleeSpeed (slower than settlers, so it can be
      // caught); fleeSpeed: its sprint once it's actually hit
      wary: 100, waryFleeSpeed: 0.6, fleeSpeed: 1.35,
      // a kill is butchered where it lies for butcherSeconds; a hit bleeds it, and now and then (dungChance)
      // the scared boar leaves dung
      butcherSeconds: 2, dungChance: 0.12 }
  },

  // apple trees: a rare kind of tree (share of the map's trees, picked by tile, not rand). Woodcutters only
  // fell one the player marked while it had no apples. Every growSeconds it bears apples, which workers
  // with no tool pick (pickSeconds) for `yield`, with bonusChance of an apple sapling.
  appleTrees: { share: 0.1, growSeconds: 45, pickSeconds: 2, yield: { apples: 3 }, bonusChance: { appleSaplings: 0.5 },
    fellBonusChance: { appleSaplings: 0.5 } }, // felled: an apple sapling instead of an ordinary one

  map: {
    lakes: { min: 1, max: 4 },
    lakeWidth: { min: 3, max: 8 },
    lakeHeight: { min: 3, max: 8 },
    lakeMinDistance: { min: 1, max: 3 },

    deserts: { min: 0, max: 2 },
    desertRadiusX: { min: 3, max: 5 },
    desertRadiusY: { min: 2, max: 4 },
    desertCactus: { min: 4, max: 8 },
    desertPebbles: { min: 3, max: 7 },

    // forests: centres placed apart; each gets forestTrees trees within forestRadius tiles
    forests: { min: 3, max: 5 },
    forestTrees: { min: 7, max: 12 },
    forestRadius: 3,
    // share of grass, berry bushes and sticks that spawn (and grow back) in forests
    forestUndergrowthShare: 0.7,
    // lone trees outside forests
    trees: { min: 6, max: 10 },
    boulders: { min: 12, max: 18 },
    // small piles of boulders on touching tiles, in addition to the scattered ones
    boulderPiles: { min: 1, max: 3 },
    boulderPileSize: { min: 3, max: 5 },
    // seconds before a harvested resource grows back somewhere
    respawnDelay: { min: 30, max: 60 },
    oreRespawnDelay: { min: 60, max: 120 },
    grass: { min: 12, max: 20 },
    berryBushes: { min: 6, max: 10 },
    sticks: { min: 12, max: 18 },
    pebbles: { min: 10, max: 18 },

    // ore spawners sit inside natural rock; ores grow within oreSpawnerRadius tiles of them
    ironSpawners: { min: 1, max: 2 },
    coalSpawners: { min: 1, max: 2 },
    orePerSpawner: { min: 4, max: 6 },
    oreSpawnerRadius: 3,

    boars: { min: 3, max: 8 },

    rockClusters: { min: 1, max: 20 },
    rockClusterWidth: { min: 1, max: 10 },
    rockClusterHeight: { min: 1, max: 10 }
  }
};
