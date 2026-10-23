// What settlers do with nothing to do (#199): between waves, instead of wandering round the town hall,
// an idle settler sits by a campfire (its morale rises faster, and a little past its usual), stands with
// others in a knot "talking", or does its faction's own thing: demons spar in pairs (morale up, a little
// health down), the undead stand and sway (#298: no sharpening, smoking or wheat stalk any more); soldiers
// and archers also walk the edge of the base on patrol, or train at a dummy (their damage grows). Each
// pastime lasts a while (GAME_CONFIG.idle.seconds), then another is picked. And any settler free between
// waves a farmer with a backpack carries dung lying about the base to a compost heap, to fertilise from.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, onceThisTick, rand, townHall } from '../../../engine/world/index.js';
import { getReachSteps, getSettlerReach, isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { getBaseRadius, isDefenseAlert, isInSafeArea } from '../../conflict/combat/index.js';
import { baseMorale, getMorale, liftMorale } from '../../conflict/morale/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { claimBuildingJob, isBuildingJobFree } from '../../economy/building/index.js';
import { fetchFromStorage, stock, takeStock } from '../storage/index.js';
import { faceTowards, startSwing } from './settlers.draw.js';

const config = () => GAME_CONFIG.idle;

// the activity texts of the pastimes (activity.<name>)
export const IDLE_ACTIVITIES = { campfire: 'idleCampfire', talk: 'idleTalk', spar: 'idleSpar', sway: 'idleSway', patrolEdge: 'idlePatrol', train: 'idleTrain', digWorms: 'idleDigWorms' };

const byId = id => game.settlers.find(o => o.id === id) || null;
// another idle settler free for company: wandering, or already in a knot
const isFreeCompany = (s, o) => o !== s && o.isIdle && !o.isPossessed && !o.carrying && (!o.idle || o.idle.act === 'wander' || o.idle.act === 'talk');
const campfiresOnce = onceThisTick();
// (#306) the fires looked for once a tick: isInSafeArea for every building, for every settler sitting by one
const campfires = () => campfiresOnce(() => game.buildings.filter(b => b.type === 'campfire' && !b.campId && isInSafeArea(b.x, b.y)));
const isFighter = s => (s.role === 'soldier' || s.role === 'archer') && !s.towerAssignment;
const fireFuel = () => Object.keys(GAME_CONFIG.cooking.fuel).find(id => stock[id] > 0) || null;

// (#298) the places to sit by a campfire: on each of its four sides, a tile that's free and that `s` can get
// to; four at most round one fire
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function seatsOf(fire, s) {
  const g = getGridPos(fire.x, fire.y), reach = s ? getSettlerReach(s) : null;
  return SIDES.map(([dx, dy], seat) => ({ seat, gx: g.gx + dx, gy: g.gy + dy }))
    .filter(p => !isTileBlockedForSettler(p.gx, p.gy) && (!reach || getReachSteps(reach, p.gx, p.gy) !== -1))
    .map(p => ({ seat: p.seat, x: p.gx * TILE_SIZE + 15, y: p.gy * TILE_SIZE + 15 }));
}
const seatTaken = (fire, seat, s) => game.settlers.some(o => o !== s && o.idle && o.idle.act === 'campfire' && o.idle.seat === seat &&
  o.idle.spot && Math.hypot(o.idle.spot.x - fire.x, o.idle.spot.y - fire.y) < 1);
// A free seat for `s` at a campfire, the nearest fire's first: { fire, seat } or null
export function freeCampfireSeat(s) {
  for (const fire of [...campfires()].filter(fire => (fire.fuelLeft || 0) > 0 ||
    (fireFuel() && isBuildingJobFree(fire, 'cook', s) && isBuildingJobFree(fire, 'light', s)))
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))) {
    const free = seatsOf(fire, s).filter(p => !seatTaken(fire, p.seat, s)).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    if (free) return { fire, seat: free.seat };
  }
  return null;
}
// an archer out of arrows doesn't train (#232)
const canTrain = s => !(s.weapon === 'bow' && (!s.quiver || (s.arrows || 0) <= 0));
// a training dummy with room for one more
const freeDummy = s => game.buildings.filter(b => b.type === 'dummy' &&
  game.settlers.filter(o => o !== s && o.idle && o.idle.act === 'train' && o.idle.spot && Math.hypot(o.idle.spot.x - b.x, o.idle.spot.y - b.y) < 1).length < (GAME_CONFIG.buildings.dummy.trainers || 2))
  .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || null;

// A pastime for the next while: what's possible, one of them at random
function pickPastime(s) {
  const c = config();
  const faction = getPlayerFaction().id;
  const options = ['wander'];
  const seat = freeCampfireSeat(s);
  if (seat) options.push('campfire');
  if (game.settlers.some(o => isFreeCompany(s, o) && Math.hypot(o.x - s.x, o.y - s.y) < c.companyRange)) options.push('talk');
  if (faction === 'demons' && game.settlers.some(o => o !== s && o.isIdle && !o.carrying && (!o.idle || o.idle.act === 'wander'))) options.push('spar', 'spar');
  if (faction === 'undead') options.push('sway', 'sway');
  if (s.tool === 'rod' && nearestGrass(s)) options.push('digWorms', 'digWorms'); // a fisher digs for worms (#199)
  if (isFighter(s)) {
    options.push('patrolEdge', 'patrolEdge');
    if (freeDummy(s) && canTrain(s) && (s.trained || 0) < c.trainMax) options.push('train', 'train', 'train');
  }
  const act = options[Math.floor(rand() * options.length)];
  const seconds = c.seconds[0] + rand() * (c.seconds[1] - c.seconds[0]);
  /** @type {{ act: string, left: number, spot: { x: number, y: number } | null, partnerId: number | null, seat?: number }} */
  const idle = { act, left: seconds, spot: null, partnerId: null };
  if (act === 'campfire' && seat) {
    idle.spot = { x: seat.fire.x, y: seat.fire.y };
    idle.seat = seat.seat;
  } else if (act === 'talk') {
    // the nearest free company; if it's in a knot already, this one joins it, else they start one
    const other = game.settlers.filter(o => isFreeCompany(s, o)).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    idle.spot = other.idle && other.idle.act === 'talk' && other.idle.spot ? other.idle.spot : { x: (s.x + other.x) / 2, y: (s.y + other.y) / 2 };
    if (!other.idle || other.idle.act !== 'talk') other.idle = { act: 'talk', left: seconds, spot: idle.spot, partnerId: null };
  } else if (act === 'spar') {
    const other = game.settlers.filter(o => o !== s && o.isIdle && !o.carrying && (!o.idle || o.idle.act === 'wander'))
      .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    idle.partnerId = other.id;
    other.idle = { act: 'spar', left: seconds, spot: null, partnerId: s.id };
  } else if (act === 'train') {
    const dummy = freeDummy(s);
    idle.spot = { x: dummy.x, y: dummy.y };
  } else if (act === 'patrolEdge') {
    idle.left *= 2; // a round takes a while
  }
  return idle;
}

// Its place round a spot (a fire, a knot, a dummy): evenly round it with the others there for the same
// pastime, in order of their ids, so no two stand in each other (#232)
function ringPlace(s, spot, radius, act) {
  const here = ringGroup(spot, act);
  const k = Math.max(0, here.indexOf(s)), n = Math.max(1, here.length);
  const angle = (k / n) * Math.PI * 2 + (spot.x + spot.y) * 0.01;
  return { x: spot.x + Math.cos(angle) * radius, y: spot.y + Math.sin(angle) * radius };
}

// (#306) The others round the same spot at the same pastime, once a tick: gathering and sorting them again
// for every settler in the knot was a good part of what a crowd of idle settlers cost
const ringOnce = onceThisTick();
function ringGroup(spot, act) {
  const groups = ringOnce(() => new Map());
  const key = `${act}|${Math.round(spot.x)}|${Math.round(spot.y)}`;
  let here = groups.get(key);
  if (!here) {
    const near = o => o.idle && o.idle.act === act && o.idle.spot && Math.hypot(o.idle.spot.x - spot.x, o.idle.spot.y - spot.y) < 1;
    here = game.settlers.filter(near).sort((a, b) => a.id - b.id);
    groups.set(key, here);
  }
  return here;
}

// true: it walked or stood at it this tick
function goStand(s, place, dt, face) {
  if (Math.hypot(place.x - s.x, place.y - s.y) > 6) { moveEntityTowards(s, place.x, place.y, s.speed * 0.6, false, dt); return; }
  if (face) faceTowards(s, face.x, face.y);
}

// Morale up towards its usual and `above` it, at `perSecond`
function cheer(s, perSecond, above, dt) {
  const top = baseMorale(s, 'settler') + above;
  if (getMorale(s) < top) liftMorale(s, Math.min(perSecond * dt, top - getMorale(s)), 'settler');
}

// An idle settler's pastime this tick (patrol calls it between waves): false to just wander
export function idlePastime(s, tick) {
  const c = config();
  if (!s.idle || s.idle.left <= 0) s.idle = pickPastime(s);
  const idle = s.idle;
  idle.left -= tick.dt;
  s.swaying = false;
  switch (idle.act) {
    case 'campfire': {
      let fire = idle.spot && campfires().find(b => Math.hypot(b.x - idle.spot.x, b.y - idle.spot.y) < 5);
      // (#298) its seat: one of the fire's four sides; none given (the night watch) or taken, another free one
      if (!fire || idle.seat === undefined || seatTaken(fire, idle.seat, s)) {
        const free = freeCampfireSeat(s);
        if (!free) { idle.left = 0; return false; }
        fire = free.fire; idle.spot = { x: fire.x, y: fire.y }; idle.seat = free.seat;
      }
      const place = seatsOf(fire, null).find(p => p.seat === idle.seat);
      if (!place) { idle.left = 0; return false; }
      if (!((fire.fuelLeft || 0) > 0)) {
        if (!isBuildingJobFree(fire, 'cook', s) || !claimBuildingJob(fire, 'light', s)) { idle.left = 0; return false; }
        const fuel = fireFuel();
        if (!fuel) { idle.left = 0; return false; }
        idle.left += tick.dt;
        return fetchFromStorage(s, fuel, tick.dt, () => {
          const amount = takeStock(fuel, 1);
          if (amount > 0) s.carrying = { type: fuel, amount, forCampfire: fire };
        });
      }
      goStand(s, place, tick.dt, fire);
      if (Math.hypot(place.x - s.x, place.y - s.y) <= 6) {
        cheer(s, c.campfireMoralePerSecond, c.campfireAbove, tick.dt);
        if (s.flute) s.playingFlute = game.pathTick; // (one with a flute plays it, #279)
      }
      return true;
    }
    case 'talk': {
      const place = ringPlace(s, idle.spot, c.talkRing, 'talk');
      goStand(s, place, tick.dt, idle.spot);
      // alone in its knot for long: off it goes (#306: the knot's group, already gathered)
      if (ringGroup(idle.spot, 'talk').length <= 1) idle.left = Math.min(idle.left, 1);
      return true;
    }
    case 'spar': {
      const other = byId(idle.partnerId);
      if (!other || !other.idle || other.idle.act !== 'spar' || other.idle.partnerId !== s.id) { idle.left = 0; return false; }
      if (Math.hypot(other.x - s.x, other.y - s.y) > c.sparReach) { moveEntityTowards(s, other.x, other.y, s.speed * 0.6, false, tick.dt); return true; }
      faceTowards(s, other.x, other.y);
      if ((s.attackCooldown || 0) <= 0) { startSwing(s, 0.3); s.attackCooldown = 0.8 + rand() * 0.6; }
      if (s.hp > s.maxHp * c.sparMinHp) s.hp = Math.max(s.maxHp * c.sparMinHp, s.hp - c.sparHpPerSecond * tick.dt);
      cheer(s, c.sparMoralePerSecond, c.sparAbove, tick.dt);
      return true;
    }
    case 'digWorms': {
      // at a tuft of grass, digging a while; now and then a worm, carried home as bait
      const grass = idle.spot && game.grassList.find(g => Math.hypot(g.x - idle.spot.x, g.y - idle.spot.y) < 1) || nearestGrass(s);
      if (!grass) { idle.left = 0; return false; }
      idle.spot = { x: grass.x, y: grass.y };
      if (Math.hypot(grass.x - s.x, grass.y - s.y) > 18) { moveEntityTowards(s, grass.x, grass.y, s.speed * 0.8, false, tick.dt); return true; }
      faceTowards(s, grass.x, grass.y);
      s.working = 0.1;
      idle.dug = (idle.dug || 0) + tick.dt;
      if (idle.dug >= GAME_CONFIG.digWorms.seconds) {
        idle.dug = 0;
        idle.left = 0;
        if (rand() < GAME_CONFIG.digWorms.chance) s.carrying = { type: 'worms', amount: 1 };
      }
      return true;
    }
    case 'sway':
      s.swaying = true;
      return true;
    case 'patrolEdge': {
      // round the base just past its edge, waypoint to waypoint (each soldier its own way round)
      const dir = Math.floor(s.id) % 2 ? 1 : -1;
      if (idle.angle === undefined) idle.angle = Math.atan2(s.y - townHall.y, s.x - townHall.x);
      const point = edgePoint(idle.angle);
      idle.onPoint = (idle.onPoint || 0) + tick.dt;
      // there, or can't get there for long: on to the next
      if (Math.hypot(point.x - s.x, point.y - s.y) < 14 || idle.onPoint > 8) { idle.angle += dir * c.patrolStep; idle.onPoint = 0; }
      else moveEntityTowards(s, point.x, point.y, s.speed * 0.7, false, tick.dt);
      return true;
    }
    case 'train': {
      const dummy = game.buildings.find(b => b.type === 'dummy' && Math.hypot(b.x - idle.spot.x, b.y - idle.spot.y) < 1);
      if (!dummy || !canTrain(s) || (s.trained || 0) >= c.trainMax) { idle.left = 0; return false; }
      const place = ringPlace(s, dummy, c.trainRing, 'train');
      // (close enough: the dummy itself may keep it off its exact place)
      if (Math.hypot(place.x - s.x, place.y - s.y) > 6 && Math.hypot(dummy.x - s.x, dummy.y - s.y) > c.trainRing + 10) { moveEntityTowards(s, place.x, place.y, s.speed * 0.7, false, tick.dt); return true; }
      faceTowards(s, dummy.x, dummy.y);
      if ((s.attackCooldown || 0) <= 0) { startSwing(s, 0.3); s.attackCooldown = 0.9; }
      s.trained = Math.min(c.trainMax, (s.trained || 0) + c.trainPerSecond * tick.dt);
      return true;
    }
    default:
      return false;
  }
}

// Bring idle-time fuel to the fire before the general carrying behaviour returns it to storage.
export function lightCampfire(s, tick) {
  const load = s.carrying;
  if (!load || !load.forCampfire) return false;
  const fire = load.forCampfire;
  if (!game.buildings.includes(fire) || !GAME_CONFIG.cooking.fuel[load.type]) {
    delete load.forCampfire;
    return false;
  }
  if (!claimBuildingJob(fire, 'light', s)) {
    delete load.forCampfire;
    return false;
  }
  if (Math.hypot(fire.x - s.x, fire.y - s.y) > 32) {
    moveEntityTowards(s, fire.x, fire.y, s.speed, false, tick.dt);
    return true;
  }
  fire.fuelLeft = (fire.fuelLeft || 0) + GAME_CONFIG.cooking.fuel[load.type] * load.amount;
  fire.burning = 1;
  s.carrying = null;
  return true;
}

// (#306) A tune now and then: one carrying a flute stops what it's doing for a while and plays by a campfire
// (the campfire pastime: its morale up while it plays), then goes back to it. Not in a wave, not asleep, not
// while it carries something, and now and then only (GAME_CONFIG.idle.fluteEvery, fluteSeconds)
export function fluteBreak(s, tick) {
  const c = config();
  if (!s.flute || s.isPossessed) return false;
  if (s.breaking) {
    if (!tick.isWaveActive && !isDefenseAlert() && s.idle && s.idle.act === 'campfire' && s.idle.left > 0 && idlePastime(s, tick)) return true;
    s.breaking = false;
    s.idle = null;
    return false;
  }
  if (s.carrying || s.drowsy || tick.isWaveActive || isDefenseAlert() || game.pathTick < (s.fluteAt || 0)) return false;
  if (!isInSafeArea(s.x, s.y)) return false;
  const seat = freeCampfireSeat(s);
  if (!seat) return false;
  s.fluteAt = game.pathTick + Math.round((c.fluteEvery[0] + rand() * (c.fluteEvery[1] - c.fluteEvery[0])) * 60);
  s.breaking = true;
  s.idle = { act: 'campfire', left: c.fluteSeconds[0] + rand() * (c.fluteSeconds[1] - c.fluteSeconds[0]), spot: { x: seat.fire.x, y: seat.fire.y }, partnerId: null, seat: seat.seat };
  return idlePastime(s, tick);
}

// A patrol's waypoint at `angle` round the town hall: a tile past the base's edge, or nearer in where
// that's blocked (a wall, water, a tree)
function edgePoint(angle) {
  const r = getBaseRadius() + TILE_SIZE;
  for (let k = 0; k < 4; k++) {
    const p = { x: townHall.x + Math.cos(angle) * (r - k * TILE_SIZE), y: townHall.y + Math.sin(angle) * (r - k * TILE_SIZE) };
    const g = getGridPos(p.x, p.y);
    if (!isTileBlockedForSettler(g.gx, g.gy)) return { x: g.gx * TILE_SIZE + 15, y: g.gy * TILE_SIZE + 15 };
  }
  return { x: townHall.x + Math.cos(angle) * r, y: townHall.y + Math.sin(angle) * r };
}

// The nearest grass in the base (#199: a fisher digs for worms there)
function nearestGrass(s) {
  let best = null, bestD = Infinity;
  for (const g of game.grassList) {
    const d = Math.hypot(g.x - s.x, g.y - s.y);
    if (d < bestD && isInSafeArea(g.x, g.y) && d < 400) { bestD = d; best = g; }
  }
  return best;
}

// ---- Dung to the compost heap

// The nearest compost heap with room for more dung (#232), or null
export function findDungHeap(from) {
  const room = b => b.type === 'dung_heap' && (b.dung || 0) < (GAME_CONFIG.buildings.dung_heap.dungCapacity || 5);
  return game.buildings.filter(room).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0] || null;
}

// A farmer with a backpack (#232: only them, nobody by hand), with no plot to fertilise just now (fertilize
// comes first), carries a pile of dung in the base to a compost heap with room; one already carrying one
// goes on with it. No heap, nobody gathers dung. In a wave, or with the heap full or gone on the way, it
// drops it where it is
const isDungFarmer = s => s.role === 'worker' && s.tool === 'hoe' && !!s.backpack;
export function cleanDung(s, tick) {
  const load = s.carrying && s.carrying.type === 'dung' && s.carrying.toHeap ? s.carrying : null;
  if (s.dungTarget && (!game.dung.includes(s.dungTarget) || s.carrying || tick.isWaveActive)) s.dungTarget = null;
  if (!load && !s.dungTarget && (!isDungFarmer(s) || s.carrying || s.isPossessed || tick.isWaveActive)) return false;
  const heap = findDungHeap(s);
  const drop = () => { game.dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false }); s.carrying = null; };
  if (load && (tick.isWaveActive || !heap)) { drop(); return false; }
  if (!heap) return false;
  if (load) {
    if (Math.hypot(heap.x - s.x, heap.y - s.y) > 32) moveEntityTowards(s, heap.x, heap.y, s.speed, false, tick.dt);
    else { heap.dung = (heap.dung || 0) + 1; s.carrying = null; }
    s.patrolTarget = null;
    return true;
  }
  // (one each: not a pile another is already going for)
  const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.dungTarget).filter(Boolean));
  const pile = s.dungTarget || game.dung.filter(p => !taken.has(p) && !tick.dungAssignments.has(p) && isInSafeArea(p.x, p.y))
    .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  if (!pile) return false;
  tick.dungAssignments.add(pile);
  s.dungTarget = pile;
  s.patrolTarget = null;
  if (Math.hypot(pile.x - s.x, pile.y - s.y) > 14) { moveEntityTowards(s, pile.x, pile.y, s.speed, false, tick.dt); return true; }
  game.dung.splice(game.dung.indexOf(pile), 1);
  s.dungTarget = null;
  s.carrying = { type: 'dung', amount: 1, toHeap: true };
  return true;
}
