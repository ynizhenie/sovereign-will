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
  // which GAME_CONFIG.mapResources kind each resource is, so canSettlerHarvest() doesn't scan every list
  const resourceKind = new Map();
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    for (const r of WORLD[def.list]) resourceKind.set(r, kind);
  }
  // player-marked resources, then anything blocking a door (worked as if marked with priority 1)
  const doorBlockers = findDoorBlockers(allResources, resourceKind);
  const zoneBlockers = findZoneBlockers(allResources, resourceKind);
  const markedResources = allResources.filter(r => (r.priority || 0) > 0 || doorBlockers.has(r) || zoneBlockers.has(r));
  markedResources.sort((a, b) => getWorkPriority(b) - getWorkPriority(a));

  const defendersCount = settlers.filter(s => s.role === 'soldier' || s.role === 'archer' || s.weapon !== 'fist').length;

  return {
    dt,
    isWaveActive: enemies.length > 0,
    tents: buildings.filter(b => b.type === 'tent'),
    allResources,
    resourceKind,
    markedResources,
    doorBlockers,
    // every way out of the base through its doors is blocked: soldiers break the blockers
    baseSealed: doorBlockers.size > 0 && isBaseSealed(),
    workerAssignments: new Map(),    // marked resource -> settlers on it this tick
    blueprintAssignments: new Map(), // blueprint -> builders on it this tick (max 3)
    repairAssignments: new Map(),    // building -> repairers on it this tick (max 2)
    plantAssignments: new Set(),     // farm zone tiles a farmer is planting this tick
    patients: new Set(),             // settlers a medic is treating this tick
    activeWaterSpots: waterTiles.filter(w => w.isFishing && isWaterReachable(w)),
    assignedFishersCount: 0,
    defendersCount,
    // unarmed workers only help destroy enemy tents when there's nobody armed to do it
    workersHelpTents: defendersCount === 0,
    // what's left of the wave is down to a few enemies (tent-summoned ones don't count): go destroy the tents
    tentAssault: enemyTents.length > 0 && enemies.filter(en => !en.summoned).length <= 5
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

    if (stock.ironOre > 0 && smelterNeedsOre) {
      let distToTH = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTH > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
      } else {
        let amountToTake = Math.min(stock.ironOre, 2);
        stock.ironOre -= amountToTake;
        s.carrying = { type: 'smelterDelivery', resource: 'ironOre', amount: amountToTake, targetSmelter: smelterNeedsOre };
      }
      return true;
    }

    if (stock.coal > 0 && smelterNeedsCoal) {
      let distToTH = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTH > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
      } else {
        let amountToTake = Math.min(stock.coal, 2);
        stock.coal -= amountToTake;
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
      stock[s.carrying.resource] += s.carrying.amount; // smelter gone: back into the stock
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

// Repair the town hall when the player asked for it (cost and hp per step: GAME_CONFIG.repairs.townHall)
function repairTownHall(s, tick) {
  if (townHall.repairRequested && townHall.hp < townHall.maxHp && s.role === 'worker' && !s.carrying && !s.targetEquipment && !s.isPossessed) {
    const repair = GAME_CONFIG.repairs.townHall;
    if (canAfford(repair.cost)) {
      let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (dist > townHall.radius + s.radius + 4) {
        moveSettlerToTownHall(s, s.speed, tick.dt);
        return true;
      } else {
        payCost(repair.cost);
        townHall.hp = Math.min(townHall.maxHp, townHall.hp + repair.hp);
        if (townHall.hp >= townHall.maxHp) townHall.repairRequested = false;
        return true;
      }
    }
  }
  return false;
}

// Repair the nearest damaged building that needs it (see needsRepair), at most 2 workers on each.
// Cost, hp and pace per step: getRepairStep()
function repairBuilding(s, tick) {
  if (s.role !== 'worker' || s.carrying || s.targetEquipment || s.isPossessed || s.towerAssignment) return false;
  let target = null, best = Infinity;
  for (const b of buildings) {
    if (!needsRepair(b) || (tick.repairAssignments.get(b) || 0) >= 2 || !canAfford(getRepairStep(b).cost)) continue;
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d < best) { best = d; target = b; }
  }
  if (!target) return false;
  tick.repairAssignments.set(target, (tick.repairAssignments.get(target) || 0) + 1);
  if (best > 34) {
    moveEntityTowards(s, target.x, target.y, s.speed, false, tick.dt);
  } else {
    const step = getRepairStep(target);
    target.repairTimer = (target.repairTimer || 0) - tick.dt;
    if (target.repairTimer <= 0) {
      payCost(step.cost);
      target.hp = Math.min(target.maxHp, target.hp + step.hp);
      target.repairTimer = step.interval;
      if (target.hp >= target.maxHp) target.repairRequested = false;
    }
  }
  s.patrolTarget = null;
  return true;
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
      // gear only: put it on / hand it back, and nothing else changes
      if (equipment.gear || equipment.gearOff) {
        if (equipment.gear) putOnGear(s, equipment.gear);
        else takeOffGear(s, equipment.gearOff);
        s.targetEquipment = null;
        return true;
      }
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
      // no longer a melee soldier (disarmed, or given a bow): the shield goes back to the stock
      if (s.shield && !canUseShield(s)) {
        addResources(GAME_CONFIG.gear.shield.cost);
        s.shield = false;
      }
      s.targetEquipment = null;
    }
    return true;
  }
  return false;
}

// Carry whatever the settler holds to the town hall and add it to the stock. With room for more loads
// (a backpack, a big settler) it keeps gathering first, unless a wave is on; see deliverWhenNothingToDo.
function deliverCarrying(s, tick) {
  if (!s.carrying || (hasRoomToCarry(s) && !tick.isWaveActive)) return false;
  goDeliver(s, tick);
  return true;
}

// A part-filled load goes home too once there's nothing left to gather
function deliverWhenNothingToDo(s, tick) {
  if (!s.carrying) return false;
  goDeliver(s, tick);
  return true;
}

function goDeliver(s, tick) {
  let dist = Math.hypot(townHall.x - s.x, townHall.y - s.y);
  if (dist > townHall.radius + s.radius) {
    moveSettlerToTownHall(s, s.speed, tick.dt);
  } else {
    let carriedItems = s.carrying.items || [s.carrying];
    carriedItems.forEach(item => {
      if (GAME_CONFIG.resources[item.type]) stock[item.type] += item.amount;
    });
    s.carrying = null;
    takeFishingBait(s);
  }
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
          damagedTent.hp = Math.min(damagedTent.maxHp, damagedTent.hp + tick.dt * GAME_CONFIG.buildings.tent.repairPerSecond);
        }
        s.patrolTarget = null;
        return true;
      }
    }
  }
  return false;
}

// Heal at the nearest tent. While enemies are on the map, or while it's destroying enemy tents, only a
// badly wounded settler (< 25% hp) leaves for this; the rest keep fighting, starting with whoever is
// attacking them. Once at the tent it heals up fully, unless it's attacked there.
function healAtTent(s, tick) {
  const tents = tick.tents;
  const badlyWounded = s.hp < s.maxHp * 0.25;
  if (s.healing && (s.hp >= s.maxHp || tents.length === 0 || (getRecentAttacker(s) && !badlyWounded))) s.healing = false;
  const calm = enemies.length === 0 && !(tick.tentAssault && joinsTentAssault(s, tick));
  if (s.hp < s.maxHp && tents.length > 0 && !s.isPossessed && (calm || badlyWounded || s.healing)) {
    let nearbyThreat = enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 100);
    if (!nearbyThreat || badlyWounded || s.healing) {
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
        s.hp = Math.min(s.maxHp, s.hp + tick.dt * GAME_CONFIG.buildings.tent.healPerSecond);
        s.patrolTarget = null;
        s.healing = s.hp < s.maxHp;
        if (s.healing) return true;
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

// Medics (a worker with a medbag) heal the wounded while enemies are about: the nearest wounded settler,
// soldiers before workers, one medic per patient, one herb from the stock per healPerHerb hp.
function treatWounded(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'medic') || !tick.isWaveActive || stock.herbs <= 0) return false;
  const medic = GAME_CONFIG.medic;
  let patient = null, best = Infinity;
  for (const other of settlers) {
    if (other === s || other.hp >= other.maxHp || other.towerAssignment || tick.patients.has(other)) continue;
    const d = Math.hypot(other.x - s.x, other.y - s.y) + (other.role === 'worker' ? 10000 : 0); // soldiers first
    if (d < best) { best = d; patient = other; }
  }
  if (!patient) { s.healTimer = 0; return false; }
  tick.patients.add(patient);
  if (Math.hypot(patient.x - s.x, patient.y - s.y) > medic.range + patient.radius) {
    moveEntityTowards(s, patient.x, patient.y, s.speed, false, tick.dt);
  } else {
    s.healTimer = (s.healTimer || 0) + tick.dt;
    if (s.healTimer >= medic.healSeconds) {
      s.healTimer = 0;
      stock.herbs--;
      patient.hp = Math.min(patient.maxHp, patient.hp + medic.healPerHerb);
    }
  }
  s.patrolTarget = null;
  return true;
}

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
  // on the way to the enemy tents: only fight what's in the way, then carry on (clearEnemyTents)
  const assaulting = tick.tentAssault && joinsTentAssault(s, tick);
  if (assaulting && !attacker) {
    targetEnemy = null;
    let nearest = TENT_ASSAULT_FIGHT_DISTANCE;
    enemies.forEach(en => {
      const d = Math.hypot(en.x - s.x, en.y - s.y);
      if (d < nearest) { nearest = d; targetEnemy = en; }
    });
    if (!targetEnemy) return false;
  }

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

    if (isNearTownHall && currentArrows < capacity && stock.arrows > 0) {
      let loadAmount = Math.min(stock.arrows, capacity - currentArrows);
      s.arrows = currentArrows + loadAmount;
      stock.arrows -= loadAmount;
      currentArrows = s.arrows;
    }

    if (currentArrows === 0 && stock.arrows > 0) {
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
  // tent-summoned enemies alone don't call workers off their work, unless they come close
  const waveThreat = tick.isWaveActive && !tick.tentAssault;
  if (targetEnemy && (waveThreat || distToClosestEn < 260 || s.role !== 'worker')) {
    if (isUnarmedOrRod && tick.defendersCount > 0 && !(isToolWorker && enemyNearTownHall) && !attacker) {
      let distToTown = Math.hypot(townHall.x - s.x, townHall.y - s.y);
      if (distToTown > townHall.radius + 15) {
        moveSettlerToTownHall(s, s.speed, dt);
      }
      s.patrolTarget = null;
      return true;
    }

    let dist = distToClosestEn;
    // approach: how close to walk before striking (bows: shoot from under this distance)
    const approach = getWeaponStats(s, 'combat').approach;
    // bows need a clear line of fire too, or they walk closer
    const inReach = isBowWeapon(s.weapon)
      ? dist < approach && hasLineOfFire(s.x, s.y, targetEnemy.x, targetEnemy.y)
      : dist <= approach;
    if (inReach) {
      performAttack(s, targetEnemy.x, targetEnemy.y);
    } else {
      moveEntityTowards(s, targetEnemy.x, targetEnemy.y, s.speed, false, dt);
    }
    s.patrolTarget = null;
    return true;
  }
  return false;
}

// Who goes to destroy enemy tents: anyone armed, and unarmed workers only when nobody is armed
function joinsTentAssault(s, tick) {
  return s.role !== 'worker' || s.weapon !== 'fist' || tick.workersHelpTents;
}

// Enemies closer than this to a settler on its way to the enemy tents get fought on the way
const TENT_ASSAULT_FIGHT_DISTANCE = 150;

// Once a wave is down to its last few enemies, go destroy enemy tents
function clearEnemyTents(s, tick) {
  if (tick.tentAssault) {
    if (joinsTentAssault(s, tick)) {
      let nearestTent = null, minDist = Infinity;
      enemyTents.forEach(et => {
        let d = Math.hypot(et.x - s.x, et.y - s.y);
        if (d < minDist) { minDist = d; nearestTent = et; }
      });
      if (nearestTent) {
        let attackDist = getWeaponStats(s, 'combat').tentReach;
        const blockedShot = isBowWeapon(s.weapon) && !hasLineOfFire(s.x, s.y, nearestTent.x, nearestTent.y);
        if (minDist > attackDist || blockedShot) {
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
                const definition = getDefinition('buildings', b.type);
                addResources(definition && definition.demolishRefund);
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
  if (fishSpot && !s.bait && !canAfford(GAME_CONFIG.fishing.bait)) fishSpot = null;
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
      if (fishSpot.fishTimer >= GAME_CONFIG.fishing.seconds) {
        for (const [item, amount] of Object.entries(GAME_CONFIG.fishing.catch)) giveResourceToSettler(s, item, amount);
        addCarryLoad(s);
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
    if (hasAxeTool(s.tool) || hasPickaxeTool(s.tool) || hasToolFamily(s.tool, 'hoe') || hasToolFamily(s.tool, 'medic')) return false;
    if (r.hidden || r.hideTarget) return false;
    let hasNothing = (s.tool === 'none' && s.weapon === 'fist');
    let hasRod = (s.tool === 'rod');
    return !hasNothing && !hasRod;
  }

  if (kind === 'grass' && boars.some(b => (b.hidden || b.hideTarget) && b.hideTarget === r)) return false;
  if (kind === 'grass' && hasToolFamily(s.tool, 'medic')) return true; // medics gather grass for herbs

  const def = getMapResourceDef(kind);
  if (!def) return false;
  // needs a tool: only settlers carrying one of that family (and trees must be grown)
  if (def.tool) return hasToolFamily(s.tool, def.tool) && !r.isGrowing;

  // gathered by hand: settlers without a tool, or anyone if the player marked it
  if (kind === 'farm' && !(r.growth >= 100)) return false;
  if (kind === 'farm' && hasToolFamily(s.tool, 'hoe')) return true; // farmers harvest ripe wheat
  let hasPriority = (r.priority || 0) > 0;
  return s.tool === 'none' || hasPriority;
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
      if (currentWorkers < getWorkPriority(r)) {
        assignedRes = r;
        tick.workerAssignments.set(r, currentWorkers + 1);
        break;
      }
    }
  }

  if (!assignedRes && !tick.isWaveActive) {
    let availableRes = tick.allResources.filter(r => canSettlerHarvest(s, r, tick) && !skipped(r) && (!r.priority || r.priority === 0) && !getMapResourceDef(tick.resourceKind.get(r)).markOnly);
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
      finishHarvest(s, boar, 'boar');
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
  const hunt = getWeaponStats(s, 'hunt');
  if (dist > hunt.range) {
    moveEntityTowards(s, boar.x, boar.y, s.speed, false, dt);
  } else {
    if (isBowWeapon(s.weapon)) {
      performAttack(s, boar.x, boar.y);
    } else if (!((boar.fleeTimer || 0) > 0 && boar.sprinting) && s.attackCooldown <= 0) { // not mid-sprint
      makeBoarFlee(boar, s.x, s.y);
      boar.hp -= hunt.damage * hunt.multiplier;
      s.attackCooldown = hunt.cooldown;
      if (boar.hp <= 0) finishHarvest(s, boar, 'boar');
    }
  }
  s.patrolTarget = null;
}

// Work a resource the settler is standing next to, the way its GAME_CONFIG.mapResources `work` says
function workResource(s, assignedRes, tick) {
  const dt = tick.dt;
  const kind = tick.resourceKind.get(assignedRes);
  const def = getMapResourceDef(kind);
  // gone already: another settler finished it earlier this tick (the tick's resource lists are a snapshot)
  if (!def || !WORLD[def.list].includes(assignedRes)) {
    s.patrolTarget = null;
    return;
  }
  if (def.tool && (!hasToolFamily(s.tool, def.tool) || assignedRes.isGrowing)) return;
  const work = def.work;

  if (work.pickup) {
    finishHarvest(s, assignedRes, kind);
  } else if (work.seconds !== undefined) {
    const duration = typeof work.seconds === 'number' ? work.seconds : (work.seconds[s.tool] ?? Object.values(work.seconds)[0]);
    assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
    if (def.hp !== undefined) {
      assignedRes.harvestDuration = duration;
      assignedRes.hp = Math.max(0, def.hp * (1 - assignedRes.harvestProgress / assignedRes.harvestDuration));
    }
    if (assignedRes.harvestProgress >= duration) finishHarvest(s, assignedRes, kind);
  } else if (work.chop) {
    assignedRes.hp -= dt * work.chop[s.type] * ((work.toolBonus && work.toolBonus[s.tool]) || 1);
    if (assignedRes.hp <= 0) finishHarvest(s, assignedRes, kind);
  } else if (work.drain) {
    assignedRes.hp -= dt * work.drain[s.tool];
    if (assignedRes.hp <= 0) finishHarvest(s, assignedRes, kind);
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

// ---- Doors

// How many workers a priority resource takes at once: the player's mark, or 1 for a door blocker
function getWorkPriority(r) {
  return r.priority || 1;
}

// Resources that block the way through a door: on a tile next to a door (not diagonally), and solid
// (trees, boulders, cacti, ore). Natural rock is left to the player to mark.
function findDoorBlockers(allResources, resourceKind) {
  const blockers = new Set();
  const doors = buildings.filter(b => b.type === 'door');
  if (doors.length === 0) return blockers;
  const beside = new Set();
  for (const door of doors) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) beside.add(`${door.x + dx * TILE_SIZE},${door.y + dy * TILE_SIZE}`);
  }
  const tiles = getTileIndex();
  for (const r of allResources) {
    const key = `${r.x},${r.y}`;
    if (!beside.has(key) || !(tiles.trees.has(key) || tiles.solids.has(key))) continue;
    const def = getMapResourceDef(resourceKind.get(r));
    if (def && !def.markOnly) blockers.add(r);
  }
  return blockers;
}

// Whether no settler can walk from the town hall to the edge of the map (the base is walled in)
const hallReachHolder = { x: 0, y: 0 };
function isBaseSealed() {
  hallReachHolder.x = townHall.x; hallReachHolder.y = townHall.y;
  const reach = getSettlerReach(hallReachHolder);
  for (let gx = 0; gx < COLS; gx++) {
    if (reach[gx] !== -1 || reach[(ROWS - 1) * COLS + gx] !== -1) return false;
  }
  for (let gy = 0; gy < ROWS; gy++) {
    if (reach[gy * COLS] !== -1 || reach[gy * COLS + COLS - 1] !== -1) return false;
  }
  return true;
}

// A walled-in base: soldiers break the nearest door blocker they can reach, one hp per strike
function breakOutOfSealedBase(s, tick) {
  if (!tick.baseSealed || s.role === 'worker' || s.isPossessed) return false;
  const reach = getSettlerReach(s);
  let target = null, best = Infinity;
  for (const r of tick.doorBlockers) {
    if (!WORLD[getMapResourceDef(tick.resourceKind.get(r)).list].includes(r)) continue; // already broken this tick
    const d = getReachDistanceToResource(reach, r);
    if (d < best) { best = d; target = r; }
  }
  if (!target) return false;
  const approachPos = getResourceApproachPoint(s, target);
  if (!approachPos) return false;
  if (Math.hypot(approachPos.x - s.x, approachPos.y - s.y) > 10) {
    moveEntityTowards(s, approachPos.x, approachPos.y, s.speed, false, tick.dt);
  } else if (s.attackCooldown <= 0) {
    target.hp -= 1;
    s.attackCooldown = getWeaponStats(s, 'combat').cooldown;
    if (target.hp <= 0) finishHarvest(s, target, tick.resourceKind.get(target));
  }
  s.patrolTarget = null;
  return true;
}

// ---- Farm zones

// What's gathered by hand (grass, sticks, pebbles, bushes) lying on a farm zone tile: workers without a
// tool take it home first (worked as if marked with priority 1), so the tile can be planted
function findZoneBlockers(allResources, resourceKind) {
  const blockers = new Set();
  if (farmZones.length === 0) return blockers;
  const zoneTiles = new Set(farmZones.map(z => `${z.x},${z.y}`));
  for (const r of allResources) {
    const kind = resourceKind.get(r);
    const def = getMapResourceDef(kind);
    if (def && !def.tool && kind !== 'farm' && kind !== 'boar' && zoneTiles.has(`${r.x},${r.y}`)) blockers.add(r);
  }
  return blockers;
}

// Farmers (a worker with a hoe) plant the empty tiles of the player's farm zones, nearest first; one
// farmer per tile. Planting takes GAME_CONFIG.farming.plantSeconds and costs the crop's building cost.
function tendFarmZones(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'hoe') || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  const farming = GAME_CONFIG.farming;
  const reach = getSettlerReach(s);
  let target = null, best = Infinity;
  for (const zone of farmZones) {
    if (tick.plantAssignments.has(zone) || isTileOccupied(zone.x, zone.y)) continue;
    const crop = getDefinition('buildings', farming.crops[zone.crop]);
    if (!crop || !canAfford(crop.cost || {})) continue;
    const g = getGridPos(zone.x, zone.y);
    const steps = getReachSteps(reach, g.gx, g.gy);
    if (steps !== -1 && steps < best) { best = steps; target = zone; }
  }
  if (!target) { s.plantProgress = 0; return false; }
  tick.plantAssignments.add(target);
  if (Math.hypot(target.x - s.x, target.y - s.y) > 12) {
    moveEntityTowards(s, target.x, target.y, s.speed, false, tick.dt);
    s.plantProgress = 0;
  } else {
    s.plantProgress = (s.plantProgress || 0) + tick.dt;
    if (s.plantProgress >= farming.plantSeconds) {
      s.plantProgress = 0;
      const cropId = farming.crops[target.crop];
      payCost(getDefinition('buildings', cropId).cost || {});
      if (cropId === 'wheat') farmPlots.push({ x: target.x, y: target.y, growth: 0, priority: 0, harvestProgress: 0 });
      else trees.push({ x: target.x, y: target.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 });
      ejectEntitiesFromTile(target.x, target.y);
      resetTileIndex();
    }
  }
  s.patrolTarget = null;
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
  repairBuilding,
  equip,
  deliverCarrying,
  repairTent,
  healAtTent,
  playerControlled,
  treatWounded,
  fightEnemies,
  breakOutOfSealedBase,
  clearEnemyTents,
  build,
  fish,
  harvest,
  tendFarmZones,
  deliverWhenNothingToDo,
  patrol
];
