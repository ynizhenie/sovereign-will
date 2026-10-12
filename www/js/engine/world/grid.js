// The world as a grid of tiles: setting the map's size, world <-> tile, and an index of what stands on
// each tile (rebuilt when something changes). The tile size itself is in state.js.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { BORDER_MARGIN, DEFAULT_MAP_TILES, TILE_SIZE, game, townHall } from './state.js';
import { camera } from '../platform/index.js';

export function setWorldSize(cols, rows) {
  game.COLS = cols; game.ROWS = rows;
  game.WORLD_WIDTH = cols * TILE_SIZE; game.WORLD_HEIGHT = rows * TILE_SIZE;
  townHall.x = game.WORLD_WIDTH / 2; townHall.y = game.WORLD_HEIGHT / 2;
  camera.x = townHall.x; camera.y = townHall.y;
}

// how many times the default map's area this one is: counts on the map (forests, lakes...) scale by it
export function getMapAreaScale() {
  return (game.COLS * game.ROWS) / (DEFAULT_MAP_TILES * DEFAULT_MAP_TILES);
}

export function getGridPos(x, y) { return { gx: Math.floor(x / TILE_SIZE), gy: Math.floor(y / TILE_SIZE) }; }

// What occupies each tile, keyed "x,y" by tile center. Path searches check thousands of tiles,
// so they look tiles up here instead of scanning every object list. Rebuilt lazily after
// resetTileIndex(), which runs every tick and whenever paths are invalidated.
export let tileIndex = null;

export function resetTileIndex() { tileIndex = null; }

export function getTileIndex() {
  if (tileIndex) return tileIndex;
  const keys = list => new Set(list.map(o => `${o.x},${o.y}`));
  // changes whenever anything that blocks a tile appears, disappears or moves; used to invalidate
  // cached reachability without every harvest/build site having to remember to do it
  let signature = game.COLS * 1000 + game.ROWS; // a new map size invalidates everything cached by signature
  for (const list of [game.naturalRocks, game.waterTiles, game.trees, game.cacti, game.boulders, game.ironOres, game.coalOres, game.buildings]) {
    signature = (signature * 31 + list.length) | 0;
    for (const o of list) signature = (signature * 31 + o.x * 1601 + o.y + (o.isGrowing ? 7 : 0)) | 0;
  }
  tileIndex = {
    signature,
    rocks: keys(game.naturalRocks),
    water: keys(game.waterTiles),
    trees: keys(game.trees.filter(t => !t.isGrowing)),
    cacti: keys(game.cacti),
    boulders: keys(game.boulders),
    ores: keys([...game.ironOres, ...game.coalOres]),
    rockAndOre: keys([...game.naturalRocks, ...game.ironOres, ...game.coalOres]), // rock tiles that draw joined up
    solids: keys([...game.boulders, ...game.cacti, ...game.ironOres, ...game.coalOres]),
    buildings: keys(game.buildings),
    walls: keys(game.buildings.filter(b => b.type !== 'door' && b.type !== 'spikes')),
    spikes: keys(game.buildings.filter(b => b.type === 'spikes')),
    // what stops arrows (see blocksArrows / arrowsPass / towerArrowsPass in GAME_CONFIG)
    arrowBlockers: keys(Object.values(GAME_CONFIG.mapResources).filter(def => def.blocksArrows)
      .flatMap(def => game[def.list].filter(o => !o.isGrowing))),
    arrowBuildings: keys(game.buildings.filter(b => !(getDefinition('buildings', b.type) || {}).arrowsPass)),
    towerArrowBuildings: keys(game.buildings.filter(b => {
      const def = getDefinition('buildings', b.type) || {};
      return !def.arrowsPass && !def.towerArrowsPass;
    }))
  };
  return tileIndex;
}

export function isBorderZone(gx, gy) {
  return gx < BORDER_MARGIN || gx >= game.COLS - BORDER_MARGIN || gy < BORDER_MARGIN || gy >= game.ROWS - BORDER_MARGIN;
}
