function deselectSettler() { selectedSettler = null; }

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
  let signature = 0;
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
    solids: keys([...boulders, ...cacti, ...ironOres, ...coalOres]),
    buildings: keys(buildings),
    walls: keys(buildings.filter(b => b.type !== 'door'))
  };
  return tileIndex;
}

// isTileBlockedForSettler for the whole map as a Uint8Array (gy * COLS + gx), rebuilt only when the
// world's blocking tiles change. Settler path searches read this instead of re-checking each tile.
let settlerBlockedGrid = { signature: null, grid: null };

function getSettlerBlockedGrid() {
  const signature = getTileIndex().signature;
  if (settlerBlockedGrid.signature !== signature) {
    const grid = new Uint8Array(COLS * ROWS);
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) grid[gy * COLS + gx] = computeTileBlockedForSettler(gx, gy) ? 1 : 0;
    }
    settlerBlockedGrid = { signature, grid };
  }
  return settlerBlockedGrid.grid;
}

function isTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
  return getSettlerBlockedGrid()[gy * COLS + gx] === 1;
}

function computeTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;

  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.walls.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

// Walking distance (in tiles) from the settler's tile to every tile, as an Int16Array indexed gy * COLS + gx,
// -1 where it can't get. Cached until the settler changes tile or the world's blocking tiles change.
function getSettlerReach(settler) {
  const start = getGridPos(settler.x, settler.y);
  const startIndex = start.gy * COLS + start.gx;
  const signature = getTileIndex().signature;
  const cache = settler.reachCache;
  if (cache && cache.startIndex === startIndex && cache.signature === signature) return cache.steps;

  const blocked = getSettlerBlockedGrid();
  const steps = new Int16Array(COLS * ROWS).fill(-1);
  const queue = [startIndex];
  if (startIndex >= 0 && startIndex < steps.length) steps[startIndex] = 0;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const cx = current % COLS, cy = (current - cx) / COLS;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cx + dx, gy = cy + dy;
      if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) continue;
      const index = gy * COLS + gx;
      if (steps[index] !== -1 || blocked[index]) continue;
      steps[index] = steps[current] + 1;
      queue.push(index);
    }
  }
  settler.reachCache = { startIndex, signature, steps };
  return steps;
}

function getReachSteps(reach, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return -1;
  return reach[gy * COLS + gx];
}

// Steps to stand next to (or on) a resource, or Infinity if the settler can't get there.
// reach comes from getSettlerReach().
function getReachDistanceToResource(reach, resource) {
  const g = getGridPos(resource.x, resource.y);
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const steps = getReachSteps(reach, g.gx + dx, g.gy + dy);
      if (steps !== -1 && steps < best) best = steps;
    }
  }
  return best;
}

function getResourceApproachPoint(entity, resource) {
  let resRadius = resource.radius || 14;
  let entRadius = entity.radius || 10;
  let minDistance = resRadius + entRadius + 1;
  // only consider spots the settler can actually walk to; a spot that's free but sealed off by rock
  // used to win on straight-line distance and leave the settler standing there forever
  const reach = settlers.includes(entity) ? getSettlerReach(entity) : null;
  // the spot rarely changes frame to frame; re-pick it twice a second or when the situation changes
  const cache = entity.approachCache;
  if (reach && cache && cache.resource === resource && cache.reach === reach && pathTick - cache.tick < 30) return cache.point;

  const approachDistances = [minDistance, minDistance + 3, minDistance + 6];

  for (const distance of approachDistances) {
    let best = null;
    let bestScore = Infinity;

    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      let x = resource.x + Math.cos(angle) * distance;
      let y = resource.y + Math.sin(angle) * distance;

      if (collidesWithWall(x, y, entRadius) || collidesWithWater(x, y, entRadius)) continue;

      let score = Math.hypot(x - entity.x, y - entity.y);
      if (reach) {
        const g = getGridPos(x, y);
        const steps = getReachSteps(reach, g.gx, g.gy);
        if (steps === -1) continue;
        score += steps * TILE_SIZE;
        // spread settlers working the same resource around it instead of stacking them on one spot
        if (settlers.some(other => other !== entity && Math.hypot(other.x - x, other.y - y) < entRadius * 2)) score += 1000;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }

    if (best) {
      if (reach) entity.approachCache = { resource, reach, tick: pathTick, point: best };
      return best;
    }
  }

  return null;
}

function rescueSettlerFromResource(settler) {
  if (settler.towerAssignment) return;
  // solid things sit on tile centers, so only the settler's own tile can be within 14px of it
  const tile = getGridPos(settler.x, settler.y);
  const cx = tile.gx * TILE_SIZE + 15, cy = tile.gy * TILE_SIZE + 15, key = `${cx},${cy}`;
  const tiles = getTileIndex();
  if (!(tiles.trees.has(key) || tiles.solids.has(key) || tiles.rocks.has(key))) return;
  if (Math.hypot(settler.x - cx, settler.y - cy) >= 14) return;
  const blockedResource = { x: cx, y: cy };
  let dx = settler.x - blockedResource.x;
  let dy = settler.y - blockedResource.y;
  const distance = Math.hypot(dx, dy) || 1;
  const resRadius = blockedResource.radius || 14;
  const entRadius = settler.radius || 10;
  const pushDistance = resRadius + entRadius + 1;
  settler.x = blockedResource.x + (dx / distance) * pushDistance;
  settler.y = blockedResource.y + (dy / distance) * pushDistance;
  clampEntityToBounds(settler);
  settler.path = null;
  settler.pathTarget = null;
}

function isTileBlockedForEnemyStrict(gx, gy) {
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;
  // route around buildings when possible; if walled in, the fallback search paths through them and enemies break them
  const tiles = getTileIndex(), k = `${tx},${ty}`;
  return tiles.buildings.has(k) || tiles.rocks.has(k) || tiles.water.has(k) || tiles.trees.has(k) ||
         tiles.cacti.has(k) || tiles.boulders.has(k) || tiles.ores.has(k);
}

function collidesWithEnemyNaturalResource(x, y, radius) {
  return collidesWithTiles(x, y, radius, [['trees', 14], ['solids', 14]]);
}

function isTileBlockedForEnemyPermissive(gx, gy) {
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
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

function findPathAStarPermissive(startX, startY, targetX, targetY) {
  const startG = getGridPos(startX, startY);
  const endG = getGridPos(targetX, targetY);
  endG.gx = Math.max(0, Math.min(COLS - 1, endG.gx));
  endG.gy = Math.max(0, Math.min(ROWS - 1, endG.gy));
  const tiles = getTileIndex();
  const isBreakable = k => tiles.trees.has(k) || tiles.boulders.has(k) || tiles.buildings.has(k);
  return findGridPath(startG, endG, targetX, targetY, {
    isBlocked: isTileBlockedForEnemyPermissive,
    // no squeezing diagonally between two rocks
    allowCornerCutting: false,
    isBlockedPath: true,
    extraCost: (x, y) => (isBreakable(`${x},${y}`) ? 10 : 0)
  });
}

function findPathAStar(startX, startY, targetX, targetY, isEnemy = false) {
  let startG = getGridPos(startX, startY);
  let endG = getGridPos(targetX, targetY);

  endG.gx = Math.max(0, Math.min(COLS - 1, endG.gx));
  endG.gy = Math.max(0, Math.min(ROWS - 1, endG.gy));

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
  return result;
}

function findSafeStepAroundObstacle(entity, targetX, targetY, speed) {
  let dx = targetX - entity.x;
  let dy = targetY - entity.y;
  let dist = Math.hypot(dx, dy) || 1;
  let baseAngle = Math.atan2(dy, dx);
  let best = null;
  let bestScore = Infinity;

  for (let offset = -1.5; offset <= 1.5; offset += 0.25) {
    let angle = baseAngle + offset;
    let stepX = Math.cos(angle) * Math.min(speed, 12);
    let stepY = Math.sin(angle) * Math.min(speed, 12);
    let nx = entity.x + stepX;
    let ny = entity.y + stepY;

    if (!collidesWithWall(nx, ny, entity.radius) && !collidesWithWater(nx, ny, entity.radius)) {
      let score = Math.hypot(nx - targetX, ny - targetY);
      if (score < bestScore) {
        bestScore = score;
        best = { x: stepX, y: stepY };
      }
    }
  }

  if (best) return best;

  for (let step = 1; step <= 8; step++) {
    for (let angle = -Math.PI; angle <= Math.PI; angle += Math.PI / 8) {
      let nx = entity.x + Math.cos(angle) * step * 1.5;
      let ny = entity.y + Math.sin(angle) * step * 1.5;
      if (!collidesWithWall(nx, ny, entity.radius) && !collidesWithWater(nx, ny, entity.radius)) {
        let score = Math.hypot(nx - targetX, ny - targetY);
        if (score < bestScore) {
          bestScore = score;
          best = { x: nx - entity.x, y: ny - entity.y };
        }
      }
    }
  }

  return best;
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

function moveEntityTowards(entity, targetX, targetY, speed, isEnemy = false, dt = 0.016) {
  let threshold = isEnemy ? 50 : 25;
  // terrain collision body; big units are drawn larger but must still fit one-tile gaps (30px)
  const bodyRadius = Math.min(entity.radius, 13);

  if (entity.pathRetryTimer > 0) entity.pathRetryTimer -= dt;
  if (entity.strictPathFailTimer > 0) entity.strictPathFailTimer -= dt;
  if (isEnemy) entity.pathTimer = (entity.pathTimer || 0) - dt;
  if (entity.directBlockedTimer > 0) entity.directBlockedTimer -= dt;

  let targetChanged = !entity.pathTarget || Math.hypot(entity.pathTarget.x - targetX, entity.pathTarget.y - targetY) > threshold;
  let needsPath = !entity.path || entity.path.length === 0 || targetChanged || (isEnemy && entity.pathTimer <= 0);
  let canRetryPath = !(entity.pathRetryTimer > 0);

  if (needsPath && canRetryPath) {
    // once the normal search found no way around (walled in), go straight to the breaking-through
    // search for a while instead of exploring the whole map again on every re-path
    let res = isEnemy && entity.strictPathFailTimer > 0
      ? findPathAStarPermissive(entity.x, entity.y, targetX, targetY)
      : findPathAStar(entity.x, entity.y, targetX, targetY, isEnemy);
    if (isEnemy && res.isBlockedPath && !(entity.strictPathFailTimer > 0)) entity.strictPathFailTimer = 3;
    entity.path = res.path;
    entity.isBlockedPath = res.isBlockedPath || false;
    entity.pathTarget = { x: targetX, y: targetY };
    if (isEnemy) entity.pathTimer = 1.0;

    if (entity.path.length === 0) {
      entity.pathRetryTimer = isEnemy ? 0.6 : 0.75;
    } else {
      entity.pathRetryTimer = 0;
    }
  }

  if (isEnemy && (entity.directBlockedTimer || 0) <= 0 && hasClearEnemyLine(entity.x, entity.y, targetX, targetY, bodyRadius)) {
    let directDx = targetX - entity.x;
    let directDy = targetY - entity.y;
    let directDist = Math.hypot(directDx, directDy);
    if (directDist > 0) {
      let directVx = (directDx / directDist) * speed;
      let directVy = (directDy / directDist) * speed;
      entity.moveVx = (entity.moveVx || 0) * 0.8 + directVx * 0.2;
      entity.moveVy = (entity.moveVy || 0) * 0.8 + directVy * 0.2;

      if (!collidesWithEnemyNaturalResource(entity.x + entity.moveVx, entity.y + entity.moveVy, bodyRadius) &&
          !collidesWithWall(entity.x + entity.moveVx, entity.y + entity.moveVy, bodyRadius) &&
          !collidesWithWater(entity.x + entity.moveVx, entity.y + entity.moveVy, bodyRadius)) {
        entity.x += entity.moveVx;
        entity.y += entity.moveVy;
      } else {
        entity.moveVx = 0;
        entity.moveVy = 0;
        entity.path = null;
        entity.pathRetryTimer = 0.25;
        entity.directBlockedTimer = 1.5;
        return;
      }
    }
    entity.path = [];
    return;
  }

  // the world changed under the path (a resource respawned on it, a wall was built): re-plan instead of
  // pushing against the new obstacle. The last node is the exact target point, not a tile to walk through.
  if (!isEnemy && entity.path && entity.path.length > 1) {
    const nextTile = getGridPos(entity.path[0].x, entity.path[0].y);
    const hereTile = getGridPos(entity.x, entity.y);
    const stepsOffTile = nextTile.gx !== hereTile.gx || nextTile.gy !== hereTile.gy;
    if (stepsOffTile && isTileBlockedForSettler(nextTile.gx, nextTile.gy)) {
      entity.path = null;
      entity.pathRetryTimer = 0;
      return;
    }
  }

  if (entity.path && entity.path.length > 0) {
    let nextNode = entity.path[0];
    let dx = nextNode.x - entity.x;
    let dy = nextNode.y - entity.y;
    let dist = Math.hypot(dx, dy);

    if (dist < 8) {
      entity.path.shift();
      if (entity.path.length > 0) {
        nextNode = entity.path[0];
        dx = nextNode.x - entity.x;
        dy = nextNode.y - entity.y;
        dist = Math.hypot(dx, dy);
      } else {
        if (!isEnemy) {
          entity.x = targetX;
          entity.y = targetY;
        }
        return;
      }
    }

    if (dist > 0) {
      let vx = (dx / dist) * speed;
      let vy = (dy / dist) * speed;

      if (isEnemy) {
        entity.moveVx = (entity.moveVx || 0) * 0.8 + vx * 0.2;
        entity.moveVy = (entity.moveVy || 0) * 0.8 + vy * 0.2;
        vx = entity.moveVx;
        vy = entity.moveVy;
      } else {
        let avoidance = getSettlerAvoidance(entity);
        vx += avoidance.x * speed * 0.8;
        vy += avoidance.y * speed * 0.8;
        let adjustedSpeed = Math.hypot(vx, vy);
        if (adjustedSpeed > 0) {
          vx = (vx / adjustedSpeed) * speed;
          vy = (vy / adjustedSpeed) * speed;
        }
      }

      if (isEnemy && (collidesWithEnemyNaturalResource(entity.x + vx, entity.y + vy, bodyRadius) ||
          collidesWithWall(entity.x + vx, entity.y + vy, bodyRadius) ||
          collidesWithWater(entity.x + vx, entity.y + vy, bodyRadius))) {
        entity.moveVx = 0;
        entity.moveVy = 0;
        entity.path = null;
        entity.pathRetryTimer = 0.25;
      } else if (!isEnemy && collidesWithWall(entity.x + vx, entity.y + vy, bodyRadius)) {
        // the push away from other settlers can shove a settler into a rock corner: try the plain
        // path direction first, then sidestep toward the next path node (not the final target, which
        // around a corner points straight back into the rock)
        const plainVx = (dx / dist) * speed;
        const plainVy = (dy / dist) * speed;
        let fallback = !collidesWithWall(entity.x + plainVx, entity.y + plainVy, bodyRadius)
          ? { x: plainVx, y: plainVy }
          : findSafeStepAroundObstacle(entity, nextNode.x, nextNode.y, speed);
        if (fallback) {
          entity.x += fallback.x;
          entity.y += fallback.y;
        } else {
          entity.path = null;
        }
      } else {
        entity.x += vx;
        entity.y += vy;
      }
    }
  } 

  else if (!isEnemy) {
    let directDx = targetX - entity.x;
    let directDy = targetY - entity.y;
    let directDist = Math.hypot(directDx, directDy);

    if (directDist > 2 && directDist < 45) {
      let directVx = (directDx / directDist) * speed;
      let directVy = (directDy / directDist) * speed;

      if (!collidesWithWall(entity.x + directVx, entity.y + directVy, bodyRadius)) {
        entity.x += directVx;
        entity.y += directVy;
      }
    }
  }
}

function clampEntityToBounds(ent) {
  ent.x = Math.max(ent.radius, Math.min(canvas.width - ent.radius, ent.x));
  ent.y = Math.max(ent.radius, Math.min(canvas.height - ent.radius, ent.y));
}

function makeBoarFlee(boar, sourceX, sourceY) {
  if ((boar.fleeTimer || 0) > 0) return;

  let dx = boar.x - sourceX;
  let dy = boar.y - sourceY;
  let distance = Math.hypot(dx, dy);
  if (distance === 0) {
    let angle = rand() * Math.PI * 2;
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }

  let fleeDistance = 80 + rand() * 60;
  boar.fleeTimer = 1.2;
  boar.fleeSpeed = 1.35;
  boar.hideTarget = null;

  let nearbyGrass = grassList.filter(grass => Math.hypot(grass.x - boar.x, grass.y - boar.y) <= 360);
  let hideGrass = nearbyGrass.length > 0 ? nearbyGrass : grassList;
  if (hideGrass.length > 0) {
    boar.hideTarget = hideGrass.reduce((nearest, grass) => {
      let nearestDistance = Math.hypot(nearest.x - boar.x, nearest.y - boar.y);
      let grassDistance = Math.hypot(grass.x - boar.x, grass.y - boar.y);
      return grassDistance < nearestDistance ? grass : nearest;
    });
    boar.targetX = boar.hideTarget.x;
    boar.targetY = boar.hideTarget.y;
  } else {
    boar.targetX = Math.max(60, Math.min(canvas.width - 60, boar.x + dx / distance * fleeDistance));
    boar.targetY = Math.max(60, Math.min(canvas.height - 60, boar.y + dy / distance * fleeDistance));
  }
}
