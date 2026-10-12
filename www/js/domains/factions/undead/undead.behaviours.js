// The colony's necromancer heals, raises and blights

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
  for (const other of game.settlers) {
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
    for (const c of game.corpses) {
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
  const zone = game.blightZones.filter(z => !z.done && !tick.blightAssignments.has(z))
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
    const graves = game.buildings.filter(b => b.type === 'grave');
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
