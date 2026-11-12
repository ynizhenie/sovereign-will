// How far a resource is worked through

import { TILE_SIZE, forEachInRect, game, thingAt, worldEpoch } from '../../../engine/world/index.js';
import { SHADOWS, paintOn, paintStill, paintVariant, drawBoulderArt, drawBushArt, drawCactusArt, drawGrassArt, drawLogArt, drawSaplingArt, drawStumpArt, drawTreeArt } from './gathering.art.js';
import { ctx, drawProgressBar, getViewRect, getViewScale, glReady } from '../../../engine/platform/index.js';
import { getMapResourceDef, getMapResourceKind } from './gathering.rules.js';
import { drawOneSprite, drawSprites } from './gathering.sprites.js';
import { CHUNK, drawChunks, drawOreVeins, getSun, isGroundCached, isPrewarmingChunks, paintRockShadows } from '../../world/index.js';

export function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

export function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  drawProgressBar(resource.x, resource.y, (maxHp - Math.max(0, resource.hp)) / maxHp, width);
}

// (#299) only what's on the screen (with room for a tree's crown over the edge): a big map has thousands
const onScreen = (list, fn) => { const v = getViewRect(2 * TILE_SIZE); forEachInRect(list, v.x0, v.y0, v.x1, v.y1, fn); };
// the things of a list on the screen
/** @param {any[]} list */
const seenOf = list => { /** @type {any[]} */ const found = []; onScreen(list, o => { found.push(o); }); return found; };
// (#322) a kind laid down from its pictures (gathering.sprites.js), then the bars of those being worked
/** @param {string} kind @param {any[]} list @param {number} [width] */
const drawKind = (kind, list, width = 24) => { const things = seenOf(list); drawSprites(kind, things); for (const o of things) drawHarvestProgress(o, width); };

// Sticks and pebbles, and minable ore
export function drawSticksPebblesOre() {
  // (the look: gathering.art.js, #251; kept on the graphics card's canvas with the trial on, see gathering.card.js)
  if (!glReady()) {
    drawSprites('stick', seenOf(game.sticks));
    drawSprites('pebbles', seenOf(game.pebbles));
  }
  onScreen(game.logs, drawLogArt); // (#298)

  // minable ore: the spawner's veined rock on a full tile, like natural rock (the spawner adds a frame and crystal)
  // (zoomed out: in the ground's pictures, #299)
  const groundPictured = isGroundCached();
  onScreen(game.ironOres, ore => {
    if (!groundPictured) drawOreVeins(ore.x, ore.y, 'iron', 14);
    drawHarvestProgress(ore);
  });

  onScreen(game.coalOres, ore => {
    if (!groundPictured) drawOreVeins(ore.x, ore.y, 'coal', 14);
    drawHarvestProgress(ore);
  });
}

// ---- Nature in pictures (#322)
//
// Trees, cacti, boulders and berry bushes (and the stumps) stand still: drawn one by one each frame, a forest on
// the screen was most of what a zoomed out frame cost (the number on the screen grows with the square of the
// zoom out). Zoomed out they're drawn once into the ground's kind of pictures (see drawChunks) and laid down;
// a piece is painted again when something in or round it comes, goes or changes, or the sun's moved enough
// for the shadows. What changes meanwhile (a sapling, a falling tree, a bar of work done, apples being picked)
// is drawn over them as before. Zoomed in the few on the screen are drawn as ever.
const MARGIN = 40; // (world px of a tree's crown and its shadow past its foot)
const REFRESH_TICKS = 3; // (what's drawn over the pictures: a bar, a sapling)
const STAMP_TICKS = 20; // (how often a piece's look is worked out again: how a tree stands, apples ripe, take a moment)
// (a little either side of a threshold the way held stays: at a physical scale of 1 (a 2x screen), a pixel of a window's
// size drew the one way and the other in turn, a whole screen of pieces painted each time)
// Nature keeps its deterministic sprite at every camera scale. Rasterized chunks used to switch
// the same tree to a different cached appearance when zooming out.
const pictured = () => false;
// as fine as the screen shows (a power of two), never finer than a world unit; a size kept while the zoom is within a little of its range
let heldRes = 1;
const natureRes = () => {
  const s = Math.max(getViewScale(), 0.0625), want = Math.min(1, 2 ** Math.ceil(Math.log2(s)));
  if (want !== heldRes && s > heldRes * 0.5 * 0.88 && s < heldRes * 1.12) return heldRes;
  heldRes = want;
  return want;
};
const standing = o => !o.isGrowing && !o.fallen;
const sunKey = () => { const s = getSun(); return `${Math.round(s.dx * 10)},${Math.round(s.dy * 10)},${Math.round(s.alpha * 50)}`; };
/** @param {any[][]} lists */
const natureLists = lists => {
  lists[0] = game.stumps; lists[1] = game.trees; lists[2] = game.cacti; lists[3] = game.boulders; lists[4] = game.berryBushes; lists[5] = game.savannaTiles;
  return lists;
};

// the things of a list in and round a rectangle, in rows of tiles (the same order whichever piece paints them)
/** @param {any[]} list @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {((o: any) => boolean) | null} [keep] */
function around(list, x0, y0, x1, y1, keep = null) {
  /** @type {any[]} */
  const found = [];
  forEachInRect(list, x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN, o => { if (!keep || keep(o)) found.push(o); });
  return found.sort((a, b) => Math.floor(a.y / TILE_SIZE) - Math.floor(b.y / TILE_SIZE) || Math.floor(a.x / TILE_SIZE) - Math.floor(b.x / TILE_SIZE));
}

// What a piece's nature is like: the things in it with how they look (grown, felled, apples ripe). Each piece's is looked at
// again once it's REFRESH_TICKS old, and no more than STAMPS_PER_FRAME in a frame (all of them at once, with the
// pieces of a screen x five lists, was a tenth of a frame); a list changing makes them all due, not all made at once
const STAMPS_PER_FRAME = 4;
/** @param {(lists: any[][]) => any[][]} listsOf @param {number} [margin] (world px round a piece of what's in it that shows in it) @param {() => string} [sunOf] @param {number} [ticks] (how often a piece is looked at again) */
function stamper(listsOf, margin = MARGIN, sunOf = sunKey, ticks = STAMP_TICKS) {
  /** @type {{ signatures: any[][], members: any[][], epoch: number, made: number, world: number, sun: string | null, stamps: Map<string, { tick: number, epoch: number, sun: string, things: number, count: number, parts: number[], counts: number[], stamp: string }>, dirty: Set<string> }} */
  const state = { signatures: [], members: [], epoch: 0, made: 0, world: worldEpoch(), sun: null, stamps: new Map(), dirty: new Set() };
  /** @type {any[][]} */
  const current = [];
  /** @param {any[]} list */
  const signatureOf = list => [list, list.length, list[0], list[list.length - 1]];
  /** @param {any[] | undefined} signature @param {any[]} list */
  const signatureMatches = (signature, list) => signature && signature[0] === list && signature[1] === list.length &&
    signature[2] === list[0] && signature[3] === list[list.length - 1];
  const dirtyObject = o => {
    const size = CHUNK * TILE_SIZE;
    const x0 = Math.floor((o.x - margin) / size), x1 = Math.floor((o.x + margin) / size);
    const y0 = Math.floor((o.y - margin) / size), y1 = Math.floor((o.y + margin) / size);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) state.dirty.add(`${cx},${cy}`);
  };
  // (#392) what's changed in the lists, and the sun: once a frame, not for every piece on the screen and round it
  const look = () => {
      if (state.world !== worldEpoch()) {
        state.world = worldEpoch(); state.signatures = []; state.members = []; state.epoch++; state.stamps.clear(); state.dirty.clear();
      }
      listsOf(current);
      if (!state.signatures.length) {
        state.members = current.map(list => [...list]);
        state.signatures = current.map(signatureOf);
      } else {
        let changed = current.length !== state.signatures.length;
        for (let n = 0; !changed && n < current.length; n++) changed = !signatureMatches(state.signatures[n], current[n]);
        if (changed) {
          for (let n = 0; n < current.length; n++) {
            if (signatureMatches(state.signatures[n], current[n])) continue;
            const before = new Set(state.members[n] || []), after = new Set(current[n] || []);
            for (const o of before) if (!after.has(o)) dirtyObject(o);
            for (const o of after) if (!before.has(o)) dirtyObject(o);
            state.members[n] = [...(current[n] || [])];
            state.signatures[n] = signatureOf(current[n]);
          }
          state.members.length = current.length;
          state.signatures.length = current.length;
        }
      }
      state.sun = sunOf();
  };
  const stamp = (cx, cy) => {
      if (state.sun === null) look();
      // (the sun's step too: the time of day can be changed with the game paused, in the editor)
      const key = `${cx},${cy}`, kept = state.stamps.get(key), sun = /** @type {string} */ (state.sun);
      // changed: something came or went (all of it looked at again); old: only how the trees stand may have changed since (the
      // other lists' things are as they were while they're there)
      const changed = !kept || state.dirty.has(key) || kept.epoch !== state.epoch;
      const old = !!kept && (game.pathTick - kept.tick >= ticks || game.pathTick < kept.tick);
      // (#322) the sun moved on: the same things, nothing looked for (it went through a dozen lists round every piece on the screen)
      const withSun = entry => { if (entry.sun !== sun) { entry.sun = sun; entry.stamp = `${entry.things}|${sun}`; } return entry.stamp; };
      if (kept && ((!changed && !old) || (!isPrewarmingChunks() && state.made >= STAMPS_PER_FRAME))) return withSun(kept);
      state.made++;
      const size = CHUNK * TILE_SIZE, x0 = cx * size, y0 = cy * size;
      const parts = kept && !changed ? kept.parts : [], counts = kept && !changed ? kept.counts : [];
      current.forEach((list, n) => {
        if (kept && !changed && list !== game.trees) return;
        let h = 0, count = 0;
        forEachInRect(list, x0 - margin, y0 - margin, x0 + size + margin, y0 + size + margin, o => {
          h = (h * 31 + o.x * 7919 + o.y * 31 + n + (standing(o) ? 1 : 0) + (o.applesReady ? 2 : 0) + (o.apple ? 4 : 0) +
            (thingAt(game.savannaTiles, o.x, o.y) ? 8 : 0)) | 0;
          count++;
        });
        parts[n] = h; counts[n] = list === game.savannaTiles ? 0 : count;
      });
      parts.length = counts.length = current.length;
      let h = 0, count = 0;
      for (let n = 0; n < parts.length; n++) { h = (h * 31 + parts[n] + n) | 0; count += counts[n]; }
      const value = `${h}|${sun}`;
      state.dirty.delete(key);
      state.stamps.set(key, { tick: game.pathTick, epoch: state.epoch, sun, things: h, count, parts, counts, stamp: value });
      return value;
  };
  stamp.dirty = (cx, cy) => state.dirty.has(`${cx},${cy}`);
  // (#322) nothing of these lists in or round the piece (as last looked at): it has no picture
  stamp.empty = (cx, cy) => { const key = `${cx},${cy}`; if (!state.stamps.has(key) || state.dirty.has(key)) stamp(cx, cy); return state.stamps.get(key)?.count === 0; };
  return {
    newFrame() { state.made = 0; look(); },
    stamp,
    // what's in and round piece (cx, cy), and how it is, as a number (the same while they stay the same)
    /** @param {number} cx @param {number} cy */
    thingsIn: (cx, cy) => state.stamps.get(`${cx},${cy}`)?.things
  };
}
/** @param {any[][]} lists */
const tuftLists = lists => { lists[0] = game.grassList; lists[1] = game.savannaTiles; return lists; };
const natureStamps = stamper(natureLists), tuftStamps = stamper(tuftLists);

/** @param {CanvasRenderingContext2D} g @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
function paintNature(g, x0, y0, x1, y1) {
  paintOn(g);
  paintVariant(null, false);
  try {
    for (const st of around(game.stumps, x0, y0, x1, y1)) drawStumpArt(st);
    for (const o of around(game.berryBushes, x0, y0, x1, y1)) drawBushArt(o);
    for (const t of around(game.trees, x0, y0, x1, y1, standing)) drawTreeArt(t);
    for (const o of around(game.cacti, x0, y0, x1, y1)) drawCactusArt(o);
    for (const o of around(game.boulders, x0, y0, x1, y1)) drawBoulderArt(o);
  } finally { paintVariant(null); paintOn(null); }
}

/** @param {CanvasRenderingContext2D} g @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
function paintTufts(g, x0, y0, x1, y1) {
  paintOn(g); paintVariant(null, false); paintStill(true);
  try { for (const o of around(game.grassList, x0, y0, x1, y1)) drawGrassArt(o); } finally { paintVariant(null); paintStill(false); paintOn(null); }
}

// The tufts of grass in pictures too, when so far out that their swaying can't be seen (and the look is the same, still)
let heldTufts = false;
const tuftsPictured = () => {
  const s = getViewScale();
  if (s < 0.7) heldTufts = true; else if (s >= 0.8) heldTufts = false;
  return heldTufts;
};

// What's drawn over the pictures: the things on the screen that aren't just standing there (looked for every few ticks)
/** @type {{ tick: number, world: number, trees: any[], others: any[], grass: any[] }} */
const over = { tick: -Infinity, world: worldEpoch(), trees: [], others: [], grass: [] };
function updateOver() {
  if (over.world !== worldEpoch()) { over.world = worldEpoch(); over.tick = -Infinity; }
  if (game.pathTick - over.tick < REFRESH_TICKS && game.pathTick >= over.tick) return;
  over.tick = game.pathTick;
  const v = getViewRect(10 * TILE_SIZE);
  over.trees = []; over.others = []; over.grass = [];
  forEachInRect(game.grassList, v.x0, v.y0, v.x1, v.y1, o => { if (o.hp < o.maxHp) over.grass.push(o); });
  forEachInRect(game.trees, v.x0, v.y0, v.x1, v.y1, t => { if (!standing(t) || t.hp < t.maxHp || t.pickShare > 0) over.trees.push(t); });
  /** @type {[any[], number][]} */
  const kinds = [[game.cacti, 24], [game.boulders, 24], [game.berryBushes, 22]];
  for (const [list, width] of kinds) {
    forEachInRect(list, v.x0, v.y0, v.x1, v.y1, o => { if (o.hp < o.maxHp) over.others.push([o, width]); });
  }
}

function drawPicturedNature() {
  natureStamps.newFrame(); tuftStamps.newFrame();
  drawChunks('nature', natureRes(), natureStamps.stamp, paintNature);
  updateOver();
  for (const t of over.trees) drawTreeNear(t, true);
  for (const [o, width] of over.others) drawHarvestProgress(o, width);
}

// ---- The shadows of what stands still (#392)
//
// Trees, stumps, cacti, boulders, bushes, tufts of grass, sticks and stones, and the rock and ore tiles: their
// shadows painted into pictures of the ground's pieces, black, and laid into the frame's shadows (see world.daytime.js)
// at every zoom. A piece is painted again when something in or round it comes, goes or changes, or the sun has moved
// on a step (small enough not to be seen: finer the closer in); till its turn, its old picture stays (a shadow gone
// for a moment as the zoom changed, waiting to be painted at the new size, read as flicker)
const SHADOW_MARGIN = 64; // (world px past its foot a thing's shadow reaches, a rock's the longest)
/** @type {[string, () => any[], ((o: any) => boolean) | null][]} */
const STILL = [
  ['stump', () => game.stumps, null], ['tree', () => game.trees, standing], ['cactus', () => game.cacti, null],
  ['boulder', () => game.boulders, null], ['bush', () => game.berryBushes, null], ['grass', () => game.grassList, null],
  ['stick', () => game.sticks, null], ['pebbles', () => game.pebbles, null]
];
/** @param {any[][]} lists */
const stillLists = lists => {
  STILL.forEach(([, listOf], n) => { lists[n] = listOf(); });
  lists[STILL.length] = game.naturalRocks; lists[STILL.length + 1] = game.ironOres; lists[STILL.length + 2] = game.coalOres;
  lists[STILL.length + 3] = game.savannaTiles;
  return lists;
};
// the pictures' size: the shadows' picture's (half the screen's), a power of two, kept while the zoom is within a little of it
let heldShadowRes = 0.5;
const shadowRes = () => {
  const s = Math.max(getViewScale() / 2, 1 / 32), want = Math.min(2, 2 ** Math.ceil(Math.log2(s)));
  if (want !== heldShadowRes && s > heldShadowRes * 0.5 * 0.88 && s < heldShadowRes * 1.12) return heldShadowRes;
  heldShadowRes = want;
  return want;
};
// the sun to a step: a shadow 20 high moves no more than about a screen px a step (the zoom is within twice the
// pictures' size), so every piece on the screen is painted again every few seconds, not every one
const sunStep = () => Math.min(0.5, 0.02 / heldShadowRes);
const stillSun = () => { const sun = getSun(), q = sunStep(); return { dx: Math.round(sun.dx / q) * q, dy: Math.round(sun.dy / q) * q }; };
// (a piece looked at again every second, for a tree felled or grown: a moment late for its shadow is not seen)
const shadowStamps = stamper(stillLists, SHADOW_MARGIN, () => { const sun = stillSun(); return `${sunStep()}:${sun.dx},${sun.dy}`; }, 60);
// what's in and round each piece, by kind, as it was last painted: painted again for the sun, it isn't looked for again
/** @type {Map<string, { things: number | undefined, feet: number[][] }>} */
const stillFeet = new Map();

/** @param {CanvasRenderingContext2D} g @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
function paintStillShadows(g, x0, y0, x1, y1) {
  const size = CHUNK * TILE_SIZE, cx = Math.floor((x0 + x1) / 2 / size), cy = Math.floor((y0 + y1) / 2 / size), key = `${cx},${cy}`;
  const things = shadowStamps.thingsIn(cx, cy);
  let kept = stillFeet.get(key);
  if (!kept || things === undefined || kept.things !== things) {
    const feet = STILL.map(([, listOf, keep]) => {
      /** @type {number[]} */
      const at = [];
      forEachInRect(listOf(), x0 - SHADOW_MARGIN, y0 - SHADOW_MARGIN, x1 + SHADOW_MARGIN, y1 + SHADOW_MARGIN, o => { if (!keep || keep(o)) at.push(o.x, o.y); });
      return at;
    });
    stillFeet.delete(key); stillFeet.set(key, (kept = { things, feet }));
    if (stillFeet.size > 400) stillFeet.delete(/** @type {string} */ (stillFeet.keys().next().value));
  }
  const sun = stillSun(), shadow = new Path2D();
  STILL.forEach(([kind], n) => {
    const [dx, dy, defaultRx, defaultRy] = SHADOWS[kind], at = kept.feet[n];
    for (let i = 0; i < at.length; i += 2) {
      const acacia = kind === 'tree' && thingAt(game.savannaTiles, at[i], at[i + 1]);
      const rx = acacia ? 19 : defaultRx, ry = acacia ? 6 : defaultRy;
      const height = rx * 0.9, ox = sun.dx * height, oy = sun.dy * height;
      const ex = rx + Math.abs(ox) * 0.5, ey = ry + Math.abs(oy) * 0.25;
      const sx = at[i] + dx + ox * 0.5, sy = at[i + 1] + dy + 4 + oy * 0.5;
      shadow.moveTo(sx + ex, sy); shadow.ellipse(sx, sy, ex, ey, 0, 0, Math.PI * 2);
    }
  });
  g.fillStyle = '#000';
  g.fill(shadow);
  paintRockShadows(g, x0, y0, x1, y1, sun);
}

// The still things' shadows into the frame's shadows' picture g (with the world's transform)
/** @param {CanvasRenderingContext2D} g */
export function drawStillShadows(g) {
  shadowStamps.newFrame();
  drawChunks('shadows', shadowRes(), shadowStamps.stamp, paintStillShadows, undefined, g, true);
}

// Trees: saplings growing, grown trees, apple trees with their apples (and the stumps of those felled)
export function drawTrees() {
  if (pictured()) return; // (with the others, in drawCactiBouldersGrassBushes)
  // (before the trees: a tree grown there covers its own stump, a felled one's log covers it)
  if (glReady()) return; // (kept on the graphics card's canvas; their bars with the others', below)
  drawSprites('stump', seenOf(game.stumps));
  drawKind('bush', game.berryBushes, 22);
}

// With nature kept on the graphics card's canvas: the bars of what's being worked (looked for every few ticks), and the
// tufts of grass, which sway (said to the card each frame, over the small things)
function drawOverKeptNature() {
  updateOver();
  for (const [o, width] of over.others) drawHarvestProgress(o, width);
  for (const t of over.trees) if (!t.isGrowing && !t.fallen) { drawHarvestProgress(t); if (t.apple && t.pickShare > 0 && game.pathTick - t.pickTick < 3) drawProgressBar(t.x, t.y, t.pickShare); }
  for (const g of over.grass) drawHarvestProgress(g, 20); // (the tufts themselves are kept on the card, swaying there)
}

export function depthSortedTrees() {
  return pictured() ? [] : seenOf(game.trees);
}

export function drawDepthTree(t) {
  if (!t.isGrowing && !t.fallen) {
    drawOneSprite('tree', t);
    drawTreeNear(t, true);
  } else drawTreeNear(t);
}

// A tree as it is close up (over its picture, standing: only what's changing, its bar)
function drawTreeNear(t, overPicture = false) {
  if (t.isGrowing) {
    drawSaplingArt(t);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(t.x - 10, t.y + 8, 20, 3);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(t.x - 10, t.y + 8, ((t.growProgress || 0) / 20) * 20, 3);
  } else {
    // apple trees: a lighter crown; red apples on it when ripe
    if (!overPicture || t.fallen) drawTreeArt(t);
    drawHarvestProgress(t);
    // apples being picked: pickShare is kept up only while someone is at it
    if (t.apple && t.pickShare > 0 && game.pathTick - t.pickTick < 3) drawProgressBar(t.x, t.y, t.pickShare);
  }
}

// Cacti, boulders, grass and berry bushes
export function drawCactiBouldersGrassBushes() {
  if (pictured()) {
    drawPicturedNature();
    if (tuftsPictured()) {
      drawChunks('tufts', natureRes(), tuftStamps.stamp, paintTufts);
      for (const g of over.grass) drawHarvestProgress(g, 20);
      return;
    }
    drawKind('grass', game.grassList, 20);
    return;
  }
  if (glReady()) { drawOverKeptNature(); return; }
  drawKind('cactus', game.cacti, 24);
  drawKind('boulder', game.boulders, 24); // (a loose, rounded stone, not the square rock that joins up)
  drawKind('grass', game.grassList, 20);
}

// The player's marks on resources: a square around it and a pointer over it, "here" (#232)
// (#322) Which things are marked is looked for in all the lists only every few ticks (the player's marks change
// rarely: a thousand things on the screen were each looked at, list by list, every frame); the marked ones are
// then drawn where they are
const marks = { tick: -Infinity, world: worldEpoch(), list: /** @type {any[]} */ ([]) };
export function drawPriorityMarks() {
  if (marks.world !== worldEpoch()) { marks.world = worldEpoch(); marks.tick = -Infinity; marks.list = []; }
  if (game.pathTick - marks.tick >= 6 || game.pathTick < marks.tick) {
    marks.tick = game.pathTick;
    const lists = [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.loot,
      game.ironOres, game.coalOres, game.naturalRocks, game.farmPlots];
    marks.list = [];
    for (const list of lists) for (const r of list) if (r.priority > 0 && !r.isGrowing && (list !== game.farmPlots || r.growth >= 100)) marks.list.push(r);
  }
  const v = getViewRect(2 * TILE_SIZE);
  const marked = marks.list.filter(r => r.x >= v.x0 && r.x <= v.x1 && r.y >= v.y0 && r.y <= v.y1);
  marked.push(...game.boars.filter(b => b.priority > 0));
  marked.forEach(r => {
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 15, r.y - 15, TILE_SIZE, TILE_SIZE);
    // a small arrow pointing down at it, above the tile (clear of the progress bar)
    ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r.x - 6, r.y - 27); ctx.lineTo(r.x + 6, r.y - 27); ctx.lineTo(r.x, r.y - 18); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}
