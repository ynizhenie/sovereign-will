// The colony's necromancer heals, raises and blights

// ---- Necromancers

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, townHall } from '../../../engine/world/index.js';
import { moveSettlerToTownHall, stock, takeStock } from '../../colony/storage/index.js';
import { getNecromancy, raiseTemporaryZombie } from './undead.rules.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { getBaseRadius, isDefenseAlert } from '../../conflict/combat/index.js';

// The undead's necromancer: heals the wounded around it; in a fight raises corpses (any, a big one into a
// big zombie) while it has raises and there's room in the colony; with raises spent, or nothing to raise,
// it gets them back at the nearest grave (or the graveyard)
export function necromancy(s, tick) {
  const necro = getNecromancy(s);
  if (!necro) return false;
  if (s.raisesLeft === undefined) s.raisesLeft = necro.raises;
  const dt = tick.dt;
  const dist = o => Math.hypot(o.x - s.x, o.y - s.y);

  // it keeps behind its own (#199): an enemy closer than necroKeepBack, it steps back towards the town hall
  // (hit, it still strikes back: strikeBack comes first)
  if (!s.isPossessed) {
    // (raising or healing, it holds on unless an enemy is right on it: no stepping back and forth, #232)
    const busy = (s.raiseTimer || 0) > 0 || (s.working || 0) > 0;
    const keep = busy ? 60 : GAME_CONFIG.morale.necroKeepBack;
    const threat = game.enemies.filter(en => en.hp > 0 && dist(en) < keep).sort((a, b) => dist(a) - dist(b))[0];
    if (threat && dist(townHall) > townHall.radius + s.radius + 10) {
      const d = Math.max(1, dist(threat));
      const away = { x: s.x + (s.x - threat.x) / d * 60, y: s.y + (s.y - threat.y) / d * 60 };
      // away from it, leaning towards the hall, behind its own
      const h = Math.max(1, dist(townHall));
      s.patrolTarget = null;
      moveEntityTowards(s, (away.x + s.x + (townHall.x - s.x) / h * 60) / 2, (away.y + s.y + (townHall.y - s.y) / h * 60) / 2, s.speed, false, dt);
      return true;
    }
  }

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
  // raised in a fight; between waves the corpses give bones instead (collectBones, #199)
  if (s.raisesLeft > 0 && (tick.isWaveActive || isDefenseAlert())) {
    // not one with an enemy close to it: it would go for it and step back again (#232)
    const guarded = c => game.enemies.some(en => en.hp > 0 && Math.hypot(en.x - c.x, en.y - c.y) < GAME_CONFIG.morale.necroCorpseClear);
    for (const c of game.corpses) {
      if (tick.raiseAssignments.has(c) || dist(c) > necro.range || guarded(c)) continue;
      if (!corpse || dist(c) < dist(corpse)) corpse = c;
    }
  }
  if (corpse) {
    tick.raiseAssignments.add(corpse);
    s.patrolTarget = null;
    // raised from a distance (raiseReach), not standing over it (#203)
    if (dist(corpse) > necro.raiseReach) {
      moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, dt);
      s.raiseTimer = 0;
      return true;
    }
    s.working = 0.1;
    s.raising = { x: corpse.x, y: corpse.y, until: game.pathTick + 2 }; // its thread (drawRaising)
    faceTowards(s, corpse.x, corpse.y);
    s.raiseTimer = (s.raiseTimer || 0) + dt;
    if (s.raiseTimer >= necro.raiseSeconds) {
      s.raiseTimer = 0;
      s.raisesLeft--;
      raiseTemporaryZombie(corpse);
    }
    return true;
  }

  // marked ground to blight, while there's the rot for it (blightRot a tile, #204)
  const zone = stock.rot >= necro.blightRot ? game.blightZones.filter(z => !z.done && !tick.blightAssignments.has(z))
    .sort((a, b) => dist(a) - dist(b))[0] : null;
  if (zone) {
    tick.blightAssignments.add(zone);
    s.patrolTarget = null;
    if (dist(zone) > 16) {
      moveEntityTowards(s, zone.x, zone.y, s.speed, false, dt);
      s.blightTimer = 0;
    } else {
      s.working = 0.1;
      s.blightTimer = (s.blightTimer || 0) + dt;
      if (s.blightTimer >= necro.blightSeconds) { s.blightTimer = 0; zone.done = true; takeStock('rot', necro.blightRot); }
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

// Between waves (no one to fight, a raised zombie would only crumble), a necromancer with nothing else to
// do takes the bones from a corpse in or near the base: `bones` (twice that from a big one) in boneSeconds
// (GAME_CONFIG.idle, #199)
export function collectBones(s, tick) {
  const necro = getNecromancy(s);
  if (!necro || s.isPossessed || s.carrying || tick.isWaveActive) return false;
  const c = GAME_CONFIG.idle;
  const dist = o => Math.hypot(o.x - s.x, o.y - s.y);
  const reach = getBaseRadius() + 3 * TILE_SIZE;
  const corpse = game.corpses.filter(k => !tick.raiseAssignments.has(k) && Math.hypot(k.x - townHall.x, k.y - townHall.y) <= reach)
    .sort((a, b) => dist(a) - dist(b))[0];
  if (!corpse) { s.boneTimer = 0; return false; }
  tick.raiseAssignments.add(corpse);
  s.patrolTarget = null;
  if (dist(corpse) > 18) { moveEntityTowards(s, corpse.x, corpse.y, s.speed, false, tick.dt); s.boneTimer = 0; return true; }
  faceTowards(s, corpse.x, corpse.y);
  s.working = 0.1;
  s.boneTimer = (s.boneTimer || 0) + tick.dt;
  if (s.boneTimer >= c.boneSeconds) {
    s.boneTimer = 0;
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
    stock.bones = (stock.bones || 0) + c.bones * (corpse.big ? 2 : 1);
  }
  return true;
}
