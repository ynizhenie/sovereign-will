// The state of the game being played: its mode and timers, the town hall, and every list of things on the
// map (WORLD, each list also reachable by its own name). Being gathered into one object (createGame).

let mapSettings = { cols: DEFAULT_MAP_TILES, rows: DEFAULT_MAP_TILES }; // set from the menu, used by resetGame

let gameDifficulty = 'normal'; // GAME_CONFIG.difficulty key, set from the menu

let gameMode = 'endless';      // endless / battle (battle.js) / editor (editor.js) / menu (the world behind the main menu, menu-scene.js)

let customMap = null;          // a saved map (editor.js) Endless plays instead of a generated one

let waveInterval = 90;

let waveTimer = waveInterval;

let gameStarted = false;

let boarRespawnTimer = 25;

const BOAR_LIMIT = 5;

let waveNum = 1;

let buildMode = 'interact';

let isPaused = false;

let selectedSettler = null;

const TOWN_HALL_HP = 100;

const townHall = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, radius: 32, hp: TOWN_HALL_HP, maxHp: TOWN_HALL_HP, repairRequested: false };

const WORLD = {
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

const WORLD_ALIASES = Object.keys(WORLD);

for (const key of WORLD_ALIASES) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    get() { return WORLD[key]; },
    set(value) { WORLD[key] = value; }
  });
}
