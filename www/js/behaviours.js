// Settler AI.
//
// Every tick update() runs SETTLER_BEHAVIOURS for each settler, in order. A behaviour looks at the
// settler and either takes over its tick (does something and returns true — later behaviours don't run
// for this settler this tick) or passes (returns false). To change priorities, reorder the list; to add
// a behaviour, write a function (settler, tick) => boolean and put it where it belongs in the list.
//
// `tick` holds what's shared by all settlers within one tick (see createSettlerTick), including the
// assignment counters that keep settlers from piling onto the same job.

function createSettlerTick(dt) {
  const allResources = getHarvestableResources();
  // which list each resource is in, so canSettlerHarvest() doesn't scan all the lists for every settler
  const resourceKind = new Map();
  for (const [kind, list] of [['boar', boars], ['grass', grassList], ['tree', trees], ['cactus', cacti], ['boulder', boulders],
                              ['iron', ironOres], ['coal', coalOres], ['rock', naturalRocks], ['stick', sticks],
                              ['pebble', pebbles], ['bush', berryBushes], ['farm', farmPlots]]) {
    for (const r of list) resourceKind.set(r, kind);
  }
  const markedResources = allResources.filter(r => (r.priority || 0) > 0);
  markedResources.sort((a, b) => b.priority - a.priority);

  const defendersCount = settlers.filter(s => s.role === 'soldier' || s.role === 'archer' || s.weapon !== 'fist').length;
  const workersCount = settlers.filter(s => s.role === 'worker' && s.weapon === 'fist').length;

  return {
    dt,
    isWaveActive: enemies.length > 0,
    tents: buildings.filter(b => b.type === 'tent'),
    allResources,
    resourceKind,
    markedResources,
    workerAssignments: new Map(),    // marked resource -> settlers on it this tick
    blueprintAssignments: new Map(), // blueprint -> builders on it this tick (max 3)
    activeWaterSpots: waterTiles.filter(w => w.isFishing && isWaterReachable(w)),
    assignedFishersCount: 0,
    defendersCount,
    workersHelpTents: (defendersCount === 0 || defendersCount < workersCount)
  };
}

// Housekeeping every settler gets each tick, before any behaviour
function prepareSettler(s, dt) {
  clampEntityToBounds(s);
  rescueSettlerFromResource(s);
  if (s.attackCooldown > 0) s.attackCooldown -= dt;
  if (s.towerAttackCooldown > 0) s.towerAttackCooldown -= dt;
}

// ---- Logistics

// Idle unarmed workers keep watchtowers stocked with arrows
function loadTowerArrows(s, tick) {
  if (!s.isPossessed && s.role === 'worker' && s.weapon === 'fist' && s.tool === 'none' &&
      !s.carrying && !s.targetEquipment) {
    const towerForArrows = findTowerForArrows(s);
    if (towerForArrows) {
      updateTowerArrowLoader(s, towerForArrows, tick.dt);
      s.patrolTarget = null;
      return true;
    }
  }
  return false;
}

// Pick up smelted iron and carry it home
function collectSmelterIron(s, tick) {
  if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
    let smelterWithIron = buildings.find(b => b.type === 'smelter' && b.ironProduced > 0);
    if (smelterWithIron) {
      let dist = Math.hypot(smelterWithIron.x - s.x, smelterWithIron.y - s.y);
      if (dist > (smelterWithIron.radius || 15) + s.radius + 8) {
        moveEntityTowards(s, smelterWithIron.x, smelterWithIron.y, s.speed, false, tick.dt);
      } else {
        s.carrying = { type: 'iron', amount: smelterWithIron.ironProduced };
        smelterWithIron.ironProduced = 0;
      }
      return true;
    }
  }
  return false;
}

// Take ore or coal from the town hall for a smelter that needs it
function supplySmelter(s, tick) {
  if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
    let smelterNeedsOre = buildings.find(b => b.type === 'smelter' && (b.oreLoaded || 0) < 10);
    let smelterNeedsCoal = buildings.find(b => b.type === 'smelter' && (b.coalLoaded || 0) < 10);

    if (ironOreStock > 0 && smelterNeedsOre) {
      let distToTH = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTH > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
      } else {
        let amountToTake = Math.min(ironOreStock, 2);
        ironOreStock -= amountToTake;
        s.carrying = { type: 'smelterDelivery', resource: 'ironOre', amount: amountToTake, targetSmelter: smelterNeedsOre };
      }
      return true;
    }

    if (coal > 0 && smelterNeedsCoal) {
      let distToTH = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTH > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
      } else {
        let amountToTake = Math.min(coal, 2);
        coal -= amountToTake;
        s.carrying = { type: 'smelterDelivery', resource: 'coal', amount: amountToTake, targetSmelter: smelterNeedsCoal };
      }
      return true;
    }
  }
  return false;
}

// Bring the ore/coal picked up by supplySmelter to its smelter
function deliverToSmelter(s, tick) {
  if (s.carrying && s.carrying.type === 'smelterDelivery') {
    let targetSmelter = s.carrying.targetSmelter;
    if (!buildings.includes(targetSmelter)) {
      if (s.carrying.resource === 'ironOre') ironOreStock += s.carrying.amount;
      if (s.carrying.resource === 'coal') coal += s.carrying.amount;
      s.carrying = null;
      return true;
    }
    let dist = Math.hypot(targetSmelter.x - s.x, targetSmelter.y - s.y);
    if (dist > (targetSmelter.radius || 15) + s.radius + 8) {
      moveEntityTowards(s, targetSmelter.x, targetSmelter.y, s.speed, false, tick.dt);
    } else {
      if (s.carrying.resource === 'ironOre') {
        targetSmelter.oreLoaded = (targetSmelter.oreLoaded || 0) + s.carrying.amount;
      } else if (s.carrying.resource === 'coal') {
        targetSmelter.coalLoaded = (targetSmelter.coalLoaded || 0) + s.carrying.amount;
      }
      s.carrying = null;
    }
    return true;
  }
  return false;
}

// ---- Towers and repairs

// Archers assigned to a watchtower stay in it until the fight comes close to the town hall
function guardTower(s, tick) {
  if (s.towerAssignment) {
    if (enemies.length < s.towerAssignment.tower.minEnemies || enemies.some(enemy => Math.hypot(enemy.x - townHall.x, enemy.y - townHall.y) <= 260)) {
      releaseTowerGuard(s);
    } else {
      updateTowerGuard(s, s.towerAssignment, tick.dt);
    }
    s.patrolTarget = null;
    if (s.towerAssignment) return true;
  }
  return false;
}

// Repair the town hall when the player asked for it (15 wood + 15 stone per +35 hp)
function repairTownHall(s, tick) {
  if (townHall.repairRequested && townHall.hp < townHall.maxHp && s.role === 'worker' && !s.carrying && !s.targetEquipment && !s.isPossessed) {
    if (wood >= 15 && stone >= 15) {
      let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (dist > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
        return true;
      } else {
        wood -= 15; stone -= 15;
        townHall.hp = Math.min(townHall.maxHp, townHall.hp + 35);
        if (townHall.hp >= townHall.maxHp) townHall.repairRequested = false;
        return true;
      }
    }
  }
  return false;
}

// Repair a damaged watchtower (10 wood + 10 stone per +35 hp)
function repairTower(s, tick) {
  const damagedTower = buildings.find(building => building.type === 'watchtower' && building.hp < building.maxHp);
  if (damagedTower && s.role === 'worker' && !s.carrying && !s.targetEquipment && !s.isPossessed && !s.towerAssignment) {
    const distanceToTower = Math.hypot(damagedTower.x - s.x, damagedTower.y - s.y);
    if (distanceToTower > 34) {
      moveEntityTowards(s, damagedTower.x, damagedTower.y, s.speed, false, tick.dt);
    } else if (wood >= 10 && stone >= 10) {
      damagedTower.repairTimer = (damagedTower.repairTimer || 0) - tick.dt;
      if (damagedTower.repairTimer <= 0) {
        wood -= 10;
        stone -= 10;
        damagedTower.hp = Math.min(damagedTower.maxHp, damagedTower.hp + 35);
        damagedTower.repairTimer = 1;
      }
    }
    s.patrolTarget = null;
    return true;
  }
  return false;
}

// ---- Equipment and hauling

// Go to the town hall to swap weapon/tool/armour the player ordered
function equip(s, tick) {
  if (s.targetEquipment) {
    let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
    if (dist > townHall.radius + s.radius) {
      moveSettlerToTownHall(s, s.speed, tick.dt);
    } else {
      let equipment = s.targetEquipment;
      if (!equipment.armorOnly) refundEquipment(s, equipment.armor === 'none', equipment.quiver === false);
      if (equipment.weapon !== undefined) s.weapon = equipment.weapon;
      if (equipment.tool !== undefined) s.tool = equipment.tool;
      if (equipment.role !== undefined) s.role = equipment.role;
      if (equipment.armor !== undefined) s.armor = equipment.armor === 'none' ? null : equipment.armor;
      if (equipment.quiverOnly) {
        s.quiver = true;
        s.quiverCapacity = 12;
        s.arrows = 0;
      }
      if (equipment.quiver !== undefined) s.quiver = equipment.quiver;
      s.targetEquipment = null;
    }
    return true;
  }
  return false;
}

// Carry whatever the settler holds to the town hall and add it to the stock
function deliverCarrying(s, tick) {
  if (s.carrying) {
    let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
    if (dist > townHall.radius + s.radius) {
      moveSettlerToTownHall(s, s.speed, tick.dt);
    } else {
      let carriedItems = s.carrying.items || [s.carrying];
      carriedItems.forEach(item => {
        if (item.type === 'wood') wood += item.amount;
        if (item.type === 'stone') stone += item.amount;
        if (item.type === 'iron') iron += item.amount;
        if (item.type === 'ironOre') ironOreStock += item.amount;
        if (item.type === 'coal') coal += item.amount;
        if (item.type === 'leather') leather += item.amount;
        if (item.type === 'food') food += item.amount;
        if (item.type === 'wheatSeeds') wheatSeeds += item.amount;
      });
      s.carrying = null;
      takeFishingBait(s);
    }
    return true;
  }
  return false;
}

// ---- Tents and healing

// Workers mend a damaged tent unless enemies are right next to it
function repairTent(s, tick) {
  if (s.role === 'worker' && !s.isPossessed) {
    let damagedTent = buildings.find(b => b.type === 'tent' && b.hp < b.maxHp);
    if (damagedTent) {
      let tentThreatened = enemies.some(en => Math.hypot(en.x - damagedTent.x, en.y - damagedTent.y) < 120);
      if (!tentThreatened) {
        let distToTent = Math.hypot(damagedTent.x - s.x, damagedTent.y - s.y);
        if (distToTent > 32) {
          moveEntityTowards(s, damagedTent.x, damagedTent.y, s.speed, false, tick.dt);
        } else {
          damagedTent.hp = Math.min(damagedTent.maxHp, damagedTent.hp + tick.dt * 15);
        }
        s.patrolTarget = null;
        return true;
      }
    }
  }
  return false;
}

// Heal at the nearest tent. While enemies are on the map only badly wounded settlers (< 25% hp)
// leave the fight for this; the rest keep fighting, starting with whoever is attacking them.
function healAtTent(s, tick) {
  const tents = tick.tents;
  const badlyWounded = s.hp < s.maxHp * 0.25;
  if (s.hp < s.maxHp && tents.length > 0 && !s.isPossessed && (enemies.length === 0 || badlyWounded)) {
    let nearbyThreat = enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 100);
    if (!nearbyThreat || badlyWounded) {
      let nearestTent = tents.reduce((closest, t) => {
        let d = Math.hypot(t.x - s.x, t.y - s.y);
        return d < closest.d ? { tent: t, d: d } : closest;
      }, { tent: tents[0], d: Math.hypot(tents[0].x - s.x, tents[0].y - s.y) }).tent;

      let distToTent = Math.hypot(nearestTent.x - s.x, nearestTent.y - s.y);
      if (distToTent > 32) {
        moveEntityTowards(s, nearestTent.x, nearestTent.y, s.speed, false, tick.dt);
        s.patrolTarget = null;
        return true;
      } else {
        s.hp = Math.min(s.maxHp, s.hp + tick.dt * 20);
        s.patrolTarget = null;
        if (s.hp < s.maxHp) return true;
      }
    }
  }
  return false;
}

// The possessed settler is moved by the player (see update()); none of the behaviours below apply
function playerControlled(s, tick) {
  return !!s.isPossessed;
}

// ---- Fighting

// Fight enemies: strike back at an attacker first, otherwise the enemy closest to the town hall.
// Archers restock arrows from towers or the town hall; unarmed settlers shelter at the town hall
// while there are defenders, unless they're being attacked themselves.
function fightEnemies(s, tick) {
  const dt = tick.dt;
  let targetEnemy = null;
  let minBaseDist = Infinity;
  enemies.forEach(en => {
    let dToTown = Math.hypot(en.x - townHall.x, en.y - townHall.y);
    let dToSettler = Math.hypot(en.x - s.x, en.y - s.y);
    let score = dToTown + (dToSettler < 180 ? 0 : dToSettler * 0.4);
    if (score < minBaseDist) { minBaseDist = score; targetEnemy = en; }
  });
  // enemies the player marked with the Point tool come first for anyone armed...
  if (s.weapon !== 'fist') {
    let nearestMarked = Infinity;
    enemies.forEach(en => {
      if (!en.markedTarget) return;
      const d = Math.hypot(en.x - s.x, en.y - s.y);
      if (d < nearestMarked) { nearestMarked = d; targetEnemy = en; }
    });
  }
  // ...but whoever is hitting this settler right now comes first of all
  const attacker = getRecentAttacker(s);
  if (attacker) targetEnemy = attacker;

  if (isBowWeapon(s.weapon) && s.quiver) {
    let currentArrows = s.arrows || 0;
    let capacity = s.quiverCapacity || 12;
    let nearbyTower = findNearestArrowTower(s);
    let townDistance = Math.hypot(townHall.x - s.x, townHall.y - s.y);
    let isNearTownHall = townDistance <= townHall.radius + s.radius;
    let towerDistance = nearbyTower ? Math.hypot(nearbyTower.x - s.x, nearbyTower.y - s.y) : Infinity;

    if (nearbyTower && currentArrows < capacity) {
      if (towerDistance > 32) {
        moveEntityTowards(s, nearbyTower.x, nearbyTower.y, s.speed, false, dt);
        s.patrolTarget = null;
        return true;
      }
      refillArcherFromTower(s, nearbyTower);
      currentArrows = s.arrows;
    }

    if (isNearTownHall && currentArrows < capacity && arrowsStock > 0) {
      let loadAmount = Math.min(arrowsStock, capacity - currentArrows);
      s.arrows = currentArrows + loadAmount;
      arrowsStock -= loadAmount;
      currentArrows = s.arrows;
    }

    if (currentArrows === 0 && arrowsStock > 0) {
      if (!isNearTownHall) {
        moveSettlerToTownHall(s, s.speed, dt);
        s.patrolTarget = null;
        return true;
      }
    }
  }

  // an archer with nothing to shoot waits
  if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) {
    s.patrolTarget = null;
    return true;
  }

  let distToClosestEn = targetEnemy ? Math.hypot(targetEnemy.x - s.x, targetEnemy.y - s.y) : Infinity;

  let isUnarmedOrRod = (s.weapon === 'fist');
  let isToolWorker = isUnarmedOrRod && (hasAxeTool(s.tool) || hasPickaxeTool(s.tool));
  let enemyNearTownHall = targetEnemy && Math.hypot(targetEnemy.x - townHall.x, targetEnemy.y - townHall.y) < 240;
  if (targetEnemy && (tick.isWaveActive || distToClosestEn < 260 || s.role !== 'worker')) {
    if (isUnarmedOrRod && tick.defendersCount > 0 && !(isToolWorker && enemyNearTownHall) && !attacker) {
      let distToTown = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTown > townHall.radius + 15) {
        moveSettlerToTownHall(s, s.speed, dt);
      }
      s.patrolTarget = null;
      return true;
    }

    let dist = distToClosestEn;
    if (isBowWeapon(s.weapon) && dist < 140) {
      performAttack(s, targetEnemy.x, targetEnemy.y);
    } else if (dist > (isSpearWeapon(s.weapon) ? 45 : 22)) {
      moveEntityTowards(s, targetEnemy.x, targetEnemy.y, s.speed, false, dt);
    } else {
      performAttack(s, targetEnemy.x, targetEnemy.y);
    }
    s.patrolTarget = null;
    return true;
  }
  return false;
}

// Once a wave is down to its last few enemies, go destroy enemy tents
function clearEnemyTents(s, tick) {
  if (enemies.length <= 5 && enemyTents.length > 0) {
    let isSoldier = (s.role !== 'worker' || s.weapon !== 'fist');
    let shouldAttackTents = isSoldier || tick.workersHelpTents;

    if (shouldAttackTents) {
      let nearestTent = null, minDist = Infinity;
      enemyTents.forEach(et => {
        let d = Math.hypot(et.x - s.x, et.y - s.y);
        if (d < minDist) { minDist = d; nearestTent = et; }
      });
      if (nearestTent) {
        let attackDist = isBowWeapon(s.weapon) ? 140 : 25;
        if (minDist > attackDist) {
          moveEntityTowards(s, nearestTent.x, nearestTent.y, s.speed, false, tick.dt);
        } else {
          performAttack(s, nearestTent.x, nearestTent.y);
        }
        s.patrolTarget = null;
        return true;
      }
    }
  }
  return false;
}

// ---- Work

// Build (or demolish) the nearest blueprint that has fewer than 3 builders
function build(s, tick) {
  const dt = tick.dt;
  if (blueprints.length > 0 && !s.carrying && s.role === 'worker') {
    let hasNearbyEnemy = enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 220);
    if (!hasNearbyEnemy) {
      let bestBp = null;
      let minDist = Infinity;
      blueprints.forEach(bp => {
        let assignedCount = tick.blueprintAssignments.get(bp) || 0;
        if (assignedCount < 3) {
          let d = Math.hypot(bp.x - s.x, bp.y - s.y);
          if (d < minDist) { minDist = d; bestBp = bp; }
        }
      });

      if (bestBp) {
        tick.blueprintAssignments.set(bestBp, (tick.blueprintAssignments.get(bestBp) || 0) + 1);
        let dist = Math.hypot(bestBp.x - s.x, bestBp.y - s.y);
        if (dist > 30) {
          moveEntityTowards(s, bestBp.x, bestBp.y, s.speed, false, dt);
        } else {
          bestBp.progress += dt * 40;
          if (bestBp.progress >= bestBp.maxProgress) {
            if (bestBp.type === 'demolish_building') {
              let bIdx = buildings.indexOf(bestBp.targetBuilding);
              if (bIdx !== -1) {
                let b = buildings[bIdx];
                if (b.type === 'wall_wood') wood += 3;
                else if (b.type === 'wall_stone') stone += 3;
                else if (b.type === 'door') wood += 3;
                else if (b.type === 'tent') wood += 5;
                else if (b.type === 'watchtower') { wood += 12; stone += 10; }
                buildings.splice(bIdx, 1);
              }
              invalidateAllPaths();
            } else if (bestBp.type === 'wheat') {
              farmPlots.push({ x: bestBp.x, y: bestBp.y, growth: 0, priority: 0, harvestProgress: 0 });
            } else if (bestBp.type === 'sapling') {
              trees.push({ x: bestBp.x, y: bestBp.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 });
            } else {
              buildings.push(bestBp);
              ejectEntitiesFromTile(bestBp.x, bestBp.y);
              invalidateAllPaths();
            }
            blueprints.splice(blueprints.indexOf(bestBp), 1);
          }
        }
        s.patrolTarget = null;
        return true;
      }
    }
  }
  return false;
}

// Workers gather any time; soldiers only between waves (hunting boars, picking up carcasses)
function canGather(s, tick) {
  return s.role === 'worker' || (s.role !== 'worker' && !tick.isWaveActive);
}

// Fishers with a rod fish at a spot the player marked; every catch uses one seed as bait,
// picked up at the town hall. No seeds, no fishing.
function fish(s, tick) {
  if (!canGather(s, tick) || s.role !== 'worker' || s.tool !== 'rod') return false;
  const dt = tick.dt;
  let fishSpot = tick.activeWaterSpots[tick.assignedFishersCount];
  if (fishSpot && !s.bait && wheatSeeds <= 0) fishSpot = null;
  if (fishSpot && !s.bait) {
    tick.assignedFishersCount++;
    if (Math.hypot(townHall.x - s.x, townHall.y - s.y) > townHall.radius + s.radius) {
      moveSettlerToTownHall(s, s.speed, dt);
    } else {
      takeFishingBait(s);
    }
    s.patrolTarget = null;
    return true;
  }
  if (fishSpot) {
    tick.assignedFishersCount++;
    let dist = Math.hypot(fishSpot.x - s.x, fishSpot.y - s.y);
    if (dist > 32) {
      moveEntityTowards(s, fishSpot.x, fishSpot.y, s.speed, false, dt);
    } else {
      fishSpot.fishTimer = (fishSpot.fishTimer || 0) + dt;
      if (fishSpot.fishTimer >= 3.0) {
        giveResourceToSettler(s, 'food', 2);
        s.bait = false;
        fishSpot.fishTimer = 0;
      }
    }
    s.patrolTarget = null;
    return true;
  }
  return false;
}

// Can this settler work this resource with what it has in hand?
function canSettlerHarvest(s, r, tick) {
  const kind = tick.resourceKind.get(r);
  if (s.role !== 'worker') {
    if (r.isCarcass) return r.collector === s;
    if (kind === 'boar') return !tick.isWaveActive && !r.hidden && !r.hideTarget;
    return false;
  }
  if (r.isCarcass) return r.collector === s;
  if (kind === 'boar') {
    if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
    if (hasAxeTool(s.tool) || hasPickaxeTool(s.tool)) return false;
    if (r.hidden || r.hideTarget) return false;
    let hasNothing = (s.tool === 'none' && s.weapon === 'fist');
    let hasRod = (s.tool === 'rod');
    return !hasNothing && !hasRod;
  }

  if (kind === 'grass' && boars.some(b => (b.hidden || b.hideTarget) && b.hideTarget === r)) return false;

  if (kind === 'tree') return hasAxeTool(s.tool) && !r.isGrowing;
  if (kind === 'cactus') return hasAxeTool(s.tool);
  if (kind === 'boulder') return hasPickaxeTool(s.tool);
  if (kind === 'iron') return hasPickaxeTool(s.tool);
  if (kind === 'coal') return hasPickaxeTool(s.tool);
  if (kind === 'rock') return hasPickaxeTool(s.tool);

  let hasPriority = (r.priority || 0) > 0;
  if (kind === 'stick' || kind === 'pebble' || kind === 'grass' || kind === 'bush' || (kind === 'farm' && r.growth >= 100)) {
    return s.tool === 'none' || hasPriority;
  }

  return false;
}

// Player-marked resources first (up to their priority in workers), otherwise the nearest one the settler
// can walk to. Returns null if there's nothing to do.
function pickResourceToHarvest(s, tick) {
  const settlerReach = getSettlerReach(s);
  // resources this settler recently found no spot next to (see harvest())
  const skipped = r => s.skippedResource === r && pathTick < s.skippedUntilTick;
  let assignedRes = null;
  for (let r of tick.markedResources) {
    if (canSettlerHarvest(s, r, tick) && !skipped(r) && getReachDistanceToResource(settlerReach, r) < Infinity) {
      let currentWorkers = tick.workerAssignments.get(r) || 0;
      if (currentWorkers < r.priority) {
        assignedRes = r;
        tick.workerAssignments.set(r, currentWorkers + 1);
        break;
      }
    }
  }

  if (!assignedRes && !tick.isWaveActive) {
    let availableRes = tick.allResources.filter(r => canSettlerHarvest(s, r, tick) && !skipped(r) && (!r.priority || r.priority === 0) && tick.resourceKind.get(r) !== 'rock');
    // nearest by walking distance; straight-line distance picked things behind rock walls or sealed off
    let minDist = Infinity;
    availableRes.forEach(r => {
      let d = getReachDistanceToResource(settlerReach, r);
      if (d < minDist) { minDist = d; assignedRes = r; }
    });
  }
  return assignedRes;
}

// Hunt a boar or collect its carcass
function huntBoar(s, boar, tick) {
  const dt = tick.dt;
  let dist = Math.hypot(boar.x - s.x, boar.y - s.y);
  if (boar.isCarcass) {
    if (dist > 25) {
      moveEntityTowards(s, boar.x, boar.y, s.speed, false, dt);
    } else {
      boars.splice(boars.indexOf(boar), 1);
      giveResourceToSettler(s, 'food', 6);
      giveResourceToSettler(s, 'leather', 2);
      invalidateAllPaths();
    }
    s.patrolTarget = null;
    return;
  }
  if (boar.hidden || boar.hideTarget) {
    s.path = null;
    if (!s.patrolTarget || Math.hypot(s.x - s.patrolTarget.x, s.y - s.patrolTarget.y) < 15) {
      let angle = rand() * Math.PI * 2;
      let patrolDistance = 30 + rand() * 120;
      s.patrolTarget = {
        x: townHall.x + Math.cos(angle) * patrolDistance,
        y: townHall.y + Math.sin(angle) * patrolDistance
      };
    }
    moveEntityTowards(s, s.patrolTarget.x, s.patrolTarget.y, s.speed * 0.5, false, dt);
    return;
  }
  let attackDist = isBowWeapon(s.weapon) ? 140 : (isSpearWeapon(s.weapon) ? 65 : (isSwordWeapon(s.weapon) ? 42 : 28));
  if (dist > attackDist) {
    moveEntityTowards(s, boar.x, boar.y, s.speed, false, dt);
  } else {
    if (isBowWeapon(s.weapon)) {
      performAttack(s, boar.x, boar.y);
    } else if ((boar.fleeTimer || 0) <= 0 && s.attackCooldown <= 0) {
      makeBoarFlee(boar, s.x, s.y);
      let boarDamage = isSpearWeapon(s.weapon) ? (s.weapon === 'iron_spear' ? 28 : 22) : (isSwordWeapon(s.weapon) ? (s.weapon === 'iron_sword' ? 40 : 32) : (hasAxeTool(s.tool) ? (s.tool === 'iron_axe' ? 22 : 16) : (hasPickaxeTool(s.tool) ? (s.tool === 'iron_pickaxe' ? 21 : 15) : (s.tool === 'rod' ? 13 : 5))));
      boar.hp -= boarDamage * (s.type === 'big' ? 1.8 : 1);
      s.attackCooldown = isSwordWeapon(s.weapon) ? 0.7 : (isSpearWeapon(s.weapon) ? 0.9 : 0.6);
      if (boar.hp <= 0) {
        boars.splice(boars.indexOf(boar), 1);
        giveResourceToSettler(s, 'food', 6);
        giveResourceToSettler(s, 'leather', 2);
        invalidateAllPaths();
      }
    }
  }
  s.patrolTarget = null;
}

// Work a resource the settler is standing next to (sticks, ore, crops, trees, ...)
function workResource(s, assignedRes, tick) {
  const dt = tick.dt;
  if (trees.includes(assignedRes) && (!hasAxeTool(s.tool) || assignedRes.isGrowing)) return;
  if (cacti.includes(assignedRes) && !hasAxeTool(s.tool)) return;
  if (boulders.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;
  if (ironOres.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;
  if (coalOres.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;
  if (naturalRocks.includes(assignedRes) && !hasPickaxeTool(s.tool)) return;

  if (sticks.includes(assignedRes)) {
    sticks.splice(sticks.indexOf(assignedRes), 1);
    giveResourceToSettler(s, 'wood', 1);
    scheduleRespawn('stick');
  } else if (pebbles.includes(assignedRes)) {
    pebbles.splice(pebbles.indexOf(assignedRes), 1);
    giveResourceToSettler(s, 'stone', 1);
    scheduleRespawn('pebble');
  } else if (ironOres.includes(assignedRes)) {
    assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
    assignedRes.harvestDuration = s.tool === 'iron_pickaxe' ? 2.0 : 3.0;
    assignedRes.hp = Math.max(0, assignedRes.maxHp * (1 - assignedRes.harvestProgress / assignedRes.harvestDuration));
    if (assignedRes.harvestProgress >= assignedRes.harvestDuration) {
      ironOres.splice(ironOres.indexOf(assignedRes), 1);
      giveResourceToSettler(s, 'ironOre', 3);
      scheduleRespawn('iron_ore');
    }
  } else if (coalOres.includes(assignedRes)) {
    assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
    assignedRes.harvestDuration = s.tool === 'iron_pickaxe' ? 1.7 : 2.5;
    assignedRes.hp = Math.max(0, assignedRes.maxHp * (1 - assignedRes.harvestProgress / assignedRes.harvestDuration));
    if (assignedRes.harvestProgress >= assignedRes.harvestDuration) {
      coalOres.splice(coalOres.indexOf(assignedRes), 1);
      giveResourceToSettler(s, 'coal', 3);
      scheduleRespawn('coal_ore');
    }
  } else if (farmPlots.includes(assignedRes)) {
    assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
    if (assignedRes.harvestProgress >= 2.5) {
      farmPlots.splice(farmPlots.indexOf(assignedRes), 1);
      giveResourceToSettler(s, 'food', 4);
    }
  } else if (grassList.includes(assignedRes) || berryBushes.includes(assignedRes)) {
    let harvestDuration = grassList.includes(assignedRes) ? 1.5 : 2.0;
    assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
    assignedRes.harvestDuration = harvestDuration;
    assignedRes.hp = Math.max(0, 1 - assignedRes.harvestProgress / harvestDuration);
    if (assignedRes.harvestProgress >= harvestDuration) {
      if (grassList.includes(assignedRes)) {
        grassList.splice(grassList.indexOf(assignedRes), 1);
        giveResourceToSettler(s, 'wheatSeeds', 1);
        scheduleRespawn('grass');
      } else {
        berryBushes.splice(berryBushes.indexOf(assignedRes), 1);
        giveResourceToSettler(s, 'food', 2);
        scheduleRespawn('berry_bush');
      }
    }
  } else if (naturalRocks.includes(assignedRes)) {
    assignedRes.hp -= dt * (s.tool === 'iron_pickaxe' ? 38 : 25);
    if (assignedRes.hp <= 0) {
      naturalRocks.splice(naturalRocks.indexOf(assignedRes), 1);
      giveResourceToSettler(s, 'stone', 15);
      invalidateAllPaths();
    }
  } else {
    let harvestSpeed = s.tool === 'iron_axe' ? 1.9 : 1;
    assignedRes.hp -= dt * (s.type === 'big' ? 2.5 : 1.5) * harvestSpeed;
    if (assignedRes.hp <= 0) {
      if (trees.includes(assignedRes)) {
        giveResourceToSettler(s, 'wood', 3);
        if (rand() < 0.5) saplings++;
        trees.splice(trees.indexOf(assignedRes), 1);
        scheduleRespawn('tree');
      }
      else if (cacti.includes(assignedRes)) { giveResourceToSettler(s, 'wood', 1); cacti.splice(cacti.indexOf(assignedRes), 1); scheduleRespawn('cactus', assignedRes.x, assignedRes.y); }
      else if (boulders.includes(assignedRes)) { giveResourceToSettler(s, 'stone', 3); boulders.splice(boulders.indexOf(assignedRes), 1); scheduleRespawn('boulder'); }
      else if (ironOres.includes(assignedRes)) { giveResourceToSettler(s, 'iron', 3); ironOres.splice(ironOres.indexOf(assignedRes), 1); scheduleRespawn('iron_ore'); }
    }
  }
  s.patrolTarget = null;
}

// Gather: pick a resource, walk to a free spot next to it, work it
function harvest(s, tick) {
  if (!canGather(s, tick)) return false;
  const assignedRes = pickResourceToHarvest(s, tick);
  if (!assignedRes) return false;

  let approachPos = getResourceApproachPoint(s, assignedRes);
  if (!approachPos) {
    // nowhere to stand next to it: pick something else for a while instead of standing here
    s.skippedResource = assignedRes;
    s.skippedUntilTick = pathTick + 5 * 60;
    s.patrolTarget = null;
    return true;
  }
  if (boars.includes(assignedRes)) {
    huntBoar(s, assignedRes, tick);
    return true;
  }
  let distToApproach = Math.hypot(approachPos.x - s.x, approachPos.y - s.y);
  if (distToApproach > 10) {
    moveEntityTowards(s, approachPos.x, approachPos.y, s.speed, false, tick.dt);
    s.patrolTarget = null;
  } else {
    workResource(s, assignedRes, tick);
  }
  return true;
}

// Nothing else to do: wander near the town hall (shown with an idle icon, see render())
function patrol(s, tick) {
  if (!s.patrolTarget || Math.hypot(s.x - s.patrolTarget.x, s.y - s.patrolTarget.y) < 15) {
    let ang = rand() * Math.PI * 2;
    let dist = 30 + rand() * 120;
    let px = townHall.x + Math.cos(ang) * dist;
    let py = townHall.y + Math.sin(ang) * dist;
    s.patrolTarget = { x: px, y: py };
  }
  moveEntityTowards(s, s.patrolTarget.x, s.patrolTarget.y, s.speed * 0.5, false, tick.dt);
  return true;
}

// Order = priority: the first behaviour that takes a settler's tick wins.
const SETTLER_BEHAVIOURS = [
  loadTowerArrows,
  collectSmelterIron,
  supplySmelter,
  deliverToSmelter,
  guardTower,
  repairTownHall,
  repairTower,
  equip,
  deliverCarrying,
  repairTent,
  healAtTent,
  playerControlled,
  fightEnemies,
  clearEnemyTents,
  build,
  fish,
  harvest,
  patrol
];
