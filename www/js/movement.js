function deselectSettler() { selectedSettler = null; }

function getGridPos(x, y) { return { gx: Math.floor(x / TILE_SIZE), gy: Math.floor(y / TILE_SIZE) }; }

function isTileBlockedForSettler(gx, gy) {
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  
  if (Math.hypot(tx - townHall.x, ty - townHall.y) < townHall.radius + 12) return true;

  if (buildings.some(b => b.x === tx && b.y === ty && b.type !== 'door')) return true;
  if (naturalRocks.some(r => r.x === tx && r.y === ty)) return true;
  if (waterTiles.some(w => w.x === tx && w.y === ty)) return true;
  if (trees.some(t => !t.isGrowing && t.x === tx && t.y === ty)) return true;
  if (cacti.some(c => c.x === tx && c.y === ty)) return true;
  if (boulders.some(b => b.x === tx && b.y === ty)) return true;
  if (ironOres.some(i => i.x === tx && i.y === ty)) return true;
  if (coalOres.some(c => c.x === tx && c.y === ty)) return true;
  return false;
}

function getResourceApproachPoint(entity, resource) {
  let resRadius = resource.radius || 14;
  let entRadius = entity.radius || 10;
  let minDistance = resRadius + entRadius + 1;

  const approachDistances = [minDistance, minDistance + 3, minDistance + 6];

  for (const distance of approachDistances) {
    let best = null;
    let bestScore = Infinity;

    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      let x = resource.x + Math.cos(angle) * distance;
      let y = resource.y + Math.sin(angle) * distance;

      if (collidesWithWall(x, y, entRadius) || collidesWithWater(x, y, entRadius)) continue;

      let score = Math.hypot(x - entity.x, y - entity.y);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }

    if (best) return best;
  }

  return null;
}

function rescueSettlerFromResource(settler) {
  if (settler.towerAssignment) return;
  const solidResources = [...trees.filter(tree => !tree.isGrowing), cacti, boulders, ironOres, coalOres, naturalRocks].flat();
  const blockedResource = solidResources.find(resource => Math.hypot(settler.x - resource.x, settler.y - resource.y) < 14);
  if (!blockedResource) return;
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
  //if (buildings.some(b => b.x === tx && b.y === ty && b.type !== 'door')) return true;
  if (naturalRocks.some(r => r.x === tx && r.y === ty)) return true;
  if (waterTiles.some(w => w.x === tx && w.y === ty)) return true;
  if (trees.some(t => !t.isGrowing && t.x === tx && t.y === ty)) return true;
  if (cacti.some(c => c.x === tx && c.y === ty)) return true;
  if (boulders.some(b => b.x === tx && b.y === ty)) return true;
  if (ironOres.some(i => i.x === tx && i.y === ty)) return true;
  if (coalOres.some(c => c.x === tx && c.y === ty)) return true;
  return false;
}

function collidesWithEnemyNaturalResource(x, y, radius) {
  let resources = [...trees.filter(t => !t.isGrowing), ...cacti, ...boulders, ...ironOres, ...coalOres];
  return collidesWithBoxList(x, y, radius, resources, 14);
}

function isTileBlockedForEnemyPermissive(gx, gy) {
  if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
  let tx = gx * TILE_SIZE + 15;
  let ty = gy * TILE_SIZE + 15;
  if (naturalRocks.some(r => r.x === tx && r.y === ty)) return true;
  if (waterTiles.some(w => w.x === tx && w.y === ty)) return true;
  return false;
}

const PATH_DIRECTIONS = [
  {dx:0, dy:-1, cost:1}, {dx:0, dy:1, cost:1}, {dx:-1, dy:0, cost:1}, {dx:1, dy:0, cost:1},
  {dx:-1, dy:-1, cost:1.41}, {dx:1, dy:-1, cost:1.41}, {dx:-1, dy:1, cost:1.41}, {dx:1, dy:1, cost:1.41}
];

function findGridPath(startG, endG, targetX, targetY, options) {
  if (startG.gx === endG.gx && startG.gy === endG.gy) {
    return { path: [{ x: targetX, y: targetY }], isBlockedPath: options.isBlockedPath };
  }

  const key = (gx, gy) => `${gx},${gy}`;
  const openList = [{ gx: startG.gx, gy: startG.gy, f: Math.hypot(startG.gx - endG.gx, startG.gy - endG.gy) }];
  const closedSet = new Set();
  const parentMap = new Map();
  const gScore = new Map([[key(startG.gx, startG.gy), 0]]);
  let found = false;

  for (let steps = 0; openList.length > 0 && steps < 350; steps++) {
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift();
    const currentKey = key(current.gx, current.gy);
    if (current.gx === endG.gx && current.gy === endG.gy) {
      found = true;
      break;
    }
    closedSet.add(currentKey);

    for (const direction of PATH_DIRECTIONS) {
      const gx = current.gx + direction.dx;
      const gy = current.gy + direction.dy;
      const nextKey = key(gx, gy);
      if (closedSet.has(nextKey) || options.isBlocked(gx, gy)) continue;
      if (!options.allowCornerCutting && direction.dx !== 0 && direction.dy !== 0 &&
          (options.isBlocked(current.gx + direction.dx, current.gy) || options.isBlocked(current.gx, current.gy + direction.dy))) continue;

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
  return findGridPath(startG, endG, targetX, targetY, {
    isBlocked: isTileBlockedForEnemyPermissive,
    allowCornerCutting: true,
    isBlockedPath: true,
    extraCost: (x, y) => (trees.some(t => !t.isGrowing && t.x === x && t.y === y) || boulders.some(b => b.x === x && b.y === y) ? 10 : 0)
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

  if (entity.pathRetryTimer > 0) entity.pathRetryTimer -= dt;
  if (isEnemy) entity.pathTimer = (entity.pathTimer || 0) - dt;
  if (entity.directBlockedTimer > 0) entity.directBlockedTimer -= dt;

  let targetChanged = !entity.pathTarget || Math.hypot(entity.pathTarget.x - targetX, entity.pathTarget.y - targetY) > threshold;
  let needsPath = !entity.path || entity.path.length === 0 || targetChanged || (isEnemy && entity.pathTimer <= 0);
  let canRetryPath = !entity.path || entity.path.length > 0 || !Number.isFinite(entity.pathRetryTimer) || entity.pathRetryTimer <= 0;

  if (needsPath && canRetryPath) {
    let res = findPathAStar(entity.x, entity.y, targetX, targetY, isEnemy);
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

  if (isEnemy && (entity.directBlockedTimer || 0) <= 0 && hasClearEnemyLine(entity.x, entity.y, targetX, targetY, entity.radius)) {
    let directDx = targetX - entity.x;
    let directDy = targetY - entity.y;
    let directDist = Math.hypot(directDx, directDy);
    if (directDist > 0) {
      let directVx = (directDx / directDist) * speed;
      let directVy = (directDy / directDist) * speed;
      entity.moveVx = (entity.moveVx || 0) * 0.8 + directVx * 0.2;
      entity.moveVy = (entity.moveVy || 0) * 0.8 + directVy * 0.2;

      if (!collidesWithEnemyNaturalResource(entity.x + entity.moveVx, entity.y + entity.moveVy, entity.radius) &&
          !collidesWithWall(entity.x + entity.moveVx, entity.y + entity.moveVy, entity.radius) &&
          !collidesWithWater(entity.x + entity.moveVx, entity.y + entity.moveVy, entity.radius)) {
        entity.x += entity.moveVx;
        entity.y += entity.moveVy;
      } else {
        entity.moveVx = 0;
        entity.moveVy = 0;
        entity.path = null;
        entity.directBlockedTimer = 1.5;
        return;
      }
    }
    entity.path = [];
    return;
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

      if (isEnemy && (collidesWithEnemyNaturalResource(entity.x + vx, entity.y + vy, entity.radius) ||
          collidesWithWall(entity.x + vx, entity.y + vy, entity.radius) ||
          collidesWithWater(entity.x + vx, entity.y + vy, entity.radius))) {
        entity.moveVx = 0;
        entity.moveVy = 0;
        entity.path = null;
      } else if (!isEnemy && collidesWithWall(entity.x + vx, entity.y + vy, entity.radius)) {
        let fallback = findSafeStepAroundObstacle(entity, targetX, targetY, speed);
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

      if (!collidesWithWall(entity.x + directVx, entity.y + directVy, entity.radius)) {
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
