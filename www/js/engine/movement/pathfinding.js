// Finding a way: which tiles block whom (settlers, enemies), walking distances, and A* paths

// isTileBlockedForSettler for the whole map as a Uint8Array (gy * COLS + gx), rebuilt only when the
// world's blocking tiles change. Settler path searches read this instead of re-checking each tile.
let settlerBlockedGrid = { signature: null, grid: null };

function getSettlerBlockedGrid() {
  const signature = getTileIndex().signature;
  if (settlerBlockedGrid.signature !== signature || settlerBlockedGrid.grid.length !== game.COLS * game.ROWS) {
    const grid = new Uint8Array(game.COLS * game.ROWS);
    for (let gy = 0; gy < game.ROWS; gy++) {
      for (let gx = 0; gx < game.COLS; gx++) grid[gy * game.COLS + gx] = computeTileBlockedForSettler(gx, gy) ? 1 : 0;
    }
    settlerBlockedGrid = { signature, grid };
  }
  return settlerBlockedGrid.grid;
}

function isTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  return getSettlerBlockedGrid()[gy * game.COLS + gx] === 1;
}

function computeTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;

  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.walls.has(k) || tiles.spikes.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

// Walking distance (in tiles) from the settler's tile to every tile, as an Int16Array indexed gy * COLS + gx,
// -1 where it can't get. Cached until the settler changes tile or the world's blocking tiles change.
function getSettlerReach(settler) {
  const start = getGridPos(settler.x, settler.y);
  const startIndex = start.gy * game.COLS + start.gx;
  const signature = getTileIndex().signature;
  const cache = settler.reachCache;
  if (cache && cache.startIndex === startIndex && cache.signature === signature) return cache.steps;

  const blocked = getSettlerBlockedGrid();
  const steps = new Int16Array(game.COLS * game.ROWS).fill(-1);
  const queue = [startIndex];
  if (startIndex >= 0 && startIndex < steps.length) steps[startIndex] = 0;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const cx = current % game.COLS, cy = (current - cx) / game.COLS;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cx + dx, gy = cy + dy;
      if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) continue;
      const index = gy * game.COLS + gx;
      if (steps[index] !== -1 || blocked[index]) continue;
      steps[index] = steps[current] + 1;
      queue.push(index);
    }
  }
  settler.reachCache = { startIndex, signature, steps };
  return steps;
}

function getReachSteps(reach, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) return -1;
  return reach[gy * game.COLS + gx];
}

// Steps to stand next to (or on) a resource, or Infinity if the settler can't get there.
// reach comes from getSettlerReach(). Only the resource's own tile and its 4 direct neighbours count:
// a diagonal neighbour is only usable through one of those, and a resource reachable only across a
// corner between two rocks has no spot a settler can actually stand on.
function getReachDistanceToResource(reach, resource) {
  const g = getGridPos(resource.x, resource.y);
  let best = Infinity;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const steps = getReachSteps(reach, g.gx + dx, g.gy + dy);
    if (steps !== -1 && steps < best) best = steps;
  }
  return best;
}

function isTileBlockedForEnemyStrict(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;
  // route around buildings when possible; if walled in, the fallback search paths through them and enemies break them
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.buildings.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

function isTileBlockedForEnemyPermissive(gx, gy) {
  if (gx < 0 || gx >= game.COLS || gy < 0 || gy >= game.ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  // enemies can chop trees and boulders and break buildings on the way (see update()), but not cacti or ore
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.rocks.has(k) || tiles.water.has(k) || tiles.cacti.has(k) || tiles.ores.has(k);
}

const PATH_DIRECTIONS = [
  {dx:0, dy:-1, cost:1}, {dx:0, dy:1, cost:1}, {dx:-1, dy:0, cost:1}, {dx:1, dy:0, cost:1},
  {dx:-1, dy:-1, cost:1.41}, {dx:1, dy:-1, cost:1.41}, {dx:-1, dy:1, cost:1.41}, {dx:1, dy:1, cost:1.41}
];

// min-heap keyed by f, for the A* open list
function createOpenList() {
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

function findGridPath(startG, endG, targetX, targetY, options) {
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
      if (!gScore.has(nextKey) || tentativeG < gScore.get(nextKey)) {
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

// Enemies' way to their target (#155): one search that weighs going round against breaking through, in
// tiles of walking: breaking a building costs `building`, a tree or boulder `nature`, walking over spikes
// `spikes`. Rock and water can't be crossed at all.
const ENEMY_PATH_COST = { building: 12, nature: 25, spikes: 2 };

// A path's length in tiles (diagonal steps count 1.41)
function pathCost(path) {
  let cost = 0;
  for (let i = 1; i < path.length - 1; i++) cost += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y) / TILE_SIZE;
  return cost;
}

// natureBlocks: trees and boulders are walked round, not chopped through (only buildings and spikes
// are taken straight, when the way round is long)
function findPathAStarPermissive(startX, startY, targetX, targetY, natureBlocks = false) {
  const startG = getGridPos(startX, startY);
  const endG = getGridPos(targetX, targetY);
  endG.gx = Math.max(0, Math.min(game.COLS - 1, endG.gx));
  endG.gy = Math.max(0, Math.min(game.ROWS - 1, endG.gy));
  const tiles = getTileIndex();
  const isBuilding = k => tiles.buildings.has(k) && !tiles.spikes.has(k);
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
    // round (to a far door), spikes are walked over, trees and boulders mostly walked round (#155)
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

function findPathAStar(startX, startY, targetX, targetY, isEnemy = false) {
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
  // a long way round (to a far door, round a wall of spikes): breaking through, or walking the spikes,
  // may be quicker; whichever costs less (#155)
  if (isEnemy && pathCost(result.path) > 1.5 * Math.hypot(endG.gx - startG.gx, endG.gy - startG.gy) + 4) {
    const through = findPathAStarPermissive(startX, startY, targetX, targetY, true);
    if (through.path.length > 0 && through.cost < pathCost(result.path)) return through;
  }
  return result;
}

function hasClearEnemyLine(startX, startY, targetX, targetY, radius = 12) {
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
function pathCrossesSpikes(en) {
  if (!en.path || en.path.length === 0) return false;
  const tiles = getTileIndex();
  return en.path.some(p => tiles.spikes.has(`${p.x},${p.y}`));
}

function invalidateAllPaths() {
  resetTileIndex();
  game.settlers.forEach(s => { s.path = null; s.pathTarget = null; });
  game.enemies.forEach(en => { en.path = null; en.pathTarget = null; });
}
