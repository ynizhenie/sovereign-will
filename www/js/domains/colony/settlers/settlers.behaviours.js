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
import { deliverCarrying, deliverWhenNothingToDo, haulPiles, moveSettlerToTownHall } from '../storage/index.js';
import { breakOutOfSealedBase, build, collectSmelterIron, deliverMaterials, deliverToSmelter, findDoorBlockers, isBaseSealed, isTileOccupied, repairBuilding, repairTownHall, supplySmelter } from '../../economy/building/index.js';
import { inReliefZone, isWaterReachable, reliefZoneSpot } from '../../world/index.js';
import { getHarvestableResources, getWorkPriority, harvest } from '../../economy/gathering/index.js';
import { healAtTent, isShelter, repairTent, treatWounded } from '../../conflict/healing/index.js';
import { clampEntityToBounds, getReachSteps, getSettlerReach, isTileBlockedForSettler, moveEntityTowards, rescueSettlerFromResource } from '../../../engine/movement/index.js';
import { clearEnemyTents, escortGatherers, fightEnemies, holdPost, restockQuiver, isDefenseAlert, isInSafeArea, strikeBack } from '../../conflict/combat/index.js';
import { panic } from '../../conflict/morale/index.js';
import { collectWorms, emptyFishTrap, fish } from '../../economy/fishing/index.js';
import { assignTowerArchers, guardTower, loadTowerArrows } from '../../conflict/towers/index.js';
import { farmerGathersGrass, fertilize, findZoneBlockers, pickApples, tendFarmZones, waterCrops } from '../../economy/farming/index.js';
import { chopFirewood, cook } from '../../economy/cooking/index.js';
import { collectBones, corpsesToGraves, necromancy } from '../../factions/undead/index.js';
import { carryCaptive, catchForCage, eatCorpse, goToSacrifice, tendCorpses } from '../../factions/demons/index.js';
import { craftItem, equip, isBowWeapon } from '../equipment/index.js';
import { followOrder } from './settlers.orders.js';
import { IDLE_ACTIVITIES, cleanDung, idlePastime } from './settlers.idle.js';
import { carryCorpse, haulCorpses } from './settlers.corpses.js';
import { goEat } from './settlers.meals.js';
import { lightTorches, nightReach, sleepAtNight } from './settlers.night.js';
import { captainArms, captainOrders, foremanOrders } from './settlers.commanders.js';
import { baitTrap } from '../../economy/hunting/index.js';
import { raidOrders, restWhileRaid } from '../../../modes/endless/index.js';
import { battleOrders } from '../../../modes/battle/index.js';

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
    isWaveActive: game.enemies.length > 0 || (game.portalQueue || []).length > 0, // (demons still to come out, #250)
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
    dungAssignments: new Set(),      // dung piles a settler is going to carry to a compost heap this tick
    trapAssignments: new Set(),      // fish traps being emptied this tick
    heapTakers: new Map(),           // compost heap -> farmers going to take dung from it this tick
    raiseAssignments: new Set(),     // corpses a necromancer is raising (or a demon eating) this tick
    markedAssignments: new Map(),    // enemy the player pointed at -> soldiers going for it this tick
    meleeOn: new Map(),              // enemy -> settlers fighting it in melee this tick (#208)
    blightAssignments: new Set(),    // marked tiles a necromancer is blighting this tick
    idleFarmer: null,                // the farmer farmerGathersGrass is finding grass for
    // (not one with a fish trap on it, #248)
    activeWaterSpots: game.waterTiles.filter(w => w.isFishing && isWaterReachable(w) && !game.buildings.some(b => b.x === w.x && b.y === w.y)),
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
  // (#279) a worker with a weapon is a soldier (with a bow, an archer); a foreman takes no weapon: one it has
  // goes back to the store
  if (s.weapon !== 'fist' && s.temporary === undefined) {
    if (s.whistle) { if (!s.targetEquipment && game.gameMode === 'endless') s.targetEquipment = { weapon: 'fist', role: 'worker', keep: true }; }
    else if (s.role === 'worker') s.role = isBowWeapon(s.weapon) ? 'archer' : 'soldier';
  }
  rescueSettlerFromResource(s);
  if (s.attackCooldown > 0) s.attackCooldown -= dt;
  if (s.towerAttackCooldown > 0) s.towerAttackCooldown -= dt;
  // a smoke or a wheat stalk in its mouth for a while, and then a while before the next (#248)
  if (s.smoking > 0) s.smoking -= dt;
  if (s.straw > 0) s.straw -= dt;
  if (s.smokeRest > 0) s.smokeRest -= dt;
}

// ---- The possessed settler
// Its AI is off: it doesn't work, heal or even hit back by itself. The player moves it (see update())
// and taps things to give it an order (see orderPossessed()): it walks there and does what it can with
// what it has in hand. Moving it by hand cancels the order. Gear the player picked is still fetched.
export function playerControlled(s, tick) {
  if (!s.isPossessed) return false;
  if (s.asleep) s.asleep = false; // (#279: possessed asleep, it walked about lying down)
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
  if (!s.reliefSpot) s.reliefSpot = reliefZoneSpot(s, z => canReach(s, z)) || findReliefSpot(s); // (a relief zone with room first, #279)
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
    game.dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false, inZone: inReliefZone(s.x, s.y) }); // (in a zone: not smeared, #279)
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

// Nothing else to do: between waves a pastime (settlers.idle.js), else wander near the town hall (shown
// with an idle icon, see render())
export function patrol(s, tick) {
  if (game.gameMode === 'battle') return true; // nothing to wander around: stand
  // caught outside the base when the alert starts, or at night with no torch (#257): straight back
  if (!isInSafeArea(s.x, s.y) || Math.hypot(s.x - townHall.x, s.y - townHall.y) > nightReach(s)) {
    s.patrolTarget = null;
    moveSettlerToTownHall(s, s.speed, tick.dt);
    return true;
  }
  if (game.gameMode === 'endless' && !tick.isWaveActive && !isDefenseAlert() && !s.isPossessed && idlePastime(s, tick)) return true;
  if (s.idle && s.idle.act !== 'wander') s.idle = null;
  s.swaying = false;
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
  raidOrders, // (a raid on an enemy camp, #255: the party...)
  restWhileRaid, // (...and the base resting)
  battleOrders, // (a battle with the auto battle off, #255)
  panic,
  strikeBack,
  sleepAtNight,
  carryCaptive,
  captainOrders,
  captainArms, // (#279: weapons lent before a wave, back after)
  goToSacrifice,
  loadTowerArrows,
  collectSmelterIron,
  supplySmelter,
  deliverToSmelter,
  guardTower,
  craftItem,
  repairTownHall,
  repairBuilding,
  equip,
  goEat,
  foremanOrders,
  cook,
  fertilize,
  cleanDung,
  tendCorpses,
  corpsesToGraves,
  carryCorpse,
  chopFirewood,
  lightTorches,
  baitTrap,
  deliverMaterials,
  deliverCarrying,
  repairTent,
  eatCorpse,
  healAtTent,
  treatWounded,
  necromancy,
  restockQuiver,
  catchForCage, // (before holdPost: a soldier on its post goes for one to cage too, #250)
  holdPost,
  fightEnemies,
  breakOutOfSealedBase,
  clearEnemyTents,
  relieve,
  build,
  haulCorpses,
  emptyFishTrap,
  collectWorms,
  fish,
  pickApples,
  harvest,
  tendFarmZones,
  waterCrops,
  farmerGathersGrass,
  collectBones,
  escortGatherers,
  deliverWhenNothingToDo,
  haulPiles,
  patrol
];

// Every settler's tick: the first behaviour of SETTLER_BEHAVIOURS that takes it
export function tickSettlers(dt) {
  const settlerTick = createSettlerTick(dt);
  assignTowerArchers();

  // one ordered to work at night goes at half its pace (#279), the rest of its tick as anyone's
  let drowsyTick = null;
  game.settlers.forEach(s => {
    prepareSettler(s, dt);
    const tick = s.drowsy ? (drowsyTick = drowsyTick || { ...settlerTick, dt: dt * GAME_CONFIG.daytime.drowsyPace }) : settlerTick;
    s.wasIdle = s.isIdle; // (cleanDung: only one that had nothing to do)
    s.isIdle = false;
    for (const behaviour of SETTLER_BEHAVIOURS) {
      if (behaviour(s, tick)) {
        s.isIdle = behaviour === patrol;
        if (!s.isIdle) { s.idle = null; s.swaying = false; }
        // what it's doing, for the selected settler's info (a pastime: its own text)
        s.activity = s.isIdle && s.idle && IDLE_ACTIVITIES[s.idle.act] ? IDLE_ACTIVITIES[s.idle.act] : behaviour.name;
        return;
      }
    }
  });
}
