const GAME_CONFIG = {
  resources: {
    // food: ready to eat (berries, apples, and anything cooked); the raw kinds need a campfire (cooking)
    food: { id: 'food', icon: '🍞', type: 'resource' },
    rawMeat: { id: 'rawMeat', icon: '🥩', type: 'resource' },
    rawFish: { id: 'rawFish', icon: '🐟', type: 'resource' },
    wheat: { id: 'wheat', icon: '🌽', type: 'resource' },
    wood: { id: 'wood', icon: '🪵', type: 'resource' },
    stone: { id: 'stone', icon: '🪨', type: 'resource' },
    coal: { id: 'coal', icon: '⚫', type: 'resource' },
    ironOre: { id: 'ironOre', icon: '⛏️', type: 'resource' },
    iron: { id: 'iron', icon: '🔩', type: 'resource' },
    leather: { id: 'leather', icon: '🟫', type: 'resource' },
    arrows: { id: 'arrows', icon: '🏹', type: 'resource' },
    wheatSeeds: { id: 'wheatSeeds', icon: '🌾', type: 'resource' },
    saplings: { id: 'saplings', icon: '🌱', type: 'resource' },
    herbs: { id: 'herbs', icon: '🍃', type: 'resource' },
    worms: { id: 'worms', icon: '🪱', type: 'resource' },
    appleSaplings: { id: 'appleSaplings', icon: '🍎', type: 'resource' }
  },
  // how the HUD groups resources: a tile per group with its total, tapped to show what's in it. A group
  // of one shows as that resource; resources in no group get their own tile.
  resourceGroups: [
    { id: 'food', members: ['food'] },
    { id: 'raw', icon: '🥩', members: ['rawMeat', 'rawFish', 'wheat'] },
    { id: 'plants', icon: '🌱', members: ['wheatSeeds', 'saplings', 'appleSaplings', 'herbs'] },
    { id: 'materials', icon: '🪵', members: ['wood', 'stone', 'coal', 'ironOre', 'iron', 'leather'] },
    { id: 'supplies', icon: '🏹', members: ['arrows', 'worms'] }
  ],

  // family: axe / pickaxe / rod — what it can gather (see mapResources `tool`).
  // combatDamage / huntDamage: what an unarmed settler carrying it hits enemies / boars for.
  tools: {
    axe: { id: 'axe', icon: '🪓', cost: { wood: 5, stone: 5 }, family: 'axe', combatDamage: 15, huntDamage: 16 },
    pickaxe: { id: 'pickaxe', icon: '⛏️', cost: { wood: 5, stone: 7 }, family: 'pickaxe', combatDamage: 10, huntDamage: 15 },
    iron_axe: { id: 'iron_axe', icon: '🔩', cost: {  wood: 5, iron: 5 }, family: 'axe', combatDamage: 18, huntDamage: 22 },
    iron_pickaxe: { id: 'iron_pickaxe', icon: '🔩', cost: {  wood: 5, iron: 7 }, family: 'pickaxe', combatDamage: 13, huntDamage: 21 },
    rod: { id: 'rod', icon: '🎣', cost: { wood: 10, wheatSeeds: 5 }, family: 'rod', combatDamage: 6, huntDamage: 13 },
    // farmers: plant the farm zones (see farming) and harvest ripe wheat
    // medics: heal wounded settlers during attacks (see medic), gather grass for herbs otherwise
    medbag: { id: 'medbag', icon: '💼', cost: { leather: 3, herbs: 2 }, family: 'medic', combatDamage: 4, huntDamage: 4 },
    hoe: { id: 'hoe', icon: '🌿', cost: { wood: 5, stone: 2 }, family: 'hoe', combatDamage: 8, huntDamage: 8 }
  },
  // family: club / sword / spear / bow — how it's drawn and used (bows shoot arrows).
  // combat: damage per hit, range of a hit, cooldown (s) between hits, approach: how close the settler
  //   walks to an enemy before striking (bow: shooting distance), tentReach: same for enemy tents;
  //   bows also: projectileSpeed, projectileLife (ticks).
  // hunt: the same against boars (range, damage, cooldown).
  // Fists (and a club when hunting) hit with the tool the settler carries (tools' combatDamage /
  // huntDamage), bare hands otherwise. settlerTypes' damageMultiplier applies on top.
  weapons: {
    fist: { id: 'fist', icon: '✊', cost: {},
      combat: { damage: 6, range: 28, cooldown: 0.7, approach: 22, tentReach: 25 }, hunt: { damage: 5, range: 28, cooldown: 0.6 } },
    club: { id: 'club', icon: '🏏', cost: { wood: 4 }, family: 'club',
      combat: { damage: 10, range: 35, cooldown: 0.6, approach: 22, tentReach: 25 }, hunt: { range: 28, cooldown: 0.6 } },
    sword: { id: 'sword', icon: '🗡️', cost: { wood: 6, stone: 3 }, family: 'sword',
      combat: { damage: 20, range: 42, cooldown: 0.4, approach: 22, tentReach: 25 }, hunt: { damage: 32, range: 42, cooldown: 0.7 } },
    spear: { id: 'spear', icon: '🍢', cost: { wood: 10, stone: 5 }, family: 'spear',
      combat: { damage: 25, range: 65, cooldown: 0.7, approach: 45, tentReach: 25 }, hunt: { damage: 22, range: 65, cooldown: 0.9 } },
    iron_sword: { id: 'iron_sword', icon: '🔩', cost: { wood: 6, iron: 3 }, family: 'sword',
      combat: { damage: 30, range: 42, cooldown: 0.4, approach: 22, tentReach: 25 }, hunt: { damage: 40, range: 42, cooldown: 0.7 } },
    iron_spear: { id: 'iron_spear', icon: '🔩', cost: { wood: 10, iron: 5 }, family: 'spear',
      combat: { damage: 40, range: 65, cooldown: 0.7, approach: 45, tentReach: 25 }, hunt: { damage: 28, range: 65, cooldown: 0.9 } },
    bow: { id: 'bow', icon: '🏹', cost: { wood: 15, leather: 5 }, family: 'bow',
      combat: { damage: 30, cooldown: 0.8, approach: 140, tentReach: 140, projectileSpeed: 4.5, projectileLife: 80 }, hunt: { range: 140 } }
  },
  // tab: which tab of the bottom panel its button goes in: 'build' (default) or 'farming'.
  // Arrows stop at buildings, except arrowsPass ones; towerArrowsPass ones only stop arrows shot from the ground.
  buildings: {
    wall_wood: { id: 'wall_wood', icon: '🪵', cost: { wood: 5 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 }, towerArrowsPass: true },
    wall_stone: { id: 'wall_stone', icon: '🪨', cost: { stone: 5 }, demolishRefund: { stone: 3 }, build: { maxProgress: 120, hp: 300 }, towerArrowsPass: true },
    // trap: every unit stepping onto it takes `damage`; it breaks after `uses` steps. Settlers walk
    // around it; enemies too, unless there's no other way (then it's cheaper for them than a wall)
    spikes: { id: 'spikes', icon: '🔺', cost: { wood: 6, iron: 2 }, build: { maxProgress: 40, trap: { damage: 25, uses: 5 } }, arrowsPass: true },
    door: { id: 'door', icon: '🚪', cost: { wood: 6 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 }, towerArrowsPass: true },
    // tent: +population to the limit; settlers heal at it (healPerSecond), workers mend it (repairPerSecond)
    tent: { id: 'tent', icon: '🏕️', cost: { wood: 10, leather: 3 }, demolishRefund: { wood: 5 }, population: 3, healPerSecond: 20, repairPerSecond: 15, build: { maxProgress: 70, hp: 80 } },
    campfire: { id: 'campfire', icon: '🔥', cost: { wood: 5 }, build: { maxProgress: 40, hp: 60, campfire: true }, arrowsPass: true },
    smelter: { id: 'smelter', icon: '🔥', cost: { wood: 15, stone: 10 }, build: { maxProgress: 100, hp: 160,
      // holds at most maxOre ore and maxCoal coal; one ore + one coal make one iron every `seconds`, up to
      // maxIron waiting to be picked up. One settler at a time brings it ore/coal, one takes its iron.
      smelter: { maxOre: 6, maxCoal: 6, maxIron: 6, seconds: 4 } } },
    watchtower: { id: 'watchtower', icon: '🗼', cost: { wood: 25, stone: 20 }, demolishRefund: { wood: 12, stone: 10 }, build: { maxProgress: 140, hp: 220, tower: { capacity: 1, minEnemies: 2, range: 320, arrowCapacity: 12, damage: 18, cooldown: 1.2, projectileSpeed: 4.5 } } },
    wheat: { id: 'wheat', icon: '🌾', cost: { wheatSeeds: 1 }, build: { maxProgress: 40 }, tab: 'farming', arrowsPass: true },
    sapling: { id: 'sapling', icon: '🌱', cost: { saplings: 1 }, build: { maxProgress: 40 }, tab: 'farming', arrowsPass: true },
    apple_sapling: { id: 'apple_sapling', icon: '🍎', cost: { appleSaplings: 1 }, build: { maxProgress: 40 }, tab: 'farming', arrowsPass: true }
  },
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
  // reward: added to the stock when it dies. Waves spawn kinds in this order.
  enemies: {
    raider_club: { id: 'raider_club', hp: 50, speed: 0.95, damage: 10, reward: { food: 1 }, weapon: 'club',
      type: 'normal', radius: 10, waveKey: 'club', buildsTents: true, reach: 6, siege: { buildings: 10, resources: 2 } },
    raider: { id: 'raider', hp: 70, speed: 0.9, damage: 20, reward: { food: 1 }, weapon: 'sword',
      type: 'normal', radius: 10, waveKey: 'raider', reach: 12, siege: { buildings: 10, resources: 2 } },
    brute: { id: 'brute', hp: 120, speed: 0.7, damage: 25, reward: { food: 2 }, weapon: 'spear',
      type: 'big', radius: 18, waveKey: 'brute', reach: 24, siege: { buildings: 25, resources: 4 }, splash: { radius: 70, share: 0.6 } },
    raider_archer: { id: 'raider_archer', hp: 60, speed: 0.8, damage: 30, reward: { food: 1 }, weapon: 'bow',
      type: 'archer', radius: 11, waveKey: 'archer', reach: 6, siege: { buildings: 10, resources: 2 },
      ranged: { range: 180, keepAway: 150, cooldown: 1.5, arrowSpeed: 3.8, arrowLife: 75 },
      quiver: { arrows: 12, tentStock: 12, refill: 6, melee: 'raider_club' } }
  },

  // enemy tents: builders put them up near the map edge; each summons extra enemies during a wave
  enemyTents: {
    hp: 60, buildWork: 180, buildRate: 20, buildDistance: 28,
    summonEnemy: 'raider', summonsPerWave: 2, summonInterval: 5, maxEnemies: 60
  },

  // wave size: attackGroups counts grow by growthPerDifficulty every wavesPerDifficulty waves; each wave
  // sends newTents (min-max) tent builders, up to difficulty + 1 tents on the map, never more than maxTents
  waveScaling: { wavesPerDifficulty: 5, growthPerDifficulty: 0.5, maxTents: 8, newTents: { min: 1, max: 2 } },
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
  // hit (possessed settler): hp per hit by tool (default otherwise); none — taken at once.
  mapResources: {
    tree: { list: 'trees', blocksArrows: true, tool: 'axe', hp: 3, yield: { wood: 3 }, bonusChance: { saplings: 0.5 }, regrow: 'forest', forestShare: 1,
      work: { chop: { normal: 1.5, big: 2.5 }, toolBonus: { iron_axe: 1.9 } }, hit: { default: 1, iron_axe: 1.5 } },
    cactus: { list: 'cacti', blocksArrows: true, tool: 'axe', hp: 2, yield: { wood: 1 }, regrow: 'nearby',
      work: { chop: { normal: 1.5, big: 2.5 }, toolBonus: { iron_axe: 1.9 } }, hit: { default: 1, iron_axe: 1.5 } },
    boulder: { list: 'boulders', blocksArrows: true, tool: 'pickaxe', hp: 4, yield: { stone: 3 }, regrow: 'anywhere',
      work: { chop: { normal: 1.5, big: 2.5 } }, hit: { default: 1, iron_pickaxe: 1.5 } },
    iron_ore: { list: 'ironOres', blocksArrows: true, tool: 'pickaxe', hp: 5, yield: { ironOre: 3 }, regrow: 'spawner',
      work: { seconds: { pickaxe: 3.0, iron_pickaxe: 2.0 } }, hit: { default: 1, iron_pickaxe: 1.5 } },
    coal_ore: { list: 'coalOres', blocksArrows: true, tool: 'pickaxe', hp: 5, yield: { coal: 3 }, regrow: 'spawner',
      work: { seconds: { pickaxe: 2.5, iron_pickaxe: 1.7 } }, hit: { default: 1, iron_pickaxe: 1.5 } },
    natural_rock: { list: 'naturalRocks', blocksArrows: true, tool: 'pickaxe', markOnly: true, hp: 100, yield: { stone: 15 }, clearsPath: true,
      work: { drain: { pickaxe: 25, iron_pickaxe: 38 } }, hit: { default: 25 } },
    stick: { list: 'sticks', hp: 1, yield: { wood: 1 }, regrow: 'forest', work: { pickup: true } },
    pebble: { list: 'pebbles', hp: 1, yield: { stone: 1 }, regrow: 'anywhere', work: { pickup: true } },
    grass: { list: 'grassList', hp: 1, yield: { herbs: 1 }, bonusChance: { wheatSeeds: 0.5 }, regrow: 'forest', work: { seconds: 1.5 } },
    berry_bush: { list: 'berryBushes', blocksArrows: true, hp: 1, yield: { food: 2 }, regrow: 'forest', work: { seconds: 2.0 } },
    farm: { list: 'farmPlots', yield: { wheat: 4, wheatSeeds: 1 }, work: { seconds: 2.5 } },
    // boars are hunted rather than worked (see huntBoar); this is what one gives.
    // wary: how close a settler can get before a calm boar bolts (see boars.forEach in update()).
    boar: { list: 'boars', hp: 40, yield: { rawMeat: 6, leather: 2 }, clearsPath: true,
      // wary: backs off from a settler this close, at waryFleeSpeed (slower than settlers, so it can be
      // caught); fleeSpeed: its sprint once it's actually hit
      wary: 100, waryFleeSpeed: 0.6, fleeSpeed: 1.35 }
  },

  // fishers with a rod at a marked spot: one catch every `seconds`, each uses `bait` from the stock
  // (a possessed settler clicking water next to it gets a catch at once, without rod or bait)
  // farm zones the player paints in the Farming tab: farmers (hoe) plant the empty tiles with the crop,
  // which is the building of that id (its cost is the seed), taking plantSeconds per tile
  farming: { plantSeconds: 1.5, crops: { wheat: 'wheat', sapling: 'sapling', apple: 'apple_sapling' } },

  // medics (medbag): during an attack, heal the nearest wounded settler (soldiers first) within `range`,
  // healPerHerb hp for one herb every healSeconds. Herbs come from the bag, filled at the town hall with
  // up to bagSize from the stock.
  medic: { healPerHerb: 30, healSeconds: 1.2, range: 26, bagSize: 5 },

  // blood on a hurt unit, under it, and on the melee weapon that hit it: it starts to fade after
  // fadeAfter seconds over fadeSeconds, except on a unit at woundedShare of its hp or less
  blood: { fadeAfter: 10, fadeSeconds: 3, woundedShare: 0.25, maxSplats: 150 },

  // a fallen settler or enemy leaves a grey corpse where it fell, gone after `seconds` unless used
  corpses: { seconds: 60 },

  // bait: the first of these the stock can pay for, per catch (worms first)
  fishing: { seconds: 3, catch: { rawFish: 2 }, bait: [{ worms: 1 }, { wheatSeeds: 1 }, { wheat: 1 }] },

  // worms turn up on a corpse once it has lain for `after` of its time; fishers pick them (1, or 2 off a
  // big body) and carry them home as bait
  worms: { after: 0.5, perCorpse: 1, perBigCorpse: 2 },

  // campfires: while there's raw food in the stock, a worker with no tool (one per campfire) cooks it.
  // It carries fuel from the town hall to the fire (one unit lasts `fuel[resource]` pieces, coal first),
  // fetches up to `batch` raw pieces, cooks each in `seconds` into `makes` food, and carries the food home.
  cooking: { seconds: 1.5, batch: 5, raw: ['rawMeat', 'rawFish', 'wheat'], makes: 1, fuel: { coal: 5, wood: 5 } },

  // ---- Colony

  start: {
    // stock at the start of a game (ids from `resources`)
    resources: { wood: 30, stone: 20, coal: 0, ironOre: 0, iron: 0, leather: 0, arrows: 0, food: 25, wheatSeeds: 3, saplings: 0 },
    // population limit before tents (each tent adds buildings.tent.population)
    population: 5
  },

  // kinds of settlers: stats, how many population slots they take, damage multiplier, and what hiring / upgrading costs.
  // carryLoads: how many gathered loads (one tree, one boulder, one boar...) it carries before going home
  settlerTypes: {
    normal: { id: 'normal', icon: '👨‍🌾', hp: 100, speed: 1.0, radius: 11, visualRadius: 11, population: 1, damageMultiplier: 1, carryLoads: 1, hireCost: { food: 15 } },
    big: { id: 'big', icon: '🧌', hp: 250, speed: 0.7, radius: 13, visualRadius: 18, population: 2, damageMultiplier: 1.8, carryLoads: 2, hireCost: { food: 30, wood: 15 }, upgradeCost: { food: 15, wood: 15 } }
  },

  // worn gear, paid for with its button and picked up at the town hall (the settler walks there to
  // put it on, and to take it off: the cost comes back). backpack: a worker carries extraLoads more
  // loads (never an archer: the quiver is on its back). armor: +hpBonus, damageReduction off every hit,
  // melee soldiers first. shield: melee soldiers only, damageReduction off every hit, on top of armour.
  gear: {
    backpack: { id: 'backpack', icon: '🎒', cost: { leather: 5 }, extraLoads: 1 },
    shield: { id: 'shield', icon: '🔰', cost: { wood: 6, iron: 2 }, damageReduction: 0.25 },
    armor: { id: 'armor', icon: '🛡️', cost: { iron: 8 }, hpBonus: 50, damageReduction: 0.35 },
    // farmers (hoe): fills at water for `charges` crops; a watered crop grows growthFactor times as fast
    wateringCan: { id: 'wateringCan', icon: '🚿', cost: { wood: 3, iron: 1 }, charges: 3, growthFactor: 2 }
  },

  // apple trees: a rare kind of tree (share of the map's trees, picked by tile, not rand). Woodcutters only
  // fell one the player marked while it had no apples. Every growSeconds it bears apples, which workers
  // with no tool pick (pickSeconds) for `yield`, with bonusChance of an apple sapling.
  appleTrees: { share: 0.1, growSeconds: 45, pickSeconds: 2, yield: { food: 3 }, bonusChance: { appleSaplings: 0.5 },
    fellBonusChance: { appleSaplings: 0.5 } }, // felled: an apple sapling instead of an ordinary one

  // crafted at the town hall into the stock
  recipes: {
    arrows: { id: 'arrows', icon: '🏹', cost: { wood: 3, stone: 1 }, produces: { arrows: 6 } }
  },

  // what one repair step costs and restores (buildings: one step per `interval` seconds per worker).
  // Buildings are repaired when the player orders it (tap it, or Repair all). Buildings without their own entry use `buildings`: costShare of what the building
  // cost (rounded up) for hpShare of its hp. Tents mend themselves for free (tent.repairPerSecond).
  repairs: {
    townHall: { cost: { wood: 15, stone: 15 }, hp: 35 },
    buildings: { costShare: 0.2, hpShare: 0.25, interval: 1 }
  },


attackGroups: [
  // Базовые шаблоны отрядов (соответствуют стартовой сложности)
  { club: 4, raider: 4, brute: 0, archer: 0 }, // Толпа ближнего боя
  { club: 4, raider: 2, brute: 1, archer: 1 }, // Толпа с поддержкой
  { club: 3, raider: 2, brute: 0, archer: 3 }, // Упор на лучников
  { club: 3, raider: 2, brute: 2, archer: 1 }, // Упор на брутов
  { club: 2, raider: 2, brute: 2, archer: 2 }  // Сбалансированный смешанный отряд
],

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

globalThis.GAME_CONFIG = GAME_CONFIG;
