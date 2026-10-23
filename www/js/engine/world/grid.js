// The world as a grid of tiles: setting the map's size, world <-> tile, and an index of what stands on
// each tile (rebuilt when something changes). The tile size itself is in state.js.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { BORDER_MARGIN, DEFAULT_MAP_TILES, OUTPOST_COLLISION_HALF_HEIGHT, OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_OFFSET_Y, TILE_SIZE, game, townHall } from './state.js';
import { camera } from '../platform/index.js';

export function setWorldSize(cols, rows) {
  game.COLS = cols; game.ROWS = rows;
  game.WORLD_WIDTH = cols * TILE_SIZE; game.WORLD_HEIGHT = rows * TILE_SIZE;
  townHall.x = game.WORLD_WIDTH / 2; townHall.y = game.WORLD_HEIGHT / 2;
  camera.x = townHall.x; camera.y = townHall.y;
  // (#299) a big map starts as close as a default one: the town hall and round it, not the whole map
  camera.zoom = Math.max(1, Math.min(cols, rows) / DEFAULT_MAP_TILES);
}

// how many times the default map's area this one is: counts on the map (forests, lakes...) scale by it
export function getMapAreaScale() {
  return (game.COLS * game.ROWS) / (DEFAULT_MAP_TILES * DEFAULT_MAP_TILES);
}

export function getGridPos(x, y) { return { gx: Math.floor(x / TILE_SIZE), gy: Math.floor(y / TILE_SIZE) }; }

// The free one-tile ring around the town hall is reserved for newly hired units and pets.
export function isTownHallSpawnTile(gx, gy) {
  const minHallGx = Math.floor((townHall.x - TILE_SIZE) / TILE_SIZE);
  const maxHallGx = Math.floor((townHall.x + TILE_SIZE - 1) / TILE_SIZE);
  const minHallGy = Math.floor((townHall.y - TILE_SIZE) / TILE_SIZE);
  const maxHallGy = Math.floor((townHall.y + TILE_SIZE - 1) / TILE_SIZE);
  const inOneTileRing = gx >= minHallGx - 1 && gx <= maxHallGx + 1 && gy >= minHallGy - 1 && gy <= maxHallGy + 1;
  const inHallFootprint = gx >= minHallGx && gx <= maxHallGx && gy >= minHallGy && gy <= maxHallGy;
  return inOneTileRing && !inHallFootprint;
}

// What occupies each tile, keyed "x,y" by tile center. Path searches check thousands of tiles,
// so they look tiles up here instead of scanning every object list. Rebuilt lazily after
// resetTileIndex(), which runs every tick and whenever paths are invalidated.
/**
 * Tile keys ("x,y" of tile centres) of each kind of thing, and a signature that changes with them
 * @typedef {{ signature: number, rocks: Set<string>, water: Set<string>, trees: Set<string>, cacti: Set<string>,
 *   boulders: Set<string>, ores: Set<string>, rockAndOre: Set<string>, solids: Set<string>, buildings: Set<string>,
 *   outposts: Set<string>, walls: Set<string>, spikes: Set<string>, traps: Set<string>, arrowBlockers: Set<string>, arrowBuildings: Set<string>,
 *   towerArrowBuildings: Set<string>, stamps?: Record<string, string> }} TileIndex
 */
/** @type {TileIndex | null} */
export let tileIndex = null;

export function resetTileIndex() { tileIndex = null; }
// (#298) the last one built: reset every tick, it was built again every tick (thousands of keys); with the
// same signature, it's the same
/** @type {TileIndex | null} */
let lastIndex = null;
// (#299) a number for each list and thing, the same for as long as it lives (for the signature below)
/** @type {WeakMap<object, number>} */
const ids = new WeakMap();
let nextId = 1;
const idOf = o => { let id = ids.get(o); if (!id) ids.set(o, (id = nextId++)); return id; };
// bumped by what changes a tile's blocking in place, without a list changing
let tilesVersion = 0;
const listStampOf = list => (list.length ? `${idOf(list)}:${list.length}:${idOf(list[0])}:${idOf(list[list.length - 1])}` : `${idOf(list)}:0`);
export function markTilesChanged() { tilesVersion++; tileIndex = null; }

/** @returns {TileIndex} */
export function getTileIndex() {
  if (tileIndex) return tileIndex;
  const keys = list => new Set(list.map(o => `${o.x},${o.y}`));
  // changes whenever anything that blocks a tile appears or disappears; used to invalidate cached
  // reachability without every harvest/build site having to remember to do it. (#299) Worked out from each
  // list's array, length, first and last (a thing taken out or put in changes one of them), not from every
  // thing in it: on a big map that was tens of thousands every tick. What changes in place (a sapling grown
  // into a tree) says so with markTilesChanged()
  let signature = game.COLS * 1000 + game.ROWS; // a new map size invalidates everything cached by signature
  signature = (signature * 31 + tilesVersion) | 0;
  for (const list of [game.naturalRocks, game.waterTiles, game.trees, game.cacti, game.boulders, game.ironOres, game.coalOres, game.buildings, game.enemyTents]) {
    signature = (signature * 31 + idOf(list)) | 0;
    signature = (signature * 31 + list.length) | 0;
    if (list.length) signature = ((signature * 31 + idOf(list[0])) * 31 + idOf(list[list.length - 1])) | 0;
  }
  let outpostStamp = '';
  for (const outpost of game.enemyTents) if (outpost.outpost)
    outpostStamp += `${idOf(outpost)}:${outpost.hp > 0 ? 1 : 0}|`;
  for (let i = 0; i < outpostStamp.length; i++) signature = (signature * 31 + outpostStamp.charCodeAt(i)) | 0;
  if (lastIndex && lastIndex.signature === signature) return (tileIndex = lastIndex);
  // (#299) each set made again only when a list it's made from changed (a tree felled: not the tens of
  // thousands of water tiles of a big map's sea again)
  const blocksArrows = Object.values(GAME_CONFIG.mapResources).filter(def => def.blocksArrows).map(def => game[def.list]);
  const size = game.COLS * 1000 + game.ROWS;
  const outpostKeys = () => {
    const outposts = new Set();
    for (const outpost of game.enemyTents) {
      if (!outpost.outpost || outpost.hp <= 0) continue;
      const center = getGridPos(outpost.x, outpost.y);
      // every tile the collider overlaps, not just the ones its centre lands on (a body walks a tile's
      // middle, so a path through a tile the outpost's corner reaches is a path into the outpost: the
      // enemy would bump it, drop the path, plan the same one again and stand there for good)
      for (let gy = center.gy - 2; gy <= center.gy + 2; gy++) {
        for (let gx = center.gx - 2; gx <= center.gx + 2; gx++) {
          const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
          if (gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS &&
            Math.abs(x - outpost.x) < OUTPOST_COLLISION_HALF_WIDTH + TILE_SIZE / 2 &&
            Math.abs(y - (outpost.y + OUTPOST_COLLISION_OFFSET_Y)) < OUTPOST_COLLISION_HALF_HEIGHT + TILE_SIZE / 2)
            outposts.add(`${x},${y}`);
        }
      }
    }
    return outposts;
  };
  /** @type {Record<string, [any[], () => Set<string>]>} */
  const sets = {
    rocks: [[game.naturalRocks], () => keys(game.naturalRocks)],
    water: [[game.waterTiles], () => keys(game.waterTiles)],
    trees: [[game.trees, tilesVersion], () => keys(game.trees.filter(t => !t.isGrowing))],
    cacti: [[game.cacti], () => keys(game.cacti)],
    boulders: [[game.boulders], () => keys(game.boulders)],
    ores: [[game.ironOres, game.coalOres], () => keys([...game.ironOres, ...game.coalOres])],
    rockAndOre: [[game.naturalRocks, game.ironOres, game.coalOres], () => keys([...game.naturalRocks, ...game.ironOres, ...game.coalOres])], // rock tiles that draw joined up
    solids: [[game.boulders, game.cacti, game.ironOres, game.coalOres], () => keys([...game.boulders, ...game.cacti, ...game.ironOres, ...game.coalOres])],
    outposts: [[game.enemyTents, outpostStamp], outpostKeys],
    buildings: [[game.buildings], () => keys(game.buildings)],
    // (doors are walked through, spikes and traps walked over: none of them a wall)
    walls: [[game.buildings], () => keys(game.buildings.filter(b => !isDoor(b) && !(getDefinition('buildings', b.type) || {}).walkable))],
    spikes: [[game.buildings], () => keys(game.buildings.filter(b => b.type === 'spikes'))],
    // iron traps (#248): settlers keep off them, enemies don't see them
    traps: [[game.buildings], () => keys(game.buildings.filter(b => (getDefinition('buildings', b.type) || {}).ironTrap))],
    // what stops arrows (see blocksArrows / arrowsPass / towerArrowsPass in GAME_CONFIG)
    arrowBlockers: [[...blocksArrows, tilesVersion], () => keys(blocksArrows.flatMap(list => list.filter(o => !o.isGrowing)))],
    arrowBuildings: [[game.buildings], () => keys(game.buildings.filter(b => !(getDefinition('buildings', b.type) || {}).arrowsPass))],
    towerArrowBuildings: [[game.buildings], () => keys(game.buildings.filter(b => {
      const def = getDefinition('buildings', b.type) || {};
      return !def.arrowsPass && !def.towerArrowsPass;
    }))]
  };
  const made = /** @type {any} */ ({ signature, stamps: {} });
  for (const [name, [from, make]] of Object.entries(sets)) {
    const stamp = [size, ...from.map(f => typeof f === 'number' || typeof f === 'string' ? f : listStampOf(f))].join('|');
    made.stamps[name] = stamp;
    made[name] = lastIndex && lastIndex.stamps && lastIndex.stamps[name] === stamp ? lastIndex[name] : make();
  }
  tileIndex = /** @type {TileIndex} */ (made);
  lastIndex = tileIndex;
  return tileIndex;
}

// A door (a wooden or an iron one, #248): settlers walk through it
export function isDoor(b) {
  return !!(getDefinition('buildings', b.type) || {}).door;
}

export function isBorderZone(gx, gy) {
  return gx < BORDER_MARGIN || gx >= game.COLS - BORDER_MARGIN || gy < BORDER_MARGIN || gy >= game.ROWS - BORDER_MARGIN;
}
