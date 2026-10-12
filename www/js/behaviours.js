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
