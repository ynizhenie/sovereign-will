// The state of the game being played: one object, `game`. Its mode and clocks, the map's size, what's
// selected, and every list of things on the map. Each field is also reachable by its own name on
// window (for the tests and the console); the game's own code says game.x.

export const TILE_SIZE = 30;
export const BORDER_MARGIN = 2;
// the world's size in tiles, picked in the main menu (setWorldSize); the canvas itself follows the screen
// (see fitCanvasToScreen)
export const DEFAULT_MAP_TILES = 40;

export const game = {
  gameMode: 'endless',      // endless / battle (battle.js) / editor (editor.js) / menu (the world behind the main menu, menu-scene.js)
  gameStarted: false,
  isPaused: false,
  gameDifficulty: 'normal', // GAME_CONFIG.difficulty key, set from the menu
  mapSettings: { cols: DEFAULT_MAP_TILES, rows: DEFAULT_MAP_TILES }, // set from the menu, used by resetGame
  customMap: null,          // a saved map (editor.js) Endless plays instead of a generated one
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
  // the things on the map (WORLD_LISTS)
  settlers: [],
  trees: [],
  cacti: [],
  boulders: [],
  grassList: [],
  berryBushes: [],
  farmPlots: [],
  farmZones: [],        // { x, y, crop } tiles the player marked for farmers to plant, see tendFarmZones()
  blightZones: [],      // { x, y, done, clearing } tiles the player marked for blight, see necromancy() (#164, #186)
  naturalRocks: [],
  waterTiles: [],
  desertTiles: [],
  desertRegion: null,
  beachTiles: [],       // sand on part of each lake's shore; only drawn, see placeBeaches()
  sticks: [],
  pebbles: [],
  ironOres: [],
  coalOres: [],
  boars: [],
  blueprints: [],
  buildings: [],
  armorOrder: null,
  enemies: [],
  enemyTents: [],
  enemyTentBlueprints: [],
  projectiles: [],
  foodMix: {},          // how much of stock.food is each GAME_CONFIG.foodKinds kind, see addFood()
  bloodSplats: [],      // { x, y, r, age, kind } blood on the ground (bleed) and footprints (trackFootprints)
  dung: [],             // { x, y, age, by, byLeft } see relieve()
  corpses: [],          // { x, y, radius, side: 'settler' | 'enemy', kind, age }, see addCorpse()
  enemyArrowStock: 0,   // arrows in enemy tents, shared by all enemy archers
  forests: [],          // forest centres, see placeForests()
  pendingRespawns: []   // harvested resources waiting to grow back, see scheduleRespawn()
};

// the fields that are the map's contents (saved with a game, endless.saves.js): settlers to pendingRespawns
export const WORLD_LISTS = Object.keys(game).slice(Object.keys(game).indexOf('settlers'));

export const BOAR_LIMIT = 5;
export const TOWN_HALL_HP = 100;
export const townHall = { x: game.WORLD_WIDTH / 2, y: game.WORLD_HEIGHT / 2, radius: 32, hp: TOWN_HALL_HP, maxHp: TOWN_HALL_HP, repairRequested: false };

for (const key of Object.keys(game)) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    get() { return game[key]; },
    set(value) { game[key] = value; }
  });
}
