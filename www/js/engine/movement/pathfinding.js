// Finding a way: which tiles block whom (settlers, enemies), walking distances, and A* paths

import { getDefinition } from '../../content/configs/index.js';
import { STRUCTURE_COLLISION_HALF_SIZE, TILE_SIZE, game, getGridPos, getTileIndex, isDoor, resetTileIndex, townHall } from '../world/index.js';

// isTileBlockedForSettler for the whole map as a Uint8Array (gy * COLS + gx), rebuilt only when the
// world's blocking tiles change. Settler path searches read this instead of re-checking each tile.
/** @type {{ signature: number | null, grid: Uint8Array | null }} */
export let settlerBlockedGrid = { signature: null, grid: null };

/** @returns {Uint8Array} */
export function getSettlerBlockedGrid() {
  const signature = getTileIndex().signature;
  if (settlerBlockedGrid.signature !== signature || !settlerBlockedGrid.grid || settlerBlockedGrid.grid.length !== game.COLS * game.ROWS) {
    settlerBlockedGrid = { signature, grid: buildSettlerBlockedGrid() };
  }
  return /** @type {Uint8Array} */ (settlerBlockedGrid.grid);
}

// (#299) marked from the lists of what blocks, not by asking each tile of a big map: the same as
// computeTileBlockedForSettler for every tile (something blocks the tile it stands in the middle of)
function buildSettlerBlockedGrid() {
  const grid = new Uint8Array(game.COLS * game.ROWS);
  const mark = o => {
    const gx = (o.x - 15) / TILE_SIZE, gy = (o.y - 15) / TILE_SIZE;
    if (Number.isInteger(gx) && Number.isInteger(gy) && gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS) grid[gy * game.COLS + gx] = 1;
  };
  for (const b of game.buildings) {
    const def = getDefinition('buildings', b.type) || {};
    if ((!isDoor(b) && !def.walkable) || b.type === 'spikes' || def.ironTrap) mark(b);
  }
  for (const list of [game.naturalRocks, game.waterTiles, game.cacti, game.boulders, game.ironOres, game.coalOres]) list.forEach(mark);
  for (const t of game.trees) if (!t.isGrowing) mark(t);
  for (const key of getTileIndex().outposts) {
    const [x, y] = key.split(',').map(Number);
    mark({ x, y });
  }
  // The town hall blocks only the tiles covered by its two-by-two-tile footprint.
  const minGx = Math.floor((townHall.x - STRUCTURE_COLLISION_HALF_SIZE) / TILE_SIZE);
  const maxGx = Math.floor((townHall.x + STRUCTURE_COLLISION_HALF_SIZE - 1) / TILE_SIZE);
  const minGy = Math.floor((townHall.y - STRUCTURE_COLLISION_HALF_SIZE) / TILE_SIZE);
  const maxGy = Math.floor((townHall.y + STRUCTURE_COLLISION_HALF_SIZE - 1) / TILE_SIZE);
  for (let gy = minGy; gy <= maxGy; gy++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) continue;
      grid[gy * game.COLS + gx] = 1;
    }
  }
  return grid;
}

export function isTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  return getSettlerBlockedGrid()[gy * game.COLS + gx] === 1;
}

export function computeTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (tilesForStructure(tx, ty, townHall.x, townHall.y)) return true;

  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.outposts.has(k) || tiles.walls.has(k) || tiles.spikes.has(k) || tiles.traps.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

const tilesForStructure = (x, y, structureX, structureY) =>
  Math.abs(x - structureX) < STRUCTURE_COLLISION_HALF_SIZE &&
  Math.abs(y - structureY) < STRUCTURE_COLLISION_HALF_SIZE;

// (#299) how far a settler's walking distances are worked out: the frontier's box of tiles (set by
// domains/world), not all of a big map; null: everywhere
/** @type {() => ({ gx0: number, gy0: number, gx1: number, gy1: number } | null)} */
let reachBounds = () => null;
export function setReachBounds(fn) { reachBounds = fn; }

// Walking distance (in tiles) from the settler's tile to every tile, as an Int16Array indexed gy * COLS + gx,
// -1 where it can't get (and past the reach bounds, unless it stands out there itself). Cached until the
// settler changes tile or the world's blocking tiles change.
export function getSettlerReach(settler) {
  const start = getGridPos(settler.x, settler.y);
  const startIndex = start.gy * game.COLS + start.gx;
  const signature = getTileIndex().signature;
  const cache = settler.reachCache;
  const size = game.COLS * game.ROWS;
  if (cache && cache.startIndex === startIndex && cache.signature === signature && cache.steps.length === size) return cache.steps;

  const blocked = getSettlerBlockedGrid();
  // (#306) the settler's own array again, with only what its last walk set cleared: making a new map's worth
  // of -1 for every settler that stepped onto a new tile was a tick's costliest work
  let steps;
  if (cache && cache.steps.length === size) {
    steps = cache.steps;
    for (const index of cache.visited) steps[index] = -1;
  } else {
    steps = new Int16Array(size).fill(-1);
  }
  let b = reachBounds() || { gx0: 0, gy0: 0, gx1: game.COLS - 1, gy1: game.ROWS - 1 };
  if (start.gx < b.gx0 || start.gx > b.gx1 || start.gy < b.gy0 || start.gy > b.gy1) b = { gx0: 0, gy0: 0, gx1: game.COLS - 1, gy1: game.ROWS - 1 };
  const queue = [startIndex];
  if (startIndex >= 0 && startIndex < steps.length) steps[startIndex] = 0;
  // (#306) the four ways on, written out: building a pair and a loop for each tile walked made a heap of
  // garbage in the costliest loop of a big colony's tick
  const cols = game.COLS;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const cx = current % cols, cy = (current - cx) / cols, next = steps[current] + 1;
    if (cx < b.gx1) { const index = current + 1; if (steps[index] === -1 && !blocked[index]) { steps[index] = next; queue.push(index); } }
    if (cx > b.gx0) { const index = current - 1; if (steps[index] === -1 && !blocked[index]) { steps[index] = next; queue.push(index); } }
    if (cy < b.gy1) { const index = current + cols; if (steps[index] === -1 && !blocked[index]) { steps[index] = next; queue.push(index); } }
    if (cy > b.gy0) { const index = current - cols; if (steps[index] === -1 && !blocked[index]) { steps[index] = next; queue.push(index); } }
  }
  settler.reachCache = { startIndex, signature, steps, visited: queue };
  return steps;
}

export function getReachSteps(reach, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) return -1;
  return reach[gy * game.COLS + gx];
}

// Steps to stand next to (or on) a resource, or Infinity if the settler can't get there.
// reach comes from getSettlerReach(). Only the resource's own tile and its 4 direct neighbours count:
// a diagonal neighbour is only usable through one of those, and a resource reachable only across a
// corner between two rocks has no spot a settler can actually stand on.
export function getReachDistanceToResource(reach, resource) {
  const g = getGridPos(resource.x, resource.y);
  let best = Infinity;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const steps = getReachSteps(reach, g.gx + dx, g.gy + dy);
    if (steps !== -1 && steps < best) best = steps;
  }
  return best;
}

export function isTileBlockedForEnemyStrict(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (tilesForStructure(tx, ty, townHall.x, townHall.y)) return true;
  // route around buildings when possible; if walled in, the fallback search paths through them and enemies break them
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  // (an iron trap they don't see: they walk right onto it, #248)
  return tiles.outposts.has(k) || (tiles.buildings.has(k) && !tiles.traps.has(k)) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

// (#299) Which tiles an enemy could get from to the town hall, breaking what it may break on the way (not
// across water or rock): 1 in a grid (gy * COLS + gx), within the reach bounds. Kept till the world's
// blocking tiles change. On a continent the frontier runs out to sea; waves come in on land joined to the base
/** @type {{ signature: number | null, grid: Uint8Array | null }} */
let enemyReach = { signature: null, grid: null };
export function getEnemyReach() {
  const signature = getTileIndex().signature;
  if (enemyReach.signature === signature && enemyReach.grid && enemyReach.grid.length === game.COLS * game.ROWS) return enemyReach.grid;
  const grid = new Uint8Array(game.COLS * game.ROWS), b = reachBounds() || { gx0: 0, gy0: 0, gx1: game.COLS - 1, gy1: game.ROWS - 1 };
  const hall = getGridPos(townHall.x, townHall.y), queue = [];
  // (from the tiles round the hall: the hall's own are blocked)
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const gx = hall.gx + dx, gy = hall.gy + dy;
    if (gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS && !isTileBlockedForEnemyPermissive(gx, gy)) { grid[gy * game.COLS + gx] = 1; queue.push(gy * game.COLS + gx); }
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i], cx = c % game.COLS, cy = (c - cx) / game.COLS;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cx + dx, gy = cy + dy;
      if (gx < b.gx0 || gy < b.gy0 || gx > b.gx1 || gy > b.gy1) continue;
      const j = gy * game.COLS + gx;
      if (grid[j] || isTileBlockedForEnemyPermissive(gx, gy)) continue;
      grid[j] = 1; queue.push(j);
    }
  }
  enemyReach = { signature, grid };
  return grid;
}

export function isTileBlockedForEnemyPermissive(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  // enemies can chop trees and boulders and break buildings on the way (see update()), but not cacti or ore
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.outposts.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.cacti.has(k) || tiles.ores.has(k);
}

export const PATH_DIRECTIONS = [
  {dx:0, dy:-1, cost:1}, {dx:0, dy:1, cost:1}, {dx:-1, dy:0, cost:1}, {dx:1, dy:0, cost:1},
  {dx:-1, dy:-1, cost:1.41}, {dx:1, dy:-1, cost:1.41}, {dx:-1, dy:1, cost:1.41}, {dx:1, dy:1, cost:1.41}
];

// min-heap keyed by f, for the A* open list
export function createOpenList() {
  const items = [];
  const swap = (i, j) => { const t = items[i]; items[i] = items[j]; items[j] = t; };
  return {
    get size() { return items.length; },
    push(node) {
      items.push(node);
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent].f <= items[i].f) break;
        swap(i, parent); i = parent;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length > 0) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let smallest = i;
          if (l < items.length && items[l].f < items[smallest].f) smallest = l;
          if (r < items.length && items[r].f < items[smallest].f) smallest = r;
          if (smallest === i) break;
          swap(i, smallest); i = smallest;
        }
      }
      return top;
    }
  };
}

export function findGridPath(startG, endG, targetX, targetY, options) {
  if (startG.gx === endG.gx && startG.gy === endG.gy) {
    return { path: [{ x: targetX, y: targetY }], isBlockedPath: options.isBlockedPath };
  }

  const key = (gx, gy) => `${gx},${gy}`;
  const blockedCache = new Map();
  const isBlocked = (gx, gy) => {
    const k = key(gx, gy);
    if (!blockedCache.has(k)) blockedCache.set(k, options.isBlocked(gx, gy));
    return blockedCache.get(k);
  };
  const openList = createOpenList();
  openList.push({ gx: startG.gx, gy: startG.gy, f: Math.hypot(startG.gx - endG.gx, startG.gy - endG.gy) });
  const closedSet = new Set();
  const parentMap = new Map();
  const gScore = new Map([[key(startG.gx, startG.gy), 0]]);
  let found = false;

  // no step cap: with the heap a failed search over the whole 40x40 map is still cheap,
  // and long detours through rock mazes need it
  while (openList.size > 0) {
    const current = openList.pop();
    const currentKey = key(current.gx, current.gy);
    // a node can be queued several times before it's expanded; skip stale copies
    if (closedSet.has(currentKey)) continue;
    if (current.gx === endG.gx && current.gy === endG.gy) {
      found = true;
      break;
    }
    closedSet.add(currentKey);

    for (const direction of PATH_DIRECTIONS) {
      const gx = current.gx + direction.dx;
      const gy = current.gy + direction.dy;
      const nextKey = key(gx, gy);
      if (closedSet.has(nextKey) || isBlocked(gx, gy)) continue;
      if (!options.allowCornerCutting && direction.dx !== 0 && direction.dy !== 0 &&
          (isBlocked(current.gx + direction.dx, current.gy) || isBlocked(current.gx, current.gy + direction.dy))) continue;

      const worldX = gx * TILE_SIZE + 15;
      const worldY = gy * TILE_SIZE + 15;
      const extraCost = options.extraCost ? options.extraCost(worldX, worldY) : 0;
      const tentativeG = (gScore.get(currentKey) || 0) + direction.cost + extraCost;
      if (!gScore.has(nextKey) || tentativeG < /** @type {number} */ (gScore.get(nextKey))) {
        gScore.set(nextKey, tentativeG);
        parentMap.set(nextKey, current);
        openList.push({ gx, gy, f: tentativeG + Math.hypot(gx - endG.gx, gy - endG.gy) });
      }
    }
  }

  const path = [];
  let current = found ? endG : null;
  while (current) {
    path.unshift({ x: current.gx * TILE_SIZE + 15, y: current.gy * TILE_SIZE + 15 });
    current = parentMap.get(key(current.gx, current.gy));
  }
  if (path.length > 0) path.push({ x: targetX, y: targetY });
  return { path, isBlockedPath: options.isBlockedPath };
}

// Enemies' way to their target: one search that weighs going round against breaking through, in
// tiles of walking: breaking a building costs `building`, a tree or boulder `nature`, walking over spikes
// `spikes`. Rock and water can't be crossed at all.
export const ENEMY_PATH_COST = { building: 0.5, nature: 25, spikes: 2 };

// A path's length in tiles (diagonal steps count 1.41)
export function pathCost(path) {
  let cost = 0;
  for (let i = 1; i < path.length - 1; i++) cost += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) / TILE_SIZE;
  return cost;
}

// natureBlocks: trees and boulders are walked round, not chopped through (only buildings and spikes
// are taken straight, when the way round is long)
export function findPathAStarPermissive(startX, startY, targetX, targetY, natureBlocks = false) {
  const startG = getGridPos(startX, startY);
  const endG = getGridPos(targetX, targetY);
  endG.gx = Math.max(0, Math.min(game.COLS - 1, endG.gx));
  endG.gy = Math.max(0, Math.min(game.ROWS - 1, endG.gy));
  const tiles = getTileIndex();
  const isBuilding = k => tiles.buildings.has(k) && !tiles.spikes.has(k) && !tiles.traps.has(k); // (traps unseen, #248)
  const isBreakable = k => tiles.trees.has(k) || tiles.boulders.has(k) || isBuilding(k);
  const PATH_COST = ENEMY_PATH_COST;
  const result = findGridPath(startG, endG, targetX, targetY, {
    isBlocked: natureBlocks
      ? (gx, gy) => isTileBlockedForEnemyPermissive(gx, gy) || tiles.trees.has(`${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`) || tiles.boulders.has(`${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`)
      : isTileBlockedForEnemyPermissive,
    // no squeezing diagonally between two rocks
    allowCornerCutting: false,
    isBlockedPath: true,
    // what a tile costs on top of walking it: a building is broken through rather than walked a long way
    // round (to a far door), spikes are walked over, trees and boulders mostly walked round
    extraCost: (x, y) => {
      const k = `${x},${y}`;
      if (isBuilding(k)) return PATH_COST.building;
      if (tiles.trees.has(k) || tiles.boulders.has(k)) return PATH_COST.nature;
      return tiles.spikes.has(k) ? PATH_COST.spikes : 0;
    }
  });
  // a way in over spikes only needs nothing broken: the enemy just walks it (see update())
  if (result.path.length > 0 && !result.path.some(p => isBreakable(`${p.x},${p.y}`))) result.isBlockedPath = false;
  // what it costs in tiles of walking, breaking and spikes included
  result.cost = pathCost(result.path) + result.path.slice(0, -1).reduce((sum, p) => {
    const k = `${p.x},${p.y}`;
    return sum + (isBuilding(k) ? PATH_COST.building : (tiles.trees.has(k) || tiles.boulders.has(k)) ? PATH_COST.nature : tiles.spikes.has(k) ? PATH_COST.spikes : 0);
  }, 0);
  return result;
}

// allowBreakthrough: enemies may fall back on the permissive search (through buildings, over spikes). A
// camp's own defenders know their ground and must go round their own buildings instead (see steering.js).
export function findPathAStar(startX, startY, targetX, targetY, isEnemy = false, allowBreakthrough = true) {
  let startG = getGridPos(startX, startY);
  let endG = getGridPos(targetX, targetY);

  endG.gx = Math.max(0, Math.min(game.COLS - 1, endG.gx));
  endG.gy = Math.max(0, Math.min(game.ROWS - 1, endG.gy));

  const isBlocked = isEnemy ? isTileBlockedForEnemyStrict : isTileBlockedForSettler;
  if (startG.gx === endG.gx && startG.gy === endG.gy && !isBlocked(endG.gx, endG.gy)) {
    return { path: [{ x: targetX, y: targetY }], isBlockedPath: false };
  }

  let reachableBlockedTargetPath = null;
  if (isBlocked(endG.gx, endG.gy)) {
    for (let radius = 1; radius <= 3 && !reachableBlockedTargetPath; radius++) {
      const neighbors = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const gx = endG.gx + dx, gy = endG.gy + dy;
          if (!isBlocked(gx, gy)) neighbors.push({ gx, gy });
        }
      }
      neighbors.sort((a, b) => Math.hypot(a.gx - startG.gx, a.gy - startG.gy) - Math.hypot(b.gx - startG.gx, b.gy - startG.gy));
      for (const n of neighbors) {
        const x = n.gx * TILE_SIZE + 15, y = n.gy * TILE_SIZE + 15;
        const candidatePath = findGridPath(startG, n, x, y, {
          isBlocked,
          allowCornerCutting: false,
          isBlockedPath: false
        });
        if (candidatePath.path.length > 0) {
          endG = n;
          targetX = x;
          targetY = y;
          reachableBlockedTargetPath = candidatePath;
          break;
        }
      }
    }
  }

  const result = reachableBlockedTargetPath || findGridPath(startG, endG, targetX, targetY, {
    isBlocked,
    allowCornerCutting: false,
    isBlockedPath: false
  });
  if (isEnemy && allowBreakthrough && result.path.length === 0) return findPathAStarPermissive(startX, startY, targetX, targetY);
  // Compare the real detour with breaking buildings or crossing spikes on the direct route.
  if (isEnemy && allowBreakthrough && pathCost(result.path) > Math.hypot(endG.gx - startG.gx, endG.gy - startG.gy) + 0.1) {
    const through = findPathAStarPermissive(startX, startY, targetX, targetY, true);
    if (through.path.length > 0 && through.cost < pathCost(result.path)) return through;
  }
  return result;
}

export function hasClearEnemyLine(startX, startY, targetX, targetY, radius = 12) {
  let distance = Math.hypot(targetX - startX, targetY - startY);
  if (distance < 1) return true;
  let steps = Math.ceil(distance / 10);

  let perpX = -(targetY - startY) / distance;
  let perpY = (targetX - startX) / distance;

  for (let i = 1; i <= steps; i++) {
    let ratio = i / steps;
    let cx = startX + (targetX - startX) * ratio;
    let cy = startY + (targetY - startY) * ratio;

    for (let offset of [0, -radius * 0.75, radius * 0.75]) {
      let x = cx + perpX * offset;
      let y = cy + perpY * offset;
      let gx = Math.floor(x / TILE_SIZE);
      let gy = Math.floor(y / TILE_SIZE);
      if (isTileBlockedForEnemyStrict(gx, gy)) return false;
    }
  }

  return true;
}

// Settlers and enemies never stand inside each other: push every overlapping pair apart, each by half
// (or one by all of it when the other would be pushed into a wall). Runs once a tick after movement;
// a few rounds, since pushing one pair apart can push a unit into its neighbour.
// Whether an enemy's current path goes over a spike trap (see pathViaSpikes)
export function pathCrossesSpikes(en) {
  if (!en.path || en.path.length === 0) return false;
  const tiles = getTileIndex();
  return en.path.some(p => tiles.spikes.has(`${p.x},${p.y}`));
}

export function invalidateAllPaths() {
  resetTileIndex();
  game.settlers.forEach(s => { s.path = null; s.pathTarget = null; });
  game.enemies.forEach(en => { en.path = null; en.pathTarget = null; });
}
