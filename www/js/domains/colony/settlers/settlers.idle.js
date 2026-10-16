// What settlers do with nothing to do (#199): between waves, instead of wandering round the town hall,
// an idle settler sits by a campfire (its morale rises faster, and a little past its usual), stands with
// others in a knot "talking", or does its faction's own thing: humans sharpen their blade (the next blow
// hits harder), demons spar in pairs (morale up, a little health down), the undead stand and sway; soldiers
// and archers also walk the edge of the base on patrol, or train at a dummy (their damage grows). Each
// pastime lasts a while (GAME_CONFIG.idle.seconds), then another is picked. And any settler free between
// waves carries dung lying about the base to a heap by the farm plots, nearer for the farmers.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, rand, townHall } from '../../../engine/world/index.js';
import { isTileBlockedForSettler, moveEntityTowards } from '../../../engine/movement/index.js';
import { getBaseRadius, isInSafeArea } from '../../conflict/combat/index.js';
import { baseMorale, getMorale, liftMorale } from '../../conflict/morale/index.js';
import { getPlayerFaction } from '../../factions/index.js';
import { faceTowards, startSwing } from './settlers.draw.js';

const config = () => GAME_CONFIG.idle;

// the activity texts of the pastimes (activity.<name>)
export const IDLE_ACTIVITIES = { campfire: 'idleCampfire', talk: 'idleTalk', sharpen: 'idleSharpen', spar: 'idleSpar', sway: 'idleSway', patrolEdge: 'idlePatrol', train: 'idleTrain' };

const byId = id => game.settlers.find(o => o.id === id) || null;
const isMelee = s => s.weapon && s.weapon !== 'fist' && s.weapon !== 'bow';
// another idle settler free for company: wandering, or already in a knot
const isFreeCompany = (s, o) => o !== s && o.isIdle && !o.isPossessed && !o.carrying && (!o.idle || o.idle.act === 'wander' || o.idle.act === 'talk');
const campfires = () => game.buildings.filter(b => b.type === 'campfire' && isInSafeArea(b.x, b.y));
const isFighter = s => (s.role === 'soldier' || s.role === 'archer') && !s.towerAssignment;
// a training dummy with room for one more
const freeDummy = s => game.buildings.filter(b => b.type === 'dummy' &&
  game.settlers.filter(o => o !== s && o.idle && o.idle.act === 'train' && o.idle.spot && Math.hypot(o.idle.spot.x - b.x, o.idle.spot.y - b.y) < 1).length < (GAME_CONFIG.buildings.dummy.trainers || 2))
  .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] || null;

// A pastime for the next while: what's possible, one of them at random
function pickPastime(s) {
  const c = config();
  const faction = getPlayerFaction().id;
  const options = ['wander'];
  const fires = campfires();
  if (fires.length) options.push('campfire');
  if (game.settlers.some(o => isFreeCompany(s, o) && Math.hypot(o.x - s.x, o.y - s.y) < c.companyRange)) options.push('talk');
  if (faction === 'humans' && isMelee(s) && !s.sharpened) options.push('sharpen', 'sharpen');
  if (faction === 'demons' && game.settlers.some(o => o !== s && o.isIdle && !o.carrying && (!o.idle || o.idle.act === 'wander'))) options.push('spar', 'spar');
  if (faction === 'undead') options.push('sway', 'sway');
  if (isFighter(s)) {
    options.push('patrolEdge', 'patrolEdge');
    if (freeDummy(s) && (s.trained || 0) < c.trainMax) options.push('train', 'train', 'train');
  }
  const act = options[Math.floor(rand() * options.length)];
  const seconds = c.seconds[0] + rand() * (c.seconds[1] - c.seconds[0]);
  /** @type {{ act: string, left: number, spot: { x: number, y: number } | null, partnerId: number | null }} */
  const idle = { act, left: seconds, spot: null, partnerId: null };
  if (act === 'campfire') {
    const fire = fires.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    idle.spot = { x: fire.x, y: fire.y };
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

// Its place round a spot (a fire, a knot): a ring, each settler at its own angle
function ringPlace(s, spot, radius) {
  const angle = ((s.id * 2.399) % (Math.PI * 2));
  return { x: spot.x + Math.cos(angle) * radius, y: spot.y + Math.sin(angle) * radius };
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
      const fire = campfires().find(b => Math.hypot(b.x - idle.spot.x, b.y - idle.spot.y) < 5);
      if (!fire) { idle.left = 0; return false; }
      const place = ringPlace(s, fire, c.campfireRing);
      goStand(s, place, tick.dt, fire);
      if (Math.hypot(place.x - s.x, place.y - s.y) <= 6) cheer(s, c.campfireMoralePerSecond, c.campfireAbove, tick.dt);
      return true;
    }
    case 'talk': {
      const place = ringPlace(s, idle.spot, c.talkRing);
      goStand(s, place, tick.dt, idle.spot);
      // alone in its knot for long: off it goes
      if (!game.settlers.some(o => o !== s && o.idle && o.idle.act === 'talk' && o.idle.spot && Math.hypot(o.idle.spot.x - idle.spot.x, o.idle.spot.y - idle.spot.y) < 1)) idle.left = Math.min(idle.left, 1);
      return true;
    }
    case 'sharpen': {
      s.working = 0.1;
      idle.sharpened = (idle.sharpened || 0) + tick.dt;
      if (idle.sharpened >= c.sharpenSeconds) { s.sharpened = true; idle.left = 0; }
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
      if (!dummy || (s.trained || 0) >= c.trainMax) { idle.left = 0; return false; }
      const place = ringPlace(s, dummy, c.trainRing);
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

// ---- Dung to the heap

// Where the heap is: one tile from the farm plot nearest the town hall, on the hall's side (none with no plots)
export function getDungHeap() {
  if (!game.farmPlots.length) return null;
  const plot = game.farmPlots.reduce((a, b) => Math.hypot(a.x - townHall.x, a.y - townHall.y) <= Math.hypot(b.x - townHall.x, b.y - townHall.y) ? a : b);
  const d = Math.hypot(townHall.x - plot.x, townHall.y - plot.y) || 1;
  return { x: plot.x + (townHall.x - plot.x) / d * TILE_SIZE, y: plot.y + (townHall.y - plot.y) / d * TILE_SIZE };
}

const byThePlots = p => game.farmPlots.some(f => Math.hypot(f.x - p.x, f.y - p.y) < TILE_SIZE * 2.5);

// A settler that had nothing to do (idle last tick) carries a pile of dung in the base to the heap by the
// farm plots; one already carrying one goes on with it. Not in a wave: then it drops it where it is
export function cleanDung(s, tick) {
  const load = s.carrying && s.carrying.type === 'dung' && s.carrying.toHeap ? s.carrying : null;
  if (s.dungTarget && (!game.dung.includes(s.dungTarget) || s.carrying || tick.isWaveActive)) s.dungTarget = null;
  if (!load && !s.dungTarget && (s.carrying || !s.wasIdle || s.isPossessed || s.towerAssignment || tick.isWaveActive)) return false;
  const heap = getDungHeap();
  const drop = () => { game.dung.push({ x: s.x, y: s.y, age: 0, by: s, byLeft: false }); s.carrying = null; };
  if (load && (tick.isWaveActive || !heap)) { drop(); return false; }
  if (!heap) return false;
  if (load) {
    // a little apart from the others in the heap, not all on one spot
    const place = { x: heap.x + ((s.id * 7) % 13) - 6, y: heap.y + ((s.id * 11) % 13) - 6 };
    if (Math.hypot(place.x - s.x, place.y - s.y) > 8) moveEntityTowards(s, place.x, place.y, s.speed, false, tick.dt);
    else drop();
    s.patrolTarget = null;
    return true;
  }
  // (one each: not a pile another is already going for)
  const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.dungTarget).filter(Boolean));
  const pile = s.dungTarget || game.dung.filter(p => !taken.has(p) && !tick.dungAssignments.has(p) && isInSafeArea(p.x, p.y) && !byThePlots(p))
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
