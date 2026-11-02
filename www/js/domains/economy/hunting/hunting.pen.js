// (#326, 27.10, 28) The boar pen (GAME_CONFIG.buildings.pen): a soldier with a lasso (GAME_CONFIG.gear.lasso) catches a
// boar hiding in the grass and leads it in, while the pen has fewer than catchUpTo; two grown ones there, fed, have
// a piglet now and then, and it grows; with three grown, soldiers kill one (a boar for the hunt as any: cull) and
// butcher it. Hungry (not fed for foodSeconds), they neither breed nor grow. A soldier feeds them, or with none
// about a worker with free hands, or else any worker

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, rand } from '../../../engine/world/index.js';
import { hasFog, inTerritory, isVisible } from '../../world/index.js';
import { moveEntityTowards } from '../../../engine/movement/index.js';
import { fetchFromStorage, returnFood, stockLeft, takeFood } from '../../colony/storage/index.js';
import { faceTowards } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';

const config = () => GAME_CONFIG.buildings.pen.pen;
// where in the pen each stands (a tile: they're drawn small, see drawBoarBody)
const SLOTS = [[-7, -4], [7, -3], [0, 6]];
const GIVE_UP_TICKS = 20 * 60, SKIP_TICKS = 30 * 60; // (a boar it can't get at: left for a while)

// The boars in a pen (not a carcass)
export const pennedIn = pen => game.boars.filter(b => b.pen === pen && !b.isCarcass);
const grown = pen => pennedIn(pen).filter(b => !(b.young > 0));
export const isPenHungry = pen => pennedIn(pen).length > 0 && !((pen.fedFor || 0) > 0);
// on their way in on a lasso, to this pen
const ledTo = pen => game.settlers.filter(s => s.leading && s.leadTo === pen).length;

// The nearest pen with room for one more caught
function penWithRoom(from) {
  let best = null, bestD = Infinity;
  for (const b of game.buildings) {
    if (b.type !== 'pen' || pennedIn(b).length + ledTo(b) >= config().catchUpTo) continue;
    const d = Math.hypot(b.x - from.x, b.y - from.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// A boar out in the wild that can be caught: alive, not penned nor on a lasso, on the base's land and seen
const wild = b => !b.isCarcass && !b.pen && !b.ledBy && inTerritory(b.x, b.y) && (!hasFog() || isVisible(b.x, b.y));

function placeInPen(b) {
  const pen = b.pen, i = Math.max(0, pennedIn(pen).indexOf(b)) % SLOTS.length;
  b.x = pen.x + SLOTS[i][0]; b.y = pen.y + SLOTS[i][1];
  b.targetX = b.x; b.targetY = b.y;
  Object.assign(b, { hidden: false, hideTarget: null, fleeTimer: 0, rest: null });
  if (pen.fedFor === undefined) pen.fedFor = config().foodSeconds; // (a new pen: fed to start with)
}

// Each tick (tickBoars) for one in a pen: in its place; on a lasso: a step behind whoever leads it. True if so
export function heldBoar(b) {
  if (b.pen) {
    if (!game.buildings.includes(b.pen)) { b.pen = null; b.cull = false; return false; } // (the pen's gone: free)
    placeInPen(b);
    return true;
  }
  const s = b.ledBy;
  if (!s) return false;
  if (!game.settlers.includes(s) || s.leading !== b) { b.ledBy = null; return false; }
  const d = Math.hypot(b.x - s.x, b.y - s.y);
  if (d > 18) { b.x += (s.x - b.x) / d * (d - 18); b.y += (s.y - b.y) / d * (d - 18); }
  Object.assign(b, { hidden: false, hideTarget: null, fleeTimer: 0, rest: null });
  return true;
}

function letGo(s) {
  if (s.leading) s.leading.ledBy = null;
  s.leading = null; s.leadTo = null;
}

// One on its lasso: led into the pen
export function leadBoar(s, tick) {
  const b = s.leading;
  if (!b) return false;
  const pen = s.leadTo;
  if (!game.boars.includes(b) || b.isCarcass || !game.buildings.includes(pen) || pennedIn(pen).length >= config().holds || s.isPossessed) { letGo(s); return false; }
  if (Math.hypot(pen.x - s.x, pen.y - s.y) > 30) { moveEntityTowards(s, pen.x, pen.y, s.speed * 0.8, false, tick.dt); return true; }
  faceTowards(s, pen.x, pen.y);
  b.pen = pen; b.ledBy = null; s.leading = null; s.leadTo = null;
  placeInPen(b);
  playSound('boar', b);
  return true;
}

// A soldier with a lasso, between waves, with a pen that has room: after the nearest boar it can catch (one it
// comes near backs off into the grass and hides, see tickBoars); one hiding (or lying down) within reach is caught
export function catchBoar(s, tick) {
  if (s.role !== 'soldier' || !s.lasso || s.isPossessed || s.carrying || s.leading || tick.isWaveActive || game.gameMode !== 'endless') return false;
  const pen = penWithRoom(s);
  if (!pen) { s.catching = null; return false; }
  const skipped = b => s.skipBoar === b && game.pathTick < (s.skipUntil || 0);
  let target = s.catching && game.boars.includes(s.catching) && wild(s.catching) && !skipped(s.catching) ? s.catching : null;
  if (!target) {
    const taken = new Set(game.settlers.filter(o => o !== s).map(o => o.catching).filter(Boolean));
    let bestD = Infinity;
    for (const b of game.boars) {
      if (!wild(b) || taken.has(b) || skipped(b)) continue;
      const d = Math.hypot(b.x - s.x, b.y - s.y);
      if (d < bestD) { bestD = d; target = b; }
    }
    if (target) s.catchSince = game.pathTick;
  }
  s.catching = target;
  if (!target) return false;
  if (game.pathTick - (s.catchSince || 0) > GIVE_UP_TICKS) { s.skipBoar = target; s.skipUntil = game.pathTick + SKIP_TICKS; s.catching = null; return false; }
  if ((target.hidden || target.rest) && Math.hypot(target.x - s.x, target.y - s.y) <= GAME_CONFIG.gear.lasso.lasso.reach) {
    s.catching = null; s.leading = target; s.leadTo = pen; target.ledBy = s;
    faceTowards(s, target.x, target.y);
    playSound('boar', target);
    return true;
  }
  moveEntityTowards(s, target.x, target.y, s.speed, false, tick.dt);
  return true;
}

// ---- Fed

const penFood = () => config().foods.find(id => stockLeft(id) >= 1);
const freeHands = o => o.role === 'worker' && o.tool === 'none' && o.weapon === 'fist';
// Who feeds them: a soldier; with none, a worker with free hands; with none of those either, any worker
function feeds(s) {
  if (s.role === 'soldier') return true;
  if (s.role !== 'worker' || game.settlers.some(o => o.role === 'soldier' && !o.isPossessed)) return false;
  return freeHands(s) || !game.settlers.some(o => freeHands(o) && !o.isPossessed);
}

// A hungry pen: its food fetched from a storage and brought (one at a time to a pen)
export function feedPen(s, tick) {
  if (s.isPossessed || s.leaving || tick.isWaveActive || game.gameMode !== 'endless') return false;
  let pen = s.feedingPen;
  const carrying = !!(s.carrying && s.carrying.forPen);
  if (pen && (!game.buildings.includes(pen) || !isPenHungry(pen))) {
    if (carrying) { returnFood(s.carrying.type, s.carrying.amount); s.carrying = null; }
    s.feedingPen = null; pen = null;
  }
  if (!pen) {
    if (s.carrying || !feeds(s) || !penFood()) return false;
    const fed = new Set(game.settlers.map(o => o.feedingPen).filter(Boolean));
    let bestD = Infinity;
    for (const b of game.buildings) {
      if (b.type !== 'pen' || !isPenHungry(b) || fed.has(b)) continue;
      const d = Math.hypot(b.x - s.x, b.y - s.y);
      if (d < bestD) { bestD = d; pen = b; }
    }
    if (!pen) return false;
    s.feedingPen = pen;
  }
  if (!carrying) {
    const food = penFood();
    if (!food) { s.feedingPen = null; return false; }
    const target = pen;
    fetchFromStorage(s, food, tick.dt, () => { s.carrying = { type: food, amount: takeFood(food, 1), forPen: target }; });
    return true;
  }
  if (Math.hypot(pen.x - s.x, pen.y - s.y) > 30) { moveEntityTowards(s, pen.x, pen.y, s.speed, false, tick.dt); return true; }
  faceTowards(s, pen.x, pen.y);
  pen.fedFor = config().foodSeconds;
  s.carrying = null; s.feedingPen = null;
  playSound('eat', pen);
  return true;
}

// ---- Each tick: hunger, piglets, growing up, one of three grown for the pot

export function tickPens(dt) {
  if (game.gameMode !== 'endless') return;
  const c = config(), boar = GAME_CONFIG.mapResources.boar;
  for (const pen of game.buildings) {
    if (pen.type !== 'pen') continue;
    const inIt = pennedIn(pen);
    if (!inIt.length) { pen.breed = 0; continue; }
    pen.fedFor = (pen.fedFor ?? c.foodSeconds) - dt;
    if (pen.fedFor <= 0) continue; // (hungry: nothing grows, nobody's born)
    for (const b of inIt) if (b.young > 0) b.young -= dt;
    const adults = grown(pen);
    if (adults.length >= 2 && inIt.length < c.holds) {
      const breed = pen.breed = (pen.breed || 0) + dt;
      if (breed >= c.breedSeconds) {
        pen.breed = 0;
        const piglet = { x: pen.x, y: pen.y, hp: boar.hp, maxHp: boar.hp, priority: 0, pen, young: c.growSeconds, wanderTimer: rand() * 4, wanderInterval: 4 };
        game.boars.push(piglet);
        placeInPen(piglet);
        playSound('boar', piglet);
      }
    } else pen.breed = 0;
    // three grown: one for the pot (soldiers hunt it there as any boar)
    if (adults.length >= c.holds && !adults.some(b => b.cull)) adults[0].cull = true;
  }
}
