// (#306) What's near a point among the things that move: settlers and enemies, sorted into buckets by
// where they were at the start of the tick (a picture of them, made again each tick, not the one
// spatial.js keeps for what stays put). A check for what's close then looks at the few buckets round the
// point instead of everyone: with a big colony every settler asking every other one, sixty times a
// second, was a good part of what made it slow.

import { game } from '../world/index.js';

const CELL = 48; // world px: a cell is a little wider than how far a push or a look reaches

/** @type {{ tick: number, settlers: any[] | null, enemies: any[] | null, cols: number, settlerBuckets: Map<number, any[]>, enemyBuckets: Map<number, any[]> }} */
let picture = { tick: -1, settlers: null, enemies: null, cols: 0, settlerBuckets: new Map(), enemyBuckets: new Map() };

/** @param {any[]} list @param {number} cols */
function sortIntoBuckets(list, cols) {
  /** @type {Map<number, any[]>} */
  const buckets = new Map();
  for (const unit of list) {
    // (+1: a key of a cell left of or above the map's edge is no other cell's)
    const key = (Math.floor(unit.y / CELL) + 1) * cols + Math.floor(unit.x / CELL) + 1;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(unit); else buckets.set(key, [unit]);
  }
  return buckets;
}

// Throws the picture away so the next look makes it again. For the few places that move units about
// and then look again in the same tick (pushing bodies apart), a picture from before the push would
// still have them where they no longer are.
export function refreshNeighbourPicture() {
  picture.tick = -1;
}

function current() {
  if (picture.tick !== game.pathTick || picture.settlers !== game.settlers || picture.enemies !== game.enemies) {
    const cols = Math.ceil(game.WORLD_WIDTH / CELL) + 3;
    picture = {
      tick: game.pathTick, settlers: game.settlers, enemies: game.enemies, cols,
      settlerBuckets: sortIntoBuckets(game.settlers, cols), enemyBuckets: sortIntoBuckets(game.enemies, cols)
    };
  }
  return picture;
}

// Calls fn for each thing of the list within r of (x, y) (not in order); fn returning true stops it, and
// that's what it returns
/** @param {'settlers' | 'enemies'} which @param {number} x @param {number} y @param {number} r @param {(unit: any) => any} fn */
function someNear(which, x, y, r, fn) {
  const now = current();
  const buckets = which === 'settlers' ? now.settlerBuckets : now.enemyBuckets;
  const cols = now.cols;
  const gx0 = Math.floor((x - r) / CELL) + 1, gx1 = Math.floor((x + r) / CELL) + 1;
  const gy0 = Math.floor((y - r) / CELL) + 1, gy1 = Math.floor((y + r) / CELL) + 1;
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const bucket = buckets.get(gy * cols + gx);
      if (bucket) for (const unit of bucket) if (fn(unit)) return true;
    }
  }
  return false;
}

// Each settler within r of (x, y)
/** @param {number} x @param {number} y @param {number} r @param {(unit: any) => void} fn */
export function forEachSettlerNear(x, y, r, fn) {
  someNear('settlers', x, y, r, unit => { fn(unit); return false; });
}

// Whether a settler within r of (x, y) is as fn says
/** @param {number} x @param {number} y @param {number} r @param {(unit: any) => any} fn */
export function someSettlerNear(x, y, r, fn) {
  return someNear('settlers', x, y, r, fn);
}

// Whether an enemy within r of (x, y) is as fn says
/** @param {number} x @param {number} y @param {number} r @param {(unit: any) => any} fn */
export function someEnemyNear(x, y, r, fn) {
  return someNear('enemies', x, y, r, fn);
}

// Each enemy within r of (x, y)
/** @param {number} x @param {number} y @param {number} r @param {(unit: any) => void} fn */
export function forEachEnemyNear(x, y, r, fn) {
  someNear('enemies', x, y, r, unit => { fn(unit); return false; });
}

// How many of the list are within r of (x, y) and as fn says. The two long lists (settlers, enemies) are
// counted by their buckets; any other (a filtered list, boars) is gone through.
/** @param {any[]} list @param {number} x @param {number} y @param {number} r @param {(unit: any) => any} fn */
export function countNear(list, x, y, r, fn) {
  const which = list === game.settlers ? 'settlers' : list === game.enemies ? 'enemies' : null;
  const rr = r * r;
  const test = unit => { const dx = unit.x - x, dy = unit.y - y; return dx * dx + dy * dy <= rr && fn(unit); };
  if (!which) return list.reduce((count, unit) => count + (test(unit) ? 1 : 0), 0);
  const now = current();
  const buckets = which === 'settlers' ? now.settlerBuckets : now.enemyBuckets;
  const cols = now.cols;
  const gx0 = Math.floor((x - r) / CELL) + 1, gx1 = Math.floor((x + r) / CELL) + 1;
  const gy0 = Math.floor((y - r) / CELL) + 1, gy1 = Math.floor((y + r) / CELL) + 1;
  let count = 0;
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const bucket = buckets.get(gy * cols + gx);
      if (bucket) for (const unit of bucket) if (test(unit)) count++;
    }
  }
  return count;
}
