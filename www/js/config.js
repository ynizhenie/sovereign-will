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

  // ============================================================
  // Сложность 1 — волны 1-5
  // ============================================================
  [
    { club: 5, raider: 3, brute: 0, archer: 0 },
    { club: 6, raider: 4, brute: 1, archer: 0 },
    { club: 4, raider: 3, brute: 0, archer: 2 },
    { club: 4, raider: 5, brute: 2, archer: 1 },
    { club: 3, raider: 2, brute: 1, archer: 1 }
  ],

  // ============================================================
  // Сложность 2 — волны 6-10
  // ============================================================
  [
    { club: 10, raider: 7, brute: 0, archer: 0 },
    { club: 10, raider: 7, brute: 2, archer: 1 },
    { club: 8, raider: 6, brute: 0, archer: 4 },
    { club: 6, raider: 8, brute: 4, archer: 3 },
    { club: 7, raider: 5, brute: 2, archer: 2 }
  ],

  // ============================================================
  // Сложность 3 — волны 11-15
  // ============================================================
  [
    { club: 17, raider: 12, brute: 0, archer: 0 },
    { club: 17, raider: 10, brute: 3, archer: 2 },
    { club: 13, raider: 10, brute: 0, archer: 7 },
    { club: 10, raider: 13, brute: 7, archer: 3 },
    { club: 13, raider: 8, brute: 4, archer: 3 }
  ],

  // ============================================================
  // Сложность 4 — волны 16-20
  // ============================================================
  [
    { club: 29, raider: 19, brute: 0, archer: 0 },
    { club: 26, raider: 17, brute: 5, archer: 2 },
    { club: 20, raider: 16, brute: 0, archer: 12 },
    { club: 15, raider: 20, brute: 10, archer: 6 },
    { club: 21, raider: 14, brute: 7, archer: 4 }
  ],

  // ============================================================
  // Сложность 5 — волны 21-25
  // ============================================================
  [
    { club: 32, raider: 22, brute: 0, archer: 0 },
    { club: 30, raider: 18, brute: 6, archer: 3 },
    { club: 23, raider: 18, brute: 0, archer: 14 },
    { club: 17, raider: 23, brute: 11, archer: 7 },
    { club: 24, raider: 16, brute: 8, archer: 5 }
  ],

  // ============================================================
  // Сложность 6 — волны 26-30
  // ============================================================
  [
    { club: 35, raider: 23, brute: 0, archer: 0 },
    { club: 32, raider: 20, brute: 6, archer: 3 },
    { club: 25, raider: 20, brute: 0, archer: 14 },
    { club: 18, raider: 24, brute: 12, archer: 8 },
    { club: 26, raider: 17, brute: 8, archer: 6 }
  ],

  // ============================================================
  // Сложность 7 — волны 31-35
  // ============================================================
  [
    { club: 37, raider: 25, brute: 0, archer: 0 },
    { club: 34, raider: 21, brute: 7, archer: 3 },
    { club: 27, raider: 21, brute: 0, archer: 15 },
    { club: 20, raider: 26, brute: 13, archer: 7 },
    { club: 28, raider: 19, brute: 9, archer: 5 }
  ],

  // ============================================================
  // Сложность 8 — волны 36-40
  // ============================================================
  [
    { club: 40, raider: 26, brute: 0, archer: 0 },
    { club: 36, raider: 22, brute: 7, archer: 4 },
    { club: 28, raider: 22, brute: 0, archer: 16 },
    { club: 20, raider: 28, brute: 14, archer: 8 },
    { club: 29, raider: 20, brute: 10, archer: 6 }
  ],

  // ============================================================
  // Сложность 9 — волны 41-45
  // ============================================================
  [
    { club: 42, raider: 28, brute: 0, archer: 0 },
    { club: 38, raider: 23, brute: 7, archer: 5 },
    { club: 30, raider: 23, brute: 0, archer: 18 },
    { club: 22, raider: 30, brute: 15, archer: 7 },
    { club: 31, raider: 21, brute: 11, archer: 6 }
  ],

  // ============================================================
  // Сложность 10 — волны 46-50
  // ============================================================
  [
    { club: 44, raider: 30, brute: 0, archer: 0 },
    { club: 40, raider: 24, brute: 8, archer: 5 },
    { club: 31, raider: 25, brute: 0, archer: 19 },
    { club: 22, raider: 31, brute: 16, archer: 9 },
    { club: 33, raider: 22, brute: 11, archer: 7 }
  ],

  // ============================================================
  // Сложность 11 — волны 51-55
  // ============================================================
  [
    { club: 47, raider: 31, brute: 0, archer: 0 },
    { club: 41, raider: 26, brute: 8, archer: 6 },
    { club: 33, raider: 26, brute: 0, archer: 19 },
    { club: 23, raider: 32, brute: 16, archer: 10 },
    { club: 35, raider: 23, brute: 12, archer: 7 }
  ],

  // ============================================================
  // Сложность 12 — волны 56-60
  // ============================================================
  [
    { club: 50, raider: 33, brute: 0, archer: 0 },
    { club: 43, raider: 28, brute: 9, archer: 5 },
    { club: 35, raider: 27, brute: 0, archer: 21 },
    { club: 25, raider: 35, brute: 17, archer: 9 },
    { club: 37, raider: 25, brute: 13, archer: 7 }
  ],

  // ============================================================
  // Сложность 13 — волны 61-65
  // ============================================================
  [
    { club: 52, raider: 34, brute: 0, archer: 0 },
    { club: 46, raider: 29, brute: 9, archer: 5 },
    { club: 36, raider: 29, brute: 0, archer: 21 },
    { club: 26, raider: 36, brute: 18, archer: 10 },
    { club: 39, raider: 26, brute: 13, archer: 7 }
  ],

  // ============================================================
  // Сложность 14 — волны 66-70
  // ============================================================
  [
    { club: 54, raider: 36, brute: 0, archer: 0 },
    { club: 48, raider: 31, brute: 9, archer: 5 },
    { club: 38, raider: 31, brute: 0, archer: 22 },
    { club: 27, raider: 38, brute: 19, archer: 10 },
    { club: 41, raider: 27, brute: 14, archer: 7 }
  ],

  // ============================================================
  // Сложность 15 — волны 71-75
  // ============================================================
  [
    { club: 56, raider: 38, brute: 0, archer: 0 },
    { club: 50, raider: 32, brute: 10, archer: 5 },
    { club: 40, raider: 32, brute: 0, archer: 23 },
    { club: 29, raider: 40, brute: 20, archer: 9 },
    { club: 43, raider: 29, brute: 14, archer: 7 }
  ],

  // ============================================================
  // Сложность 16 — волны 76-80
  // ============================================================
  [
    { club: 59, raider: 39, brute: 0, archer: 0 },
    { club: 52, raider: 34, brute: 10, archer: 5 },
    { club: 41, raider: 33, brute: 0, archer: 25 },
    { club: 30, raider: 42, brute: 21, archer: 9 },
    { club: 45, raider: 30, brute: 15, archer: 8 }
  ],

  // ============================================================
  // Сложность 17 — волны 81-85
  // ============================================================
  [
    { club: 61, raider: 41, brute: 0, archer: 0 },
    { club: 55, raider: 36, brute: 10, archer: 5 },
    { club: 43, raider: 34, brute: 0, archer: 26 },
    { club: 31, raider: 44, brute: 22, archer: 9 },
    { club: 46, raider: 31, brute: 15, archer: 8 }
  ],

  // ============================================================
  // Сложность 18 — волны 86-90
  // ============================================================
  [
    { club: 63, raider: 42, brute: 0, archer: 0 },
    { club: 57, raider: 37, brute: 11, archer: 5 },
    { club: 44, raider: 36, brute: 0, archer: 26 },
    { club: 32, raider: 46, brute: 22, archer: 9 },
    { club: 47, raider: 32, brute: 16, archer: 8 }
  ],

  // ============================================================
  // Сложность 19 — волны 91-95
  // ============================================================
  [
    { club: 65, raider: 43, brute: 0, archer: 0 },
    { club: 59, raider: 39, brute: 11, archer: 5 },
    { club: 46, raider: 37, brute: 0, archer: 27 },
    { club: 33, raider: 48, brute: 23, archer: 8 },
    { club: 49, raider: 32, brute: 16, archer: 10 }
  ],

  // ============================================================
  // Сложность 20 — волны 96-100
  // ============================================================
  [
    { club: 67, raider: 44, brute: 0, archer: 0 },
    { club: 60, raider: 40, brute: 11, archer: 5 },
    { club: 47, raider: 38, brute: 0, archer: 27 },
    { club: 35, raider: 48, brute: 23, archer: 9 },
    { club: 50, raider: 33, brute: 17, archer: 10 }
  ]

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

    ironVeins: { min: 1, max: 3 },
    coalVeins: { min: 1, max: 3 },
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
