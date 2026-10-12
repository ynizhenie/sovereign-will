// Settler AI.
//
// Every tick update() runs SETTLER_BEHAVIOURS for each settler, in order. A behaviour looks at the
// settler and either takes over its tick (does something and returns true — later behaviours don't run
// for this settler this tick) or passes (returns false). To change priorities, reorder the list; to add
// a behaviour, write a function (settler, tick) => boolean and put it where it belongs in the list.
//
// `tick` holds what's shared by all settlers within one tick (see createSettlerTick), including the
// assignment counters that keep settlers from piling onto the same job.

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

// ---- Towers and repairs

// Archers assigned to a watchtower stay in it until the fight comes close to the town hall
function guardTower(s, tick) {
  if (s.towerAssignment) {
    if (!isTowerDutyOn(s.towerAssignment)) {
      releaseTowerGuard(s);
    } else {
      updateTowerGuard(s, s.towerAssignment, tick.dt);
    }
    s.patrolTarget = null;
    if (s.towerAssignment) return true;
  }
  return false;
}

// ---- Tents and healing

// Workers mend a damaged tent unless enemies are right next to it
function repairTent(s, tick) {
  if (s.role === 'worker' && !s.isPossessed) {
    let damagedTent = buildings.find(b => isShelter(b) && b.hp < b.maxHp);
    if (damagedTent) {
      let tentThreatened = enemies.some(en => Math.hypot(en.x - damagedTent.x, en.y - damagedTent.y) < 120);
      if (!tentThreatened) {
        let distToTent = Math.hypot(damagedTent.x - s.x, damagedTent.y - s.y);
        if (distToTent > 32) {
          moveEntityTowards(s, damagedTent.x, damagedTent.y, s.speed, false, tick.dt);
        } else {
          damagedTent.hp = Math.min(damagedTent.maxHp, damagedTent.hp + tick.dt * getDefinition('buildings', damagedTent.type).repairPerSecond);
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
  // being hit right now: it turns on whoever hits it (fightEnemies) and heals once it has fought them off
  // (a playtest saw badly hurt settlers stand healing at a tent while an enemy beat them to death)
  const hitNow = !!getRecentAttacker(s) && pathTick - s.lastAttackedTick < 90;
  if (hitNow) { s.healing = false; return false; }
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
        s.hp = Math.min(s.maxHp, s.hp + tick.dt * getDefinition('buildings', nearestTent.type).healPerSecond);
        s.patrolTarget = null;
        s.healing = s.hp < s.maxHp;
        if (s.healing) return true;
      }
    }
  }
  return false;
}

// ---- Demons (#43)

// A settler the player sent into a sacrificial circle walks there and dies in it; everyone else is
// healed to full (see the circle tap in handleCanvasClick)
function goToSacrifice(s, tick) {
  const circle = s.sacrificeAt;
  if (!circle) return false;
  if (!buildings.includes(circle)) { s.sacrificeAt = null; return false; }
  s.patrolTarget = null;
  if (Math.hypot(circle.x - s.x, circle.y - s.y) > 30) {
    moveEntityTowards(s, circle.x, circle.y, s.speed, false, tick.dt);
    return true;
  }
  s.sacrificeAt = null;
  s.hp = 0;
  for (const other of settlers) if (other !== s) other.hp = other.maxHp;
  showNotification(t('sacrifice.done'), false);
  return true;
}

// Demons heal by eating a corpse, when nothing is attacking (eatCorpseSeconds per corpse: back to full)
function eatCorpse(s, tick) {
  if (!(getDefinition('settlerTypes', s.type) || {}).eatsCorpses || s.hp >= s.maxHp || tick.isWaveActive || s.carrying) return false;
  let corpse = null, best = Infinity;
  for (const c of corpses) {
    const d = Math.hypot(c.x - s.x, c.y - s.y);
    if (d < best && !tick.raiseAssignments.has(c)) { best = d; corpse = c; }
  }
  if (!corpse) return false;
  tick.raiseAssignments.add(corpse);
  s.patrolTarget = null;
  if (best > 16) {
    moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt);
    s.eatTimer = 0;
    return true;
  }
  s.working = 0.1;
  faceTowards(s, corpse.x, corpse.y);
  s.eatTimer = (s.eatTimer || 0) + tick.dt;
  if (s.eatTimer >= GAME_CONFIG.eatCorpseSeconds) {
    s.eatTimer = 0;
    s.hp = s.maxHp;
    corpses.splice(corpses.indexOf(corpse), 1);
  }
  return true;
}

// ---- Necromancers (#43)

// The undead's necromancer: heals the wounded around it; raises corpses (any, a big one into a big
// zombie) while it has raises and there's room in the colony; with raises spent, or nothing to raise,
// it gets them back at the nearest grave (or the graveyard)
function necromancy(s, tick) {
  const necro = getNecromancy(s);
  if (!necro) return false;
  if (s.raisesLeft === undefined) s.raisesLeft = necro.raises;
  const dt = tick.dt;
  const dist = o => Math.hypot(o.x - s.x, o.y - s.y);

  let patient = null;
  for (const other of settlers) {
    if (other !== s && other.hp < other.maxHp && dist(other) < necro.range / 2 && (!patient || dist(other) < dist(patient))) patient = other;
  }
  if (patient) {
    s.patrolTarget = null;
    if (dist(patient) > necro.healRange) {
      moveEntityTowards(s, patient.x, patient.y, s.speed, false, dt);
    } else {
      patient.hp = Math.min(patient.maxHp, patient.hp + necro.healPerSecond * dt);
      s.working = 0.1;
      faceTowards(s, patient.x, patient.y);
    }
    return true;
  }

  let corpse = null;
  const zombieType = c => (c.big ? 'big_zombie' : 'zombie');
  if (s.raisesLeft > 0) {
    for (const c of corpses) {
      if (tick.raiseAssignments.has(c) || dist(c) > necro.range) continue;
      if (!corpse || dist(c) < dist(corpse)) corpse = c;
    }
  }
  if (corpse) {
    tick.raiseAssignments.add(corpse);
    s.patrolTarget = null;
    if (dist(corpse) > 16) {
      moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, dt);
      s.raiseTimer = 0;
      return true;
    }
    s.working = 0.1;
    faceTowards(s, corpse.x, corpse.y);
    s.raiseTimer = (s.raiseTimer || 0) + dt;
    if (s.raiseTimer >= necro.raiseSeconds) {
      s.raiseTimer = 0;
      s.raisesLeft--;
      raiseTemporaryZombie(corpse);
    }
    return true;
  }

  // marked ground to blight (#164)
  const zone = blightZones.filter(z => !z.done && !tick.blightAssignments.has(z))
    .sort((a, b) => dist(a) - dist(b))[0];
  if (zone) {
    tick.blightAssignments.add(zone);
    s.patrolTarget = null;
    if (dist(zone) > 16) {
      moveEntityTowards(s, zone.x, zone.y, s.speed, false, dt);
      s.blightTimer = 0;
    } else {
      s.working = 0.1;
      s.blightTimer = (s.blightTimer || 0) + dt;
      if (s.blightTimer >= necro.blightSeconds) { s.blightTimer = 0; zone.done = true; }
    }
    return true;
  }

  if (s.raisesLeft < necro.raises) {
    const graves = buildings.filter(b => b.type === 'grave');
    const grave = graves.length ? graves.reduce((a, b) => (dist(a) < dist(b) ? a : b)) : townHall;
    s.patrolTarget = null;
    if (grave === townHall ? dist(townHall) > townHall.radius + s.radius + 4 : dist(grave) > 32) {
      if (grave === townHall) moveSettlerToTownHall(s, s.speed, dt);
      else moveEntityTowards(s, grave.x, grave.y, s.speed, false, dt);
    } else {
      s.raisesLeft = necro.raises;
    }
    return true;
  }
  return false;
}

// A corpse rises as a temporary zombie (#164): no room taken in the colony; it crumbles into rot after
// GAME_CONFIG.temporaryZombie.lifeSeconds (see updateTemporaryZombies)
function raiseTemporaryZombie(corpse) {
  const zombie = createSettler(corpse.big ? 'big_zombie' : 'zombie', Date.now() + rand(), corpse.x, corpse.y);
  zombie.temporary = GAME_CONFIG.temporaryZombie.lifeSeconds;
  settlers.push(zombie);
  corpses.splice(corpses.indexOf(corpse), 1);
  return zombie;
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
  const near = GAME_CONFIG.defense.nearBaseTiles * TILE_SIZE;
  return Math.hypot(en.x - townHall.x, en.y - townHall.y) <= getBaseRadius() + near + townHall.radius ||
    buildings.some(b => Math.hypot(en.x - b.x, en.y - b.y) <= near);
}

// An enemy the player pointed at, for this soldier, while fewer than markedSquad soldiers go for it (#155)
function takeMarkedTarget(s, tick) {
  let best = null;
  for (const en of enemies) {
    if (!en.markedTarget || (tick.markedAssignments.get(en) || 0) >= GAME_CONFIG.defense.markedSquad) continue;
    if (!best || Math.hypot(en.x - s.x, en.y - s.y) < Math.hypot(best.x - s.x, best.y - s.y)) best = en;
  }
  if (best) tick.markedAssignments.set(best, (tick.markedAssignments.get(best) || 0) + 1);
  return best;
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
  // too few for two squads: everyone on a post of their own round the base (#155)
  const singles = melee.length < 2 * size;
  const count = singles ? melee.length + archers.length : Math.ceil(melee.length / size);
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
  if (singles) {
    [...melee, ...archers].forEach((s, i) => squadOf.set(s, { post: posts[i], slot: 0 }));
  } else {
    melee.forEach((s, i) => squadOf.set(s, { post: posts[Math.floor(i / size)], slot: i % size }));
    archers.forEach((s, i) => squadOf.set(s, { post: posts[i % posts.length], slot: size + Math.floor(i / posts.length) }));
  }
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
  // an enemy the player pointed at: a few soldiers leave their posts for it (#155)
  const marked = takeMarkedTarget(s, tick);
  if (marked) { s.postTarget = marked; return false; }
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
  // enemies the player marked with the Point tool come first, for up to markedSquad of the armed (a
  // squad soldier already got its own from holdPost)...
  if (s.weapon !== 'fist' && !(s.postTarget && s.postTarget.markedTarget && enemies.includes(s.postTarget))) {
    const marked = takeMarkedTarget(s, tick);
    if (marked) targetEnemy = marked;
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
