// (#299) Finding what's near a point without going through a whole list: each list of things that stay
// where they are (trees, rock, water, buildings...) gets its things sorted into buckets by tile, kept with
// the list. On a big map a list has thousands; a check near a point then looks at a few tiles' worth.
//
// The lists are plain arrays changed all over the game (push, splice, a new array), so the buckets notice by
// themselves: things pushed on the end are added; anything else (one taken out, a new array, a new map
// size) and they're sorted again. Not for things that move (settlers, enemies, boars): those are checked
// one by one as before.

import { TILE_SIZE, game } from './state.js';

/** @type {WeakMap<any[], { length: number, first: any, last: any, cols: number, buckets: Map<number, any[]> }>} */
const indexes = new WeakMap();

const bucketOf = (x, y) => Math.floor(y / TILE_SIZE) * game.COLS + Math.floor(x / TILE_SIZE);

function add(buckets, o) {
  const k = bucketOf(o.x, o.y), bucket = buckets.get(k);
  if (bucket) bucket.push(o); else buckets.set(k, [o]);
}

/** @param {any[]} list */
function bucketsOf(list) {
  let index = indexes.get(list);
  if (index && index.cols === game.COLS && index.first === list[0] && index.length === list.length && index.last === list[list.length - 1]) return index.buckets;
  if (index && index.cols === game.COLS && index.first === list[0] && index.length < list.length && list[index.length - 1] === index.last) {
    for (let i = index.length; i < list.length; i++) add(index.buckets, list[i]);
  } else {
    index = { length: 0, first: list[0], last: undefined, cols: game.COLS, buckets: new Map() };
    for (const o of list) add(index.buckets, o);
    indexes.set(list, index);
  }
  index.length = list.length; index.last = list[list.length - 1];
  return index.buckets;
}

// Calls fn for each thing of the list within the square of half-side r round (x, y) (closer ones, not
// in order); fn returning true stops it, and that's what it returns
/** @template T @param {T[]} list @param {number} x @param {number} y @param {number} r @param {(o: T) => any} fn */
export function someNear(list, x, y, r, fn) {
  if (list.length < 24) return list.some(fn); // (a short list: quicker to just go through it)
  const buckets = bucketsOf(list);
  const gx0 = Math.floor((x - r) / TILE_SIZE), gx1 = Math.floor((x + r) / TILE_SIZE);
  const gy0 = Math.floor((y - r) / TILE_SIZE), gy1 = Math.floor((y + r) / TILE_SIZE);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (gx < 0 || gx >= game.COLS) continue;
      const bucket = buckets.get(gy * game.COLS + gx);
      if (bucket) for (const o of bucket) if (fn(o)) return true;
    }
  }
  return false;
}

// Whether any thing of the list is closer than r to (x, y)
/** @param {{ x: number, y: number }[]} list @param {number} x @param {number} y @param {number} r */
export function anyWithin(list, x, y, r) {
  return someNear(list, x, y, r, o => Math.hypot(o.x - x, o.y - y) < r);
}

// The thing of the list exactly at (x, y), if any
/** @template {{ x: number, y: number }} T @param {T[]} list @param {number} x @param {number} y @returns {T | undefined} */
export function thingAt(list, x, y) {
  let found;
  someNear(list, x, y, 0, o => o.x === x && o.y === y && (found = o));
  return found;
}

// Calls fn for each thing of the list inside the rectangle (x0, y0)-(x1, y1), row of tiles by row of tiles
// (top to bottom: what's lower on the screen is drawn over what's higher)
/** @template {{ x: number, y: number }} T @param {T[]} list @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {(o: T) => void} fn */
export function forEachInRect(list, x0, y0, x1, y1, fn) {
  const inside = o => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
  if (list.length < 24) { for (const o of list) if (inside(o)) fn(o); return; }
  const buckets = bucketsOf(list);
  const gx0 = Math.max(0, Math.floor(x0 / TILE_SIZE)), gx1 = Math.min(game.COLS - 1, Math.floor(x1 / TILE_SIZE));
  const gy0 = Math.max(0, Math.floor(y0 / TILE_SIZE)), gy1 = Math.min(game.ROWS - 1, Math.floor(y1 / TILE_SIZE));
  // (a rectangle bigger than the list: quicker through the list)
  if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > list.length) { for (const o of list) if (inside(o)) fn(o); return; }
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const bucket = buckets.get(gy * game.COLS + gx);
      if (bucket) for (const o of bucket) if (inside(o)) fn(o);
    }
  }
}

// What a list of tiles that rarely change is like now (which array, how many, the first and the last): the
// same while none came or went (#299: a picture made of them kept till this changes)
/** @param {any[]} list */
export function listStamp(list) {
  return list.length ? [list, list.length, list[0], list[list.length - 1]] : [list, 0];
}
