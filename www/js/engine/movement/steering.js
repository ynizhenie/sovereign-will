// One step towards a target: along the path, round obstacles and other units, never onto the colony's own
// spikes; and where to stand to reach a resource

import { GAME_CONFIG } from '../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, getTileIndex } from '../world/index.js';
import { isBlighted } from '../../domains/factions/undead/index.js';
import { findPathAStar, findPathAStarPermissive, getReachSteps, getSettlerReach, hasClearEnemyLine, isTileBlockedForSettler, pathCrossesSpikes } from './pathfinding.js';
import { clampEntityToBounds, collidesWithEnemyNaturalResource, collidesWithWall, collidesWithWater, getSettlerAvoidance } from './collision.js';
import { someSettlerNear } from './neighbours.js';
import { takePortal } from '../../domains/factions/demons/index.js';

export function findSafeStepAroundObstacle(entity, targetX, targetY, speed) {
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

// A settler's step that would take it onto a spike tile from off one (its own traps: it never walks
// them, the player's possessed settler aside, which moves by hand; #326: the enemy's it walks straight onto)
export function stepsOntoSpikes(entity, vx, vy) {
  const tiles = getTileIndex();
  if (tiles.ownSpikes.size === 0 && tiles.ownTraps.size === 0) return false;
  const key = (x, y) => { const g = getGridPos(x, y); return `${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`; };
  const hazard = k => tiles.ownSpikes.has(k) || tiles.ownTraps.has(k); // (iron traps too, #248)
  return hazard(key(entity.x + vx, entity.y + vy)) && !hazard(key(entity.x, entity.y));
}

// (#322) A step's distance is the speed for 1/60 s: a longer or shorter step (dt) goes further or less far, and a settler
// at half pace (dt halved) walks at half speed
export function moveEntityTowards(entity, targetX, targetY, speed, isEnemy = false, dt = 1 / 60) {
  // the undead's blighted ground holds enemies back
  if (isEnemy && isBlighted(entity.x, entity.y)) speed *= GAME_CONFIG.blight.slowFactor;
  // through a portal pair of its own side (#326: an enemy through the red side's, in a battle)
  if (game.buildings.length) {
    const via = takePortal(entity, targetX, targetY, isEnemy ? 'red' : 'green');
    if (via === true) return;
    if (via) { targetX = via.x; targetY = via.y; }
  }
  speed *= GAME_CONFIG.movementScale * dt * 60;
  // terrain collision body; big units are drawn larger but must still fit one-tile gaps (30px)
  const bodyRadius = Math.min(entity.radius, 13);

  tickPathTimers(entity, isEnemy, dt);
  replanIfNeeded(entity, targetX, targetY, isEnemy);
  if (isEnemy && (entity.directBlockedTimer || 0) <= 0 && hasClearEnemyLine(entity.x, entity.y, targetX, targetY, bodyRadius)) {
    stepStraightAtTarget(entity, targetX, targetY, speed, bodyRadius, isEnemy);
    return;
  }
  if (!isEnemy && pathBlockedAhead(entity)) {
    entity.path = null;
    entity.pathRetryTimer = 0;
    return;
  }
  if (entity.path && entity.path.length > 0) stepAlongPath(entity, targetX, targetY, speed, isEnemy, bodyRadius);
  else if (!isEnemy) stepCloseToTarget(entity, targetX, targetY, speed, bodyRadius);
}

function tickPathTimers(entity, isEnemy, dt) {
  if (entity.pathRetryTimer > 0) entity.pathRetryTimer -= dt;
  if (entity.strictPathFailTimer > 0) entity.strictPathFailTimer -= dt;
  if (isEnemy) entity.pathTimer = (entity.pathTimer || 0) - dt;
  if (entity.directBlockedTimer > 0) entity.directBlockedTimer -= dt;
}

// (#322) at most this many enemies' searches a tick: a wave chasing settlers searched again and again; the
// rest keep the way they have a tick or two longer
const ENEMY_SEARCHES_PER_TICK = 4;
let searches = { tick: -1, count: 0 };
const SETTLER_SEARCHES_PER_TICK = 10;
let settlerSearches = { tick: -1, count: 0 };

// (#322) and at most this many tiles looked at by searches a tick, and by one: on a big map a way that isn't
// there (walled in, across water) had the search go over every tile it could reach — 90 ms, a step and the
// frames of a fifth of a second lost, every time it was tried. Past the budget the rest keep the way they
// have (or none) and are searched for again next tick. (Tiles, not time: a save loads back and goes on the
// same way, whatever the machine)
const SEARCH_NODES_PER_TICK = 3000;
let searchNodes = { tick: -1, left: 0 };
function searchNodesLeft() {
  if (searchNodes.tick !== game.pathTick) searchNodes = { tick: game.pathTick, left: SEARCH_NODES_PER_TICK };
  return searchNodes.left;
}

// A new path when there's none, the target moved, an enemy's path is a second old, and no retry is pending.
// (#322) An enemy far off minds its target moving only by a share of the way to it
function replanIfNeeded(entity, targetX, targetY, isEnemy) {
  let threshold = isEnemy ? Math.max(50, Math.hypot(targetX - entity.x, targetY - entity.y) * 0.25) : 25;
  let targetChanged = !entity.pathTarget || Math.hypot(entity.pathTarget.x - targetX, entity.pathTarget.y - targetY) > threshold;
  let needsPath = !entity.path || entity.path.length === 0 || targetChanged || (isEnemy && entity.pathTimer <= 0);
  let canRetryPath = !(entity.pathRetryTimer > 0);
  if (needsPath && canRetryPath && isEnemy && entity.path && entity.path.length > 0) {
    if (searches.tick !== game.pathTick) searches = { tick: game.pathTick, count: 0 };
    if (searches.count >= ENEMY_SEARCHES_PER_TICK) return;
    searches.count++;
  }
  // (#322) and the settlers': a hundred of them all setting off in one tick (the alarm of a wave, a night's end) searched a hundred
  // ways in it; some a tick or two later (those with a way already keep it a little longer)
  if (needsPath && canRetryPath && !isEnemy) {
    if (settlerSearches.tick !== game.pathTick) settlerSearches = { tick: game.pathTick, count: 0 };
    if (settlerSearches.count >= SETTLER_SEARCHES_PER_TICK) return;
    settlerSearches.count++;
  }

  if (needsPath && canRetryPath) {
    const nodesLeft = searchNodesLeft();
    if (nodesLeft <= 0) return; // (the tick's searches are spent: this one next tick)
    // once the normal search found no way around (walled in), go straight to the breaking-through
    // search for a while instead of exploring the whole map again on every re-path
    let res = isEnemy && entity.strictPathFailTimer > 0
      ? findPathAStarPermissive(entity.x, entity.y, targetX, targetY, false, nodesLeft)
      : findPathAStar(entity.x, entity.y, targetX, targetY, isEnemy, nodesLeft);
    searchNodes.left -= res.looked || 0;
    if (isEnemy && res.isBlockedPath && !(entity.strictPathFailTimer > 0)) entity.strictPathFailTimer = 3;
    entity.path = res.path;
    if (!isEnemy && entity.path.length > 1) {
      // A* includes the current tile center, which can pull a settler backwards after a replan.
      const start = getGridPos(entity.x, entity.y), first = getGridPos(entity.path[0].x, entity.path[0].y);
      if (start.gx === first.gx && start.gy === first.gy) entity.path.shift();
    }
    entity.isBlockedPath = res.isBlockedPath || false;
    if (isEnemy) entity.pathViaSpikes = pathCrossesSpikes(entity); // kept while the path is dropped and retried
    entity.pathTarget = { x: targetX, y: targetY };
    if (isEnemy) entity.pathTimer = 1.0;

    if (entity.path.length === 0) {
      entity.pathRetryTimer = isEnemy ? 0.6 : 0.75;
    } else {
      entity.pathRetryTimer = 0;
    }
  }
}

// An enemy with a clear line to its target walks straight at it, eased; blocked, it drops the path for a
// fresh search and leaves the straight line for a while
function stepStraightAtTarget(entity, targetX, targetY, speed, bodyRadius, isEnemy) {
  let directDx = targetX - entity.x;
  let directDy = targetY - entity.y;
  let directDist = Math.hypot(directDx, directDy);
  if (directDist > 0) {
    let directVx = (directDx / directDist) * speed;
    let directVy = (directDy / directDist) * speed;
    entity.moveVx = (entity.moveVx || 0) * 0.8 + directVx * 0.2;
    entity.moveVy = (entity.moveVy || 0) * 0.8 + directVy * 0.2;

    if (!collidesWithEnemyNaturalResource(entity.x + entity.moveVx, entity.y + entity.moveVy, bodyRadius) &&
        !collidesWithWall(entity.x + entity.moveVx, entity.y + entity.moveVy, bodyRadius, isEnemy) &&
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
}

// The world changed under the path (a resource respawned on it, a wall was built): the next tile is
// blocked now. The last node is the exact target point, not a tile to walk through.
function pathBlockedAhead(entity) {
  if (!entity.path || entity.path.length <= 1) return false;
  const nextTile = getGridPos(entity.path[0].x, entity.path[0].y);
  const hereTile = getGridPos(entity.x, entity.y);
  const stepsOffTile = nextTile.gx !== hereTile.gx || nextTile.gy !== hereTile.gy;
  if (stepsOffTile && isTileBlockedForSettler(nextTile.gx, nextTile.gy)) {
    // (#326) the enemy's building it's going to break through, on purpose
    const tiles = getTileIndex(), k = `${nextTile.gx * TILE_SIZE + 15},${nextTile.gy * TILE_SIZE + 15}`;
    return !tiles.redBuildings.has(k) && !tiles.redDoors.has(k);
  }
  return false;
}

// One step to the path's next node: eased for an enemy, steered round other settlers for a settler, and
// round what it would walk into
function stepAlongPath(entity, targetX, targetY, speed, isEnemy, bodyRadius) {
  const path = /** @type {{ x: number, y: number }[]} */ (entity.path);
  let nextNode = path[0];
  let dx = nextNode.x - entity.x;
  let dy = nextNode.y - entity.y;
  let dist = Math.hypot(dx, dy);

  if (dist < 8) {
    path.shift();
    if (path.length > 0) {
      nextNode = path[0];
      dx = nextNode.x - entity.x;
      dy = nextNode.y - entity.y;
      dist = Math.hypot(dx, dy);
    } else {
      // there: onto the exact point, unless that's inside something it can't walk (a campfire it cooks
      // at, a wall): it stays beside it then, never stuck inside
      if (!isEnemy) {
        const t = getGridPos(targetX, targetY);
        if (!isTileBlockedForSettler(t.gx, t.gy)) {
          entity.x = targetX;
          entity.y = targetY;
        }
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
        collidesWithWall(entity.x + vx, entity.y + vy, bodyRadius, true) ||
        collidesWithWater(entity.x + vx, entity.y + vy, bodyRadius))) {
      entity.moveVx = 0;
      entity.moveVy = 0;
      entity.path = null;
      entity.pathRetryTimer = 0.25;
    } else if (!isEnemy && ((collidesWithWall(entity.x + vx, entity.y + vy, bodyRadius) && !collidesWithWall(entity.x, entity.y, bodyRadius)) || stepsOntoSpikes(entity, vx, vy))) {
      // the push away from other settlers can shove a settler into a rock corner: try the plain
      // path direction first, then sidestep toward the next path node (not the final target, which
      // around a corner points straight back into the rock)
      const plainVx = (dx / dist) * speed;
      const plainVy = (dy / dist) * speed;
      let fallback = !collidesWithWall(entity.x + plainVx, entity.y + plainVy, bodyRadius) && !stepsOntoSpikes(entity, plainVx, plainVy)
        ? { x: plainVx, y: plainVy }
        : findSafeStepAroundObstacle(entity, nextNode.x, nextNode.y, speed);
      if (fallback && stepsOntoSpikes(entity, fallback.x, fallback.y)) fallback = null;
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

// No path but close to the target: a settler steps straight to it (out of something it's caught in, too)
function stepCloseToTarget(entity, targetX, targetY, speed, bodyRadius) {
  let directDx = targetX - entity.x;
  let directDy = targetY - entity.y;
  let directDist = Math.hypot(directDx, directDy);

  if (directDist > 2 && directDist < 45) {
    let directVx = (directDx / directDist) * speed;
    let directVy = (directDy / directDist) * speed;

    // (caught inside something already: it may walk out)
    if ((!collidesWithWall(entity.x + directVx, entity.y + directVy, bodyRadius) || collidesWithWall(entity.x, entity.y, bodyRadius)) && !stepsOntoSpikes(entity, directVx, directVy)) {
      entity.x += directVx;
      entity.y += directVy;
    }
  }
}

export function getResourceApproachPoint(entity, resource) {
  let resRadius = resource.radius || 14;
  let entRadius = entity.radius || 10;
  let minDistance = resRadius + entRadius + 1;
  // only consider spots the settler can actually walk to; a spot that's free but sealed off by rock
  // used to win on straight-line distance and leave the settler standing there forever
  const reach = game.settlers.includes(entity) ? getSettlerReach(entity) : null;
  // the spot rarely changes frame to frame; re-pick it twice a second or when the situation changes
  const cache = entity.approachCache;
  if (reach && cache && cache.resource === resource && cache.reach === reach && game.pathTick - cache.tick < 30) return cache.point;

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
        // (#306: those near the spot, not everyone on the map)
        if (someSettlerNear(x, y, entRadius * 2, other => other !== entity)) score += 1000;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }

    if (best) {
      if (reach) entity.approachCache = { resource, reach, tick: game.pathTick, point: best };
      return best;
    }
  }

  return null;
}

export function rescueSettlerFromResource(settler) {
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
