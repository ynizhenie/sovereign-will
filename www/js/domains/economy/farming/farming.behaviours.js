// Farmers plant and water the zones, gather grass; workers with free hands pick apples

// ---- Apple trees

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { game, getGridPos, rand, resetTileIndex } from '../../../engine/world/index.js';
import { hasToolFamily } from '../../colony/equipment/index.js';
import { addCarryLoad, addResources, canAfford, giveResourceToSettler, hasRoomToCarry, payCost } from '../../colony/storage/index.js';
import { isTileOccupied } from '../building/index.js';
import { isWaterReachable } from '../../world/index.js';
import { getMapResourceDef, harvest } from '../gathering/index.js';
import { makeAppleTree } from './farming.rules.js';
import { ejectEntitiesFromTile, getReachDistanceToResource, getReachSteps, getResourceApproachPoint, getSettlerReach, moveEntityTowards } from '../../../engine/movement/index.js';
import { isInSafeArea } from '../../conflict/combat/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';

// Workers with no tool pick ripe apples off the nearest apple tree they can reach (marked ones first),
// one worker per tree; a pick is a load to carry home (GAME_CONFIG.appleTrees)
export function pickApples(s, tick) {
  if (s.role !== 'worker' || s.tool !== 'none' || s.weapon !== 'fist' || s.isPossessed || tick.isWaveActive) return false;
  if (s.carrying && !hasRoomToCarry(s)) return false;
  const reach = getSettlerReach(s);
  let target = null, best = Infinity;
  for (const t of game.trees) {
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

// ---- Watering

// A farmer with a watering can waters growing crops (wheat plots, saplings) that aren't watered yet,
// filling up at the nearest water it can reach; a watered crop grows faster (GAME_CONFIG.gear.wateringCan)
export function waterCrops(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'hoe') || !s.wateringCan || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  const can = GAME_CONFIG.gear.wateringCan;
  const thirsty = [...game.farmPlots.filter(f => f.growth < 100), ...game.trees.filter(t => t.isGrowing)]
    .filter(c => !c.watered && !tick.wateringAssignments.has(c));
  if (thirsty.length === 0) return false;
  s.patrolTarget = null;
  s.usingCan = 0.3; // the can in hand, the hoe on its back (see render)
  if (!(s.waterCharges > 0)) {
    const water = game.waterTiles.filter(w => isWaterReachable(w))
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (!water) return false;
    if (Math.hypot(water.x - s.x, water.y - s.y) > 32) moveEntityTowards(s, water.x, water.y, s.speed, false, tick.dt);
    else { s.waterCharges = can.charges; playSound('splash', s); }
    return true;
  }
  const crop = thirsty.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  tick.wateringAssignments.add(crop);
  if (Math.hypot(crop.x - s.x, crop.y - s.y) > 24) {
    moveEntityTowards(s, crop.x, crop.y, s.speed, false, tick.dt);
  } else {
    crop.watered = true;
    playSound('drip', crop);
    s.waterCharges--;
    s.working = 0.1;
  }
  return true;
}

// ---- Fertiliser

// A farmer with a backpack, between waves, carries a pile of dung to a wheat plot not fertilised yet;
// the plot's next harvest yields more (GAME_CONFIG.fertilizer). Called off its way (a wave), it drops the
// dung where it is (#201)
export function fertilize(s, tick) {
  const carriesDung = !!s.carrying && s.carrying.type === 'dung';
  const able = s.role === 'worker' && hasToolFamily(s.tool, 'hoe') && s.backpack && !s.isPossessed && !tick.isWaveActive;
  if (carriesDung && !able) {
    game.dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false });
    s.carrying = null;
    return false;
  }
  if (!able || (s.carrying && !carriesDung)) return false;
  const near = list => list.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  const plot = near(game.farmPlots.filter(f => !f.fertilized && !tick.fertilizeAssignments.has(f)));
  if (!plot) {
    if (carriesDung) { game.dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false }); s.carrying = null; }
    return false;
  }
  if (!carriesDung) {
    const pile = near(game.dung.filter(p => !tick.dungAssignments.has(p) && isInSafeArea(p.x, p.y)));
    if (!pile) return false;
    tick.dungAssignments.add(pile);
    tick.fertilizeAssignments.add(plot);
    s.patrolTarget = null;
    if (Math.hypot(pile.x - s.x, pile.y - s.y) > 16) moveEntityTowards(s, pile.x, pile.y, s.speed, false, tick.dt);
    else { game.dung.splice(game.dung.indexOf(pile), 1); s.carrying = { type: 'dung', amount: 1 }; }
    return true;
  }
  tick.fertilizeAssignments.add(plot);
  s.patrolTarget = null;
  if (Math.hypot(plot.x - s.x, plot.y - s.y) > 20) {
    moveEntityTowards(s, plot.x, plot.y, s.speed, false, tick.dt);
  } else {
    plot.fertilized = true;
    s.carrying = null;
    s.working = 0.1;
  }
  return true;
}

// A farmer with nothing to plant or harvest gathers grass (see canSettlerHarvest)
export function farmerGathersGrass(s, tick) {
  if (!hasToolFamily(s.tool, 'hoe')) return false;
  tick.idleFarmer = s;
  const busy = harvest(s, tick);
  tick.idleFarmer = null;
  return busy;
}

// ---- Farm zones

// What's gathered by hand (grass, sticks, pebbles, bushes) lying on a farm zone tile: workers without a
// tool take it home first (worked as if marked with priority 1), so the tile can be planted
export function findZoneBlockers(allResources, resourceKind) {
  const blockers = new Set();
  if (game.farmZones.length === 0) return blockers;
  const zoneTiles = new Set(game.farmZones.map(z => `${z.x},${z.y}`));
  for (const r of allResources) {
    const kind = resourceKind.get(r);
    const def = getMapResourceDef(kind);
    if (def && !def.tool && kind !== 'farm' && kind !== 'boar' && zoneTiles.has(`${r.x},${r.y}`)) blockers.add(r);
  }
  return blockers;
}

// Farmers (a worker with a hoe) plant the empty tiles of the player's farm zones, nearest first; one
// farmer per tile. Planting takes GAME_CONFIG.farming.plantSeconds and costs the crop's building cost.
export function tendFarmZones(s, tick) {
  if (s.role !== 'worker' || !hasToolFamily(s.tool, 'hoe') || s.carrying || s.isPossessed || tick.isWaveActive) return false;
  const farming = GAME_CONFIG.farming;
  const reach = getSettlerReach(s);
  let target = null, best = Infinity;
  for (const zone of game.farmZones) {
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
      playSound('dig', target);
      const cropId = farming.crops[target.crop];
      payCost(getDefinition('buildings', cropId).cost || {});
      if (cropId === 'wheat') game.farmPlots.push({ x: target.x, y: target.y, growth: 0, priority: 0, harvestProgress: 0 });
      else {
        const tree = { x: target.x, y: target.y, hp: 1, maxHp: 3, isGrowing: true, growProgress: 0, priority: 0 };
        game.trees.push(cropId === 'apple_sapling' ? makeAppleTree(tree) : tree);
      }
      ejectEntitiesFromTile(target.x, target.y);
      resetTileIndex();
    }
  }
  s.patrolTarget = null;
  return true;
}
