const GAME_CONFIG = {
  resources: {
    food: { id: 'food', label: 'Еда', icon: '🍞', type: 'resource' },
    wood: { id: 'wood', label: 'Дерево', icon: '🪵', type: 'resource' },
    stone: { id: 'stone', label: 'Камень', icon: '🪨', type: 'resource' },
    coal: { id: 'coal', label: 'Уголь', icon: '⚫', type: 'resource' },
    ironOre: { id: 'ironOre', label: 'Руда', icon: '⛏️', type: 'resource' },
    iron: { id: 'iron', label: 'Железо', icon: '🔩', type: 'resource' },
    leather: { id: 'leather', label: 'Кожа', icon: '🟫', type: 'resource' },
    arrows: { id: 'arrows', label: 'Стрелы', icon: '🏹', type: 'resource' },
    armor: { id: 'armor', label: 'Броня', icon: '🛡️', type: 'resource' },
    wheatSeeds: { id: 'wheatSeeds', label: 'Семена', icon: '🌾', type: 'resource' },
    saplings: { id: 'saplings', label: 'Саженцы', icon: '🌱', type: 'resource' }
  },
  tools: {
    axe: { id: 'axe', label: 'Топор', icon: '🪓', cost: { wood: 5, stone: 5 } },
    pickaxe: { id: 'pickaxe', label: 'Кирка', icon: '⛏️', cost: { wood: 5, stone: 7 } },
    iron_axe: { id: 'iron_axe', label: 'Железный топор', icon: '🔩', cost: {  wood: 5, iron: 5 } },
    iron_pickaxe: { id: 'iron_pickaxe', label: 'Железная кирка', icon: '🔩', cost: {  wood: 5, iron: 7 } },
    rod: { id: 'rod', label: 'Удочка', icon: '🎣', cost: { wood: 10, wheatSeeds: 5 } }
  },
  weapons: {
    fist: { id: 'fist', label: 'Кулак', icon: '✊', cost: {} },
    club: { id: 'club', label: 'Дубина', icon: '🏏', cost: { wood: 4 } },
    sword: { id: 'sword', label: 'Меч', icon: '🗡️', cost: { wood: 6, stone: 3 } },
    spear: { id: 'spear', label: 'Копье', icon: '🍢', cost: { wood: 10, stone: 5 } },
    iron_sword: { id: 'iron_sword', label: 'Железный меч', icon: '🔩', cost: { wood: 6, iron: 3 } },
    iron_spear: { id: 'iron_spear', label: 'Железное копье', icon: '🔩', cost: { wood: 10, iron: 5 } },
    bow: { id: 'bow', label: 'Лук', icon: '🏹', cost: { wood: 15, leather: 5 } }
  },
  buildings: {
    wall_wood: { id: 'wall_wood', label: 'Деревянная стена', icon: '🪵', cost: { wood: 5 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 } },
    wall_stone: { id: 'wall_stone', label: 'Каменная стена', icon: '🪨', cost: { stone: 5 }, demolishRefund: { stone: 3 }, build: { maxProgress: 120, hp: 300 } },
    door: { id: 'door', label: 'Дверь', icon: '🚪', cost: { wood: 6 }, demolishRefund: { wood: 3 }, build: { maxProgress: 80, hp: 150 } },
    // tent: +population to the limit; settlers heal at it (healPerSecond), workers mend it (repairPerSecond)
    tent: { id: 'tent', label: 'Палатка', icon: '🏕️', cost: { wood: 10, leather: 3 }, demolishRefund: { wood: 5 }, population: 3, healPerSecond: 20, repairPerSecond: 15, build: { maxProgress: 70, hp: 80 } },
    smelter: { id: 'smelter', label: 'Плавильня', icon: '🔥', cost: { wood: 15, stone: 10 }, build: { maxProgress: 100, hp: 160, smelter: true } },
    watchtower: { id: 'watchtower', label: 'Сторожевая башня', icon: '🗼', cost: { wood: 25, stone: 20 }, demolishRefund: { wood: 12, stone: 10 }, build: { maxProgress: 140, hp: 220, tower: { capacity: 1, minEnemies: 2, range: 320, arrowCapacity: 12, damage: 18, cooldown: 1.2, projectileSpeed: 4.5 } } },
    wheat: { id: 'wheat', label: 'Пшеница', icon: '🌾', cost: { wheatSeeds: 1 }, build: { maxProgress: 40 } },
    sapling: { id: 'sapling', label: 'Саженец', icon: '🌱', cost: { saplings: 1 }, build: { maxProgress: 40 } }
  },
  enemies: {
    raider_club: { id: 'raider_club', label: 'Дикарь', hp: 50, speed: 0.95, damage: 10, reward: { food: 1 }, weapon: 'club' },
    raider: { id: 'raider', label: 'Разбойник', hp: 70, speed: 0.9, damage: 20, reward: { food: 1 }, weapon: 'sword' },
    raider_archer: { id: 'raider_archer', label: 'Лучник', hp: 60, speed: 0.8, damage: 30, reward: { food: 1 }, weapon: 'bow' },
    brute: { id: 'brute', label: 'Громила', hp: 120, speed: 0.7, damage: 25, reward: { food: 2 }, weapon: 'spear' }
  },
  // ---- Colony

  start: {
    // stock at the start of a game (ids from `resources`)
    resources: { wood: 30, stone: 20, coal: 0, ironOre: 0, iron: 0, leather: 0, arrows: 0, armor: 0, food: 25, wheatSeeds: 3, saplings: 0 },
    // population limit before tents (each tent adds buildings.tent.population)
    population: 5
  },

  // kinds of settlers: stats, how many population slots they take, and what hiring / upgrading costs
  settlerTypes: {
    normal: { id: 'normal', label: 'Рабочий', icon: '👨‍🌾', hp: 100, speed: 1.0, radius: 11, visualRadius: 11, population: 1, hireCost: { food: 15 } },
    big: { id: 'big', label: 'Богатырь', icon: '🧌', hp: 250, speed: 0.7, radius: 13, visualRadius: 18, population: 2, hireCost: { food: 30, wood: 15 }, upgradeCost: { food: 15, wood: 15 } }
  },

  // crafted at the town hall into the stock
  recipes: {
    arrows: { id: 'arrows', label: 'Стрелы', icon: '🏹', cost: { wood: 3, stone: 1 }, produces: { arrows: 6 } },
    armor: { id: 'armor', label: 'Броня', icon: '🛡️', cost: { iron: 8 }, produces: { armor: 1 }, hpBonus: 50 }
  },

  // what one repair step costs and restores (watchtower: one step per `interval` seconds)
  repairs: {
    townHall: { cost: { wood: 15, stone: 15 }, hp: 35 },
    watchtower: { cost: { wood: 10, stone: 10 }, hp: 35, interval: 1 }
  },

  waves: [
  { enemy: 'raider_club', type: 'normal', radius: 10, buildsTents: true },
  { enemy: 'raider', type: 'normal', radius: 10 },
  { enemy: 'brute', type: 'big', radius: 18 },
  { enemy: 'raider_archer', type: 'archer', radius: 11 }
  ],

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
