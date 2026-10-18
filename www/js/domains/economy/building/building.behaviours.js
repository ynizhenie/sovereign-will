// Builders build, bring materials, repair and run the smelters; a walled-in base breaks out

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game, townHall } from '../../../engine/world/index.js';
import { getWeaponStats } from '../../colony/equipment/index.js';
import { addResources, canAfford, fetchFromStorage, moveSettlerToTownHall, payCost, stock, takeStock } from '../../colony/storage/index.js';
import { claimBuildingJob, getMissingMaterial, getRepairStep, getSmelterLimits, isBuildingJobFree, needsRepair, removeBuilding } from './building.rules.js';
import { finishHarvest, getMapResourceDef } from '../gathering/index.js';
import { makeAppleTree } from '../farming/index.js';
import { ejectEntitiesFromTile, getReachDistanceToResource, getResourceApproachPoint, getSettlerReach, invalidateAllPaths, moveEntityTowards } from '../../../engine/movement/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { playSound, playWorkSound } from '../../../app/index.js';

// Pick up smelted iron and carry it home
export function collectSmelterIron(s, tick) {
  if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
    let smelterWithIron = game.buildings.find(b => b.type === 'smelter' && (b.ironProduced || 0) > 0 && isBuildingJobFree(b, 'collector', s));
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
export function supplySmelter(s, tick) {
  if (!s.carrying && s.role === 'worker' && !s.isPossessed && !s.targetEquipment) {
    const limits = getSmelterLimits();
    /** @type {[string, string, number][]} */
    const loads = [['ironOre', 'oreLoaded', limits.maxOre], ['coal', 'coalLoaded', limits.maxCoal]];
    for (const [resource, loaded, max] of loads) {
      if (stock[resource] <= 0) continue;
      const smelter = game.buildings.find(b => b.type === 'smelter' && (b[loaded] || 0) < max && isBuildingJobFree(b, 'supplier', s));
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
export function deliverToSmelter(s, tick) {
  if (s.carrying && s.carrying.type === 'smelterDelivery') {
    let targetSmelter = s.carrying.targetSmelter;
    if (!game.buildings.includes(targetSmelter)) {
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

// Repair the town hall when the player asked for it (cost and hp per step: GAME_CONFIG.repairs.townHall)
export function repairTownHall(s, tick) {
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
export function repairBuilding(s, tick) {
  if (s.role !== 'worker' || s.carrying || s.targetEquipment || s.isPossessed || s.towerAssignment) return false;
  let target = null, best = Infinity;
  // only one it can walk up to (#232: a wall behind spikes had them trying for good)
  const reach = getSettlerReach(s);
  for (const b of game.buildings) {
    if (!needsRepair(b) || (tick.repairAssignments.get(b) || 0) >= 2 || !canAfford(getRepairStep(b).cost)) continue;
    if (getReachDistanceToResource(reach, b) === Infinity) continue;
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
export function repairStep(b, dt) {
  const step = getRepairStep(b);
  b.repairTimer = (b.repairTimer || 0) - dt;
  if (b.repairTimer <= 0) {
    payCost(step.cost);
    b.hp = Math.min(b.maxHp, b.hp + step.hp);
    if (b.usesLeft !== undefined) b.usesLeft = Math.floor(b.hp); // a trap's uses (#232)
    b.repairTimer = step.interval;
    if (b.hp >= b.maxHp) b.repairRequested = false;
  }
}

// Building materials a builder carries (forBlueprint) go to their blueprint (see build)
export function deliverMaterials(s, tick) {
  const bp = s.carrying && s.carrying.forBlueprint;
  if (!bp) return false;
  if (!game.blueprints.includes(bp)) { delete s.carrying.forBlueprint; return false; } // gone: back to storage
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

// ---- Work

// Build (or demolish) the nearest blueprint that has fewer than 3 builders
export function build(s, tick) {
  const dt = tick.dt;
  if (game.blueprints.length > 0 && !s.carrying && s.role === 'worker') {
    let hasNearbyEnemy = game.enemies.some(en => Math.hypot(en.x - s.x, en.y - s.y) < 220);
    if (!hasNearbyEnemy) {
      let bestBp = /** @type {import('../../../engine/world/types.js').Blueprint | null} */ (null);
      let minDist = Infinity;
      game.blueprints.forEach(bp => {
        let assignedCount = tick.blueprintAssignments.get(bp) || 0;
        if (assignedCount < 3) {
          let d = Math.hypot(bp.x - s.x, bp.y - s.y);
          if (d < minDist) { minDist = d; bestBp = bp; }
        }
      });

      if (bestBp) {
        tick.blueprintAssignments.set(bestBp, (tick.blueprintAssignments.get(bestBp) || 0) + 1);
        // materials first, fetched from storage; none to be had: nothing to do on it for now
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
export function workBlueprint(s, bp, dt) {
  bp.progress += dt * 40;
  s.working = 0.1;
  faceTowards(s, bp.x, bp.y);
  playWorkSound(s, 'hammer', 0.45);
  if (bp.progress >= bp.maxProgress) {
    playSound('built', bp);
    if (bp.type === 'demolish_building') {
      const b = bp.targetBuilding;
      if (game.buildings.includes(b)) {
        const definition = getDefinition('buildings', b.type);
        removeBuilding(b); // first: the refund mustn't go into a warehouse being taken down
        addResources(definition && definition.demolishRefund);
      }
    } else if (bp.type === 'wheat') {
      game.farmPlots.push({ x: bp.x, y: bp.y, growth: 0, priority: 0, harvestProgress: 0 });
    } else if (bp.type === 'sapling' || bp.type === 'apple_sapling') {
      const tree = { x: bp.x, y: bp.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 };
      game.trees.push(bp.type === 'apple_sapling' ? makeAppleTree(tree) : tree);
    } else {
      // built over the one it upgrades (a door on a wall, #248): that one comes down, its refund back
      if (bp.replaces) {
        const old = bp.replaces;
        delete bp.replaces;
        if (game.buildings.includes(old)) {
          game.buildings.splice(game.buildings.indexOf(old), 1);
          addResources((getDefinition('buildings', old.type) || {}).demolishRefund);
        }
      }
      game.buildings.push(bp);
      ejectEntitiesFromTile(bp.x, bp.y);
      invalidateAllPaths();
    }
    game.blueprints.splice(game.blueprints.indexOf(bp), 1);
  }
}

// A walled-in base: soldiers break the nearest door blocker they can reach, one hp per strike
export function breakOutOfSealedBase(s, tick) {
  if (!tick.baseSealed || s.role === 'worker' || s.isPossessed) return false;
  const reach = getSettlerReach(s);
  let target = null, best = Infinity;
  for (const r of tick.doorBlockers) {
    if (!game[getMapResourceDef(tick.resourceKind.get(r)).list].includes(r)) continue; // already broken this tick
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
