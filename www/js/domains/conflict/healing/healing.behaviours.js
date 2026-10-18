// Healing at a shelter, mending it, and medics treating the wounded

// ---- Tents and healing

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { hasToolFamily } from '../../colony/equipment/index.js';
import { fetchFromStorage, stock, takeStock } from '../../colony/storage/index.js';
import { faceTowards, getRecentAttacker } from '../../colony/settlers/index.js';
import { isShelter } from './healing.rules.js';
import { getReachDistanceToResource, getSettlerReach, moveEntityTowards } from '../../../engine/movement/index.js';
import { isWaterReachable } from '../../world/index.js';
import { joinsTentAssault } from '../combat/index.js';
import { playSound } from '../../../app/index.js';

// Workers mend a damaged tent unless enemies are right next to it
export function repairTent(s, tick) {
  if (s.role === 'worker' && !s.isPossessed) {
    let damagedTent = game.buildings.find(b => isShelter(b) && b.hp < b.maxHp);
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
  const covered = game.settlers.some(o => o !== s && o.weapon !== 'fist' && !o.towerAssignment && Math.hypot(o.x - s.x, o.y - s.y) < ai.coverRange);
  const badlyWounded = s.hp < s.maxHp * (covered ? ai.retreatShare : 0.25);
  // being hit right now: it turns on whoever hits it (fightEnemies) and heals once it has fought them off
  const hitNow = !!getRecentAttacker(s) && game.pathTick - s.lastAttackedTick < 90;
  if (hitNow) { s.healing = false; return false; }
  if (s.healing && (s.hp >= s.maxHp || tents.length === 0 || (getRecentAttacker(s) && !badlyWounded))) s.healing = false;
  const calm = game.enemies.length === 0 && !(tick.tentAssault && joinsTentAssault(s, tick));
  if (s.hp < s.maxHp && tents.length > 0 && !s.isPossessed && (calm || badlyWounded || s.healing)) {
    let nearbyThreat = game.enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 100);
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
// soldiers before workers, one medic per patient, a potion (healPerPotion hp) or else a herb (healPerHerb)
// from its bag, filled at a storage. With the wave beaten and a tent (grave) to heal at for free, it keeps
// its herbs (#199)
export function treatWounded(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'medic') || !tick.isWaveActive) return false;
  if (tick.tents.length > 0 && !game.enemies.some(en => en.fromWave)) return false;
  const medic = GAME_CONFIG.medic;
  if (!(s.bagHerbs > 0) && !(s.bagPotions > 0) && stock.herbs <= 0 && !(stock.potions > 0)) return false;
  let patient = null, best = Infinity;
  for (const other of game.settlers) {
    if (other === s || other.hp >= other.maxHp || other.towerAssignment || tick.patients.has(other)) continue;
    const d = Math.hypot(other.x - s.x, other.y - s.y) + (other.role === 'worker' ? 10000 : 0); // soldiers first
    if (d < best) { best = d; patient = other; }
  }
  if (!patient) { s.healTimer = 0; return false; }
  s.patrolTarget = null;
  // an empty bag gets filled at the nearest storage first: potions, then herbs for the room left
  if (!(s.bagHerbs > 0) && !(s.bagPotions > 0)) {
    return fetchFromStorage(s, stock.potions > 0 ? 'potions' : 'herbs', tick.dt, () => {
      s.bagPotions = takeStock('potions', medic.bagSize);
      s.bagHerbs = takeStock('herbs', medic.bagSize - s.bagPotions);
    });
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
      const potion = s.bagPotions > 0;
      if (potion) s.bagPotions--; else s.bagHerbs--;
      patient.hp = Math.min(patient.maxHp, patient.hp + (potion ? medic.healPerPotion : medic.healPerHerb));
      playSound('heal', patient);
    }
  }
  s.patrolTarget = null;
  return true;
}

// ---- Potions (#199)

// Between waves a medic brews a potion: brew.herbs herbs from a storage, water from the nearest water, and
// brew.seconds over a campfire; while the stock has fewer than brew.max. The herbs and water go in its hands
export function brewPotion(s, tick) {
  const brew = GAME_CONFIG.medic.brew;
  const load = s.carrying && s.carrying.forBrew ? s.carrying : null;
  if (load && (tick.isWaveActive || s.isPossessed)) { addResourcesBack(load); s.carrying = null; return false; }
  if (!load && (s.role !== 'worker' || !hasToolFamily(s.tool, 'medic') || s.isPossessed || s.carrying || tick.isWaveActive ||
    stock.herbs < brew.herbs || (stock.potions || 0) + game.settlers.filter(o => o.carrying && o.carrying.forBrew).length >= brew.max ||
    game.pathTick < (s.brewRestUntil || 0))) return false;
  // the nearest fire and water it can walk to (#232: water across rock it stood facing for good)
  const reach = getSettlerReach(s);
  const walk = o => getReachDistanceToResource(reach, o);
  const nearestWalk = list => list.map(o => ({ o, d: walk(o) })).filter(m => m.d < Infinity).sort((a, b) => a.d - b.d)[0]?.o || null;
  const fire = nearestWalk(game.buildings.filter(b => b.type === 'campfire'));
  const water = nearestWalk(game.waterTiles.filter(w => isWaterReachable(w)));
  const giveUp = () => { if (load) { addResourcesBack(load); s.carrying = null; } s.brewWalk = 0; };
  if (!fire || !water) { giveUp(); return false; }
  s.patrolTarget = null;
  if (!load) { s.brewWalk = 0; return fetchFromStorage(s, 'herbs', tick.dt, () => { s.carrying = { type: 'herbs', amount: takeStock('herbs', brew.herbs), forBrew: 'water' }; }); }
  // walking for too long without getting there: not now, it tries again in a while
  s.brewWalk = (s.brewWalk || 0) + tick.dt;
  if (s.brewWalk > brew.giveUpSeconds) { giveUp(); s.brewRestUntil = game.pathTick + brew.restSeconds * 60; return false; }
  if (load.forBrew === 'water') {
    if (Math.hypot(water.x - s.x, water.y - s.y) > 30) moveEntityTowards(s, water.x, water.y, s.speed, false, tick.dt);
    else { s.working = 0.1; load.forBrew = 'fire'; s.brewWalk = 0; }
    return true;
  }
  if (Math.hypot(fire.x - s.x, fire.y - s.y) > 32) { moveEntityTowards(s, fire.x, fire.y, s.speed, false, tick.dt); s.brewTimer = 0; return true; }
  s.brewWalk = 0;
  faceTowards(s, fire.x, fire.y);
  s.working = 0.1;
  s.brewTimer = (s.brewTimer || 0) + tick.dt;
  if (s.brewTimer >= brew.seconds) { s.brewTimer = 0; s.carrying = null; stock.potions = (stock.potions || 0) + 1; }
  return true;
}

// the herbs back into the stock (a brew dropped half way)
function addResourcesBack(load) { stock.herbs += load.amount || 0; }

