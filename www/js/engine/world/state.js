// The state of the game being played: one object, `game`. Its mode and clocks, the map's size, what's
// selected, and every list of things on the map.

export const TILE_SIZE = 30;
export const BORDER_MARGIN = 2;
// the world's size in tiles, picked in the main menu (setWorldSize); the canvas itself follows the screen
// (see fitCanvasToScreen)
export const DEFAULT_MAP_TILES = 40;

/** @type {import('./types.js').Game} */
export const game = {
  gameMode: 'endless',      // endless / battle / editor (modes/) / menu (the world behind the main menu, modes/menu/menu.world.js)
  gameStarted: false,
  isPaused: false,
  gameDifficulty: 'normal', // GAME_CONFIG.difficulty key, set from the menu
  mapSettings: { cols: DEFAULT_MAP_TILES, rows: DEFAULT_MAP_TILES }, // set from the menu, used by resetGame
  customMap: null,          // a saved map (modes/editor) Endless plays instead of a generated one
  worldSeed: null,          // the world's seed and its random sequence (rng.js)
  // the map's size, in tiles and in world units (setWorldSize)
  COLS: DEFAULT_MAP_TILES,
  ROWS: DEFAULT_MAP_TILES,
  WORLD_WIDTH: DEFAULT_MAP_TILES * TILE_SIZE,
  WORLD_HEIGHT: DEFAULT_MAP_TILES * TILE_SIZE,
  // the clocks
  waveInterval: 90,
  waveTimer: 90,
  waveNum: 1,
  boarRespawnTimer: 25,
  pathTick: 0,              // game ticks, for short-lived per-settler caches
  // the player's choices and the soldiers' plan
  buildMode: 'interact',
  selectedSettler: null,
  defensePlan: null,        // squads and their posts (getDefensePlan)
  /** @type {Object<string, number>} */
  armory: {},           // tools, weapons and gear in store, by '<category>:<id>' (loot, #210)
  // the things on the map (WORLD_LISTS)
  settlers: [],
  trees: [],
  cacti: [],
  boulders: [],
  grassList: [],
  berryBushes: [],
  farmPlots: [],
  farmZones: [],        // { x, y, crop } tiles the player marked for farmers to plant, see tendFarmZones()
  blightZones: [],      // { x, y, done, clearing } tiles the player marked for blight, see necromancy()
  naturalRocks: [],
  waterTiles: [],
  desertTiles: [],
  desertRegion: null,
  beachTiles: [],       // sand on part of each lake's shore; only drawn, see placeBeaches()
  sticks: [],
  pebbles: [],
  loot: [],             // { x, y, yield, items } piles fallen enemies dropped (#210)
  piles: [],            // { x, y, type, amount } stock on the ground by a full storage (#248, storage.stores.js)
  ironOres: [],
  coalOres: [],
  boars: [],
  blueprints: [],
  buildings: [],
  craftOrders: [],      // { key, category, id, crafter, stage, progress, for, yields? } things being made (#211)
  armorOrder: null,
  enemies: [],
  enemyTents: [],
  enemyTentBlueprints: [],
  projectiles: [],
  foodMix: {},          // how much of stock.food is each GAME_CONFIG.foodKinds kind, see addFood()
  bloodSplats: [],      // { x, y, r, age, kind } blood on the ground (bleed) and footprints (trackFootprints)
  dung: [],             // { x, y, age, by, byLeft } see relieve()
  corpses: [],          // { x, y, radius, side: 'settler' | 'enemy', kind, age }, see addCorpse()
  waveSize: 0,          // how many the last wave brought (morale: a wave that's lost most of them runs, #207)
  waveRouted: false,
  enemyArrowStock: 0,   // arrows in enemy tents, shared by all enemy archers
  /** @type {{ armor: boolean, shield: boolean }} */
  playerGear: { armor: false, shield: false }, // armour / a shield the player has made: waves wear them too (#203)
  forests: [],          // forest centres, see placeForests()
  pendingRespawns: []   // harvested resources waiting to grow back, see scheduleRespawn()
};

// the fields that are the map's contents (saved with a game, endless.saves.js): settlers to pendingRespawns
export const WORLD_LISTS = Object.keys(game).slice(Object.keys(game).indexOf('settlers'));

export const BOAR_LIMIT = 5;
export const TOWN_HALL_HP = 100;
/** @type {import('./types.js').TownHall} */
/** @type {import('./types.js').TownHall} */
export const townHall = { x: game.WORLD_WIDTH / 2, y: game.WORLD_HEIGHT / 2, radius: 32, hp: TOWN_HALL_HP, maxHp: TOWN_HALL_HP, repairRequested: false, store: {} };
