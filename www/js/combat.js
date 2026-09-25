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

  let baseDmgMult = attacker.type === 'big' ? 1.8 : 1.0;

  if (attacker.weapon === 'bow') {
    if (!attacker.quiver || (attacker.arrows || 0) <= 0) return;
    let angle = Math.atan2(targetY - attacker.y, targetX - attacker.x);
    projectiles.push({ 
      x: attacker.x, 
      y: attacker.y, 
      vx: Math.cos(angle) * 4.5, 
      vy: Math.sin(angle) * 4.5, 
      damage: 30 * baseDmgMult,
      life: 80, 
      fromEnemy: false, 
      owner: attacker 
    });
    attacker.arrows--;
    attacker.attackCooldown = 0.8;
  } else {
    let range = isSpearWeapon(attacker.weapon) ? 65 : 
               (isSwordWeapon(attacker.weapon) ? 42 : 
               (isClubWeapon(attacker.weapon) ? 35 : 28));

    let toolDamage = hasAxeTool(attacker.tool) ? (attacker.tool === 'iron_axe' ? 18 : 15) : 
                    (hasPickaxeTool(attacker.tool) ? (attacker.tool === 'iron_pickaxe' ? 13 : 10) : 
                    (attacker.tool === 'rod' ? 6 : 6));

    let weaponDamage = toolDamage;
    if (isSpearWeapon(attacker.weapon)) {
      weaponDamage = attacker.weapon === 'iron_spear' ? 40 : 25;
    } else if (isSwordWeapon(attacker.weapon)) {
      weaponDamage = attacker.weapon === 'iron_sword' ? 30 : 20;
    } else if (isClubWeapon(attacker.weapon)) {
      weaponDamage = 10;
    }

    let dmg = weaponDamage * baseDmgMult;
    
    enemies.forEach(en => {
      if (Math.hypot(en.x - attacker.x, en.y - attacker.y) <= range + en.radius) {
        en.hp -= dmg;
      }
    });

    enemyTents.forEach(et => {
      if (Math.hypot(et.x - attacker.x, et.y - attacker.y) <= range + 15) {
        et.hp -= dmg;
      }
    });

    boars.forEach(b => {
      if (!b.isCarcass && !b.hidden && !b.hideTarget && Math.hypot(b.x - attacker.x, b.y - attacker.y) <= range + 12 && (b.fleeTimer || 0) <= 0) {
        b.hp -= dmg;
        makeBoarFlee(b, attacker.x, attacker.y);
        if (b.hp <= 0) {
          boars.splice(boars.indexOf(b), 1);
          giveResourceToSettler(attacker, 'food', 6);
          invalidateAllPaths();
        }
      }
    });

    attacker.attackCooldown = isSwordWeapon(attacker.weapon) ? 0.4 : 
                              (isClubWeapon(attacker.weapon) ? 0.6 : 0.7);
  }
}

function assignTowerArchers() {
  const towers = buildings.filter(building => building.type === 'watchtower');
  const towerSet = new Set(towers);
  const townHallThreatened = enemies.some(enemy => Math.hypot(enemy.x - townHall.x, enemy.y - townHall.y) <= 260);
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
      settler.weapon === 'bow' && settler.quiver && !settler.carrying && !settler.targetEquipment;
    const towerDutyActive = settler.towerAssignment && enemies.length >= settler.towerAssignment.tower.minEnemies;
    if ((!towerDutyActive || townHallThreatened || !canGuard) && settler.towerAssignment) {
      releaseTowerGuard(settler);
    }
    if (townHallThreatened || !canGuard || settler.towerAssignment) return;

    const tower = towers.find(candidate => enemies.length >= candidate.tower.minEnemies && candidate.guards.length < candidate.tower.capacity);
    if (tower) {
      tower.guards.push(settler);
      settler.towerAssignment = tower;
    }
  });
}

function findTowerForArrows(settler) {
  return buildings
    .filter(tower => tower.type === 'watchtower' &&
      tower.arrows < tower.tower.arrowCapacity && arrowsStock > 0)
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
  const amount = Math.min(arrowsStock, tower.tower.arrowCapacity - tower.arrows);
  tower.arrows += amount;
  arrowsStock -= amount;
  return true;
}

function releaseTowerGuard(settler) {
  const tower = settler.towerAssignment;
  if (!tower) return;
  tower.guards = tower.guards.filter(guard => guard !== settler);
  const angle = Math.atan2(settler.y - tower.y, settler.x - tower.x);
  settler.x = tower.x + Math.cos(angle || 0) * 34;
  settler.y = tower.y + Math.sin(angle || 0) * 34;
  settler.towerAssignment = null;
}

function updateTowerGuard(settler, tower, dt) {
  const approachDistance = 30;
  const distanceToTower = Math.hypot(tower.x - settler.x, tower.y - settler.y);
  if (distanceToTower > approachDistance) {
    const angle = Math.atan2(settler.y - tower.y, settler.x - tower.x);
    moveEntityTowards(settler, tower.x + Math.cos(angle) * approachDistance, tower.y + Math.sin(angle) * approachDistance, settler.speed, false, dt);
    return;
  }

  settler.x = tower.x;
  settler.y = tower.y;

  if (settler.arrows <= 0 && tower.arrows > 0) {
    const amount = Math.min(tower.arrows, tower.tower.arrowCapacity - settler.arrows);
    settler.arrows += amount;
    tower.arrows -= amount;
  }
  if (settler.arrows <= 0) return;

  const target = enemies
    .filter(enemy => Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.tower.range)
    .sort((a, b) => Math.hypot(a.x - tower.x, a.y - tower.y) - Math.hypot(b.x - tower.x, b.y - tower.y))[0];
  if (!target || (settler.towerAttackCooldown || 0) > 0) return;

  const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
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
  settler.arrows--;
  settler.towerAttackCooldown = tower.tower.cooldown;
}
