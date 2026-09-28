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
    wall_wood: { id: 'wall_wood', label: 'Деревянная стена', icon: '🪵', cost: { wood: 5 }, build: { maxProgress: 80, hp: 150 } },
    wall_stone: { id: 'wall_stone', label: 'Каменная стена', icon: '🪨', cost: { stone: 5 }, build: { maxProgress: 120, hp: 300 } },
    door: { id: 'door', label: 'Дверь', icon: '🚪', cost: { wood: 6 }, build: { maxProgress: 80, hp: 150 } },
    tent: { id: 'tent', label: 'Палатка', icon: '🏕️', cost: { wood: 10, leather: 3 }, build: { maxProgress: 70, hp: 80 } },
    smelter: { id: 'smelter', label: 'Плавильня', icon: '🔥', cost: { wood: 15, stone: 10 }, build: { maxProgress: 100, hp: 160, smelter: true } },
    watchtower: { id: 'watchtower', label: 'Сторожевая башня', icon: '🗼', cost: { wood: 25, stone: 20 }, build: { maxProgress: 140, hp: 220, tower: { capacity: 1, minEnemies: 2, range: 320, arrowCapacity: 12, damage: 18, cooldown: 1.2, projectileSpeed: 4.5 } } },
    wheat: { id: 'wheat', label: 'Пшеница', icon: '🌾', cost: { wheatSeeds: 1 }, build: { maxProgress: 40 } },
    sapling: { id: 'sapling', label: 'Саженец', icon: '🌱', cost: { saplings: 1 }, build: { maxProgress: 40 } }
  },
  enemies: {
    raider_club: { id: 'raider_club', label: 'Дикарь', hp: 50, speed: 0.95, damage: 10, reward: { food: 1 }, weapon: 'club' },
    raider: { id: 'raider', label: 'Разбойник', hp: 70, speed: 0.9, damage: 20, reward: { food: 1 }, weapon: 'sword' },
    raider_archer: { id: 'raider_archer', label: 'Лучник', hp: 60, speed: 0.8, damage: 30, reward: { food: 1 }, weapon: 'bow' },
    brute: { id: 'brute', label: 'Громила', hp: 120, speed: 0.7, damage: 25, reward: { food: 2 }, weapon: 'spear' }
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

    trees: { min: 18, max: 26 },
    boulders: { min: 12, max: 18 },
    grass: { min: 12, max: 20 },
    berryBushes: { min: 6, max: 10 },
    sticks: { min: 12, max: 18 },
    pebbles: { min: 10, max: 18 },

    // ore spawners sit inside natural rock; ores grow within oreSpawnerRadius tiles of them
    ironSpawners: { min: 1, max: 2 },
    coalSpawners: { min: 1, max: 2 },
    orePerSpawner: { min: 4, max: 6 },
    oreSpawnerRadius: 3,
    resourceClusters: { min: 3, max: 5 },
    clusterTrees: { min: 4, max: 6 },
    clusterGrass: { min: 3, max: 5 },
    clusterBerryBushes: { min: 1, max: 3 },
    clusterPebbles: { min: 1, max: 3 },

    boars: { min: 3, max: 8 },

    rockClusters: { min: 1, max: 20 },
    rockClusterWidth: { min: 1, max: 10 },
    rockClusterHeight: { min: 1, max: 10 }
  }
};

globalThis.GAME_CONFIG = GAME_CONFIG;
