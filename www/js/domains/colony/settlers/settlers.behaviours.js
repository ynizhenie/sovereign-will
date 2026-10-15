// Settler AI.
//
// Every tick update() runs SETTLER_BEHAVIOURS for each settler, in order. A behaviour looks at the
// settler and either takes over its tick (does something and returns true — later behaviours don't run
// for this settler this tick) or passes (returns false). To change priorities, reorder the list; to add
// a behaviour, write a function (settler, tick) => boolean and put it where it belongs in the list.
//
// `tick` holds what's shared by all settlers within one tick (see createSettlerTick), including the
// assignment counters that keep settlers from piling onto the same job.
//
// The behaviours themselves live with their mechanic (domains/*/*.behaviours.js); here are the list and
// the ones every settler has, whatever its job: being possessed, relief, wandering.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, rand, townHall } from '../../../engine/world/index.js';
import { deliverCarrying, deliverWhenNothingToDo, moveSettlerToTownHall } from '../storage/index.js';
import { breakOutOfSealedBase, build, collectSmelterIron, deliverMaterials, deliverToSmelter, findDoorBlockers, isBaseSealed, isTileOccupied, repairBuilding, repairTownHall, supplySmelter } from '../../economy/building/index.js';
import { isWaterReachable } from '../../world/index.js';
import { getHarvestableResources, getWorkPriority, harvest } from '../../economy/gathering/index.js';
import { healAtTent, isShelter, repairTent, treatWounded } from '../../conflict/healing/index.js';
import { clampEntityToBounds, getReachSteps, getSettlerReach, isTileBlockedForSettler, moveEntityTowards, rescueSettlerFromResource } from '../../../engine/movement/index.js';
import { clearEnemyTents, fightEnemies, holdPost, isDefenseAlert, isInSafeArea } from '../../conflict/combat/index.js';
import { panic } from '../../conflict/morale/index.js';
import { collectWorms, fish } from '../../economy/fishing/index.js';
import { assignTowerArchers, guardTower, loadTowerArrows } from '../../conflict/towers/index.js';
import { farmerGathersGrass, fertilize, findZoneBlockers, pickApples, tendFarmZones, waterCrops } from '../../economy/farming/index.js';
import { cook } from '../../economy/cooking/index.js';
import { necromancy } from '../../factions/undead/index.js';
import { eatCorpse, goToSacrifice } from '../../factions/demons/index.js';
import { equip } from '../equipment/index.js';
import { followOrder } from './settlers.orders.js';

export function createSettlerTick(dt) {
  const allResources = getHarvestableResources();
  // which GAME_CONFIG.mapResources kind each resource is, so canSettlerHarvest() doesn't scan every list
  const resourceKind = new Map();
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    for (const r of game[def.list]) resourceKind.set(r, kind);
  }
  // player-marked resources, then anything blocking a door (worked as if marked with priority 1)
  const doorBlockers = findDoorBlockers(allResources, resourceKind);
  const zoneBlockers = findZoneBlockers(allResources, resourceKind);
  const markedResources = allResources.filter(r => (r.priority || 0) > 0 || doorBlockers.has(r) || zoneBlockers.has(r));
  markedResources.sort((a, b) => getWorkPriority(b) - getWorkPriority(a));

  const defendersCount = game.settlers.filter(s => s.role === 'soldier' || s.role === 'archer' || s.weapon !== 'fist').length;

  return {
    dt,
    isWaveActive: game.enemies.length > 0,
    tents: game.buildings.filter(isShelter), // tents or graves
    allResources,
    resourceKind,
    markedResources,
    doorBlockers,
    // every way out of the base through its doors is blocked: soldiers break the blockers
    baseSealed: doorBlockers.size > 0 && isBaseSealed(),
    workerAssignments: new Map(),    // marked resource -> settlers on it this tick
    blueprintAssignments: new Map(), // blueprint -> builders on it this tick (max 3)
    repairAssignments: new Map(),    // building -> repairers on it this tick (max 2)
    plantAssignments: new Set(),     // farm zone tiles a farmer is planting this tick
    patients: new Set(),             // settlers a medic is treating this tick
    appleAssignments: new Set(),     // apple trees someone is picking this tick
    wormAssignments: new Set(),      // corpses a fisher is taking worms off this tick
    wateringAssignments: new Set(),  // crops a farmer is watering this tick
    fertilizeAssignments: new Set(), // wheat plots a farmer is bringing dung to this tick
    dungAssignments: new Set(),      // dung piles a farmer is going to pick up this tick
    raiseAssignments: new Set(),     // corpses a necromancer is raising (or a demon eating) this tick
    markedAssignments: new Map(),    // enemy the player pointed at -> soldiers going for it this tick
    blightAssignments: new Set(),    // marked tiles a necromancer is blighting this tick
    idleFarmer: null,                // the farmer farmerGathersGrass is finding grass for
    activeWaterSpots: game.waterTiles.filter(w => w.isFishing && isWaterReachable(w)),
    assignedFishersCount: 0,
    defendersCount,
    // unarmed workers only help destroy enemy tents when there's nobody armed to do it
    workersHelpTents: defendersCount === 0,
    // what's left of the wave is down to a few enemies (tent-summoned ones don't count): go destroy the tents
    tentAssault: game.enemyTents.length > 0 && game.enemies.filter(en => !en.summoned).length <= 5
  };
}

// Housekeeping every settler gets each tick, before any behaviour
export function prepareSettler(s, dt) {
  clampEntityToBounds(s);
  rescueSettlerFromResource(s);
  if (s.attackCooldown > 0) s.attackCooldown -= dt;
  if (s.towerAttackCooldown > 0) s.towerAttackCooldown -= dt;
}

// ---- The possessed settler
// Its AI is off: it doesn't work, heal or even hit back by itself. The player moves it (see update())
// and taps things to give it an order (see orderPossessed()): it walks there and does what it can with
// what it has in hand. Moving it by hand cancels the order. Gear the player picked is still fetched.
export function playerControlled(s, tick) {
  if (!s.isPossessed) return false;
  if (s.targetEquipment) return equip(s, tick);
  if (s.order && !followOrder(s, tick)) s.order = null;
  return true;
}

// ---- Relief

// A settler that needs to go (see the meals in update) walks off to a quiet spot away from the buildings,
// near grass if there's some, waits a moment and leaves dung there
export function relieve(s, tick) {
  if (!s.needsRelief || s.isPossessed || isDefenseAlert() || tick.isWaveActive || s.towerAssignment) return false;
  const relief = GAME_CONFIG.relief;
  if (!s.reliefSpot) s.reliefSpot = findReliefSpot(s);
  const spot = s.reliefSpot;
  s.patrolTarget = null;
  if (Math.hypot(spot.x - s.x, spot.y - s.y) > 12) {
    s.reliefWalk = (s.reliefWalk || 0) + tick.dt;
    // can't get there (walled off since, or stuck): another spot, and after a few, right where it is (#200)
    if (s.reliefWalk > relief.giveUpSeconds || (game.pathTick % 30 === 0 && !canReach(s, spot))) {
      s.reliefTries = (s.reliefTries || 0) + 1;
      (s.reliefAvoid = s.reliefAvoid || []).push(spot);
      s.reliefSpot = s.reliefTries >= relief.maxTries ? { x: s.x, y: s.y } : findReliefSpot(s);
      s.reliefWalk = 0;
      return true;
    }
    moveEntityTowards(s, spot.x, spot.y, s.speed, false, tick.dt);
    s.reliefTimer = 0;
    return true;
  }
  s.reliefTimer = (s.reliefTimer || 0) + tick.dt;
  if (s.reliefTimer >= relief.seconds) {
    game.dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false });
    s.needsRelief = false; s.meals = 0; s.reliefSpot = null; s.reliefTimer = 0;
    s.reliefWalk = 0; s.reliefTries = 0; s.reliefAvoid = null;
  }
  return true;
}

// The settler can walk to that point from where it is now
function canReach(s, p) {
  const g = getGridPos(p.x, p.y);
  return getReachSteps(getSettlerReach(s), g.gx, g.gy) !== -1;
}

// The nearest spot the settler can walk to that's far enough from every building (and the town hall):
// grass first, then any free tile; where it stands if there's none. Spots it gave up on are left out
export function findReliefSpot(s) {
  const minDist = GAME_CONFIG.relief.awayFromBuildings * TILE_SIZE;
  const away = p => Math.hypot(p.x - townHall.x, p.y - townHall.y) >= minDist + townHall.radius &&
    game.buildings.every(b => Math.hypot(p.x - b.x, p.y - b.y) >= minDist);
  const reach = getSettlerReach(s);
  const reachable = p => { const g = getGridPos(p.x, p.y); return getReachSteps(reach, g.gx, g.gy) !== -1; };
  // not where it already couldn't get to
  const tried = p => (s.reliefAvoid || []).some(a => Math.hypot(a.x - p.x, a.y - p.y) < TILE_SIZE * 2);
  const nearest = list => list.filter(p => away(p) && reachable(p) && !tried(p))
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  // beside a grass tuft, not on it
  const byGrass = nearest(game.grassList.map(g => ({ x: g.x + TILE_SIZE, y: g.y })).filter(p => !isTileOccupied(p.x, p.y)));
  if (byGrass) return byGrass;
  const tiles = [];
  for (let gy = BORDER_MARGIN; gy < game.ROWS - BORDER_MARGIN; gy += 2) {
    for (let gx = BORDER_MARGIN; gx < game.COLS - BORDER_MARGIN; gx += 2) {
      const p = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
      if (!isTileOccupied(p.x, p.y)) tiles.push(p);
    }
  }
  return nearest(tiles) || { x: s.x, y: s.y };
}

// Nothing else to do: wander near the town hall (shown with an idle icon, see render())
export function patrol(s, tick) {
  if (game.gameMode === 'battle') return true; // nothing to wander around: stand
  // caught outside the base when the alert starts: straight back, not a stroll
  if (!isInSafeArea(s.x, s.y)) {
    s.patrolTarget = null;
    moveSettlerToTownHall(s, s.speed, tick.dt);
    return true;
  }
  if (!s.patrolTarget || Math.hypot(s.x - s.patrolTarget.x, s.y - s.patrolTarget.y) < 15) {
    // a spot round the hall it can stand on (not on spikes, a wall, a tree...)
    for (let tries = 0; tries < 8; tries++) {
      let ang = rand() * Math.PI * 2;
      let dist = 30 + rand() * 120;
      let px = townHall.x + Math.cos(ang) * dist;
      let py = townHall.y + Math.sin(ang) * dist;
      s.patrolTarget = { x: px, y: py };
      const g = getGridPos(px, py);
      if (!isTileBlockedForSettler(g.gx, g.gy)) break;
    }
  }
  moveEntityTowards(s, s.patrolTarget.x, s.patrolTarget.y, s.speed * 0.5, false, tick.dt);
  return true;
}

// Order = priority: the first behaviour that takes a settler's tick wins.
export const SETTLER_BEHAVIOURS = [
  playerControlled,
  panic,
  goToSacrifice,
  loadTowerArrows,
  collectSmelterIron,
  supplySmelter,
  deliverToSmelter,
  guardTower,
  repairTownHall,
  repairBuilding,
  equip,
  cook,
  fertilize,
  deliverMaterials,
  deliverCarrying,
  repairTent,
  eatCorpse,
  healAtTent,
  treatWounded,
  necromancy,
  holdPost,
  fightEnemies,
  breakOutOfSealedBase,
  clearEnemyTents,
  relieve,
  build,
  collectWorms,
  fish,
  pickApples,
  harvest,
  tendFarmZones,
  waterCrops,
  farmerGathersGrass,
  deliverWhenNothingToDo,
  patrol
];

// Every settler's tick: the first behaviour of SETTLER_BEHAVIOURS that takes it
export function tickSettlers(dt) {
  const settlerTick = createSettlerTick(dt);
  assignTowerArchers();

  game.settlers.forEach(s => {
    prepareSettler(s, dt);
    s.isIdle = false;
    for (const behaviour of SETTLER_BEHAVIOURS) {
      if (behaviour(s, settlerTick)) {
        s.isIdle = behaviour === patrol;
        s.activity = behaviour.name; // what it's doing, for the selected settler's info
        return;
      }
    }
  });
}
