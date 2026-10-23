// Healing at a shelter, mending it, and medics treating the wounded

// ---- Tents and healing

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { hasToolFamily } from '../../colony/equipment/index.js';
import { fetchFromStorage, stock, takeStock } from '../../colony/storage/index.js';
import { faceTowards, getRecentAttacker, noteDay } from '../../colony/settlers/index.js';
import { isShelter } from './healing.rules.js';
import { getReachDistanceToResource, getSettlerReach, moveEntityTowards, someEnemyNear, someSettlerNear } from '../../../engine/movement/index.js';
import { isWaterReachable } from '../../world/index.js';
import { joinsTentAssault } from '../combat/index.js';
import { playSound } from '../../../app/index.js';

// Workers mend a damaged tent unless enemies are right next to it
export function repairTent(s, tick) {
  if (s.role === 'worker' && !s.isPossessed) {
    let damagedTent = game.buildings.find(b => !b.campId && isShelter(b) && b.hp < b.maxHp);
    if (damagedTent) {
      let tentThreatened = game.enemies.some(en => Math.hypot(en.x - damagedTent.x, en.y - damagedTent.y) < 120);
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
export function healAtTent(s, tick) {
  const tents = tick.tents;
  // badly wounded: below a quarter of its health; with an armed one near to hold the line, a little sooner (#208)
  const ai = GAME_CONFIG.combatAI;
  const covered = someSettlerNear(s.x, s.y, ai.coverRange, o => o !== s && o.weapon !== 'fist' && !o.towerAssignment); // (#306: those near it, not everyone)
  const badlyWounded = s.hp < s.maxHp * (covered ? ai.retreatShare : 0.25);
  // being hit right now: it turns on whoever hits it (fightEnemies) and heals once it has fought them off
  const hitNow = !!getRecentAttacker(s) && game.pathTick - s.lastAttackedTick < 90;
  if (hitNow) { s.healing = false; return false; }
  if (s.healing && (s.hp >= s.maxHp || tents.length === 0 || (getRecentAttacker(s) && !badlyWounded))) s.healing = false;
  const calm = game.enemies.length === 0 && !(tick.tentAssault && joinsTentAssault(s, tick));
  if (s.hp < s.maxHp && tents.length > 0 && !s.isPossessed && (calm || badlyWounded || s.healing)) {
    let nearbyThreat = someEnemyNear(s.x, s.y, 100, () => true); // (#306: those near it, not everyone)
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

// ---- Fighting

// Medics (a worker with a medbag) heal the wounded while enemies are about: the nearest wounded settler,
// soldiers before workers, one medic per patient, a herb (healPerHerb hp) each (#279: no more potions)
// from its bag, filled at a storage. With the wave beaten and a tent (grave) to heal at for free, it keeps
// its herbs (#199)
export function treatWounded(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'medic') || !tick.isWaveActive) return false;
  if (tick.tents.length > 0 && !game.enemies.some(en => en.fromWave)) return false;
  const medic = GAME_CONFIG.medic;
  if (!(s.bagHerbs > 0) && stock.herbs <= 0) return false;
  let patient = null, best = Infinity;
  for (const other of game.settlers) {
    if (other === s || other.hp >= other.maxHp || other.towerAssignment || tick.patients.has(other)) continue;
    const d = Math.hypot(other.x - s.x, other.y - s.y) + (other.role === 'worker' ? 10000 : 0); // soldiers first
    if (d < best) { best = d; patient = other; }
  }
  if (!patient && s.hp < s.maxHp && !tick.patients.has(s)) patient = s; // itself last of all (#279)
  if (!patient) { s.healTimer = 0; return false; }
  s.patrolTarget = null;
  // an empty bag gets filled with herbs at the nearest storage first
  if (!(s.bagHerbs > 0)) return fetchFromStorage(s, 'herbs', tick.dt, () => { s.bagHerbs = takeStock('herbs', medic.bagSize); });
  tick.patients.add(patient);
  if (patient !== s && Math.hypot(patient.x - s.x, patient.y - s.y) > medic.range + patient.radius) {
    moveEntityTowards(s, patient.x, patient.y, s.speed, false, tick.dt);
  } else {
    s.healTimer = (s.healTimer || 0) + tick.dt;
    s.working = 0.1;
    if (patient !== s) faceTowards(s, patient.x, patient.y);
    if (s.healTimer >= medic.healSeconds) {
      s.healTimer = 0;
      s.bagHerbs--;
      patient.hp = Math.min(patient.maxHp, patient.hp + medic.healPerHerb);
      if (patient !== s) noteDay(s, 'healed'); // (#279)
      playSound('heal', patient);
    }
  }
  s.patrolTarget = null;
  return true;
}


