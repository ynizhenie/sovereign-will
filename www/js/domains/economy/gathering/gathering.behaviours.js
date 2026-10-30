// Workers gather: pick a resource (the player's marks first), walk to it, work it with the right tool

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, onceThisTick, rand, townHall } from '../../../engine/world/index.js';
import { hasAxeTool, hasPickaxeTool, hasToolFamily, isRangedWeapon } from '../../colony/equipment/index.js';
import { faceTowards, isBigBody, nightReach, says } from '../../colony/settlers/index.js';
import { finishHarvest, getMapResourceDef } from './gathering.rules.js';
import { addCarryLoad, addResources, giveResourceToSettler, hasRoomToCarry } from '../../colony/storage/index.js';
import { hasFog, inTerritory, isVisible, ORE_KINDS } from '../../world/index.js';
import { getReachDistanceToResource, getResourceApproachPoint, getSettlerReach, moveEntityTowards, someEnemyNear } from '../../../engine/movement/index.js';
import { isInSafeArea, TENT_ASSAULT_FIGHT_DISTANCE } from '../../conflict/combat/index.js';
import { huntBoar } from '../hunting/index.js';
import { playSound, playWorkSound } from '../../../app/index.js';

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
    if (kind === 'boar') return !tick.isWaveActive && !r.hidden && !r.hideTarget && !(isRangedWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0));
    return false;
  }
  if (r.isCarcass) return r.collector === s;
  if (kind === 'boar') {
    if (isRangedWeapon(s.weapon) && (!s.quiver || (s.arrows || 0) <= 0)) return false;
    if (hasAxeTool(s.tool) || hasPickaxeTool(s.tool) || hasToolFamily(s.tool, 'hoe') || hasToolFamily(s.tool, 'medic')) return false;
    if (hasToolFamily(s.tool, 'necro') && !((r.priority || 0) > 0)) return false; // a necromancer only one pointed at (#253)
    if (r.hidden || r.hideTarget) return false;
    if ((hasFog() && !isVisible(r.x, r.y)) || !inTerritory(r.x, r.y)) return false; // (a soldier goes looking for one in the dark, 27.10, 6)
    let hasNothing = (s.tool === 'none' && s.weapon === 'fist');
    let hasRod = (s.tool === 'rod');
    return !hasNothing && !hasRod;
  }

  if (kind === 'grass' && game.boars.some(b => (b.hidden || b.hideTarget) && b.hideTarget === r)) return false;
  // loot (#210): not while an enemy is close to it
  if (kind === 'loot' && someEnemyNear(r.x, r.y, 150, () => true)) return false; // (#306: an enemy close to it)
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
  if (kind === 'log' && hasToolFamily(s.tool, 'axe')) return true; // a woodcutter carries the logs it cut (#298)
  let hasPriority = (r.priority || 0) > 0;
  return s.tool === 'none' || hasPriority;
}

// A worker with nothing in hand that's free for a mark (#232): gathering, carrying in what it gathered, or
// idle; not one building, cooking, making things...
export function isFreeHands(o) {
  return o.role === 'worker' && o.tool === 'none' && o.weapon === 'fist' && !o.isPossessed &&
    (!o.activity || o.isIdle || o.activity === 'harvest' || o.activity === 'pickApples' || o.activity === 'deliverCarrying' || o.activity === 'deliverWhenNothingToDo');
}

// (#306) What a settler with this gear can work, worked out once a tick for all who carry the same: the same
// bushes, trees and stones were gone over for every settler, every tick, which was a big colony's costliest
// work (a carcass is left out: which settler may bring it in is its own)
const gearListsOnce = onceThisTick();
function workableWithGear(s, tick) {
  const one = r => !r.isCarcass && canSettlerHarvest(s, r, tick);
  // (the farmer gathering grass for herbs is the one a tick: its own list)
  if (tick.idleFarmer === s) return tick.allResources.filter(one);
  const bow = isRangedWeapon(s.weapon) ? (s.quiver && (s.arrows || 0) > 0 ? 'bow' : 'noArrows') : '';
  const key = `${s.role}|${s.tool}|${s.weapon}|${bow}`;
  const lists = gearListsOnce(() => new Map());
  let list = lists.get(key);
  if (!list) {
    list = tick.allResources.filter(one);
    lists.set(key, list);
  }
  return list;
}

// Ripe apple trees on the base's land, worked out once a tick for all the free hands: a ripe tree is no
// priority of its own, it is simply one more thing to pick, the nearest one first (see pickResourceToHarvest)
const appleTreesOnce = onceThisTick();
const ripeAppleTrees = () => appleTreesOnce(() => game.trees.filter(t => t.apple && t.applesReady && inTerritory(t.x, t.y)));

// Player-marked resources first, otherwise the nearest one the settler can walk to. Of the marked: the one
// it's already on, until it's done; else the nearest nobody's on yet, and only with none left a second
// worker on one (up to getWorkPriority) — two on one while others waited made one of them stand about
// (#232). Returns null if there's nothing to do.
// (#326) Who's going for which thing: one each. Made once a tick from what each was going for (picked in the last two seconds,
// still gathering), and kept up as they pick in this tick: two workers didn't go for one stick, one of them for nothing
const claimsOnce = onceThisTick();
const claims = () => claimsOnce(() => {
  /** @type {Map<any, any>} */
  const by = new Map();
  for (const o of game.settlers) if (o.pickedRes && o.lastBehaviour && o.activity === 'harvest' && game.pathTick - (o.pickedAt || -Infinity) < 120) by.set(o.pickedRes, o);
  return by;
});
const claimedByOther = (r, s) => { const o = claims().get(r); return !!o && o !== s && game.settlers.includes(o) && o.hp > 0; };

export function pickResourceToHarvest(s, tick, markedOnly = false) {
  // (#306) the settler's walking distances worked out only if there's something to walk to: that walk is the
  // costliest thing in here, and it was made for every settler every tick, whether there was work or not
  let settlerReach = null;
  const reachOf = () => settlerReach || (settlerReach = getSettlerReach(s));
  // at night with no torch, nothing past the base (#257)
  const night = nightReach(s), withinNight = r => night === Infinity || Math.hypot(r.x - townHall.x, r.y - townHall.y) <= night;
  // resources this settler recently found no spot next to (see harvest())
  const skipped = r => s.skippedResource === r && game.pathTick < s.skippedUntilTick;
  let assignedRes = null;
  const workers = r => tick.workerAssignments.get(r) || 0;
  // something marked that needs no tool (sticks, pebbles, berries, apples) is for the free hands: one with a
  // tool takes it only while no worker with nothing in hand is free for it, and only one nobody's on (#232)
  // (#306) whether anyone with free hands is free for a mark: the same for all who carry a tool (one of those
  // is never one of the free hands), worked out once a tick
  const handsFreeOnce = onceThisTick();
  const handsFree = s.tool !== 'none' && handsFreeOnce(() => game.settlers.some(o => isFreeHands(o) && (!o.markTarget || !tick.markedResources.includes(o.markTarget))));
  const forHands = r => !getMapResourceDef(tick.resourceKind.get(r)).tool;
  const marked = tick.markedResources.map(r => ({ r, d: canSettlerHarvest(s, r, tick) && !skipped(r) && !(handsFree && forHands(r)) && withinNight(r) ? getReachDistanceToResource(reachOf(), r) : Infinity }))
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
  // (#326) up at night for a mark past the base, with no torch: it says it won't go out there in the dark
  if (!assignedRes && s.drowsy && night !== Infinity && tick.markedResources.some(r => !withinNight(r) && canSettlerHarvest(s, r, tick))) says(s, 'noTorch');
  if (!assignedRes && (s.drowsy || markedOnly)) return null; // (up at night for what was marked, or the marks first: only that, #298)

  if (!assignedRes) {
    // from the warning until the wave is beaten, nothing beyond the base's farthest building
    const usable = r => !skipped(r) && (!r.priority || r.priority === 0) && isInSafeArea(r.x, r.y) && withinNight(r) &&
      isSafeFromTentAssault(s, r, tick) && !claimedByOther(r, s);
    // (#306) from the list of what this gear can work, not from every resource on the base's land
    // (#322) the one it picked is kept for a third of a second while it's still there and it can still work it: every settler
    // went through every resource of the base's land every tick to pick, and came to the same one
    const gear = `${s.role}|${s.tool}|${s.weapon}`;
    const held = s.pickedRes;
    if (held && s.pickedGear === gear && game.pathTick >= s.pickedAt && game.pathTick - s.pickedAt < 20 && tick.resourceSet.has(held) && !held.isCarcass && !(held.hp <= 0) &&
      !(s.focus && s.focus.until > game.pathTick) && usable(held) && canSettlerHarvest(s, held, tick)) return held;
    let availableRes = [];
    for (const r of workableWithGear(s, tick)) if (!getMapResourceDef(tick.resourceKind.get(r)).markOnly && usable(r)) availableRes.push(r);
    // (the carcasses it was the one to bring in, one each, #199)
    for (const b of game.boars) if (b.isCarcass && b.collector === s && usable(b)) availableRes.push(b);
    // what its foreman said is needed most, first, while there's some of it (#248)
    if (s.focus && s.focus.until > game.pathTick) {
      const focused = availableRes.filter(r => ((r.yield || getMapResourceDef(tick.resourceKind.get(r)).yield || {})[s.focus.resource] || 0) > 0);
      if (focused.length) availableRes = focused;
    }
    // (#326) a woodcutter takes up the logs of what's felled (and a fallen tree's log cut up) before felling
    // another: the wood's all brought in first
    if (hasToolFamily(s.tool, 'axe')) {
      const felled = availableRes.filter(r => tick.resourceKind.get(r) === 'log' || r.fallen);
      if (felled.length) availableRes = felled;
    }
    // nearest by walking distance; straight-line distance picked things behind rock walls or sealed off.
    // (#306) Walking is never shorter than the straight way there in tiles, so what's farther off than the
    // best so far can be left out before its distance is asked for
    let minDist = Infinity;
    for (const r of availableRes) {
      const offTiles = Math.max(Math.abs(r.x - s.x), Math.abs(r.y - s.y)) / TILE_SIZE;
      if (offTiles >= minDist + 1) continue;
      const d = getReachDistanceToResource(reachOf(), r);
      if (d < minDist) { minDist = d; assignedRes = r; }
    }
    // a free hand picks ripe apples too, like anything else it can reach: only the nearest, on the base's
    // land, and (with a wave coming) inside the base; not a priority over the rest, nor a walk past the
    // player's zone for them
    if (s.role === 'worker' && s.tool === 'none' && s.weapon === 'fist') {
      for (const t of ripeAppleTrees()) {
        if (tick.appleAssignments.has(t) || skipped(t) || !isInSafeArea(t.x, t.y) || !withinNight(t)) continue;
        const offTiles = Math.max(Math.abs(t.x - s.x), Math.abs(t.y - s.y)) / TILE_SIZE;
        if (offTiles >= minDist + 1) continue;
        const d = getReachDistanceToResource(reachOf(), t);
        if (d < minDist) { minDist = d; assignedRes = t; }
      }
      if (assignedRes && assignedRes.apple && assignedRes.applesReady) tick.appleAssignments.add(assignedRes);
    }
    s.pickedRes = assignedRes; s.pickedAt = game.pathTick; s.pickedGear = gear;
    if (assignedRes) claims().set(assignedRes, s);
  }
  return assignedRes;
}

function isSafeFromTentAssault(settler, resource, tick) {
  if (!tick.tentAssault || settler.role !== 'worker' || settler.weapon !== 'fist' || tick.workersHelpTents) return true;
  const dx = resource.x - settler.x, dy = resource.y - settler.y;
  const lengthSquared = dx * dx + dy * dy;
  const safeDistance = TENT_ASSAULT_FIGHT_DISTANCE + TILE_SIZE;
  return game.enemyTents.every(tent => {
    const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((tent.x - settler.x) * dx + (tent.y - settler.y) * dy) / lengthSquared));
    return Math.hypot(tent.x - (settler.x + along * dx), tent.y - (settler.y + along * dy)) >= safeDistance;
  });
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
  s.workKind = kind === 'berry_bush' ? 'pick' : null; // (berries picked by hand, #279)
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
    playSound('pickup', s); // (#252)
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

// Walk up to an apple tree and pick its apples; false if there's nowhere to stand next to it
export function pickApplesFrom(s, target, dt) {
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
    target.pickShare = s.pickProgress / apples.pickSeconds; // shown on the tree
    target.pickTick = game.pathTick;
    if (s.pickProgress >= apples.pickSeconds) {
      s.pickProgress = 0;
      for (const [item, amount] of Object.entries(apples.yield)) giveResourceToSettler(s, item, amount);
      addCarryLoad(s);
      for (const [item, chance] of Object.entries(apples.bonusChance || {})) if (rand() < chance) addResources({ [item]: 1 });
      target.applesReady = false;
      target.appleGrowth = 0;
      target.pickShare = 0;
      if (target.markIntent === 'apples') { target.priority = 0; target.markIntent = null; }
    }
  }
  s.patrolTarget = null;
  return true;
}

// (#298) the player's marks first: something marked, and one fit for it goes for it before its chores
// (cooking, dung, corpses, firewood, piles...), which kept it from them for long ("marks ignored"). With its
// load full it takes that home first
export function harvestMarked(s, tick) {
  if (s.carrying && !hasRoomToCarry(s)) return false;
  if (s.carrying && (s.carrying.forFire || s.carrying.type === 'corpse' || s.carrying.counted)) return false;
  if (!tick.markedResources.some(r => (r.priority || 0) > 0)) return false;
  return harvest(s, tick, true);
}

// Gather: pick a resource, walk to a free spot next to it, work it
export function harvest(s, tick, markedOnly = false) {
  if (!canGather(s, tick)) return false;
  // hands full (as many loads as it can carry): home with them first (see deliverCarrying)
  if (s.carrying && s.carrying.loads !== undefined && !hasRoomToCarry(s)) return false;
  const assignedRes = pickResourceToHarvest(s, tick, markedOnly);
  if (!assignedRes) return false;

  // a ripe apple tree: its apples are picked, not the tree felled
  if (assignedRes.apple && assignedRes.applesReady) {
    if (!pickApplesFrom(s, assignedRes, tick.dt)) {
      s.skippedResource = assignedRes;
      s.skippedUntilTick = game.pathTick + 5 * 60;
      s.patrolTarget = null;
    }
    return true;
  }

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
