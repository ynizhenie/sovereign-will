// Bodies and what stops them: walls, water, natural obstacles, the map's edge, and units pushed apart

import { OUTPOST_COLLISION_HALF_HEIGHT, OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_OFFSET_Y, STRUCTURE_COLLISION_HALF_SIZE, TILE_SIZE, game, getGridPos, getTileIndex, townHall } from '../world/index.js';
import { forEachEnemyNear, forEachSettlerNear, refreshNeighbourPicture } from './neighbours.js';

export function collidesWithBoxList(x, y, radius, objects, halfSize) {
  return objects.some(object => collidesWithBox(x, y, radius, object.x, object.y, halfSize, halfSize));
}

function collidesWithBox(x, y, radius, centerX, centerY, halfWidth, halfHeight) {
  const closestX = Math.max(centerX - halfWidth, Math.min(x, centerX + halfWidth));
  const closestY = Math.max(centerY - halfHeight, Math.min(y, centerY + halfHeight));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

// Box collision against what occupies the tiles around (x, y). Everything solid sits on a tile center,
// so only the few nearby tiles need checking instead of every object on the map.
// kinds: [[tileIndex set name, box half size], ...]
// (#299) a kind's tiles as a grid (gy * COLS + gx), made from the tile index's set the first time it's asked
// for and kept with that index: looking a tile up by a "x,y" string thousands of times a tick was slow
// (keyed by the set itself: a set the index kept, its grid kept too)
/** @type {WeakMap<Set<string>, Uint8Array>} */
const kindGrids = new WeakMap();
function kindGrid(tiles, set) {
  let grid = kindGrids.get(tiles[set]);
  if (!grid || grid.length !== game.COLS * game.ROWS) {
    grid = new Uint8Array(game.COLS * game.ROWS);
    for (const key of tiles[set]) {
      const comma = key.indexOf(','), gx = (Number(key.slice(0, comma)) - 15) / TILE_SIZE, gy = (Number(key.slice(comma + 1)) - 15) / TILE_SIZE;
      if (Number.isInteger(gx) && Number.isInteger(gy) && gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS) grid[gy * game.COLS + gx] = 1;
    }
    kindGrids.set(tiles[set], grid);
  }
  return grid;
}

export function collidesWithTiles(x, y, radius, kinds) {
  const tiles = getTileIndex();
  const span = Math.ceil((radius + 15) / TILE_SIZE);
  const g = getGridPos(x, y);
  for (let gy = g.gy - span; gy <= g.gy + span; gy++) {
    if (gy < 0 || gy >= game.ROWS) continue;
    for (let gx = g.gx - span; gx <= g.gx + span; gx++) {
      if (gx < 0 || gx >= game.COLS) continue;
      const cx = gx * TILE_SIZE + 15, cy = gy * TILE_SIZE + 15, at = gy * game.COLS + gx;
      for (const [set, halfSize] of kinds) {
        if (!kindGrid(tiles, set)[at]) continue;
        const dx = x - Math.max(cx - halfSize, Math.min(x, cx + halfSize));
        const dy = y - Math.max(cy - halfSize, Math.min(y, cy + halfSize));
        if (dx * dx + dy * dy < radius * radius) return true;
      }
    }
  }
  return false;
}

export const WALL_COLLISION_KINDS = [['walls', 14], ['rocks', 14], ['water', 15], ['trees', 12], ['solids', 12]];

export function collidesWithWall(x, y, radius) {
  if (collidesWithBoxList(x, y, radius, [townHall], STRUCTURE_COLLISION_HALF_SIZE)) return true;
  if (game.enemyTents.some(outpost => outpost.outpost && outpost.hp > 0 &&
    collidesWithBox(x, y, radius, outpost.x, outpost.y + OUTPOST_COLLISION_OFFSET_Y, OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_HALF_HEIGHT))) return true;
  return collidesWithTiles(x, y, radius, WALL_COLLISION_KINDS);
}

export function collidesWithWater(x, y, radius) {
  return collidesWithTiles(x, y, radius, [['water', 15]]);
}

export function getSettlerAvoidance(entity) {
  let avoidX = 0;
  let avoidY = 0;
  // (#306) only those close enough to push it, out of the tick's picture of where everyone is: asking all of
  // them for each of them was the most expensive thing in a big colony's tick
  forEachSettlerNear(entity.x, entity.y, 38, other => {
    if (other === entity || other.asleep) return; // (#279: one asleep lies on the ground: stepped over, not walked round; round a tent they hemmed everyone in)
    let dx = entity.x - other.x;
    let dy = entity.y - other.y;
    let distance = Math.hypot(dx, dy);
    if (distance >= 38) return;
    if (distance === 0) {
      dx = entity.id % 2 === 0 ? 1 : -1;
      dy = 0;
      distance = 1;
    }
    let strength = (38 - distance) / 38;
    avoidX += (dx / distance) * strength;
    avoidY += (dy / distance) * strength;
  });
  return { x: avoidX, y: avoidY };
}

export function collidesWithEnemyNaturalResource(x, y, radius) {
  return collidesWithTiles(x, y, radius, [['trees', 14], ['solids', 14]]);
}

export function rescueEnemyFromResource(enemy) {
  const radius = Math.min(enemy.radius, 13);
  if (!collidesWithEnemyNaturalResource(enemy.x, enemy.y, radius)) return false;
  const current = getGridPos(enemy.x, enemy.y);
  const candidates = [];
  for (let distance = 1; distance <= 3; distance++) {
    for (let dy = -distance; dy <= distance; dy++) {
      for (let dx = -distance; dx <= distance; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) continue;
        const x = (current.gx + dx) * TILE_SIZE + 15;
        const y = (current.gy + dy) * TILE_SIZE + 15;
        if (x < 15 || y < 15 || x > game.WORLD_WIDTH - 15 || y > game.WORLD_HEIGHT - 15 ||
            collidesWithWall(x, y, radius) || collidesWithWater(x, y, radius)) continue;
        candidates.push({ x, y, distance: Math.hypot(x - enemy.x, y - enemy.y) });
      }
    }
    if (candidates.length) break;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const escape = candidates[0];
  if (!escape) return false;
  enemy.x = escape.x;
  enemy.y = escape.y;
  enemy.path = null;
  enemy.pathTarget = null;
  enemy.moveVx = 0;
  enemy.moveVy = 0;
  return true;
}

export function separateSettlersFromEnemies() {
  for (let round = 0; round < 4; round++) {
    if (!separateSettlersFromEnemiesOnce()) return;
  }
}

export function separateSettlersFromEnemiesOnce() {
  let moved = false;
  // The picture of where everyone was is made after each pass, because a pass pushes bodies about and
  // an old picture would keep pushing them apart at places they have already left.
  refreshNeighbourPicture();
  let widestEnemy = 0;
  for (const en of game.enemies) if (en.radius > widestEnemy) widestEnemy = en.radius;
  for (const s of game.settlers) {
    if (s.towerAssignment || s.ghostly) continue; // up in a watchtower; (#314) a ghost: through everyone
    const sRadius = s.visualRadius || s.radius;
    forEachEnemyNear(s.x, s.y, sRadius + widestEnemy, en => {
      if (en.ghostly) return;
      let dx = s.x - en.x, dy = s.y - en.y;
      let dist = Math.hypot(dx, dy);
      const overlap = sRadius + en.radius - dist;
      if (overlap <= 0) return;
      if (dist === 0) { dx = 1; dy = 0; dist = 1; }
      const nx = dx / dist, ny = dy / dist;
      const canMove = (unit, share, sign) => !collidesWithWall(unit.x + sign * nx * overlap * share, unit.y + sign * ny * overlap * share, Math.min(unit.radius, 13));
      let settlerShare = 0.5, enemyShare = 0.5;
      if (!canMove(s, 0.5, 1)) { settlerShare = 0; enemyShare = canMove(en, 1, -1) ? 1 : 0; }
      else if (!canMove(en, 0.5, -1)) { enemyShare = 0; settlerShare = canMove(s, 1, 1) ? 1 : 0; }
      s.x += nx * overlap * settlerShare; s.y += ny * overlap * settlerShare;
      en.x -= nx * overlap * enemyShare; en.y -= ny * overlap * enemyShare;
      moved = true;
    });
  }
  return moved;
}

export function clampEntityToBounds(ent) {
  ent.x = Math.max(ent.radius, Math.min(game.WORLD_WIDTH - ent.radius, ent.x));
  ent.y = Math.max(ent.radius, Math.min(game.WORLD_HEIGHT - ent.radius, ent.y));
}

export function ejectEntitiesFromTile(x, y) {
  const allEntities = [...game.settlers, ...game.enemies];
  allEntities.forEach(ent => {
    if (Math.abs(ent.x - x) < 16 + ent.radius && Math.abs(ent.y - y) < 16 + ent.radius) {
      const offsets = [
        {x: 0, y: -TILE_SIZE}, {x: 0, y: TILE_SIZE}, {x: -TILE_SIZE, y: 0}, {x: TILE_SIZE, y: 0}
      ];
      for (let off of offsets) {
        let nx = x + off.x, ny = y + off.y;
        if (!collidesWithWall(nx, ny, ent.radius)) {
          ent.x = nx; ent.y = ny;
          break;
        }
      }
    }
  });
}
