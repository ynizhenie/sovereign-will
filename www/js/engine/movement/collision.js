// Bodies and what stops them: walls, water, natural obstacles, the map's edge, and units pushed apart

import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, getTileIndex } from '../world/index.js';
import { forEachSettlerNear } from './neighbours.js';

export function collidesWithBoxList(x, y, radius, objects, halfSize) {
  return objects.some(object => {
    const closestX = Math.max(object.x - halfSize, Math.min(x, object.x + halfSize));
    const closestY = Math.max(object.y - halfSize, Math.min(y, object.y + halfSize));
    const dx = x - closestX;
    const dy = y - closestY;
    return dx * dx + dy * dy < radius * radius;
  });
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

export const WALL_COLLISION_KINDS = [['walls', 14], ['redDoors', 14], ['rocks', 14], ['water', 15], ['trees', 12], ['solids', 12]];
// (#326) an enemy goes through its own doors (the red side's): a wall to the player's
const ENEMY_WALL_KINDS = WALL_COLLISION_KINDS.filter(([set]) => set !== 'redDoors');

export function collidesWithWall(x, y, radius, isEnemy = false) {
  return collidesWithTiles(x, y, radius, isEnemy ? ENEMY_WALL_KINDS : WALL_COLLISION_KINDS);
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

export function separateSettlersFromEnemies() {
  for (let round = 0; round < 4; round++) {
    if (!separateSettlersFromEnemiesOnce()) return;
  }
}

export function separateSettlersFromEnemiesOnce() {
  let moved = false;
  for (const s of game.settlers) {
    if (s.towerAssignment || s.ghostly) continue; // up in a watchtower; (#314) a ghost: through everyone
    const sRadius = s.visualRadius || s.radius;
    for (const en of game.enemies) {
      if (en.ghostly) continue;
      let dx = s.x - en.x, dy = s.y - en.y;
      let dist = Math.hypot(dx, dy);
      const overlap = sRadius + en.radius - dist;
      if (overlap <= 0) continue;
      if (dist === 0) { dx = 1; dy = 0; dist = 1; }
      const nx = dx / dist, ny = dy / dist;
      const canMove = (unit, share, sign) => !collidesWithWall(unit.x + sign * nx * overlap * share, unit.y + sign * ny * overlap * share, Math.min(unit.radius, 13));
      let settlerShare = 0.5, enemyShare = 0.5;
      if (!canMove(s, 0.5, 1)) { settlerShare = 0; enemyShare = canMove(en, 1, -1) ? 1 : 0; }
      else if (!canMove(en, 0.5, -1)) { enemyShare = 0; settlerShare = canMove(s, 1, 1) ? 1 : 0; }
      s.x += nx * overlap * settlerShare; s.y += ny * overlap * settlerShare;
      en.x -= nx * overlap * enemyShare; en.y -= ny * overlap * enemyShare;
      moved = true;
    }
  }
  return moved;
}

// (#326) Allies don't stand inside each other either (a fight's crowd went into one another): each overlapping
// pair of one side pushed apart, a part of the way a tick (gently: one walking past another isn't shoved), not
// one asleep (lying), up in a tower, or a ghost; not into a wall. fightingOnly: only those that struck in the last
// few seconds (settlers: two working at one tuft of grass were pushed out of its reach, both, for good)
const ALLY_PUSH = 0.35, FIGHTING_TICKS = 180;
export function separateAllies(units, fightingOnly = false) {
  const live = units.filter(u => !u.asleep && !u.towerAssignment && !u.ghostly && !(u.hp <= 0)
    && (!fightingOnly || (u.struckAt !== undefined && game.pathTick - u.struckAt < FIGHTING_TICKS)));
  for (let i = 0; i < live.length; i++) {
    const a = live[i], ar = Math.min(a.visualRadius || a.radius, 13) * 0.85;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j], br = Math.min(b.visualRadius || b.radius, 13) * 0.85;
      if (fightingOnly && game.gameMode === 'battle' && a.fightTarget &&
        a.fightTarget === b.fightTarget && game.enemies.includes(a.fightTarget) && a.fightTarget.hp > 0) continue;
      let dx = a.x - b.x, dy = a.y - b.y;
      if (Math.abs(dx) > ar + br || Math.abs(dy) > ar + br) continue;
      let dist = Math.hypot(dx, dy);
      const overlap = ar + br - dist;
      if (overlap <= 0) continue;
      if (dist === 0) { dx = (i % 2 ? 1 : -1); dy = 0; dist = 1; }
      const push = overlap * ALLY_PUSH;
      const nx = dx / dist * push, ny = dy / dist * push;
      if (!a.isPossessed && !collidesWithWall(a.x + nx, a.y + ny, Math.min(a.radius, 13))) { a.x += nx; a.y += ny; }
      if (!b.isPossessed && !collidesWithWall(b.x - nx, b.y - ny, Math.min(b.radius, 13))) { b.x -= nx; b.y -= ny; }
    }
  }
}

// In the world; (#326) in a battle, off the red strip round the field too, but for one fleeing in a panic
export function clampEntityToBounds(ent) {
  const edge = game.gameMode === 'battle' && !ent.panic ? BORDER_MARGIN * TILE_SIZE : 0;
  ent.x = Math.max(edge + ent.radius, Math.min(game.WORLD_WIDTH - edge - ent.radius, ent.x));
  ent.y = Math.max(edge + ent.radius, Math.min(game.WORLD_HEIGHT - edge - ent.radius, ent.y));
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
