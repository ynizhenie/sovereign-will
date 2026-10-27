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
  loading: false,           // (#326) a world being made or a save read: the loading screen is up, nothing drawn or run till it's done
  gameDifficulty: 'normal', // GAME_CONFIG.difficulty key, set from the menu
  cardMode: false,          // Endless with cards (#255, modes/endless/endless.cards.js), set from the menu
  mapSettings: { cols: DEFAULT_MAP_TILES, rows: DEFAULT_MAP_TILES }, // set from the menu, used by resetGame
  customMap: null,          // a saved map (modes/editor) Endless plays instead of a generated one
  worldSeed: null,          // the world's seed and its random sequence (rng.js)
  // the map's size, in tiles and in world units (setWorldSize)
  COLS: DEFAULT_MAP_TILES,
  ROWS: DEFAULT_MAP_TILES,
  WORLD_WIDTH: DEFAULT_MAP_TILES * TILE_SIZE,
  WORLD_HEIGHT: DEFAULT_MAP_TILES * TILE_SIZE,
  // the clocks
  waveInterval: 180,     // (#257: 120 / 180 / 240)
  waveTimer: 90,
  waveNum: 1,
  boarRespawnTimer: 25,
  pathTick: 0,              // game ticks, for short-lived per-settler caches
  // the player's choices and the soldiers' plan
  buildMode: 'interact',
  selectedSettler: null,
  selectedGroup: [],    // (#326) more picked with the selected one: orders by tap go to them all
  addingToGroup: false, // (#326) a tap on a settler adds it to the group (or takes it out), not picks it
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
  battleBlight: false,  // (#326) a battle fought on blighted ground (its settings)
  naturalRocks: [],
  waterTiles: [],
  desertTiles: [],
  desertRegion: null,
  beachTiles: [],       // sand on part of each lake's shore; only drawn, see placeBeaches()
  sticks: [],
  pebbles: [],
  logs: [],             // pieces of a felled tree's log lying about (#298)
  stumps: [],           // { x, y } where a tree was felled: its stump, till a tree grows again (see finishHarvest)
  loot: [],             // { x, y, yield, items } piles fallen enemies dropped (#210)
  piles: [],
  dayTime: 0,           // seconds into the day (#257, world.daytime.js); the game starts in the morning
  nightId: 0,           // which night it is (a torch in hand taken once a night)
  wasNight: false,
  autoBlight: false,    // the undead's necromancers blight by themselves (#253); autoBlightDone: none left to
  autoBlightDone: false,
  portalQueue: [],      // a wave's enemy demons still to come out of the portals (#250)
  portalTimer: 0,            // { x, y, type, amount } stock on the ground by a full storage (#248, storage.stores.js)
  ironOres: [],
  coalOres: [],
  boars: [],
  blueprints: [],
  buildings: [],
  craftOrders: [],      // { key, category, id, crafter, stage, progress, for, yields?, waitFor? } things being made (#211)
  armorOrder: null,
  enemies: [],
  enemyTents: [],
  enemyTentBlueprints: [],
  projectiles: [],
  stuckArrows: [],
  soulFx: [],   // (#326) souls flying into a lantern or out of it, only drawn
  foodMix: {},          // how much of stock.food is each GAME_CONFIG.foodKinds kind, see addFood()
  bloodSplats: [],      // { x, y, r, age, kind } blood on the ground (bleed) and footprints (trackFootprints)
  dung: [],             // { x, y, age, by, byLeft } see relieve()
  corpses: [],          // { x, y, radius, side: 'settler' | 'enemy', kind, age, pet }, see addCorpse()
  waveSize: 0,          // how many the last wave brought (morale: a wave that's lost most of them runs, #207)
  waveRouted: false,
  enemyArrowStock: 0,   // arrows in enemy tents, shared by all enemy archers
  /** @type {{ armor: boolean, shield: boolean, leather?: boolean }} */
  playerGear: { armor: false, shield: false, leather: false }, // armour / a shield the player has made: waves wear them too (#203)
  forests: [],          // forest centres, see placeForests()
  pendingRespawns: [],  // harvested resources waiting to grow back, see scheduleRespawn()
  /** @type {Object<string, number>} */
  paths: {},            // 'gx,gy' -> how worn that tile's ground is, 0..1 (#248, world.paths.js)
  /** @type {Object<string, boolean>} */
  unlocked: {},         // the cards picked (#255): '<category>:<id>' -> opened
  cardsDue: 0,          // waves come whose card is still to be offered
  cardsWave: 0,         // waves counted for cards
  /** @type {string[] | null} */
  cardOffer: null,      // the cards offered now, waiting for a pick
  /** @type {{ side: string, timeLeft: number, seed?: number, layout?: string, army?: any[], wave?: number } | null} */
  raidCamp: null,       // an enemy camp's zone open beyond a side of the map (#255, endless.raid.js)
  raidCampWave: 0,      // the waves beaten when the last one opened
  reliefZones: [],      // { x, y } tiles marked to relieve in (#279, world.zones.js)
  postZones: [],        // { x, y } tiles marked for soldiers' posts before a wave
  scouts: [],           // enemy scouts between waves (#279, waves.scouts.js): not enemies till the player points at one
  scoutClock: 0,
  /** @type {any} */
  weather: null         // (#308) the weather now (world.weather.js); null: none yet (a new game, an old save)
};

// the fields that are the map's contents (saved with a game, endless.saves.js): settlers to pendingRespawns
export const WORLD_LISTS = Object.keys(game).slice(Object.keys(game).indexOf('settlers'));

export const BOAR_LIMIT = 5;
export const TOWN_HALL_HP = 100;
/** @type {import('./types.js').TownHall} */
/** @type {import('./types.js').TownHall} */
export const townHall = { x: game.WORLD_WIDTH / 2, y: game.WORLD_HEIGHT / 2, radius: 32, hp: TOWN_HALL_HP, maxHp: TOWN_HALL_HP, repairRequested: false, store: {} };
