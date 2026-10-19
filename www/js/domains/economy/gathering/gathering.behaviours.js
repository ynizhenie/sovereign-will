// Workers gather: pick a resource (the player's marks first), walk to it, work it with the right tool

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { hasAxeTool, hasPickaxeTool, hasToolFamily, isBowWeapon } from '../../colony/equipment/index.js';
import { faceTowards, isBigBody } from '../../colony/settlers/index.js';
import { finishHarvest, getMapResourceDef } from './gathering.rules.js';
import { addCarryLoad, giveResourceToSettler } from '../../colony/storage/index.js';
import { ORE_KINDS } from '../../world/index.js';
import { getReachDistanceToResource, getResourceApproachPoint, getSettlerReach, moveEntityTowards } from '../../../engine/movement/index.js';
import { isInSafeArea } from '../../conflict/combat/index.js';
import { huntBoar } from '../hunting/index.js';
import { playWorkSound } from '../../../app/index.js';

// Workers gather any time; soldiers only between waves (hunting boars, picking up carcasses)
export function canGather(s, tick) {
  return s.role === 'worker' || (s.role !== 'worker' && !tick.isWaveActive);
}

// Can this settler work this resource with what it has in hand?
export function canSettlerHarvest(s, r, tick) {
  const kind = tick.resourceKind.get(r);
  if (s.role !== 'worker') {
    if (r.isCarcass) return r.collector === s;
    // (an archer out of arrows doesn't go hunting, #232)
    if (kind === 'boar') return !tick.isWaveActive && !r.hidden && !r.hideTarget && !(isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0));
    return false;
  }
  if (r.isCarcass) return r.collector === s;
  if (kind === 'boar') {
    if (isBowWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
    if (hasAxeTool(s.tool) || hasPickaxeTool(s.tool) || hasToolFamily(s.tool, 'hoe') || hasToolFamily(s.tool, 'medic')) return false;
    if (hasToolFamily(s.tool, 'necro') && !((r.priority || 0) > 0)) return false; // a necromancer only one pointed at (#253)
    if (r.hidden || r.hideTarget) return false;
    let hasNothing = (s.tool === 'none' && s.weapon === 'fist');
    let hasRod = (s.tool === 'rod');
    return !hasNothing && !hasRod;
  }

  if (kind === 'grass' && game.boars.some(b => (b.hidden || b.hideTarget) && b.hideTarget === r)) return false;
  // loot (#210): not while an enemy is close to it
  if (kind === 'loot' && game.enemies.some(en => Math.hypot(en.x - r.x, en.y - r.y) < 150)) return false;
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

// A worker with nothing in hand that's free for a mark (#232): gathering, carrying in what it gathered, or
// idle; not one building, cooking, making things...
export function isFreeHands(o) {
  return o.role === 'worker' && o.tool === 'none' && o.weapon === 'fist' && !o.isPossessed &&
    (!o.activity || o.isIdle || o.activity === 'harvest' || o.activity === 'pickApples' || o.activity === 'deliverCarrying' || o.activity === 'deliverWhenNothingToDo');
}

// Player-marked resources first, otherwise the nearest one the settler can walk to. Of the marked: the one
// it's already on, until it's done; else the nearest nobody's on yet, and only with none left a second
// worker on one (up to getWorkPriority) — two on one while others waited made one of them stand about
// (#232). Returns null if there's nothing to do.
export function pickResourceToHarvest(s, tick) {
  const settlerReach = getSettlerReach(s);
  // resources this settler recently found no spot next to (see harvest())
  const skipped = r => s.skippedResource === r && game.pathTick < s.skippedUntilTick;
  let assignedRes = null;
  const workers = r => tick.workerAssignments.get(r) || 0;
  // something marked that needs no tool (sticks, pebbles, berries, apples) is for the free hands: one with a
  // tool takes it only while no worker with nothing in hand is free for it, and only one nobody's on (#232)
  const handsFree = s.tool !== 'none' && game.settlers.some(o => o !== s && isFreeHands(o) && (!o.markTarget || !tick.markedResources.includes(o.markTarget)));
  const forHands = r => !getMapResourceDef(tick.resourceKind.get(r)).tool;
  const marked = tick.markedResources.map(r => ({ r, d: canSettlerHarvest(s, r, tick) && !skipped(r) && !(handsFree && forHands(r)) ? getReachDistanceToResource(settlerReach, r) : Infinity }))
    .filter(m => m.d < Infinity && workers(m.r) < getWorkPriority(m.r) &&
      // (nor a second pair of hands on one someone's already going for)
      !(s.tool !== 'none' && forHands(m.r) && game.settlers.some(o => o !== s && o.markTarget === m.r)));
  const nearest = list => list.reduce((best, m) => (!best || m.d < best.d ? m : best), null);
  const kept = marked.find(m => m.r === s.markTarget);
  const pick = kept || nearest(marked.filter(m => workers(m.r) === 0)) || nearest(marked);
  if (pick) {
    assignedRes = pick.r;
    tick.workerAssignments.set(pick.r, workers(pick.r) + 1);
  }
  s.markTarget = assignedRes;

  if (!assignedRes) {
    // from the warning until the wave is beaten, nothing beyond the base's farthest building
    let availableRes = tick.allResources.filter(r => canSettlerHarvest(s, r, tick) && !skipped(r) && (!r.priority || r.priority === 0) &&
      !getMapResourceDef(tick.resourceKind.get(r)).markOnly && isInSafeArea(r.x, r.y));
    // what its foreman said is needed most, first, while there's some of it (#248)
    if (s.focus && s.focus.until > game.pathTick) {
      const focused = availableRes.filter(r => ((r.yield || getMapResourceDef(tick.resourceKind.get(r)).yield || {})[s.focus.resource] || 0) > 0);
      if (focused.length) availableRes = focused;
    }
    // nearest by walking distance; straight-line distance picked things behind rock walls or sealed off
    let minDist = Infinity;
    availableRes.forEach(r => {
      let d = getReachDistanceToResource(settlerReach, r);
      if (d < minDist) { minDist = d; assignedRes = r; }
    });
  }
  return assignedRes;
}

// Work a resource the settler is standing next to, the way its GAME_CONFIG.mapResources `work` says
export function workResource(s, assignedRes, tick) {
  const dt = tick.dt;
  const kind = tick.resourceKind.get(assignedRes);
  const def = getMapResourceDef(kind);
  // gone already: another settler finished it earlier this tick (the tick's resource lists are a snapshot)
  if (!def || !game[def.list].includes(assignedRes)) {
    s.patrolTarget = null;
    return;
  }
  if (def.tool && (!hasToolFamily(s.tool, def.tool) || assignedRes.isGrowing)) return;
  s.working = 0.1; // animated while at it (see getHeldItemPose)
  faceTowards(s, assignedRes.x, assignedRes.y);
  const work = def.work;
  playWorkSound(s, def.tool === 'axe' ? 'chop' : def.tool === 'pickaxe' ? 'mine' : 'rustle', def.tool ? 0.5 : 0.7);

  if (assignedRes.oreSpawner) {
    // an ore spawner (#248): slow, one ore at a time, never used up
    assignedRes.harvestProgress = (assignedRes.harvestProgress || 0) + dt;
    if (assignedRes.harvestProgress >= def.spawnerWork.seconds[s.tool]) {
      assignedRes.harvestProgress = 0;
      for (const [item, amount] of Object.entries(getMapResourceDef(ORE_KINDS[assignedRes.oreSpawner].resource).yield)) giveResourceToSettler(s, item, Math.min(1, amount));
      addCarryLoad(s);
    }
  } else if (work.pickup) {
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
    // by body, not by kind: a zombie or an imp chops like a worker, a big zombie or a demon like a giant
    assignedRes.hp -= dt * work.chop[isBigBody(s) ? 'big' : 'normal'] * ((work.toolBonus && work.toolBonus[s.tool]) || 1);
    if (assignedRes.hp <= 0) finishHarvest(s, assignedRes, kind);
  } else if (work.drain) {
    assignedRes.hp -= dt * work.drain[s.tool];
    if (assignedRes.hp <= 0) finishHarvest(s, assignedRes, kind);
  }
  s.patrolTarget = null;
}

// Gather: pick a resource, walk to a free spot next to it, work it
export function harvest(s, tick) {
  if (!canGather(s, tick)) return false;
  const assignedRes = pickResourceToHarvest(s, tick);
  if (!assignedRes) return false;

  let approachPos = getResourceApproachPoint(s, assignedRes);
  if (!approachPos) {
    // nowhere to stand next to it: pick something else for a while instead of standing here
    s.skippedResource = assignedRes;
    s.skippedUntilTick = game.pathTick + 5 * 60;
    s.patrolTarget = null;
    return true;
  }
  if (game.boars.includes(assignedRes)) {
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

// How many workers a marked resource takes at once: markWorkers for the player's mark, 1 for a door blocker
export function getWorkPriority(r) {
  return r.priority > 0 ? GAME_CONFIG.markWorkers : 1;
}
