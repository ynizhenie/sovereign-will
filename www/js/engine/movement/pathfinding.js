// Finding a way: which tiles block whom (settlers, enemies), walking distances, and A* paths

import { getDefinition } from '../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, getTileIndex, isDoor, resetTileIndex, townHall } from '../world/index.js';

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
  // (#326) the player's spikes and traps kept off, the enemy's walked straight onto; the enemy's doors a wall
  for (const b of game.buildings) {
    const def = getDefinition('buildings', b.type) || {}, own = b.side !== 'red';
    if ((!isDoor(b) && !def.walkable) || (own && (b.type === 'spikes' || def.ironTrap)) || (!own && isDoor(b))) mark(b);
  }
  for (const list of [game.naturalRocks, game.waterTiles, game.cacti, game.boulders, game.ironOres, game.coalOres]) list.forEach(mark);
  for (const t of game.trees) if (!t.isGrowing) mark(t);
  // round the town hall
  const reach = Math.ceil((townHall.radius + 12) / TILE_SIZE) + 1, hall = getGridPos(townHall.x, townHall.y);
  for (let gy = hall.gy - reach; gy <= hall.gy + reach; gy++) {
    for (let gx = hall.gx - reach; gx <= hall.gx + reach; gx++) {
      if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) continue;
      if (Math.hypot(gx * TILE_SIZE + 15 - townHall.x, gy * TILE_SIZE + 15 - townHall.y) < townHall.radius + 12) grid[gy * game.COLS + gx] = 1;
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
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;

  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.walls.has(k) || tiles.redDoors.has(k) || tiles.ownSpikes.has(k) || tiles.ownTraps.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

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

// (#322) What a tile is for enemies, worked out the first time it's asked and kept till the world's blocking
// tiles (or the hall) change: an enemy's search and its straight-line checks asked the same tiles over and
// over, each time making an "x,y" string and looking it up in a dozen sets. -1: not known yet
function enemyMemo() {
  const signature = getTileIndex().signature, size = game.COLS * game.ROWS;
  if (enemyTiles.signature !== signature || enemyTiles.strict.length !== size || enemyTiles.hallX !== townHall.x || enemyTiles.hallY !== townHall.y) {
    enemyTiles = { signature, hallX: townHall.x, hallY: townHall.y, strict: new Int8Array(size).fill(-1), permissive: new Int8Array(size).fill(-1) };
  }
  return enemyTiles;
}
let enemyTiles = { signature: /** @type {number | null} */ (null), hallX: 0, hallY: 0, strict: new Int8Array(0), permissive: new Int8Array(0) };

export function isTileBlockedForEnemyStrict(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  const memo = enemyMemo(), i = gy * game.COLS + gx;
  if (memo.strict[i] === -1) memo.strict[i] = computeBlockedForEnemyStrict(gx, gy) ? 1 : 0;
  return memo.strict[i] === 1;
}

function computeBlockedForEnemyStrict(gx, gy) {
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;
  // route around buildings when possible; if walled in, the fallback search paths through them and enemies break them
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  // (an iron trap they don't see: they walk right onto it, #248; #326 the player's spikes too, straight over them;
  // through their own doors, round their own spikes and traps)
  return (tiles.buildings.has(k) && !tiles.ownTraps.has(k) && !tiles.ownSpikes.has(k) && !tiles.redDoors.has(k)) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
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
  const memo = enemyMemo(), i = gy * game.COLS + gx;
  if (memo.permissive[i] === -1) memo.permissive[i] = computeBlockedForEnemyPermissive(gx, gy) ? 1 : 0;
  return memo.permissive[i] === 1;
}

function computeBlockedForEnemyPermissive(gx, gy) {
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  // enemies can chop trees and boulders and break buildings on the way (see update()), but not cacti or ore;
  // (#326) not their own buildings, and they keep off their own spikes and traps
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.rocks.has(k) || tiles.water.has(k) || tiles.cacti.has(k) || tiles.ores.has(k) || tiles.redBuildings.has(k) || tiles.redHazards.has(k);
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

// (#322) The search's own arrays, one entry per tile and kept between searches: a tile's g score, where it
// was reached from, and whether it's closed or its blocking known, each counted by the search they're for (a
// stamp), so nothing's cleared between searches. It used Maps keyed by "x,y" strings: most of an enemy's time
const grid = { size: 0, g: new Float64Array(0), from: new Int32Array(0), seen: new Int32Array(0), closed: new Int32Array(0), known: new Int32Array(0), blocked: new Uint8Array(0) };
let searchId = 0;
function searchArrays() {
  const size = game.COLS * game.ROWS;
  if (grid.size !== size) {
    Object.assign(grid, { size, g: new Float64Array(size), from: new Int32Array(size), seen: new Int32Array(size), closed: new Int32Array(size), known: new Int32Array(size), blocked: new Uint8Array(size) });
    searchId = 0;
  }
  if (++searchId > 2e9) { grid.seen.fill(0); grid.closed.fill(0); grid.known.fill(0); searchId = 1; }
  return grid;
}

export function findGridPath(startG, endG, targetX, targetY, options) {
  if (startG.gx === endG.gx && startG.gy === endG.gy) {
    return { path: [{ x: targetX, y: targetY }], isBlockedPath: options.isBlockedPath };
  }
  const cols = game.COLS, rows = game.ROWS, a = searchArrays(), id = searchId;
  const isBlocked = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return options.isBlocked(gx, gy);
    const i = gy * cols + gx;
    if (a.known[i] !== id) { a.known[i] = id; a.blocked[i] = options.isBlocked(gx, gy) ? 1 : 0; }
    return a.blocked[i] === 1;
  };
  // the open list: a min-heap on f of tile indexes (as createOpenList: the same order of pops)
  const heapAt = [], heapF = [];
  const push = (i, f) => {
    heapAt.push(i); heapF.push(f);
    let k = heapAt.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heapF[parent] <= heapF[k]) break;
      [heapAt[parent], heapAt[k]] = [heapAt[k], heapAt[parent]]; [heapF[parent], heapF[k]] = [heapF[k], heapF[parent]];
      k = parent;
    }
  };
  const pop = () => {
    const top = heapAt[0], lastAt = heapAt.pop(), lastF = heapF.pop();
    if (heapAt.length > 0) {
      heapAt[0] = /** @type {number} */ (lastAt); heapF[0] = /** @type {number} */ (lastF);
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let smallest = k;
        if (l < heapAt.length && heapF[l] < heapF[smallest]) smallest = l;
        if (r < heapAt.length && heapF[r] < heapF[smallest]) smallest = r;
        if (smallest === k) break;
        [heapAt[smallest], heapAt[k]] = [heapAt[k], heapAt[smallest]]; [heapF[smallest], heapF[k]] = [heapF[k], heapF[smallest]];
        k = smallest;
      }
    }
    return top;
  };
  const inMap = (gx, gy) => gx >= 0 && gy >= 0 && gx < cols && gy < rows;
  const startIndex = startG.gy * cols + startG.gx, endIndex = endG.gy * cols + endG.gx;
  // (a start off the map: searched as before, from nothing)
  if (!inMap(startG.gx, startG.gy)) return { path: [], isBlockedPath: options.isBlockedPath };
  a.g[startIndex] = 0; a.seen[startIndex] = id; a.from[startIndex] = -1;
  push(startIndex, Math.hypot(startG.gx - endG.gx, startG.gy - endG.gy));
  let found = false;

  // no step cap: with the heap a failed search over the whole 40x40 map is still cheap,
  // and long detours through rock mazes need it
  while (heapAt.length > 0) {
    const current = pop(), cx = current % cols, cy = (current - cx) / cols;
    // a node can be queued several times before it's expanded; skip stale copies
    if (a.closed[current] === id) continue;
    if (current === endIndex) { found = true; break; }
    a.closed[current] = id;

    for (const direction of PATH_DIRECTIONS) {
      const gx = cx + direction.dx;
      const gy = cy + direction.dy;
      if (!inMap(gx, gy)) { isBlocked(gx, gy); continue; }
      const next = gy * cols + gx;
      if (a.closed[next] === id || isBlocked(gx, gy)) continue;
      if (!options.allowCornerCutting && direction.dx !== 0 && direction.dy !== 0 &&
          (isBlocked(cx + direction.dx, cy) || isBlocked(cx, cy + direction.dy))) continue;

      const extraCost = options.extraCost ? options.extraCost(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15) : 0;
      const tentativeG = a.g[current] + direction.cost + extraCost;
      if (a.seen[next] !== id || tentativeG < a.g[next]) {
        a.g[next] = tentativeG; a.seen[next] = id; a.from[next] = current;
        push(next, tentativeG + Math.hypot(gx - endG.gx, gy - endG.gy));
      }
    }
  }

  const path = [];
  for (let i = found ? endIndex : -1; i !== -1; i = a.from[i]) {
    const gx = i % cols;
    path.push({ x: gx * TILE_SIZE + 15, y: (i - gx) / cols * TILE_SIZE + 15 });
  }
  path.reverse();
  if (path.length > 0) path.push({ x: targetX, y: targetY });
  return { path, isBlockedPath: options.isBlockedPath };
}

// Enemies' way to their target: one search that weighs going round against breaking through, in
// tiles of walking: breaking a building costs `building`, a tree or boulder `nature`, walking over spikes
// `spikes`. Rock and water can't be crossed at all.
// (#326) a building costs 3 tiles: one is broken through when the way round is more than 3 tiles longer (both
// sides, every mode); spikes are the other side's, walked straight over
export const ENEMY_PATH_COST = { building: 3, nature: 25, spikes: 0 };

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
  const isBuilding = k => tiles.buildings.has(k) && !tiles.spikes.has(k) && !tiles.traps.has(k) && !tiles.redDoors.has(k); // (traps unseen, #248; its own doors walked through)
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

export function findPathAStar(startX, startY, targetX, targetY, isEnemy = false) {
  let startG = getGridPos(startX, startY);
  let endG = getGridPos(targetX, targetY);

  endG.gx = Math.max(0, Math.min(game.COLS - 1, endG.gx));
  endG.gy = Math.max(0, Math.min(game.ROWS - 1, endG.gy));

  if (startG.gx === endG.gx && startG.gy === endG.gy) {
    return { path: [{ x: targetX, y: targetY }], isBlockedPath: false };
  }

  const isBlocked = isEnemy ? isTileBlockedForEnemyStrict : isTileBlockedForSettler;

  if (isBlocked(endG.gx, endG.gy)) {
    let neighbors = [
      {gx: endG.gx+1, gy: endG.gy}, {gx: endG.gx-1, gy: endG.gy},
      {gx: endG.gx, gy: endG.gy+1}, {gx: endG.gx, gy: endG.gy-1}
    ];
    let bestN = null;
    let minD = Infinity;
    for (let n of neighbors) {
      if (!isBlocked(n.gx, n.gy)) {
        let d = Math.hypot(n.gx - startG.gx, n.gy - startG.gy);
        if (d < minD) { minD = d; bestN = n; }
      }
    }
    if (bestN) endG = bestN;
  }

  const result = findGridPath(startG, endG, targetX, targetY, {
    isBlocked,
    allowCornerCutting: false,
    isBlockedPath: false
  });
  if (isEnemy && result.path.length === 0) return findPathAStarPermissive(startX, startY, targetX, targetY);
  // a long way round (to a far door): breaking through may be quicker; whichever costs less. (#326) Tried once
  // the way round is more than BREAK_DETOUR tiles longer than the straight way
  const dx = Math.abs(endG.gx - startG.gx), dy = Math.abs(endG.gy - startG.gy);
  const straight = Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  const roundabout = result.path.length === 0 || pathCost(result.path) > straight + BREAK_DETOUR;
  if (isEnemy && roundabout) {
    const through = findPathAStarPermissive(startX, startY, targetX, targetY, true);
    if (through.path.length > 0 && through.cost < pathCost(result.path)) return through;
  }
  // (#326) the player's too, through the enemy's buildings (a battle's red half, a raid's camp)
  if (!isEnemy && roundabout && (getTileIndex().redBuildings.size > 0 || getTileIndex().redDoors.size > 0)) {
    const through = findSettlerPathThrough(startG, endG, targetX, targetY);
    if (through.path.length > 0 && (result.path.length === 0 || through.cost < pathCost(result.path))) return through;
  }
  return result;
}

const BREAK_DETOUR = 3;

// (#326) A settler's way through the enemy's buildings (its walls, doors and the like count ENEMY_PATH_COST.building
// tiles each, to break): isBlockedPath, so it strikes what's in the way (see breakWhatsInTheWay)
function findSettlerPathThrough(startG, endG, targetX, targetY) {
  const tiles = getTileIndex();
  const isRed = (gx, gy) => { const k = `${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`; return tiles.redBuildings.has(k) || tiles.redDoors.has(k); };
  const result = findGridPath(startG, endG, targetX, targetY, {
    isBlocked: (gx, gy) => isTileBlockedForSettler(gx, gy) && !isRed(gx, gy),
    allowCornerCutting: false,
    isBlockedPath: true,
    extraCost: (x, y) => (tiles.redBuildings.has(`${x},${y}`) || tiles.redDoors.has(`${x},${y}`) ? ENEMY_PATH_COST.building : 0)
  });
  result.cost = pathCost(result.path) + result.path.slice(0, -1).filter(p => tiles.redBuildings.has(`${p.x},${p.y}`) || tiles.redDoors.has(`${p.x},${p.y}`)).length * ENEMY_PATH_COST.building;
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
