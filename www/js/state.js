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

const townHall = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, radius: 32, hp: 100, maxHp: 100, repairRequested: false };

const WORLD = {
  settlers: [],
  trees: [],
  cacti: [],
  boulders: [],
  grassList: [],
  berryBushes: [],
  farmPlots: [],
  farmZones: [],        // { x, y, crop } tiles the player marked for farmers to plant, see tendFarmZones()
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
  resourcePiles: [],    // { x, y, type, amount } what a destroyed warehouse spilled, see dropStorageContents()
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

// ---- Storage (#36)
// Resources lie in the town hall and in warehouses (`contents`, resource id -> amount), each holding
// up to its capacity (GAME_CONFIG.storage) in all. Settlers bring what they gather to the nearest one
// with room and fetch what they need from one that holds it (storeIn / takeFrom).
// `stock` is the colony's total of each resource: what the HUD shows and costs are checked against.
// Reading it adds the storages up; changing it puts resources in (the town hall first, then
// warehouses; past every capacity into the hall all the same) or takes them out (the hall first).
townHall.contents = {};

function getStorages() {
  return [townHall, ...buildings.filter(b => b.contents)];
}

function getStorageCapacity(storage) {
  if (storage === townHall) return GAME_CONFIG.storage.townHall;
  const def = getDefinition('buildings', storage.type);
  return (def && def.build && def.build.storage) || 0;
}

function getStoredTotal(storage) {
  let total = 0;
  for (const amount of Object.values(storage.contents)) total += amount;
  return total;
}

function getStorageRoom(storage) {
  return Math.max(0, getStorageCapacity(storage) - getStoredTotal(storage));
}

// Put up to `amount` into this storage (as much as it has room for); returns how much went in
function storeIn(storage, id, amount) {
  const fits = Math.min(amount, getStorageRoom(storage));
  if (fits > 0) storage.contents[id] = (storage.contents[id] || 0) + fits;
  return fits;
}

// Take up to `amount` out of this storage; returns how much it had
function takeFrom(storage, id, amount) {
  const got = Math.min(amount, storage.contents[id] || 0);
  if (got > 0) {
    storage.contents[id] -= got;
    if (storage.contents[id] <= 1e-9) delete storage.contents[id];
  }
  return got;
}

function depositAnywhere(id, amount) {
  for (const storage of getStorages()) {
    amount -= storeIn(storage, id, amount);
    if (amount <= 0) return;
  }
  townHall.contents[id] = (townHall.contents[id] || 0) + amount;
}

function withdrawAnywhere(id, amount) {
  for (const storage of getStorages()) {
    amount -= takeFrom(storage, id, amount);
    if (amount <= 0) return;
  }
}

function getStockTotal(id) {
  let total = 0;
  for (const storage of getStorages()) total += storage.contents[id] || 0;
  return total;
}

const stock = new Proxy({}, {
  get: (_, id) => (typeof id === 'string' ? getStockTotal(id) : undefined),
  set: (_, id, value) => {
    const delta = Number(value) - getStockTotal(id);
    if (delta > 0) depositAnywhere(id, delta);
    else if (delta < 0) withdrawAnywhere(id, -delta);
    return true;
  },
  has: (_, id) => id in GAME_CONFIG.resources,
  ownKeys: () => Object.keys(GAME_CONFIG.resources),
  getOwnPropertyDescriptor: (_, id) => (id in GAME_CONFIG.resources
    ? { value: getStockTotal(id), writable: true, enumerable: true, configurable: true } : undefined)
});

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
