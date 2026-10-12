// The world as a grid of tiles: the tile size, the map's size, world <-> tile, and an index of what stands
// on each tile (rebuilt when something changes)

const TILE_SIZE = 30;

const BORDER_MARGIN = 2;

// the world's size in tiles, picked in the main menu (setWorldSize); the canvas itself follows the screen
// (see fitCanvasToScreen)
const DEFAULT_MAP_TILES = 40;

let COLS = DEFAULT_MAP_TILES;

let ROWS = DEFAULT_MAP_TILES;

let WORLD_WIDTH = COLS * TILE_SIZE;

let WORLD_HEIGHT = ROWS * TILE_SIZE;

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

function getGridPos(x, y) { return { gx: Math.floor(x / TILE_SIZE), gy: Math.floor(y / TILE_SIZE) }; }

// What occupies each tile, keyed "x,y" by tile center. Path searches check thousands of tiles,
// so they look tiles up here instead of scanning every object list. Rebuilt lazily after
// resetTileIndex(), which runs every tick and whenever paths are invalidated.
let tileIndex = null;

// game ticks, for short-lived per-settler caches
let pathTick = 0;

function resetTileIndex() { tileIndex = null; }

function getTileIndex() {
  if (tileIndex) return tileIndex;
  const keys = list => new Set(list.map(o => `${o.x},${o.y}`));
  // changes whenever anything that blocks a tile appears, disappears or moves; used to invalidate
  // cached reachability without every harvest/build site having to remember to do it
  let signature = COLS * 1000 + ROWS; // a new map size invalidates everything cached by signature
  for (const list of [naturalRocks, waterTiles, trees, cacti, boulders, ironOres, coalOres, buildings]) {
    signature = (signature * 31 + list.length) | 0;
    for (const o of list) signature = (signature * 31 + o.x * 1601 + o.y + (o.isGrowing ? 7 : 0)) | 0;
  }
  tileIndex = {
    signature,
    rocks: keys(naturalRocks),
    water: keys(waterTiles),
    trees: keys(trees.filter(t => !t.isGrowing)),
    cacti: keys(cacti),
    boulders: keys(boulders),
    ores: keys([...ironOres, ...coalOres]),
    rockAndOre: keys([...naturalRocks, ...ironOres, ...coalOres]), // rock tiles that draw joined up
    solids: keys([...boulders, ...cacti, ...ironOres, ...coalOres]),
    buildings: keys(buildings),
    walls: keys(buildings.filter(b => b.type !== 'door' && b.type !== 'spikes')),
    spikes: keys(buildings.filter(b => b.type === 'spikes')),
    // what stops arrows (see blocksArrows / arrowsPass / towerArrowsPass in GAME_CONFIG)
    arrowBlockers: keys(Object.values(GAME_CONFIG.mapResources).filter(def => def.blocksArrows)
      .flatMap(def => WORLD[def.list].filter(o => !o.isGrowing))),
    arrowBuildings: keys(buildings.filter(b => !(getDefinition('buildings', b.type) || {}).arrowsPass)),
    towerArrowBuildings: keys(buildings.filter(b => {
      const def = getDefinition('buildings', b.type) || {};
      return !def.arrowsPass && !def.towerArrowsPass;
    }))
  };
  return tileIndex;
}

function isBorderZone(gx, gy) {
  return gx < BORDER_MARGIN || gx >= COLS - BORDER_MARGIN || gy < BORDER_MARGIN || gy >= ROWS - BORDER_MARGIN;
}
