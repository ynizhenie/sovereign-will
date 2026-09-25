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
const COLS = canvas.width / TILE_SIZE;
const ROWS = canvas.height / TILE_SIZE;

const keys = {};
let mouse = { x: 0, y: 0 };
let camera = { x: canvas.width / 2, y: canvas.height / 2, zoom: 1 };
let cameraDragging = false;
let cameraDragPoint = { x: 0, y: 0 };

let wood = 30, stone = 20, coal = 0, ironOreStock = 0, iron = 0, leather = 0, arrowsStock = 0, food = 25, armorStock = 0;
let wheatSeeds = 3;
let saplings = 0;
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

const townHall = { x: canvas.width / 2, y: canvas.height / 2, radius: 32, hp: 100, maxHp: 100, repairRequested: false };

const WORLD = {
  settlers: [],
  trees: [],
  cacti: [],
  boulders: [],
  grassList: [],
  berryBushes: [],
  farmPlots: [],
  naturalRocks: [],
  waterTiles: [],
  desertTiles: [],
  desertRegion: null,
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
  projectiles: []
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

function showNotification(msg, isWarning = true) {
  const toastDiv = document.getElementById('toast-notification');
  if (toastDiv) {
    toastDiv.innerText = msg;
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
