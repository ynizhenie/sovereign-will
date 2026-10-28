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
import { BORDER_MARGIN, TILE_SIZE, forEachInRect, game, getGridPos, listStamp, rand, townHall, worldEpoch } from '../../../engine/world/index.js';
import { deliverCarrying, deliverWhenNothingToDo, haulPiles, haulPilesFirst, moveSettlerToTownHall } from '../storage/index.js';
import { breakOutOfSealedBase, build, collectSmelterIron, deliverMaterials, deliverToSmelter, findDoorBlockers, isBaseSealed, isTileOccupied, repairBuilding, repairTownHall, supplySmelter } from '../../economy/building/index.js';
import { getFrontier, getTerritoryBox, inReliefZone, inTerritory, isVisible, isWaterReachable, reliefZoneSpot } from '../../world/index.js';
import { getMapResourceKind, getWorkPriority, getWorkableResources, harvest, harvestMarked } from '../../economy/gathering/index.js';
import { healAtTent, isShelter, repairTent, treatWounded } from '../../conflict/healing/index.js';
import { clampEntityToBounds, getReachSteps, getSettlerReach, isTileBlockedForSettler, moveEntityTowards, rescueSettlerFromResource } from '../../../engine/movement/index.js';
import { clearEnemyTents, escortGatherers, fightEnemies, followCommand, holdPost, restockQuiver, isDefenseAlert, isInSafeArea, strikeBack } from '../../conflict/combat/index.js';
import { panic } from '../../conflict/morale/index.js';
import { collectWorms, emptyFishTrap, fish } from '../../economy/fishing/index.js';
import { assignTowerArchers, guardTower } from '../../conflict/towers/index.js';
import { farmerGathersGrass, fertilize, findZoneBlockers, pickApples, tendFarmZones, waterCrops } from '../../economy/farming/index.js';
import { chopFirewood, cook } from '../../economy/cooking/index.js';
import { collectBones, corpsesToGraves, followMaster, necromancy } from '../../factions/undead/index.js';
import { carryCaptive, catchForCage, eatCorpse, goToSacrifice, tendCorpses } from '../../factions/demons/index.js';
import { craftItem, equip, isBowWeapon } from '../equipment/index.js';
import { followOrder } from './settlers.orders.js';
import { IDLE_ACTIVITIES, cleanDung, idlePastime } from './settlers.idle.js';
import { carryCorpse, haulCorpses } from './settlers.corpses.js';
import { goEat } from './settlers.meals.js';
import { isPet } from './settlers.rules.js';
import { feedPet, tickPet } from '../pets/index.js';
import { fetchNightTorch, lightTorches, nightReach, sleepAtNight } from './settlers.night.js';
import { captainArms, captainOrders, foremanOrders } from './settlers.commanders.js';
import { baitTrap } from '../../economy/hunting/index.js';
import { raidOrders, restWhileRaid } from '../../../modes/endless/index.js';
import { battleOrders } from '../../../modes/battle/index.js';

// (#322) What the settlers may work, and which of it is marked or in the way, was worked out afresh every tick: every list of
// things looked through over the whole base's land (tens of thousands of tiles' buckets), sixty times a second. It's kept now,
// and made again when a list of things (or the buildings, or a zone) has changed, and anyway every RESOURCES_EVERY ticks (the
// marks, a boar's step in or out of sight, a plot ripe...)
const RESOURCES_EVERY = 10;
/** @type {{ tick: number, epoch: number, stamps: any[], state: any } | null} */
let resourceCache = null;
const resourceLists = () => [...Object.values(GAME_CONFIG.mapResources).map(def => game[def.list]), game.buildings, game.farmZones, game.waterTiles];
function resourceState() {
  const stamps = resourceLists().flatMap(listStamp);
  const kept = resourceCache;
  if (kept && kept.epoch === worldEpoch() && game.pathTick >= kept.tick && game.pathTick - kept.tick < RESOURCES_EVERY &&
    stamps.length === kept.stamps.length && stamps.every((v, i) => v === kept.stamps[i])) return kept.state;
  // which GAME_CONFIG.mapResources kind each resource is, so canSettlerHarvest() doesn't scan every list
  // (#299: those to be worked, by the list each came from; another one asked about found out then)
  const kindOfList = new Map(Object.entries(GAME_CONFIG.mapResources).map(([kind, def]) => [game[def.list], kind]));
  const known = new Map();
  // (#299) only on the base's land: settlers work nowhere else
  const allResources = getWorkableResources((r, list) => known.set(r, kindOfList.get(list)));
  const resourceKind = { get: r => { if (!known.has(r)) known.set(r, getMapResourceKind(r)); return known.get(r); } };
  // player-marked resources, then anything blocking a door (worked as if marked with priority 1)
  const doorBlockers = findDoorBlockers(allResources, resourceKind);
  const zoneBlockers = findZoneBlockers(allResources, resourceKind);
  const markedResources = allResources.filter(r => (r.priority || 0) > 0 || doorBlockers.has(r) || zoneBlockers.has(r));
  markedResources.sort((a, b) => getWorkPriority(b) - getWorkPriority(a));
  const state = { allResources, resourceSet: new Set(allResources), resourceKind, doorBlockers, markedResources, activeWaterSpots: fishingSpots() };
  resourceCache = { tick: game.pathTick, epoch: worldEpoch(), stamps, state };
  return state;
}

export function createSettlerTick(dt) {
  const { allResources, resourceSet, resourceKind, doorBlockers, markedResources, activeWaterSpots } = resourceState();

  const defendersCount = game.settlers.filter(s => s.role === 'soldier' || s.role === 'archer' || s.weapon !== 'fist').length;

  return {
    dt,
    isWaveActive: game.enemies.length > 0 || (game.portalQueue || []).length > 0, // (demons still to come out, #250)
    tents: game.buildings.filter(isShelter), // tents or graves
    allResources,
    resourceSet,
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
    // (#299: looked for on the base's land only, not through a continent's sea)
    activeWaterSpots,
    assignedFishersCount: 0,
    defendersCount,
    // unarmed workers only help destroy enemy tents when there's nobody armed to do it
    workersHelpTents: defendersCount === 0,
    // what's left of the wave is down to a few enemies (tent-summoned ones don't count): go destroy the tents
    tentAssault: game.enemyTents.length > 0 && game.enemies.filter(en => !en.summoned).length <= 5
  };
}

// The fishing spots marked on the base's land (not one with a fish trap on it, #248)
function fishingSpots() {
  const box = getTerritoryBox(), spots = [];
  forEachInRect(game.waterTiles, box.x0, box.y0, box.x1, box.y1, w => {
    if (w.isFishing && isWaterReachable(w) && !game.buildings.some(b => b.x === w.x && b.y === w.y)) spots.push(w);
  });
  return spots;
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
  s.relievingAt = game.pathTick; // (at it this tick: the censor shows only while it is, #298)
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
// (#314) One let go walks away, out of the base's land and a few tiles past it, and is gone (taken off the list
// after the tick: leftColony)
function leaveColony(s, tick) {
  if (!s.leaving) return false;
  if (!s.leaveTo) {
    const f = getFrontier(), edges = [{ x: f.x0 + 20, y: s.y }, { x: f.x1 - 20, y: s.y }, { x: s.x, y: f.y0 + 20 }, { x: s.x, y: f.y1 - 20 }];
    s.leaveTo = edges.reduce((a, b) => (Math.hypot(a.x - s.x, a.y - s.y) < Math.hypot(b.x - s.x, b.y - s.y) ? a : b));
  }
  moveEntityTowards(s, s.leaveTo.x, s.leaveTo.y, s.speed, false, tick.dt);
  const away = !isVisible(s.x, s.y) || Math.hypot(s.leaveTo.x - s.x, s.leaveTo.y - s.y) < 20 ||
    (!inTerritory(s.x, s.y) && !inTerritory(s.x + 4 * TILE_SIZE, s.y) && !inTerritory(s.x - 4 * TILE_SIZE, s.y) && !inTerritory(s.x, s.y + 4 * TILE_SIZE) && !inTerritory(s.x, s.y - 4 * TILE_SIZE));
  if (away) s.leftColony = true;
  return true;
}

export const SETTLER_BEHAVIOURS = [
  leaveColony,
  playerControlled,
  raidOrders, // (a raid on an enemy camp, #255: the party...)
  restWhileRaid, // (...and the base resting)
  battleOrders, // (a battle with the auto battle off, #255)
  panic,
  followCommand, // (#326: the player's orders by tap, in Endless)
  strikeBack,
  followMaster, // (#326: a necromancer's zombie keeps by it)
  sleepAtNight,
  fetchNightTorch,
  carryCaptive,
  captainOrders,
  captainArms, // (#279: weapons lent before a wave, back after)
  goToSacrifice,
  collectSmelterIron,
  supplySmelter,
  deliverToSmelter,
  guardTower,
  craftItem,
  repairTownHall,
  repairBuilding,
  equip,
  goEat,
  feedPet, // (#314: a hungry pet fed)
  foremanOrders,
  harvestMarked, // (the player's marks before the chores, #298)
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
  haulPilesFirst, // (piles carried in before gathering on, #279)
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

// (#298) one got up at night for the player's order does that and nothing else: what was marked, the build,
// bringing it what it needs; the rest (cooking, firewood, gathering what wasn't marked...) waits for the day
const NIGHT_ORDER_ONLY = new Set([playerControlled, raidOrders, restWhileRaid, battleOrders, panic, strikeBack, sleepAtNight,
  fetchNightTorch, deliverMaterials, deliverCarrying, fightEnemies, build, harvestMarked, harvest, patrol]);

// (#322) A settler at its everyday work (gathering, hauling, building, strolling) in a calm colony goes on with it
// for a few ticks without being offered everything above it again: it looks at the whole list only every
// RECHECK_TICKS (its turn is spread by its id, so a colony isn't all asked in one tick). What came before it in the
// list said no a moment ago; with the tick's cost grown with each of the settlers x each of the sixty behaviours,
// that was most of a big colony's step. Not while there are enemies about, or in anything but Endless, nor for one
// the player moves.
const RECHECK_TICKS = 4;
const CALM_WORK = new Set([harvestMarked, harvest, pickApples, build, haulPilesFirst, haulPiles, haulCorpses, deliverCarrying, deliverMaterials,
  deliverWhenNothingToDo, emptyFishTrap, collectWorms, fish, tendFarmZones, waterCrops, farmerGathersGrass, collectBones, escortGatherers, patrol]);

// A settler's turn to be offered the whole list
const isRecheckTurn = s => (game.pathTick + (typeof s.id === 'number' ? s.id : 0)) % RECHECK_TICKS === 0;

function took(s, behaviour) {
  s.lastBehaviour = behaviour;
  s.isIdle = behaviour === patrol;
  if (!s.isIdle) { s.idle = null; s.swaying = false; }
  // what it's doing, for the selected settler's info (a pastime: its own text)
  s.activity = s.isIdle && s.idle && IDLE_ACTIVITIES[s.idle.act] ? IDLE_ACTIVITIES[s.idle.act] : behaviour.name;
}

// Every settler's tick: the first behaviour of SETTLER_BEHAVIOURS that takes it
export function tickSettlers(dt) {
  const settlerTick = createSettlerTick(dt);
  assignTowerArchers();
  const calmColony = game.gameMode === 'endless' && !settlerTick.isWaveActive;

  // one ordered to work at night goes at half its pace (#279), the rest of its tick as anyone's
  let drowsyTick = null;
  game.settlers.forEach(s => {
    prepareSettler(s, dt);
    const tick = s.drowsy ? (drowsyTick = drowsyTick || { ...settlerTick, dt: dt * GAME_CONFIG.daytime.drowsyPace }) : settlerTick;
    s.wasIdle = s.isIdle; // (cleanDung: only one that had nothing to do)
    if (isPet(s)) { if (s.targetEquipment) s.targetEquipment = null; tickPet(s, tick); return; } // (its own ways, #314)
    const last = s.lastBehaviour;
    // (a captain or a foreman counts its own seconds to its next order inside the behaviours above: always offered the list)
    if (last && calmColony && !s.drowsy && !s.isPossessed && !s.targetEquipment && !s.order && s.orderIn === undefined && s.armIn === undefined &&
      CALM_WORK.has(last) && !isRecheckTurn(s)) {
      s.isIdle = false;
      if (last(s, tick)) { took(s, last); return; }
    }
    s.isIdle = false;
    for (const behaviour of SETTLER_BEHAVIOURS) {
      if (s.drowsy && !NIGHT_ORDER_ONLY.has(behaviour)) continue;
      if (behaviour(s, tick)) { took(s, behaviour); return; }
    }
    s.lastBehaviour = null;
  });
  if (game.settlers.some(s => s.leftColony)) game.settlers = game.settlers.filter(s => !s.leftColony); // (#314: let go, gone)
}
