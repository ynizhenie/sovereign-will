// Watchtowers: archers climb them while there's tower duty, shoot from them, come down; arrows for them

// Archers climb the towers while there's tower duty (#155: they stay up when enemies reach the base, that's
// when a tower is worth most), as long as they or the tower have arrows
function assignTowerArchers() {
  const towers = game.buildings.filter(building => building.type === 'watchtower');
  const towerSet = new Set(towers);
  towers.forEach(tower => {
    tower.guards = (tower.guards || []).filter(guard => game.settlers.includes(guard));
  });

  game.settlers.forEach(settler => {
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
  return game.enemies.length >= tower.tower.minEnemies || isDefenseAlert();
}

function findTowerForArrows(settler) {
  return game.buildings
    .filter(tower => tower.type === 'watchtower' &&
      tower.arrows < tower.tower.arrowCapacity && stock.arrows > 0 &&
      !game.settlers.some(s => s !== settler && s.carrying && s.carrying.forTower === tower))
    .sort((a, b) => Math.hypot(a.x - settler.x, a.y - settler.y) - Math.hypot(b.x - settler.x, b.y - settler.y))[0] || null;
}

function findNearestArrowTower(settler) {
  const townHallDistance = Math.hypot(townHall.x - settler.x, townHall.y - settler.y);
  const townHallThreatened = game.enemies.some(enemy => Math.hypot(enemy.x - townHall.x, enemy.y - townHall.y) <= 260);
  if (townHallThreatened || game.enemies.length < 2) return null;
  return game.buildings
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

  const target = game.enemies
    .filter(enemy => Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.tower.range &&
      hasLineOfFire(tower.x, tower.y, enemy.x, enemy.y, true))
    .sort((a, b) => Math.hypot(a.x - tower.x, a.y - tower.y) - Math.hypot(b.x - tower.x, b.y - tower.y))[0];
  if (!target || (settler.towerAttackCooldown || 0) > 0) return;

  const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  faceTowards(settler, target.x, target.y);
  game.projectiles.push({
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
  if (game.gameMode !== 'battle') settler.arrows--;
  settler.towerAttackCooldown = tower.tower.cooldown;
}
