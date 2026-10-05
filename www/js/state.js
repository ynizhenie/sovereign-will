const worldSeedInput = document.getElementById('seed-input');
if (worldSeedInput && (!worldSeedInput.value || worldSeedInput.value === 'default-world-seed')) {
  worldSeedInput.value = createDefaultSeed();
}
let worldSeed = createWorldSeed(worldSeedInput ? worldSeedInput.value : createDefaultSeed());

function applySeedFromUI() {
  const rawSeed = worldSeedInput ? worldSeedInput.value.trim() : '';
  worldSeed = createWorldSeed(rawSeed || createDefaultSeed());
  updateSeedHud();
  return worldSeed;
}

function updateSeedHud() {
  const seedElem = document.getElementById('hud-seed');
  if (seedElem && worldSeed) {
    seedElem.innerText = worldSeed.value;
  }
}

function rand() {
  if (worldSeed && typeof worldSeed.random === 'function') return worldSeed.random();
  return Math.random();
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', {
  alpha: false,
  desynchronized: true,
  willReadFrequently: false
});
const TILE_SIZE = 30;
const BORDER_MARGIN = 2;
// the world's size in tiles, picked in the main menu (setWorldSize); the canvas itself follows the screen
// (see fitCanvasToScreen)
const DEFAULT_MAP_TILES = 40;
let COLS = DEFAULT_MAP_TILES;
let ROWS = DEFAULT_MAP_TILES;
let WORLD_WIDTH = COLS * TILE_SIZE;
let WORLD_HEIGHT = ROWS * TILE_SIZE;
let mapSettings = { cols: DEFAULT_MAP_TILES, rows: DEFAULT_MAP_TILES }; // set from the menu, used by resetGame
let gameDifficulty = 'normal'; // GAME_CONFIG.difficulty key, set from the menu
let gameMode = 'endless';      // endless / battle (battle.js) / editor (editor.js)
let customMap = null;          // a saved map (editor.js) Endless plays instead of a generated one
// the two sides (#43, factions.js): GAME_CONFIG.factions ids and the colours their units are drawn in
const sides = { player: { faction: 'humans', color: '#e9c46a' }, enemy: { faction: 'humans', color: '#e8572a' } };
// in the map editor, the faction the map is made for (#170)
function getPlayerFaction() {
  if (gameMode === 'editor' && typeof editor !== 'undefined') return GAME_CONFIG.factions[editor.faction];
  return GAME_CONFIG.factions[sides.player.faction];
}
function getEnemyFaction() { return GAME_CONFIG.factions[sides.enemy.faction]; }

function getDifficulty() {
  return GAME_CONFIG.difficulty[gameDifficulty] || GAME_CONFIG.difficulty.normal;
}

function setWorldSize(cols, rows) {
  COLS = cols; ROWS = rows;
  WORLD_WIDTH = cols * TILE_SIZE; WORLD_HEIGHT = rows * TILE_SIZE;
  townHall.x = WORLD_WIDTH / 2; townHall.y = WORLD_HEIGHT / 2;
  camera.x = townHall.x; camera.y = townHall.y;
}

// how many times the default map's area this one is: counts on the map (forests, lakes...) scale by it
function getMapAreaScale() {
  return (COLS * ROWS) / (DEFAULT_MAP_TILES * DEFAULT_MAP_TILES);
}

const keys = {};
// the on-screen joystick for the possessed settler: x, y in -1..1 (see input.js)
const joystick = { x: 0, y: 0 };
let mouse = { x: 0, y: 0 };
let camera = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, zoom: 1 };
let cameraDragging = false;
let cameraDragPoint = { x: 0, y: 0 };

let waveInterval = 90;
let waveTimer = waveInterval;
let gameStarted = false;
let foodTimer = 25;
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
  blightZones: [],      // { x, y, done } tiles the player marked for blight, see necromancy() (#164)
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

// ---- The colony's stock (#36, #141): amount per resource id of GAME_CONFIG.resources, shared by the
// whole colony (set from GAME_CONFIG.start by resetGame). The town hall and warehouses are where
// settlers bring what they gather and fetch what they need: whichever is nearest.
const stock = Object.fromEntries(Object.keys(GAME_CONFIG.resources).map(id => [id, 0]));

function getStorages() {
  return [townHall, ...buildings.filter(b => b.type === 'warehouse')];
}

// Take up to `amount` of a resource out of the stock; returns how much there was
function takeStock(id, amount) {
  const got = Math.max(0, Math.min(amount, stock[id] || 0));
  stock[id] -= got;
  return got;
}

function showNotification(msg, isWarning = true) {
  const toastDiv = document.getElementById('toast-notification');
  if (toastDiv) {
    setRichText(toastDiv, msg);
    toastDiv.style.background = isWarning ? 'rgba(192, 57, 43, 0.95)' : 'rgba(39, 174, 96, 0.95)';
    toastDiv.style.opacity = '1';
    toastDiv.style.transform = 'translateX(-50%) translateY(0px)';
    
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
      toastDiv.style.opacity = '0';
      toastDiv.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 2800);
  }
}
