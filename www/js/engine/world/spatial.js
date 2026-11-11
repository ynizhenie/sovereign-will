// (#299) Finding what's near a point without going through a whole list: each list of things that stay
// where they are (trees, rock, water, buildings...) gets its things sorted into buckets by tile, kept with
// the list. On a big map a list has thousands; a check near a point then looks at a few tiles' worth.
//
// The lists are plain arrays changed all over the game (push, splice, a new array), so the buckets notice by
// themselves: things pushed on the end are added; anything else (one taken out, a new array, a new map
// size) and they're sorted again. Not for things that move (settlers, enemies, boars): those are checked
// one by one as before.

import { TILE_SIZE, game } from './state.js';

/** @typedef {{ get: (k: number) => any[] | undefined, set: (k: number, bucket: any[]) => void }} Buckets */
/** @type {WeakMap<any[], { length: number, first: any, last: any, cols: number, buckets: Buckets, blocks: Uint8Array, across: number }>} */
const indexes = new WeakMap();

// (#322) A list with a thing on a good share of the map's tiles (a continent's sea: hundreds of thousands) keeps its buckets in a
// plain array, one place a tile: a Map that big is slow to look a tile up in, and a screen's worth of tiles is looked up for it
// several times a frame
/** @param {any[]} list @returns {Buckets} */
function makeBuckets(list) {
  const tiles = game.COLS * game.ROWS;
  if (list.length * 8 < tiles) return new Map();
  /** @type {(any[] | undefined)[]} */
  const cells = new Array(tiles);
  return { get: k => cells[k], set: (k, bucket) => { if (k >= 0 && k < tiles) cells[k] = bucket; } };
}

// (#322) and which squares of BLOCK x BLOCK tiles have anything of the list at all: a rectangle of tiles gone through skips an
// empty square in one go (a screen's worth of tiles was looked up one by one for every list, most of them with nothing there)
const BLOCK = 8;
function add(index, o) {
  const gx = Math.floor(o.x / TILE_SIZE), gy = Math.floor(o.y / TILE_SIZE), k = gy * game.COLS + gx, bucket = index.buckets.get(k);
  if (bucket) bucket.push(o); else index.buckets.set(k, [o]);
  if (gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS) index.blocks[Math.floor(gy / BLOCK) * index.across + Math.floor(gx / BLOCK)] = 1;
}

/** @param {any[]} list */
function bucketsOf(list) {
  let index = indexes.get(list);
  if (index && index.cols === game.COLS && index.first === list[0] && index.length === list.length && index.last === list[list.length - 1]) return index;
  if (index && index.cols === game.COLS && index.first === list[0] && index.length < list.length && list[index.length - 1] === index.last) {
    for (let i = index.length; i < list.length; i++) add(index, list[i]);
  } else {
    const across = Math.ceil(game.COLS / BLOCK);
    index = { length: 0, first: list[0], last: undefined, cols: game.COLS, buckets: makeBuckets(list), blocks: new Uint8Array(across * Math.ceil(game.ROWS / BLOCK)), across };
    for (const o of list) add(index, o);
    indexes.set(list, index);
  }
  index.length = list.length; index.last = list[list.length - 1];
  return index;
}

// Calls fn for each thing of the list within the square of half-side r round (x, y) (closer ones, not
// in order); fn returning true stops it, and that's what it returns
/** @template T @param {T[]} list @param {number} x @param {number} y @param {number} r @param {(o: T) => any} fn */
export function someNear(list, x, y, r, fn) {
  if (list.length < 24) return list.some(fn); // (a short list: quicker to just go through it)
  const index = bucketsOf(list), buckets = index.buckets;
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

// The first thing of the list (in the list's own order, as `find` gives it) within the square of half-side r round (x, y)
// that fn is true of
/** @template T @param {T[]} list @param {number} x @param {number} y @param {number} r @param {(o: T) => any} fn @returns {T | undefined} */
export function firstOf(list, x, y, r, fn) {
  if (list.length < 24) return list.find(fn);
  /** @type {T | undefined} */
  let found, more = false;
  someNear(list, x, y, r, o => { if (fn(o)) { if (found === undefined) found = o; else more = true; } return false; });
  return more ? list.find(fn) : found; // (more than one: the list's first of them)
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
  const index = bucketsOf(list), buckets = index.buckets;
  const gx0 = Math.max(0, Math.floor(x0 / TILE_SIZE)), gx1 = Math.min(game.COLS - 1, Math.floor(x1 / TILE_SIZE));
  const gy0 = Math.max(0, Math.floor(y0 / TILE_SIZE)), gy1 = Math.min(game.ROWS - 1, Math.floor(y1 / TILE_SIZE));
  // (a rectangle bigger than the list: quicker through the list)
  if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > list.length) { for (const o of list) if (inside(o)) fn(o); return; }
  const blocks = index.blocks, across = index.across;
  for (let gy = gy0; gy <= gy1; gy++) {
    const row = Math.floor(gy / BLOCK) * across;
    for (let gx = gx0; gx <= gx1; gx++) {
      if (!blocks[row + Math.floor(gx / BLOCK)]) { gx |= BLOCK - 1; continue; } // (on to the next square)
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
