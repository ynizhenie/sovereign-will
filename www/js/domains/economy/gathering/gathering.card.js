// Nature kept on the graphics card's canvas (the WebGL trial, engine/platform/gl.js).
//
// Laid down one by one each frame, the trees, bushes, stones and sticks on the screen were looked for and said again sixty
// times a second though nothing about them had changed. Here each one's picture is given to the card once, when the thing
// comes, and taken back when it goes; a frame only says where the camera is. What changes is noticed as it happens: a list
// that a thing came to or went from is gone through again; the trees (grown, felled, their apples ripe or picked) are looked
// at a few hundred a frame in turn, and at once those a unit stands by. A tree growing or lying felled isn't kept: it's
// drawn on the game's canvas as ever.

import { TILE_SIZE, forEachInRect, game, thingAt, worldEpoch } from '../../../engine/world/index.js';
import { getBaseScale, getMaxZoom, glDrop, glDropAll, glKeep, glSway, glSwayDropAll, glWind } from '../../../engine/platform/index.js';
import { windNow } from '../../world/index.js';
import { pictureBox, pictureOf } from './gathering.sprites.js';

// the small things, from the bottom up (as they're drawn on the game's canvas)
/** @type {[string, () => any[]][]} */
const SMALL = [
  ['stick', () => game.sticks], ['pebbles', () => game.pebbles], ['stump', () => game.stumps],
  ['bush', () => game.berryBushes], ['cactus', () => game.cacti], ['boulder', () => game.boulders]
];
const LOOK_AT_A_FRAME = 400;
const GROUP_PX = 16 * TILE_SIZE; // (the tufts kept in groups this wide) // (trees looked at again each frame, in turn)

/** @typedef {{ list: any[] | null, length: number, first: any, last: any, members: Set<any> }} Seen */
/** @returns {Seen} */
const nothing = () => ({ list: null, length: -1, first: undefined, last: undefined, members: new Set() });
const state = {
  world: -1, res: 0,
  small: SMALL.map(nothing), trees: nothing(), grass: nothing(),
  /** the look each kept tree was kept with (its apples) @type {Map<any, number>} */
  looks: new Map(),
  /** the trees not kept: growing, felled @type {Set<any>} */
  loose: new Set(),
  /** @type {any[]} */
  turn: [], at: 0
};
const same = (seen, list) => seen.list === list && seen.length === list.length && seen.first === list[0] && seen.last === list[list.length - 1];
const standing = t => !t.isGrowing && !t.fallen;
const lookOf = t => (t.apple ? (t.applesReady ? 2 : 1) : 0);

function keep(layer, kind, o, z) {
  const c = pictureOf(kind, o, state.res), [x0, y0] = pictureBox(kind), res = state.res;
  glKeep(layer, o, c, o.x + x0 - 1 / res, o.y + y0 - 1 / res, c.width / res, c.height / res, z);
}

// A tree as it is now: kept with its picture, or (growing, felled) not
function lookAtTree(t) {
  if (standing(t)) {
    const look = lookOf(t);
    if (state.looks.get(t) !== look) { keep(1, 'tree', t, t.y); state.looks.set(t, look); }
    state.loose.delete(t);
  } else {
    if (state.looks.has(t)) { glDrop(1, t); state.looks.delete(t); }
    state.loose.add(t);
  }
}

// What came to a list or went from it since it was last gone through
/** @param {Seen} seen @param {any[]} list @param {(o: any) => void} came @param {(o: any) => void} went */
function changes(seen, list, came, went) {
  if (same(seen, list)) return false;
  const now = new Set(list);
  for (const o of seen.members) if (!now.has(o)) went(o);
  for (const o of list) if (!seen.members.has(o)) came(o);
  seen.list = list; seen.length = list.length; seen.first = list[0]; seen.last = list[list.length - 1]; seen.members = now;
  return true;
}

// Each frame (with the trial on): what's kept brought up to date
export function keepNatureOnCard() {
  // (pictures as sharp as the closest zoom shows them; the card makes them smaller by itself further out)
  const res = Math.min(4, Math.max(0.25, 2 ** Math.ceil(Math.log2(Math.max(getBaseScale() * getMaxZoom(), 0.01)))));
  if (state.world !== worldEpoch() || state.res !== res) {
    glDropAll(); glSwayDropAll();
    state.world = worldEpoch(); state.res = res;
    state.small = SMALL.map(nothing); state.trees = nothing(); state.grass = nothing();
    state.looks.clear(); state.loose.clear(); state.turn = []; state.at = 0;
  }
  SMALL.forEach(([kind, listOf], n) => {
    changes(state.small[n], listOf(), o => keep(0, kind, o, n * 1e7 + o.y), o => glDrop(0, o));
  });
  if (changes(state.trees, game.trees, lookAtTree, t => { glDrop(1, t); state.looks.delete(t); state.loose.delete(t); })) {
    state.turn = game.trees.slice(); state.at = 0;
  }
  // the tufts of grass, in groups of GROUP x GROUP tiles: a group one came to or went from is made again
  /** @type {Set<string>} */
  const stale = new Set();
  const groupOf = o => { stale.add(`${Math.floor(o.x / GROUP_PX)},${Math.floor(o.y / GROUP_PX)}`); };
  if (changes(state.grass, game.grassList, groupOf, groupOf)) {
    const box = pictureBox('grass');
    for (const key of stale) {
      const [cx, cy] = key.split(',').map(Number), tufts = [];
      forEachInRect(game.grassList, cx * GROUP_PX, cy * GROUP_PX, (cx + 1) * GROUP_PX - 0.01, (cy + 1) * GROUP_PX - 0.01, o => {
        const c = pictureOf('grass', o, res);
        tufts.push({ picture: c, x: o.x + box[0] - 1 / res, y: o.y + box[1] - 1 / res, w: c.width / res, h: c.height / res, fx: o.x, fy: o.y });
      });
      glSway(key, tufts);
    }
  }
  const wind = windNow();
  glWind(performance.now() / 1000, wind.wind, wind.lean);
  for (let i = 0; i < LOOK_AT_A_FRAME && state.turn.length; i++) {
    if (state.at >= state.turn.length) state.at = 0;
    lookAtTree(state.turn[state.at++]);
  }
}

// The trees to draw on the game's canvas this frame, in their turn by depth: those growing or felled on the screen, and
// those standing on the tiles `near` (where a unit or a building is by: gy * span + gx), drawn there over their kept
// picture so that they cover what's behind them
/** @param {Set<number>} near @param {number} span @param {{ x0: number, y0: number, x1: number, y1: number }} view */
export function treesToDrawOver(near, span, view) {
  /** @type {any[]} */
  const found = [];
  for (const key of near) {
    const gx = key % span, gy = (key - gx) / span;
    const t = thingAt(game.trees, gx * TILE_SIZE + 15, gy * TILE_SIZE + 15);
    if (!t) continue;
    lookAtTree(t); // (felled just now by the one standing by it, say)
    if (standing(t)) found.push(t);
  }
  for (const t of state.loose) if (t.x >= view.x0 && t.x <= view.x1 && t.y >= view.y0 && t.y <= view.y1) found.push(t);
  return found;
}
