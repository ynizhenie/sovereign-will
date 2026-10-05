function collidesWithBoxList(x, y, radius, objects, halfSize) {
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
function collidesWithTiles(x, y, radius, kinds) {
  const tiles = getTileIndex();
  const span = Math.ceil((radius + 15) / TILE_SIZE);
  const g = getGridPos(x, y);
  for (let gy = g.gy - span; gy <= g.gy + span; gy++) {
    for (let gx = g.gx - span; gx <= g.gx + span; gx++) {
      const cx = gx * TILE_SIZE + 15, cy = gy * TILE_SIZE + 15, key = `${cx},${cy}`;
      for (const [set, halfSize] of kinds) {
        if (!tiles[set].has(key)) continue;
        const dx = x - Math.max(cx - halfSize, Math.min(x, cx + halfSize));
        const dy = y - Math.max(cy - halfSize, Math.min(y, cy + halfSize));
        if (dx * dx + dy * dy < radius * radius) return true;
      }
    }
  }
  return false;
}

// Whether an arrow is stopped on tile (gx, gy). fromTower: shot from a watchtower, over walls and doors.
function isArrowBlockedTile(gx, gy, fromTower) {
  const tiles = getTileIndex();
  const key = `${gx * TILE_SIZE + 15},${gy * TILE_SIZE + 15}`;
  return tiles.arrowBlockers.has(key) || (fromTower ? tiles.towerArrowBuildings : tiles.arrowBuildings).has(key);
}

function isArrowBlockedAt(x, y, fromTower) {
  const g = getGridPos(x, y);
  return isArrowBlockedTile(g.gx, g.gy, fromTower);
}

// Whether an arrow from (x1, y1) would fly to (x2, y2) unstopped. Walks every tile the line touches
// (not just points along it), so an arrow never clips a corner the check missed. The shooter's own
// tile doesn't count.
function hasLineOfFire(x1, y1, x2, y2, fromTower = false) {
  let gx = Math.floor(x1 / TILE_SIZE), gy = Math.floor(y1 / TILE_SIZE);
  const endGx = Math.floor(x2 / TILE_SIZE), endGy = Math.floor(y2 / TILE_SIZE);
  const dx = x2 - x1, dy = y2 - y1;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  // how far along the line (0..1) the next vertical / horizontal tile border is, and one tile's worth
  let nextX = stepX ? ((stepX > 0 ? gx + 1 : gx) * TILE_SIZE - x1) / dx : Infinity;
  let nextY = stepY ? ((stepY > 0 ? gy + 1 : gy) * TILE_SIZE - y1) / dy : Infinity;
  const tileX = stepX ? TILE_SIZE / Math.abs(dx) : Infinity;
  const tileY = stepY ? TILE_SIZE / Math.abs(dy) : Infinity;
  while (gx !== endGx || gy !== endGy) {
    if (Math.abs(nextX - nextY) < 1e-9) {
      // exactly through a corner: both side tiles count
      if (isArrowBlockedTile(gx + stepX, gy, fromTower) || isArrowBlockedTile(gx, gy + stepY, fromTower)) return false;
      gx += stepX; gy += stepY; nextX += tileX; nextY += tileY;
    } else if (nextX < nextY) {
      gx += stepX; nextX += tileX;
    } else {
      gy += stepY; nextY += tileY;
    }
    if (nextX > 1 + tileX && nextY > 1 + tileY) break; // safety: past the end
    if (isArrowBlockedTile(gx, gy, fromTower)) return false;
  }
  return true;
}

const WALL_COLLISION_KINDS = [['walls', 14], ['rocks', 14], ['water', 15], ['trees', 12], ['solids', 12]];

function collidesWithWall(x, y, radius) {
  return collidesWithTiles(x, y, radius, WALL_COLLISION_KINDS);
}

function getTownHallApproachPoint(settler) {
  let dx = settler.x - townHall.x;
  let dy = settler.y - townHall.y;
  let distance = Math.hypot(dx, dy);
  if (distance === 0) {
    dx = 1;
    dy = 0;
    distance = 1;
  }
  let approachDistance = townHall.radius + settler.radius - 1;
  return {
    x: townHall.x + (dx / distance) * approachDistance,
    y: townHall.y + (dy / distance) * approachDistance
  };
}

function moveSettlerToTownHall(settler, speed, dt) {
  let approachPoint = getTownHallApproachPoint(settler);
  moveEntityTowards(settler, approachPoint.x, approachPoint.y, speed, false, dt);
}

function getSettlerAvoidance(entity) {
  let avoidX = 0;
  let avoidY = 0;
  settlers.forEach(other => {
    if (other === entity) return;
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

function collidesWithWater(x, y, radius) {
  return collidesWithTiles(x, y, radius, [['water', 15]]);
}

function performAttack(attacker, targetX, targetY) {
  if (attacker.attackCooldown > 0) return;
  faceTowards(attacker, targetX, targetY);

  const stats = getWeaponStats(attacker, 'combat');

  if (isBowWeapon(attacker.weapon)) {
    if (!attacker.quiver || (attacker.arrows || 0) <= 0) return;
    let angle = Math.atan2(targetY - attacker.y, targetX - attacker.x);
    projectiles.push({ 
      x: attacker.x, 
      y: attacker.y, 
      vx: Math.cos(angle) * stats.projectileSpeed, 
      vy: Math.sin(angle) * stats.projectileSpeed, 
      damage: stats.damage * stats.multiplier,
      life: stats.projectileLife, 
      fromEnemy: false, 
      owner: attacker,
      fire: !!(getDefinition('settlerTypes', attacker.type) || {}).fireArrows // a fire imp's (#165)
    });
    playSound('bow', attacker);
    if (gameMode !== 'battle') attacker.arrows--; // arrows don't run out in battles (#166)
    attacker.attackCooldown = stats.cooldown;
    startSwing(attacker, 0.3);
  } else {
    const range = stats.range;
    const dmg = stats.damage * stats.multiplier;
    const inReach = (o, pad) => Math.hypot(o.x - attacker.x, o.y - attacker.y) <= range + pad;
    // everything within reach of the blow, and what hitting it does
    const struck = [
      ...enemies.filter(en => inReach(en, en.radius)).map(en => ({ at: en, hit: () => { en.hp -= dmg; bleed(en, attacker); playSound('hit', en); } })),
      ...enemyTents.filter(et => inReach(et, 15)).map(et => ({ at: et, hit: () => { et.hp -= dmg; } })),
      ...boars.filter(b => !b.isCarcass && !b.hidden && !b.hideTarget && inReach(b, 12) && !((b.fleeTimer || 0) > 0 && b.sprinting))
        .map(b => ({ at: b, hit: () => {
          woundBoar(b, dmg, attacker, attacker.x, attacker.y);
        } }))
    ];
    // a big settler's blow hits everything around it; anyone else hits one: the one aimed at (#144)
    if (isBigBody(attacker)) struck.forEach(target => target.hit());
    else if (struck.length > 0) {
      const aimed = struck.reduce((best, target) =>
        Math.hypot(target.at.x - targetX, target.at.y - targetY) < Math.hypot(best.at.x - targetX, best.at.y - targetY) ? target : best);
      aimed.hit();
    }

    attacker.attackCooldown = stats.cooldown;
    startSwing(attacker, Math.min(0.35, stats.cooldown * 0.8));
    playSound('swing', attacker);
  }
}

// Archers climb the towers while there's tower duty (#155: they stay up when enemies reach the base, that's
// when a tower is worth most), as long as they or the tower have arrows
function assignTowerArchers() {
  const towers = buildings.filter(building => building.type === 'watchtower');
  const towerSet = new Set(towers);
  towers.forEach(tower => {
    tower.guards = (tower.guards || []).filter(guard => settlers.includes(guard));
  });

  settlers.forEach(settler => {
    if (settler.towerAssignment && (!towerSet.has(settler.towerAssignment) ||
        !settler.towerAssignment.guards.includes(settler))) {
      if (towerSet.has(settler.towerAssignment)) {
        settler.towerAssignment.guards = settler.towerAssignment.guards.filter(guard => guard !== settler);
      }
      settler.towerAssignment = null;
    }
    const canGuard = !settler.isPossessed && settler.role === 'archer' &&
      isBowWeapon(settler.weapon) && settler.quiver && !settler.carrying && !settler.targetEquipment;
    const hasArrows = tower => (settler.arrows || 0) > 0 || (tower.arrows || 0) > 0;
    const towerDutyActive = settler.towerAssignment && isTowerDutyOn(settler.towerAssignment) && hasArrows(settler.towerAssignment);
    if ((!towerDutyActive || !canGuard) && settler.towerAssignment) {
      releaseTowerGuard(settler);
    }
    if (!canGuard || settler.towerAssignment) return;

    const tower = towers.find(candidate => isTowerDutyOn(candidate) && hasArrows(candidate) && candidate.guards.length < candidate.tower.capacity);
    if (tower) {
      tower.guards.push(settler);
      settler.towerAssignment = tower;
    }
  });
}

// A tower is manned when enough enemies are about, or from the warning until the wave is beaten (#14, #155)
function isTowerDutyOn(tower) {
  return enemies.length >= tower.tower.minEnemies || isDefenseAlert();
}

function findTowerForArrows(settler) {
  return buildings
    .filter(tower => tower.type === 'watchtower' &&
      tower.arrows < tower.tower.arrowCapacity && stock.arrows > 0 &&
      !settlers.some(s => s !== settler && s.carrying && s.carrying.forTower === tower))
    .sort((a, b) => Math.hypot(a.x - settler.x, a.y - settler.y) - Math.hypot(b.x - settler.x, b.y - settler.y))[0] || null;
}

function findNearestArrowTower(settler) {
  const townHallDistance = Math.hypot(townHall.x - settler.x, townHall.y - settler.y);
  const townHallThreatened = enemies.some(enemy => Math.hypot(enemy.x - townHall.x, enemy.y - townHall.y) <= 260);
  if (townHallThreatened || enemies.length < 2) return null;
  return buildings
    .filter(tower => tower.type === 'watchtower' && tower.arrows > 0 && Math.hypot(tower.x - settler.x, tower.y - settler.y) < townHallDistance)
    .sort((a, b) => Math.hypot(a.x - settler.x, a.y - settler.y) - Math.hypot(b.x - settler.x, b.y - settler.y))[0] || null;
}

function refillArcherFromTower(settler, tower) {
  const amount = Math.min(tower.arrows, (settler.quiverCapacity || 12) - (settler.arrows || 0));
  settler.arrows = (settler.arrows || 0) + amount;
  tower.arrows -= amount;
}

function updateTowerArrowLoader(settler, tower, dt) {
  const distance = Math.hypot(tower.x - settler.x, tower.y - settler.y);
  if (distance > 32) {
    moveEntityTowards(settler, tower.x, tower.y, settler.speed, false, dt);
    return true;
  }
  // the arrows it brought; what doesn't fit goes back to storage
  const amount = Math.min(settler.carrying.amount, tower.tower.arrowCapacity - tower.arrows);
  tower.arrows += amount;
  settler.carrying.amount -= amount;
  if (settler.carrying.amount > 0) delete settler.carrying.forTower;
  else settler.carrying = null;
  return true;
}

// Where a guard climbs down: the free tile next to the tower (then further out) that can be walked to from
// the town hall, nearest the side it faces, so it never lands inside a wall or in a sealed pocket
function findTowerExit(tower, settler) {
  const start = getGridPos(tower.x, tower.y);
  const hallReach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const facing = Math.atan2(settler.y - tower.y, settler.x - tower.x) || 0;
  for (let ring = 1; ring <= 4; ring++) {
    let best = null, bestScore = Infinity;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const gx = start.gx + dx, gy = start.gy + dy;
        if (isTileBlockedForSettler(gx, gy) || getReachSteps(hallReach, gx, gy) === -1) continue;
        let turn = Math.abs(Math.atan2(dy, dx) - facing) % (Math.PI * 2);
        if (turn > Math.PI) turn = Math.PI * 2 - turn;
        const score = turn + (dx !== 0 && dy !== 0 ? 0.5 : 0); // straight sides before corners
        if (score < bestScore) { bestScore = score; best = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 }; }
      }
    }
    if (best) return best;
  }
  // walled in from the town hall: any free tile next to it, rather than into a wall (#173)
  for (let ring = 1; ring <= 4; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring && !isTileBlockedForSettler(start.gx + dx, start.gy + dy)) {
          return { x: (start.gx + dx) * TILE_SIZE + 15, y: (start.gy + dy) * TILE_SIZE + 15 };
        }
      }
    }
  }
  return { x: tower.x, y: tower.y };
}

function releaseTowerGuard(settler) {
  const tower = settler.towerAssignment;
  if (!tower) return;
  tower.guards = tower.guards.filter(guard => guard !== settler);
  const spot = findTowerExit(tower, settler);
  settler.x = spot.x;
  settler.y = spot.y;
  settler.path = null;
  settler.towerAssignment = null;
}

function updateTowerGuard(settler, tower, dt) {
  // up from a free tile beside it that can be walked to (not from the side a wall is on, #173)
  const distanceToTower = Math.hypot(tower.x - settler.x, tower.y - settler.y);
  if (distanceToTower > 32) {
    if (!settler.towerEntry || settler.towerEntry.tower !== tower) settler.towerEntry = { tower, ...findTowerExit(tower, settler) };
    const entry = settler.towerEntry;
    if (Math.hypot(entry.x - settler.x, entry.y - settler.y) > 8) {
      moveEntityTowards(settler, entry.x, entry.y, settler.speed, false, dt);
      return;
    }
  }
  settler.towerEntry = null;

  settler.x = tower.x;
  settler.y = tower.y;

  if (settler.arrows <= 0 && tower.arrows > 0) {
    const amount = Math.min(tower.arrows, tower.tower.arrowCapacity - settler.arrows);
    settler.arrows += amount;
    tower.arrows -= amount;
  }
  if (settler.arrows <= 0) return;

  const target = enemies
    .filter(enemy => Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.tower.range &&
      hasLineOfFire(tower.x, tower.y, enemy.x, enemy.y, true))
    .sort((a, b) => Math.hypot(a.x - tower.x, a.y - tower.y) - Math.hypot(b.x - tower.x, b.y - tower.y))[0];
  if (!target || (settler.towerAttackCooldown || 0) > 0) return;

  const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  faceTowards(settler, target.x, target.y);
  projectiles.push({
    x: tower.x,
    y: tower.y,
    vx: Math.cos(angle) * tower.tower.projectileSpeed,
    vy: Math.sin(angle) * tower.tower.projectileSpeed,
    damage: tower.tower.damage,
    life: 80,
    fromEnemy: false,
    owner: settler,
    fromTower: true
  });
  if (gameMode !== 'battle') settler.arrows--;
  settler.towerAttackCooldown = tower.tower.cooldown;
}
