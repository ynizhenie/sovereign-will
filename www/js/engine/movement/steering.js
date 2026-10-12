// One step towards a target: along the path, round obstacles and other units, never onto the colony's own
// spikes; and where to stand to reach a resource

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

// A settler's step that would take it onto a spike tile from off one (its own traps: it never walks
// them, the player's possessed settler aside, which moves by hand)
function stepsOntoSpikes(entity, vx, vy) {
  const tiles = getTileIndex();
  if (tiles.spikes.size === 0) return false;
  const key = (x, y) => { const g = getGridPos(x, y); return `${g.gx * TILE_SIZE + 15},${g.gy * TILE_SIZE + 15}`; };
  return tiles.spikes.has(key(entity.x + vx, entity.y + vy)) && !tiles.spikes.has(key(entity.x, entity.y));
}

function moveEntityTowards(entity, targetX, targetY, speed, isEnemy = false, dt = 0.016) {
  // the undead's blighted ground holds enemies back (#164)
  if (isEnemy && isBlighted(entity.x, entity.y)) speed *= GAME_CONFIG.blight.slowFactor;
  if (!isEnemy && game.buildings.length) {
    const via = takePortal(entity, targetX, targetY);
    if (via === true) return;
    if (via) { targetX = via.x; targetY = via.y; }
  }
  speed *= GAME_CONFIG.movementScale;
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
    if (isEnemy) entity.pathViaSpikes = pathCrossesSpikes(entity); // kept while the path is dropped and retried
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
        // there: onto the exact point, unless that's inside something it can't walk (a campfire it cooks
        // at, a wall): it stays beside it then (a playtest found cooks put inside the fire, stuck there)
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
          collidesWithWall(entity.x + vx, entity.y + vy, bodyRadius) ||
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

  else if (!isEnemy) {
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
}

function getResourceApproachPoint(entity, resource) {
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
        if (game.settlers.some(other => other !== entity && Math.hypot(other.x - x, other.y - y) < entRadius * 2)) score += 1000;
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
