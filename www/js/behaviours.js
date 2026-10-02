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
    appleAssignments: new Set(),     // apple trees someone is picking this tick
    wormAssignments: new Set(),      // corpses a fisher is taking worms off this tick
    wateringAssignments: new Set(),  // crops a farmer is watering this tick
    idleFarmer: null,                // the farmer farmerGathersGrass is finding grass for
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

// Idle unarmed workers keep watchtowers stocked with arrows, fetched from a storage (#36)
function loadTowerArrows(s, tick) {
  if (s.isPossessed || s.role !== 'worker' || s.weapon !== 'fist' || s.tool !== 'none' || s.targetEquipment) return false;
  const load = s.carrying && s.carrying.forTower;
  if (s.carrying && !load) return false;
  if (load && !buildings.includes(load)) { delete s.carrying.forTower; return false; } // tower gone: back to storage
  const tower = load || findTowerForArrows(s);
  if (!tower) return false;
  s.patrolTarget = null;
  if (!s.carrying) {
    return fetchFromStorage(s, 'arrows', tick.dt, () => {
      s.carrying = { type: 'arrows', amount: takeStock('arrows', tower.tower.arrowCapacity - tower.arrows), forTower: tower };
    });
  }
  updateTowerArrowLoader(s, tower, tick.dt);
  return true;
}

// Some buildings take one settler at a time for each job: a smelter's `supplier` (brings ore/coal) and
// `collector` (takes the iron), a campfire's `cook`. A claim lasts while its settler keeps at it
// (renewed every tick); anyone else skips that building.
function claimBuildingJob(smelter, job, s) {
  const claim = smelter[job];
  if (claim && claim.settler !== s && settlers.includes(claim.settler) && pathTick - claim.tick <= 1) return false;
  smelter[job] = { settler: s, tick: pathTick };
  return true;
}

function isBuildingJobFree(smelter, job, s) {
  const claim = smelter[job];
  return !claim || claim.settler === s || !settlers.includes(claim.settler) || pathTick - claim.tick > 1;
}

// Pick up smelted iron and carry it home
function collectSmelterIron(s, tick) {
  if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
    let smelterWithIron = buildings.find(b => b.type === 'smelter' && b.ironProduced > 0 && isBuildingJobFree(b, 'collector', s));
    if (smelterWithIron) {
      claimBuildingJob(smelterWithIron, 'collector', s);
      let dist = Math.hypot(smelterWithIron.x - s.x, smelterWithIron.y - s.y);
      if (dist > (smelterWithIron.radius || 15) + s.radius + 8) {
        moveEntityTowards(s, smelterWithIron.x, smelterWithIron.y, s.speed, false, tick.dt);
      } else {
        s.carrying = { type: 'iron', amount: smelterWithIron.ironProduced };
        smelterWithIron.ironProduced = 0;
        smelterWithIron.collector = null;
      }
      return true;
    }
  }
  return false;
}

// Take ore or coal from the town hall for a smelter that has room for it (one supplier per smelter)
function supplySmelter(s, tick) {
  if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
    const limits = getSmelterLimits();
    for (const [resource, loaded, max] of [['ironOre', 'oreLoaded', limits.maxOre], ['coal', 'coalLoaded', limits.maxCoal]]) {
      if (stock[resource] <= 0) continue;
      const smelter = buildings.find(b => b.type === 'smelter' && (b[loaded] || 0) < max && isBuildingJobFree(b, 'supplier', s));
      if (!smelter) continue;
      claimBuildingJob(smelter, 'supplier', s);
      return fetchFromStorage(s, resource, tick.dt, () => {
        const amountToTake = takeStock(resource, Math.min(2, max - (smelter[loaded] || 0)));
        s.carrying = { type: 'smelterDelivery', resource, amount: amountToTake, targetSmelter: smelter };
      });
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
    claimBuildingJob(targetSmelter, 'supplier', s);
    let dist = Math.hypot(targetSmelter.x - s.x, targetSmelter.y - s.y);
    if (dist > (targetSmelter.radius || 15) + s.radius + 8) {
      moveEntityTowards(s, targetSmelter.x, targetSmelter.y, s.speed, false, tick.dt);
    } else {
      // whatever doesn't fit (it filled up meanwhile) goes back into the stock
      const limits = getSmelterLimits();
      const [loaded, max] = s.carrying.resource === 'ironOre' ? ['oreLoaded', limits.maxOre] : ['coalLoaded', limits.maxCoal];
      const fits = Math.min(s.carrying.amount, max - (targetSmelter[loaded] || 0));
      targetSmelter[loaded] = (targetSmelter[loaded] || 0) + fits;
      stock[s.carrying.resource] += s.carrying.amount - fits;
      s.carrying = null;
      targetSmelter.supplier = null;
    }
    return true;
  }
  return false;
}

// ---- Towers and repairs

// Archers assigned to a watchtower stay in it until the fight comes close to the town hall
function guardTower(s, tick) {
  if (s.towerAssignment) {
    if (!isTowerDutyOn(s.towerAssignment) || enemies.some(enemy => Math.hypot(enemy.x - townHall.x, enemy.y - townHall.y) <= 260)) {
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
    repairStep(target, tick.dt);
  }
  s.patrolTarget = null;
  return true;
}

// One repair step's worth of time at a building: pays getRepairStep's cost every interval
function repairStep(b, dt) {
  const step = getRepairStep(b);
  b.repairTimer = (b.repairTimer || 0) - dt;
  if (b.repairTimer <= 0) {
    payCost(step.cost);
    b.hp = Math.min(b.maxHp, b.hp + step.hp);
    b.repairTimer = step.interval;
    if (b.hp >= b.maxHp) b.repairRequested = false;
  }
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

// To the nearest storage, the town hall or a warehouse (#36, #141), and into the stock
function goDeliver(s, tick) {
  const storage = findNearestStorage(s);
  if (!isAtStorage(s, storage)) { walkToStorage(s, storage, tick.dt); return; }
  for (const item of s.carrying.items || [s.carrying]) {
    if (GAME_CONFIG.resources[item.type]) stock[item.type] += item.amount;
    else if (isFoodKind(item.type)) addFood(item.type, item.amount);
  }
  s.carrying = null;
  takeFishingBait(s);
}

// ---- Storages (#36, #141): the town hall and warehouses (see getStorages in state.js)

// The town hall or the warehouse nearest the settler
function findNearestStorage(s) {
  let best = townHall, bestDist = Infinity;
  for (const storage of getStorages()) {
    const d = Math.hypot(storage.x - s.x, storage.y - s.y);
    if (d < bestDist) { bestDist = d; best = storage; }
  }
  return best;
}

function isAtStorage(s, storage) {
  const d = Math.hypot(storage.x - s.x, storage.y - s.y);
  return storage === townHall ? d <= townHall.radius + s.radius + 4 : d <= 34;
}

function walkToStorage(s, storage, dt) {
  if (storage === townHall) moveSettlerToTownHall(s, s.speed, dt);
  else moveEntityTowards(s, storage.x, storage.y, s.speed, false, dt);
  s.patrolTarget = null;
}

// Walk to the nearest storage for some `id` from the stock; once there, take(). False if there's none.
function fetchFromStorage(s, id, dt, take) {
  if (!(stock[id] > 0)) return false;
  const storage = findNearestStorage(s);
  if (isAtStorage(s, storage)) take(storage);
  else walkToStorage(s, storage, dt);
  return true;
}

// Building materials a builder carries (forBlueprint) go to their blueprint (see build)
function deliverMaterials(s, tick) {
  const bp = s.carrying && s.carrying.forBlueprint;
  if (!bp) return false;
  if (!blueprints.includes(bp)) { delete s.carrying.forBlueprint; return false; } // gone: back to storage
  if (Math.hypot(bp.x - s.x, bp.y - s.y) > 30) {
    moveEntityTowards(s, bp.x, bp.y, s.speed, false, tick.dt);
  } else {
    bp.needs[s.carrying.type] = Math.max(0, (bp.needs[s.carrying.type] || 0) - s.carrying.amount);
    if (bp.needs[s.carrying.type] <= 0) delete bp.needs[s.carrying.type];
    s.carrying = null;
  }
  s.patrolTarget = null;
  return true;
}

// What a blueprint still needs brought, after what's on its way already: [id, amount] or null
function getMissingMaterial(bp) {
  for (const [id, amount] of Object.entries(bp.needs || {})) {
    const coming = settlers.reduce((sum, o) => sum + (o.carrying && o.carrying.forBlueprint === bp && o.carrying.type === id ? o.carrying.amount : 0), 0);
    if (amount - coming > 0) return [id, amount - coming];
  }
  return null;
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

// ---- The possessed settler (#16)
// Its AI is off: it doesn't work, heal or even hit back by itself. The player moves it (see update())
// and taps things to give it an order (see orderPossessed()): it walks there and does what it can with
// what it has in hand. Moving it by hand cancels the order. Gear the player picked is still fetched.
function playerControlled(s, tick) {
  if (!s.isPossessed) return false;
  if (s.targetEquipment) return equip(s, tick);
  if (s.order && !followOrder(s, tick)) s.order = null;
  return true;
}

// ---- Fighting

// Medics (a worker with a medbag) heal the wounded while enemies are about: the nearest wounded settler,
// soldiers before workers, one medic per patient, one herb from the stock per healPerHerb hp.
function treatWounded(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'medic') || !tick.isWaveActive) return false;
  const medic = GAME_CONFIG.medic;
  if (!(s.bagHerbs > 0) && stock.herbs <= 0) return false;
  let patient = null, best = Infinity;
  for (const other of settlers) {
    if (other === s || other.hp >= other.maxHp || other.towerAssignment || tick.patients.has(other)) continue;
    const d = Math.hypot(other.x - s.x, other.y - s.y) + (other.role === 'worker' ? 10000 : 0); // soldiers first
    if (d < best) { best = d; patient = other; }
  }
  if (!patient) { s.healTimer = 0; return false; }
  s.patrolTarget = null;
  // an empty bag gets filled at the nearest storage first
  if (!(s.bagHerbs > 0)) {
    return fetchFromStorage(s, 'herbs', tick.dt, () => { s.bagHerbs = takeStock('herbs', medic.bagSize); });
  }
  tick.patients.add(patient);
  if (Math.hypot(patient.x - s.x, patient.y - s.y) > medic.range + patient.radius) {
    moveEntityTowards(s, patient.x, patient.y, s.speed, false, tick.dt);
  } else {
    s.healTimer = (s.healTimer || 0) + tick.dt;
    s.working = 0.1;
    faceTowards(s, patient.x, patient.y);
    if (s.healTimer >= medic.healSeconds) {
      s.healTimer = 0;
      s.bagHerbs--;
      patient.hp = Math.min(patient.maxHp, patient.hp + medic.healPerHerb);
    }
  }
  s.patrolTarget = null;
  return true;
}

// a normal settler's drawn radius plus a normal enemy's: what melee `approach` distances are set for
const NORMAL_BODIES = 21;

// ---- Pre-wave deployment (#14)

// From deploySeconds before a wave until its enemies are beaten, not in battle mode
function isDefenseAlert() {
  if (gameMode === 'battle' || !gameStarted) return false;
  return waveTimer <= GAME_CONFIG.defense.deploySeconds || enemies.some(en => en.fromWave);
}

// How far the base reaches from the town hall: its farthest building, at least minRadius tiles
function getBaseRadius() {
  const far = buildings.reduce((max, b) => Math.max(max, Math.hypot(b.x - townHall.x, b.y - townHall.y)), 0);
  return Math.max(far, GAME_CONFIG.defense.minRadius * TILE_SIZE);
}

// From the warning until the wave is beaten, settlers go no farther from the town hall than the base's
// farthest building (plus a tile) on their own; only what the player marked takes them farther
function getSafeRadius() {
  return isDefenseAlert() ? getBaseRadius() + TILE_SIZE : Infinity;
}

function isInSafeArea(x, y) {
  return Math.hypot(x - townHall.x, y - townHall.y) <= getSafeRadius();
}

// An enemy inside the base, or next to one of its buildings or the town hall
function isInsideBase(en) {
  const near = 2 * TILE_SIZE;
  return Math.hypot(en.x - townHall.x, en.y - townHall.y) <= getBaseRadius() + TILE_SIZE + townHall.radius ||
    buildings.some(b => Math.hypot(en.x - b.x, en.y - b.y) <= near);
}

let defensePlan = null;

// Squads and their posts, rebuilt when the soldiers or the buildings change: squads of squadSize melee
// soldiers (plus an archer each while there are any), posts at the doors first, the rest spread evenly
// around the town hall at the base's radius, each on a tile a settler can stand on
function getDefensePlan() {
  const melee = settlers.filter(s => s.role === 'soldier' && !s.isPossessed);
  const archers = settlers.filter(s => s.role === 'archer' && !s.isPossessed && !s.towerAssignment);
  const key = [...melee, ...archers].map(s => s.id).join(',') + '|' + buildings.length;
  if (defensePlan && defensePlan.key === key) return defensePlan;
  const size = GAME_CONFIG.defense.squadSize;
  const count = melee.length ? Math.ceil(melee.length / size) : (archers.length ? 1 : 0);
  const radius = getBaseRadius();
  const hallReach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const standable = (x, y) => {
    const g = getGridPos(x, y);
    for (let ring = 0; ring <= 3; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (getReachSteps(hallReach, g.gx + dx, g.gy + dy) >= 0) return { x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 };
        }
      }
    }
    return { x, y };
  };
  const posts = [];
  for (const door of buildings.filter(b => b.type === 'door')) {
    if (posts.length >= count) break;
    // just inside the door, on the town hall's side
    const angle = Math.atan2(door.y - townHall.y, door.x - townHall.x);
    posts.push(standable(door.x - Math.cos(angle) * TILE_SIZE, door.y - Math.sin(angle) * TILE_SIZE));
  }
  const ring = count - posts.length;
  for (let i = 0; i < ring; i++) {
    const angle = (i / ring) * Math.PI * 2 - Math.PI / 2;
    posts.push(standable(townHall.x + Math.cos(angle) * radius, townHall.y + Math.sin(angle) * radius));
  }
  const squadOf = new Map();
  melee.forEach((s, i) => squadOf.set(s, { post: posts[Math.floor(i / size)], slot: i % size }));
  archers.forEach((s, i) => squadOf.set(s, { post: posts[i % posts.length], slot: size + Math.floor(i / posts.length) }));
  defensePlan = { key, posts, squadOf };
  return defensePlan;
}

// A soldier in a squad holds its post until an enemy comes near the post, gets into the base (or next
// to a building), or hits it; then it fights that enemy (fightEnemies) and comes back afterwards
function holdPost(s, tick) {
  if ((s.role !== 'soldier' && s.role !== 'archer') || s.isPossessed || s.towerAssignment || s.carrying || !isDefenseAlert()) return false;
  const place = getDefensePlan().squadOf.get(s);
  if (!place || !place.post) return false;
  if (getRecentAttacker(s)) return false;
  const engage = GAME_CONFIG.defense.engageTiles * TILE_SIZE;
  let nearest = null, best = engage;
  for (const en of enemies) {
    const d = Math.hypot(en.x - place.post.x, en.y - place.post.y);
    if (d < best) { best = d; nearest = en; }
  }
  // nothing near the post: the nearest enemy that got into the base, wherever that is
  if (!nearest) {
    best = Infinity;
    for (const en of enemies) {
      const d = Math.hypot(en.x - place.post.x, en.y - place.post.y);
      if (d < best && isInsideBase(en)) { best = d; nearest = en; }
    }
  }
  if (nearest) { s.postTarget = nearest; return false; }
  s.postTarget = null;
  // squad members stand around the post
  const angle = place.slot * 2.1;
  const spot = { x: place.post.x + Math.cos(angle) * 14 * Math.min(1, place.slot), y: place.post.y + Math.sin(angle) * 14 * Math.min(1, place.slot) };
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > 8) moveEntityTowards(s, spot.x, spot.y, s.speed, false, tick.dt);
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
  // a squad soldier goes for the enemy that came near its post (see holdPost)
  if (!attacker && s.postTarget && enemies.includes(s.postTarget)) targetEnemy = s.postTarget;
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
    // arrows from the nearest storage, if the stock has any (#36)
    const arrowStore = stock.arrows > 0 ? findNearestStorage(s) : null;
    const atArrowStore = !!arrowStore && isAtStorage(s, arrowStore);
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

    if (atArrowStore && currentArrows < capacity) {
      s.arrows = currentArrows + takeStock('arrows', capacity - currentArrows);
      currentArrows = s.arrows;
    }

    if (currentArrows === 0 && arrowStore && !atArrowStore) {
      walkToStorage(s, arrowStore, dt);
      return true;
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
  // workers keep working through a wave and only react to an enemy close by (#14)
  const alarm = tick.isWaveActive && !tick.tentAssault ? GAME_CONFIG.defense.workerAlarm : 260;
  if (targetEnemy && (distToClosestEn < alarm || s.role !== 'worker')) {
    // (in battle mode there's no town hall to shelter at: the unarmed fight too)
    if (isUnarmedOrRod && tick.defendersCount > 0 && !(isToolWorker && enemyNearTownHall) && !attacker && gameMode !== 'battle') {
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
    // bows need a clear line of fire too, or they walk closer. Melee approach is set for a normal settler
    // against a normal enemy (bodies 21 px apart): bigger bodies keep their centres further apart (see
    // separateSettlersFromEnemies), so a big settler or a brute counts as in reach that much sooner
    const extraBody = Math.max(0, (s.visualRadius || s.radius) + targetEnemy.radius - NORMAL_BODIES);
    const inReach = isBowWeapon(s.weapon)
      ? dist < approach && hasLineOfFire(s.x, s.y, targetEnemy.x, targetEnemy.y)
      : dist <= approach + extraBody;
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

// ---- Relief (#124)

// A settler that needs to go (see the meals in update) walks off to a quiet spot away from the buildings,
// near grass if there's some, waits a moment and leaves dung there
function relieve(s, tick) {
  if (!s.needsRelief || s.isPossessed || isDefenseAlert() || tick.isWaveActive || s.towerAssignment) return false;
  const relief = GAME_CONFIG.relief;
  if (!s.reliefSpot) s.reliefSpot = findReliefSpot(s);
  const spot = s.reliefSpot;
  s.patrolTarget = null;
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > 12) {
    moveEntityTowards(s, spot.x, spot.y, s.speed, false, tick.dt);
    s.reliefTimer = 0;
    return true;
  }
  s.reliefTimer = (s.reliefTimer || 0) + tick.dt;
  if (s.reliefTimer >= relief.seconds) {
    dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false });
    s.needsRelief = false; s.meals = 0; s.reliefSpot = null; s.reliefTimer = 0;
  }
  return true;
}

// The nearest spot the settler can walk to that's far enough from every building (and the town hall):
// grass first, then any free tile; where it stands if there's none
function findReliefSpot(s) {
  const minDist = GAME_CONFIG.relief.awayFromBuildings * TILE_SIZE;
  const away = p => Math.hypot(p.x - townHall.x, p.y - townHall.y) >= minDist + townHall.radius &&
    buildings.every(b => Math.hypot(p.x - b.x, p.y - b.y) >= minDist);
  const reach = getSettlerReach(s);
  const reachable = p => { const g = getGridPos(p.x, p.y); return getReachSteps(reach, g.gx, g.gy) !== -1; };
  const nearest = list => list.filter(p => away(p) && reachable(p))
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  // beside a grass tuft, not on it
  const byGrass = nearest(grassList.map(g => ({ x: g.x + TILE_SIZE, y: g.y })).filter(p => !isTileOccupied(p.x, p.y)));
  if (byGrass) return byGrass;
  const tiles = [];
  for (let gy = BORDER_MARGIN; gy < ROWS - BORDER_MARGIN; gy += 2) {
    for (let gx = BORDER_MARGIN; gx < COLS - BORDER_MARGIN; gx += 2) {
      const p = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
      if (!isTileOccupied(p.x, p.y)) tiles.push(p);
    }
  }
  return nearest(tiles) || { x: s.x, y: s.y };
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
        // materials first, fetched from storage (#36); none to be had: nothing to do on it for now
        const missing = getMissingMaterial(bestBp);
        if (missing) {
          const [id, amount] = missing;
          const fetching = fetchFromStorage(s, id, dt, () => {
            const got = takeStock(id, Math.min(amount, GAME_CONFIG.storage.carryMaterials));
            s.carrying = { type: id, amount: got, forBlueprint: bestBp };
          });
          s.patrolTarget = null;
          return fetching;
        }
        if (Object.keys(bestBp.needs || {}).length > 0) return false; // the rest is on its way
        let dist = Math.hypot(bestBp.x - s.x, bestBp.y - s.y);
        if (dist > 30) {
          moveEntityTowards(s, bestBp.x, bestBp.y, s.speed, false, dt);
        } else {
          workBlueprint(s, bestBp, dt);
        }
        s.patrolTarget = null;
        return true;
      }
    }
  }
  return false;
}

// Work on a blueprint the settler is standing at; finished, it becomes what it was for
function workBlueprint(s, bp, dt) {
  bp.progress += dt * 40;
  s.working = 0.1;
  faceTowards(s, bp.x, bp.y);
  if (bp.progress >= bp.maxProgress) {
    if (bp.type === 'demolish_building') {
      const b = bp.targetBuilding;
      if (buildings.includes(b)) {
        const definition = getDefinition('buildings', b.type);
        removeBuilding(b); // first: the refund mustn't go into a warehouse being taken down
        addResources(definition && definition.demolishRefund);
      }
    } else if (bp.type === 'wheat') {
      farmPlots.push({ x: bp.x, y: bp.y, growth: 0, priority: 0, harvestProgress: 0 });
    } else if (bp.type === 'sapling' || bp.type === 'apple_sapling') {
      const tree = { x: bp.x, y: bp.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 };
      trees.push(bp.type === 'apple_sapling' ? makeAppleTree(tree) : tree);
    } else {
      buildings.push(bp);
      ejectEntitiesFromTile(bp.x, bp.y);
      invalidateAllPaths();
    }
    blueprints.splice(blueprints.indexOf(bp), 1);
  }
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
  if (fishSpot && !s.bait && !getFishingBait()) fishSpot = null;
  if (fishSpot && !s.bait) {
    tick.assignedFishersCount++;
    fetchBait(s, dt);
    s.patrolTarget = null;
    return true;
  }
  if (fishSpot) {
    tick.assignedFishersCount++;
    fishAt(s, fishSpot, dt);
    return true;
  }
  return false;
}

// Walk to a fishing spot and fish there (the settler has bait)
function fishAt(s, fishSpot, dt) {
  let dist = Math.hypot(fishSpot.x - s.x, fishSpot.y - s.y);
  if (dist > 32) {
    moveEntityTowards(s, fishSpot.x, fishSpot.y, s.speed, false, dt);
  } else {
    fishSpot.fishTimer = (fishSpot.fishTimer || 0) + dt;
    s.working = 0.1;
    faceTowards(s, fishSpot.x, fishSpot.y);
    if (fishSpot.fishTimer >= GAME_CONFIG.fishing.seconds) {
      for (const [item, amount] of Object.entries(GAME_CONFIG.fishing.catch)) giveResourceToSettler(s, item, amount);
      addCarryLoad(s);
      s.bait = false;
      fishSpot.fishTimer = 0;
    }
  }
  s.patrolTarget = null;
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
  if (kind === 'grass' && tick.idleFarmer === s) return true; // so does a farmer with nothing else to do

  const def = getMapResourceDef(kind);
  if (!def) return false;
  // needs a tool: only settlers carrying one of that family (and trees must be grown)
  // apple trees are only felled when the player marked one that had no apples
  if (r.apple && !((r.priority || 0) > 0 && r.markIntent === 'chop')) return false;
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

  if (!assignedRes) {
    // from the warning until the wave is beaten, nothing beyond the base's farthest building (#14)
    let availableRes = tick.allResources.filter(r => canSettlerHarvest(s, r, tick) && !skipped(r) && (!r.priority || r.priority === 0) &&
      !getMapResourceDef(tick.resourceKind.get(r)).markOnly && isInSafeArea(r.x, r.y));
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
      startSwing(s, Math.min(0.35, hunt.cooldown * 0.8));
      faceTowards(s, boar.x, boar.y);
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
  s.working = 0.1; // animated while at it (see getHeldItemPose)
  faceTowards(s, assignedRes.x, assignedRes.y);
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

// ---- Apple trees

// Workers with no tool pick ripe apples off the nearest apple tree they can reach (marked ones first),
// one worker per tree; a pick is a load to carry home (GAME_CONFIG.appleTrees)
function pickApples(s, tick) {
  if (s.role !== 'worker' || s.tool !== 'none' || s.weapon !== 'fist' || s.isPossessed || tick.isWaveActive) return false;
  if (s.carrying && !hasRoomToCarry(s)) return false;
  const reach = getSettlerReach(s);
  let target = null, best = Infinity;
  for (const t of trees) {
    if (!t.apple || !t.applesReady || tick.appleAssignments.has(t)) continue;
    if (!(t.markIntent === 'apples' && t.priority > 0) && !isInSafeArea(t.x, t.y)) continue;
    const d = getReachDistanceToResource(reach, t) - (t.markIntent === 'apples' && t.priority > 0 ? 1000 : 0);
    if (d < best) { best = d; target = t; }
  }
  if (!target || best === Infinity) return false;
  tick.appleAssignments.add(target);
  return pickApplesFrom(s, target, tick.dt);
}

// Walk up to an apple tree and pick its apples; false if there's nowhere to stand next to it
function pickApplesFrom(s, target, dt) {
  const spot = getResourceApproachPoint(s, target);
  if (!spot) return false;
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > 10) {
    moveEntityTowards(s, spot.x, spot.y, s.speed, false, dt);
    s.pickProgress = 0;
  } else {
    s.pickProgress = (s.pickProgress || 0) + dt;
    s.working = 0.1;
    faceTowards(s, target.x, target.y);
    const apples = GAME_CONFIG.appleTrees;
    if (s.pickProgress >= apples.pickSeconds) {
      s.pickProgress = 0;
      for (const [item, amount] of Object.entries(apples.yield)) giveResourceToSettler(s, item, amount);
      addCarryLoad(s);
      for (const [item, chance] of Object.entries(apples.bonusChance || {})) if (rand() < chance) addResources({ [item]: 1 });
      target.applesReady = false;
      target.appleGrowth = 0;
      if (target.markIntent === 'apples') { target.priority = 0; target.markIntent = null; }
    }
  }
  s.patrolTarget = null;
  return true;
}

// ---- Cooking

// Campfire cooks (GAME_CONFIG.cooking): while there's raw food in the stock, a worker with no tool looks
// after a campfire, one per fire. It fetches fuel from the town hall when the fire is out, then a batch of
// raw food, cooks it piece by piece and takes the food home. What it carries is ordinary stock (wood,
// raw meat...) marked with the fire it's for, so if it's called away (a wave) it just goes back in stock.
function cook(s, tick) {
  if (s.role !== 'worker' || s.tool !== 'none' || s.weapon !== 'fist' || s.isPossessed || tick.isWaveActive) return false;
  const cooking = GAME_CONFIG.cooking;
  const job = s.carrying && s.carrying.forFire;
  if (s.carrying && !job) return false; // carrying something else: deliver that first
  let fire = job && buildings.includes(job) ? job : null;
  if (!fire) {
    if (s.carrying) return false; // its fire is gone: deliverCarrying puts it back in the stock
    if (!cooking.raw.some(r => stock[r] > 0)) return false;
    fire = buildings.filter(b => b.type === 'campfire' && isBuildingJobFree(b, 'cook', s) && (b.fuelLeft > 0 || findFuel()))
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (!fire) return false;
  }
  claimBuildingJob(fire, 'cook', s);
  s.patrolTarget = null;

  // empty-handed: fetch fuel if the fire is out, otherwise a batch of raw food (no more than the fuel
  // cooks), from the nearest storage
  if (!s.carrying) {
    const needsFuel = !(fire.fuelLeft > 0);
    const want = needsFuel ? findFuel() : cooking.raw.find(r => stock[r] > 0);
    if (!want) return false;
    return fetchFromStorage(s, want, tick.dt, () => {
      const amount = takeStock(want, needsFuel ? 1 : Math.min(cooking.batch, fire.fuelLeft));
      s.carrying = { type: want, amount, forFire: fire };
    });
  }

  // at the fire: put the fuel on, or cook what it brought one piece at a time
  if (Math.hypot(fire.x - s.x, fire.y - s.y) > 32) {
    moveEntityTowards(s, fire.x, fire.y, s.speed, false, tick.dt);
    return true;
  }
  const load = s.carrying;
  if (cooking.fuel[load.type]) {
    fire.fuelLeft = (fire.fuelLeft || 0) + cooking.fuel[load.type] * load.amount;
    s.carrying = null;
    return true;
  }
  if (!(fire.fuelLeft > 0)) {
    // out of fuel mid-batch: take the raw food back, fetch fuel next
    delete load.forFire;
    return false;
  }
  s.working = 0.1;
  faceTowards(s, fire.x, fire.y);
  fire.burning = 1; // drawn lit for a moment
  fire.cookProgress = (fire.cookProgress || 0) + tick.dt / cooking.seconds;
  if (fire.cookProgress >= 1) {
    fire.cookProgress = 0;
    fire.fuelLeft--;
    load.amount--;
    s.cooked = (s.cooked || 0) + cooking.makes;
    if (load.amount <= 0) {
      s.carrying = { type: cooking.dish[load.type] || 'provisions', amount: s.cooked }; // home with it (deliverCarrying)
      s.cooked = 0;
    }
  }
  return true;
}

// The fuel the stock has, coal before wood (see GAME_CONFIG.cooking.fuel)
function findFuel() {
  return Object.keys(GAME_CONFIG.cooking.fuel).find(f => stock[f] > 0) || null;
}

// ---- Worms

// Fishers pick worms off corpses that have them (see corpseHasWorms) and carry them home as bait
function collectWorms(s, tick) {
  if (s.role !== 'worker' || s.tool !== 'rod' || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  let target = null, best = Infinity;
  for (const c of corpses) {
    if (!corpseHasWorms(c) || tick.wormAssignments.has(c) || !isInSafeArea(c.x, c.y)) continue;
    const d = Math.hypot(c.x - s.x, c.y - s.y);
    if (d < best) { best = d; target = c; }
  }
  if (!target) return false;
  tick.wormAssignments.add(target);
  if (best > 16) {
    moveEntityTowards(s, target.x, target.y, s.speed, false, tick.dt);
  } else {
    const worms = GAME_CONFIG.worms;
    target.wormsTaken = true;
    giveResourceToSettler(s, 'worms', target.big ? worms.perBigCorpse : worms.perCorpse);
  }
  s.patrolTarget = null;
  return true;
}

// ---- Watering

// A farmer with a watering can waters growing crops (wheat plots, saplings) that aren't watered yet,
// filling up at the nearest water it can reach; a watered crop grows faster (GAME_CONFIG.gear.wateringCan)
function waterCrops(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'hoe') || !s.wateringCan || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  const can = GAME_CONFIG.gear.wateringCan;
  const thirsty = [...farmPlots.filter(f => f.growth < 100), ...trees.filter(t => t.isGrowing)]
    .filter(c => !c.watered && !tick.wateringAssignments.has(c));
  if (thirsty.length === 0) return false;
  s.patrolTarget = null;
  s.usingCan = 0.3; // the can in hand, the hoe on its back (see render)
  if (!(s.waterCharges > 0)) {
    const water = waterTiles.filter(w => isWaterReachable(w))
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (!water) return false;
    if (Math.hypot(water.x - s.x, water.y - s.y) > 32) moveEntityTowards(s, water.x, water.y, s.speed, false, tick.dt);
    else s.waterCharges = can.charges;
    return true;
  }
  const crop = thirsty.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  tick.wateringAssignments.add(crop);
  if (Math.hypot(crop.x - s.x, crop.y - s.y) > 24) {
    moveEntityTowards(s, crop.x, crop.y, s.speed, false, tick.dt);
  } else {
    crop.watered = true;
    s.waterCharges--;
    s.working = 0.1;
  }
  return true;
}

// A farmer with nothing to plant or harvest gathers grass (see canSettlerHarvest)
function farmerGathersGrass(s, tick) {
  if (!hasToolFamily(s.tool, 'hoe')) return false;
  tick.idleFarmer = s;
  const busy = harvest(s, tick);
  tick.idleFarmer = null;
  return busy;
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
    s.working = 0.1;
    faceTowards(s, target.x, target.y);
    if (s.plantProgress >= farming.plantSeconds) {
      s.plantProgress = 0;
      const cropId = farming.crops[target.crop];
      payCost(getDefinition('buildings', cropId).cost || {});
      if (cropId === 'wheat') farmPlots.push({ x: target.x, y: target.y, growth: 0, priority: 0, harvestProgress: 0 });
      else {
        const tree = { x: target.x, y: target.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 };
        trees.push(cropId === 'apple_sapling' ? makeAppleTree(tree) : tree);
      }
      ejectEntitiesFromTile(target.x, target.y);
      resetTileIndex();
    }
  }
  s.patrolTarget = null;
  return true;
}

// Nothing else to do: wander near the town hall (shown with an idle icon, see render())
function patrol(s, tick) {
  if (gameMode === 'battle') return true; // nothing to wander around: stand
  // caught outside the base when the alert starts: straight back, not a stroll
  if (!isInSafeArea(s.x, s.y)) {
    s.patrolTarget = null;
    moveSettlerToTownHall(s, s.speed, tick.dt);
    return true;
  }
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
  playerControlled,
  loadTowerArrows,
  collectSmelterIron,
  supplySmelter,
  deliverToSmelter,
  guardTower,
  repairTownHall,
  repairBuilding,
  equip,
  cook,
  deliverMaterials,
  deliverCarrying,
  repairTent,
  healAtTent,
  treatWounded,
  holdPost,
  fightEnemies,
  breakOutOfSealedBase,
  clearEnemyTents,
  relieve,
  build,
  collectWorms,
  fish,
  pickApples,
  harvest,
  tendFarmZones,
  waterCrops,
  farmerGathersGrass,
  deliverWhenNothingToDo,
  patrol
];
