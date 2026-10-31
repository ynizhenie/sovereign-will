// The ground: grass, water, rock, desert and ore, each joining its own kind

import { drawIcon } from '../../ui/index.js';
import { BORDER_MARGIN, TILE_SIZE, forEachInRect, game, getTileIndex, listStamp, worldEpoch } from '../../engine/world/index.js';
import { ctx, getViewRect, getViewScale } from '../../engine/platform/index.js';
import { drawHarvestProgress } from '../economy/gathering/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { isContinentMap } from './world.continent.js';

// A few close shades of the base grass color, plus an occasional darker speckle, so the ground
// isn't one flat repeating fill. Picked per-tile from a coordinate hash, not rand(), so it
// stays put across frames without disturbing the seeded world-gen RNG sequence.
export const GRASS_SHADES = ['#2d4a22', '#2f4d25', '#2a4620', '#31501f', '#294419', '#2e4b28'];

export function tileVariantHash(gx, gy) {
  let h = Math.imul(gx, 374761393) + Math.imul(gy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---- The ground in pieces (#299)
//
// What rarely changes is drawn once into pictures of CHUNK x CHUNK tiles and those laid down each frame,
// only the ones on the screen: a picture of a whole big map was too big for a phone, and repainting it all
// for one change too slow. Two sizes of picture: full for zoomed in, half for zoomed out. Kept up to
// MAX_CHUNKS of each, the least recently shown dropped first.
export const CHUNK = 16;
const MAX_CHUNKS = 96;
// (#322) and the pictures of a layer kept no more than this many pixels in all (a sharp piece of the terrain is four times a plain one's)
const MAX_PIXELS = 16e6;

/** @typedef {{ canvas: HTMLCanvasElement, pad: number, pw: number, ph: number, stamp: string, frame: number }} Chunk */
/** @typedef {((cx: number, cy: number) => string) & { dirty?: (cx: number, cy: number) => boolean }} ChunkStamp */
// layer -> its pictures by "res|cx,cy"
/** @type {Map<string, Map<string, Chunk>>} */
const chunkLayers = new Map();

// (#322) Pieces are cached by map chunk. A camera pan can expose many uncached pieces at once,
// so only one detailed chunk is painted per frame; old-size pictures or lightweight previews
// cover the rest until their turn. A ring round the screen is painted ahead when budget allows.
const PAINT_MS = 4;
const AHEAD = 1; // (pieces round the screen painted ahead)
const STILL_PAINTS_PER_FRAME = 4;
// (#306) world px painted past a piece's edge: a patch of grass crossing the edge is whole on either side of it,
// instead of being cut off at it
const PAD = 6;
let frameOf = 0;
let framePaints = 0, framePaintMs = 0, framePaintLimit = STILL_PAINTS_PER_FRAME, framePaintLayer = 'grass', priorityPassed = false;
let previousView = null, previousScale = 0;
let cacheWorldEpoch = -1;
// the last frame's pieces on the screen not laid down from their own picture (0, but as the zoom changes size), and those
// painted on the spot (not ahead: 0 as the camera moves at a walk), for the tests
// `holes` are uncovered base-ground pieces. `pending` also counts chunks still shown from a light preview.
const stats = { holes: 0, late: 0, pending: 0 };
export const chunkStats = () => ({ ...stats });

// The layer's pictures on the screen at resolution res (canvas pixels per world unit), each painted by
// paint(g, x0, y0, x1, y1) when it's new or its stamp(cx, cy) changed
/** @param {string} layer @param {number} res @param {ChunkStamp} stamp @param {Function} paint @param {(x0: number, y0: number, x1: number, y1: number) => void} [preview] */
export function drawChunks(layer, res, stamp, paint, preview) {
  if (typeof document === 'undefined') return;
  const epoch = worldEpoch();
  if (cacheWorldEpoch !== epoch) {
    // Chunk canvases contain map-specific pixels; don't let equal-sized worlds reuse them.
    chunkLayers.clear();
    cacheWorldEpoch = epoch;
    previousView = null; previousScale = 0;
    stats.holes = 0; stats.late = 0; stats.pending = 0;
    // These derived indexes are tied to world lists and may have identical lengths on a new map.
    sandKeys = { n: -1, desert: null, beach: null, keys: new Set() };
    terrainStamps = { lists: [], stamps: new Map() };
    fishy = { lists: [], list: [] };
    spots = { version: -1, list: [], acc: [], at: 0 };
  }
  let chunks = chunkLayers.get(layer);
  if (!chunks) chunkLayers.set(layer, (chunks = new Map()));
  const size = CHUNK * TILE_SIZE, v = getViewRect(), scale = getViewScale();
  if (layer === 'grass') {
    const moving = previousView && (Math.abs(v.x0 - previousView.x0) > 0.5 || Math.abs(v.y0 - previousView.y0) > 0.5 || Math.abs(scale - previousScale) > 0.002);
    previousView = v; previousScale = scale;
    frameOf++; stats.holes = 0; stats.late = 0; stats.pending = 0; framePaints = 0; framePaintMs = 0; framePaintLimit = moving ? 1 : STILL_PAINTS_PER_FRAME; priorityPassed = false;
    const layers = scale < 0.7 ? ['grass', 'terrain', 'nature', 'tufts'] : scale < 0.95 ? ['grass', 'terrain', 'nature'] : ['grass', 'terrain'];
    // While still, let every layer use the remaining paint budget. Rotating priorities
    // is useful only during movement, when a coarse first pass keeps the pan responsive.
    framePaintLayer = moving ? layers[(frameOf - 1) % layers.length] : layers[0];
  } // (the first layer of a frame)
  // (#306) a picture lands on whole screen pixels, and its edge is its neighbour's: no hairline of the ground
  // shows between two pieces, which read as square joins between them
  const m = ctx.getTransform();
  const snapX = x => (Math.round(m.e + m.a * x) - m.e) / m.a, snapY = y => (Math.round(m.f + m.d * y) - m.f) / m.d;
  const blit = (p, x0, y0, x1, y1) => {
    const dx0 = snapX(x0), dy0 = snapY(y0), dw = snapX(x1) - dx0, dh = snapY(y1) - dy0;
    ctx.drawImage(p.canvas, p.pad, p.pad, p.pw, p.ph, dx0, dy0, dw, dh);
  };
  const lastX = Math.ceil(game.COLS / CHUNK) - 1, lastY = Math.ceil(game.ROWS / CHUNK) - 1;
  const cx0 = Math.max(0, Math.floor(v.x0 / size)), cx1 = Math.min(lastX, Math.floor(v.x1 / size));
  const cy0 = Math.max(0, Math.floor(v.y0 / size)), cy1 = Math.min(lastY, Math.floor(v.y1 / size));
  /** @param {number} cx @param {number} cy @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {Chunk | undefined} chunk @param {string} now */
  const painted = (cx, cy, x0, y0, x1, y1, chunk, now) => {
    const startedAt = performance.now();
    const canvas = chunk ? chunk.canvas : document.createElement('canvas');
    const pad = Math.ceil(PAD * res), bleed = pad / res;
    const pw = Math.ceil((x1 - x0) * res), ph = Math.ceil((y1 - y0) * res);
    canvas.width = pw + pad * 2; canvas.height = ph + pad * 2;
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    g.setTransform(res, 0, 0, res, pad - x0 * res, pad - y0 * res);
    paint(g, x0 - bleed, y0 - bleed, x1 + bleed, y1 + bleed);
    framePaintMs += performance.now() - startedAt;
    return { canvas, pad, pw, ph, stamp: now, frame: frameOf };
  };
  // the screen's pieces first (a changed one repainted before any painting ahead), then the ring round it
  for (const ahead of [false, true]) {
    for (let cy = Math.max(0, cy0 - AHEAD); cy <= Math.min(lastY, cy1 + AHEAD); cy++) {
      for (let cx = Math.max(0, cx0 - AHEAD); cx <= Math.min(lastX, cx1 + AHEAD); cx++) {
        const shown = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
        if (shown === ahead) continue;
        const key = `${res}|${cx},${cy}`;
        let chunk = chunks.get(key);
        const x0 = cx * size, y0 = cy * size, x1 = Math.min(game.WORLD_WIDTH, x0 + size), y1 = Math.min(game.WORLD_HEIGHT, y0 + size);
        const free = framePaints < framePaintLimit && framePaintMs < PAINT_MS && (layer === framePaintLayer || priorityPassed);
        const invalidated = typeof stamp.dirty === 'function' && stamp.dirty(cx, cy);
        // (off the screen: only painted ahead while there's time this frame, and its stamp only worked out then)
        if (!shown) {
          if (free) {
            const now = `${game.COLS}x${game.ROWS}|${stamp(cx, cy)}`;
            if (!chunk || chunk.stamp !== now) { chunks.delete(key); chunks.set(key, painted(cx, cy, x0, y0, x1, y1, chunk, now)); framePaints++; }
            else if (chunk) chunk.frame = frameOf;
          }
          else if (chunk) chunk.frame = frameOf;
          continue;
        }
        if (chunk) chunks.delete(key); // (to the end: the most recently shown)
        if (!free) {
          if (chunk && !invalidated) {
            chunk.frame = frameOf; chunks.set(key, chunk); blit(chunk, x0, y0, x1, y1);
          } else {
            // A quick pan can expose dozens of uncached pieces at once. Don't even stamp
            // or rasterize each one this frame: preview it until its turn in the queue.
            // An invalidated overlay is left off the screen rather than showing a removed thing.
            if (preview) preview(x0, y0, x1, y1);
            stats.pending++;
            // Nature and tufts are overlays on the already painted ground. Only a missing base layer
            // without its own fallback leaves a visible hole.
            if (!preview && (layer === 'grass' || layer === 'terrain')) stats.holes++;
          }
          continue;
        }
        const now = `${game.COLS}x${game.ROWS}|${stamp(cx, cy)}`;
        if (!chunk || chunk.stamp !== now) { chunks.delete(key); chunks.set(key, (chunk = painted(cx, cy, x0, y0, x1, y1, chunk, now))); framePaints++; stats.late++; }
        if (chunk) { chunk.frame = frameOf; chunks.set(key, chunk); blit(chunk, x0, y0, x1, y1); }
      }
    }
  }
  if (layer === framePaintLayer) priorityPassed = true;
  // the least recently shown dropped past the budget, never one this frame has (on the screen or just round it)
  let pixels = 0;
  for (const c of chunks.values()) pixels += c.canvas.width * c.canvas.height;
  for (const [key, c] of chunks) {
    if (chunks.size <= MAX_CHUNKS && pixels <= MAX_PIXELS) break;
    if (c.frame === frameOf) continue;
    pixels -= c.canvas.width * c.canvas.height;
    chunks.delete(key);
  }
}

// full-size pictures zoomed in, half zoomed out
// (#306) How fine a piece is painted: about what the screen shows, and no finer (a power of two, so a piece
// isn't painted again for every little change of zoom). Zoomed out to the whole map it used to paint and lay
// down sixteen times the pixels that showed, which was most of what that view cost
// (#322) and a size is kept while the zoom is within a little of it (a hair either side of a threshold painted two sizes in turn, and
// the whole screen of pieces again each time)
let heldRes = 1;
const chunkRes = () => {
  const s = Math.max(getViewScale(), 0.0625), want = Math.min(1, 2 ** Math.floor(Math.log2(s)));
  if (want !== heldRes && s / heldRes > 0.88 && s / heldRes < 2.3) return Math.min(1, heldRes);
  heldRes = want;
  return want;
};
// (#322) The terrain's pieces are laid down at every zoom (what's drawn tile by tile each frame, with its gradients and rounded
// corners, was most of what a view of lake or desert cost): as fine as the screen shows, up to twice a world unit
let heldTerrain = 1;
const terrainRes = () => {
  const s = getViewScale();
  let want = s < 0.7 ? chunkRes() : s >= 1.35 ? 2 : 1;
  // (a size is kept within a band of a tenth or so round each threshold)
  if (heldTerrain === 2 && s > 1.2) want = 2;
  else if (heldTerrain === 1 && s >= 0.62 && s < 1.5) want = 1;
  heldTerrain = want;
  return want;
};

// The grass (#251: per-tile shades read as a grid): one green under everything, soft patches of the close
// shades over it, crossing the tiles' edges, and a tuft or a speckle here and there. It never changes
// (the patches of the tiles round a piece too, for those spilling into it: the same either side of its edge)
function paintGrass(g, x0, y0, x1, y1) {
  g.fillStyle = '#2d4a22'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  // (#326: whole tiles: with the piece's bleed its edge isn't on one, and fractional tiles drew other patches
  // than the piece beside it, a seam between them)
  const gx0 = Math.max(0, Math.floor(x0 / TILE_SIZE) - 1), gx1 = Math.min(game.COLS - 1, Math.ceil(x1 / TILE_SIZE));
  const gy0 = Math.max(0, Math.floor(y0 / TILE_SIZE) - 1), gy1 = Math.min(game.ROWS - 1, Math.ceil(y1 / TILE_SIZE));
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const hsh = tileVariantHash(gx, gy), x = gx * TILE_SIZE, y = gy * TILE_SIZE;
      // two patches, anywhere in the tile and spilling out of it
      for (let k = 0; k < 2; k++) {
        const v = k ? hsh >>> 11 : hsh;
        g.globalAlpha = 0.45 + (v % 5) * 0.06;
        g.fillStyle = GRASS_SHADES[(v >>> 3) % GRASS_SHADES.length];
        g.beginPath();
        g.ellipse(x + (v >>> 6) % TILE_SIZE, y + (v >>> 9) % TILE_SIZE, 9 + (v >>> 12) % 12, 7 + (v >>> 15) % 10, ((v >>> 18) % 6) / 2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      if (hsh % 5 === 0) {
        // a tuft: a few blades
        const tx = x + 6 + (hsh >>> 7) % 18, ty = y + 10 + (hsh >>> 13) % 14;
        g.strokeStyle = hsh % 2 ? 'rgba(90, 140, 60, 0.55)' : 'rgba(20, 35, 15, 0.45)'; g.lineWidth = 1;
        g.beginPath();
        for (const dx of [-2, 0, 2]) { g.moveTo(tx + dx, ty); g.lineTo(tx + dx * 1.6, ty - 4 - Math.abs(dx)); }
        g.stroke();
      } else if (hsh % 7 === 0) {
        g.fillStyle = 'rgba(0, 0, 0, 0.1)';
        g.fillRect(x + 4 + ((hsh >>> 8) % (TILE_SIZE - 10)), y + 4 + ((hsh >>> 14) % (TILE_SIZE - 10)), 3, 3);
      }
    }
  }
}

export function drawGrassGround() {
  drawChunks('grass', chunkRes(), () => '', paintGrass, (x0, y0, x1, y1) => {
    ctx.fillStyle = '#2d4a22'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  });
}

// ---- Terrain that joins up
//
// Water joins water, natural rock joins rock and ore: every tile covers its whole square, and gets an
// outline only on sides with no neighbour of its kind, so lakes and rock masses read as shapes instead
// of a grid of separate squares. Shades and details vary per tile (tileVariantHash).
export const WATER_SHADES = ['#2c83bd', '#2a80b9', '#2d85be', '#2a7db5'];
export const ROCK_SHADES = ['#34495e', '#33475b', '#364b60', '#32465a', '#354a5f'];
export const DESERT_SHADES = ['#c9a66b', '#cba96f', '#c7a468', '#cdab72'];

// (#298) where the tile functions below draw: the screen, or the terrain's picture while it's painted
/** @type {CanvasRenderingContext2D | null} */
let target = null;
// how far (world px) a tile's ground is painted past its sides, so no seam shows between two: half a pixel, or a
// whole pixel of a small picture (#326)
let over = 0.5;

// Which sides (and corners) of tile (x, y) have no neighbour in `keys` (a Set of "x,y" tile centres). Past the
// map's edge counts as a neighbour: (#326) the sea round a continent had a light rim along the map's edge
export function openSides(keys, x, y) {
  const T = TILE_SIZE;
  const open = (kx, ky) => kx >= 0 && ky >= 0 && kx < game.WORLD_WIDTH && ky < game.WORLD_HEIGHT && !keys.has(`${kx},${ky}`);
  return {
    n: open(x, y - T), s: open(x, y + T), w: open(x - T, y), e: open(x + T, y),
    nw: open(x - T, y - T), ne: open(x + T, y - T), sw: open(x - T, y + T), se: open(x + T, y + T)
  };
}

// (#307) a mass of tiles' outer corners rounded: a corner with no neighbour on either side of it
const CORNER = 7;
export function cornerRadii(open, occupiedCorners = {}) {
  return {
    nw: open.n && open.w && open.nw && !occupiedCorners.nw ? CORNER : 0,
    ne: open.n && open.e && open.ne && !occupiedCorners.ne ? CORNER : 0,
    se: open.s && open.e && open.se && !occupiedCorners.se ? CORNER : 0,
    sw: open.s && open.w && open.sw && !occupiedCorners.sw ? CORNER : 0
  };
}

function terrainCornerOccupancy(x, y, tiles) {
  const sand = getSandKeys(), has = (dx, dy) => {
    const key = `${x + dx * TILE_SIZE},${y + dy * TILE_SIZE}`;
    return tiles.water.has(key) || tiles.rockAndOre.has(key) || sand.has(key);
  };
  return { nw: has(-1, -1), ne: has(1, -1), se: has(1, 1), sw: has(-1, 1) };
}

function drawJoinedTileOutline(x, y, open, edgeColor, occupiedCorners) {
  const G = target || ctx;
  const k = cornerRadii(open, occupiedCorners), x0 = x - 15, y0 = y - 15, x1 = x + 15, y1 = y + 15;
  G.strokeStyle = edgeColor; G.lineWidth = 2;
  G.beginPath();
  if (open.n) { G.moveTo(x0 + k.nw, y0 + 1); G.lineTo(x1 - k.ne, y0 + 1); }
  if (open.s) { G.moveTo(x0 + k.sw, y1 - 1); G.lineTo(x1 - k.se, y1 - 1); }
  if (open.w) { G.moveTo(x0 + 1, y0 + k.nw); G.lineTo(x0 + 1, y1 - k.sw); }
  if (open.e) { G.moveTo(x1 - 1, y0 + k.ne); G.lineTo(x1 - 1, y1 - k.se); }
  for (const [r, cx, cy, from] of [[k.nw, x0 + k.nw, y0 + k.nw, Math.PI], [k.ne, x1 - k.ne, y0 + k.ne, Math.PI * 1.5], [k.se, x1 - k.se, y1 - k.se, 0], [k.sw, x0 + k.sw, y1 - k.sw, Math.PI / 2]]) {
    if (!r) continue;
    G.moveTo(cx + Math.cos(from) * (r - 1), cy + Math.sin(from) * (r - 1));
    G.arc(cx, cy, r - 1, from, from + Math.PI / 2);
  }
  G.stroke();
  G.fillStyle = edgeColor;
  if (!open.n && !open.w && open.nw) G.fillRect(x0, y0, 2, 2);
  if (!open.n && !open.e && open.ne) G.fillRect(x1 - 2, y0, 2, 2);
  if (!open.s && !open.w && open.sw) G.fillRect(x0, y1 - 2, 2, 2);
  if (!open.s && !open.e && open.se) G.fillRect(x1 - 2, y1 - 2, 2, 2);
}

// The whole tile in its shade, with an outline just inside the sides that have no neighbour of its kind.
// (#307) Its outer corners rounded (and the outline round them), and where its two sides have neighbours but
// the corner between doesn't, the outline's ends joined (there was a gap there, a notch of the tile's shade)
export function drawJoinedTile(x, y, open, edgeColor, fillColor, outline = true, occupiedCorners = {}) {
  const G = target || ctx;
  const k = cornerRadii(open, occupiedCorners), x0 = x - 15, y0 = y - 15;
  // Half a pixel over every side prevents light sand showing through soft edges when zoomed in (#251).
  G.fillStyle = fillColor;
  if (k.nw || k.ne || k.se || k.sw) { G.beginPath(); G.roundRect(x0 - over, y0 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2, [k.nw, k.ne, k.se, k.sw]); G.fill(); }
  else G.fillRect(x0 - over, y0 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2);
  if (outline) drawJoinedTileOutline(x, y, open, edgeColor, occupiedCorners);
}

// (#307) where land meets water or sand meets grass: a soft band, fading out from the tile's open sides
// (`inside`: into the tile itself, clipped to its shape), its colour `rgb` at alpha `a` at the edge. `which`:
// the open sides to band (a side's neighbour of the right kind)
function edgeBand(G, x, y, open, which, rgb, a, width, inside, occupiedCorners = {}) {
  const x0 = x - 15, y0 = y - 15, T = TILE_SIZE, k = cornerRadii(open, occupiedCorners);
  const band = (gx0, gy0, gx1, gy1, rx, ry, rw, rh) => {
    const g = G.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, `rgba(${rgb}, ${a})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
    G.fillStyle = g; G.fillRect(rx, ry, rw, rh);
  };
  if (inside) { G.save(); G.beginPath(); G.roundRect(x0 - over, y0 - over, T + over * 2, T + over * 2, [k.nw, k.ne, k.se, k.sw]); G.clip(); } // (its half pixel over too)
  const d = inside ? width : -width;
  // (outside, kept off the rounded corners: a quarter of a ring goes round each)
  const cut = c => (inside ? 0 : c);
  const o = inside ? 0.5 : 0; // (inside: from its half pixel over)
  if (which.n) band(x, y0 - o, x, y0 + d, x0 + cut(k.nw) - o, inside ? y0 - o : y0 - width, T - cut(k.nw) - cut(k.ne) + 2 * o, width + o);
  if (which.s) band(x, y0 + T + o, x, y0 + T - d, x0 + cut(k.sw) - o, inside ? y0 + T - width : y0 + T, T - cut(k.sw) - cut(k.se) + 2 * o, width + o);
  if (which.w) band(x0 - o, y, x0 + d, y, inside ? x0 - o : x0 - width, y0 + cut(k.nw) - o, width + o, T - cut(k.nw) - cut(k.sw) + 2 * o);
  if (which.e) band(x0 + T + o, y, x0 + T - d, y, inside ? x0 + T - width : x0 + T, y0 + cut(k.ne) - o, width + o, T - cut(k.ne) - cut(k.se) + 2 * o);
  if (inside) G.restore();
  else {
    // round its rounded corners outside: a quarter of a ring
    for (const [r, cx, cy, from, on] of [[k.nw, x0 + k.nw, y0 + k.nw, Math.PI, which.n && which.w], [k.ne, x0 + T - k.ne, y0 + k.ne, Math.PI * 1.5, which.n && which.e],
      [k.se, x0 + T - k.se, y0 + T - k.se, 0, which.s && which.e], [k.sw, x0 + k.sw, y0 + T - k.sw, Math.PI / 2, which.s && which.w]]) {
      if (!r || !on) continue;
      const g = G.createRadialGradient(cx, cy, r, cx, cy, r + width);
      g.addColorStop(0, `rgba(${rgb}, ${a})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
      G.fillStyle = g; G.beginPath();
      G.arc(cx, cy, r + width, from, from + Math.PI / 2);
      G.arc(cx, cy, r, from + Math.PI / 2, from, true);
      G.closePath(); G.fill();
    }
  }
}

// The sand tiles (desert and beach) as keys, worked out again when there are more or fewer of them
/** @type {{ n: number, desert: typeof game.desertTiles | null, beach: typeof game.beachTiles | null, keys: Set<string> }} */
let sandKeys = { n: -1, desert: null, beach: null, keys: new Set() };
function getSandKeys() {
  const n = game.desertTiles.length * 100003 + game.beachTiles.length;
  if (sandKeys.n !== n || sandKeys.desert !== game.desertTiles || sandKeys.beach !== game.beachTiles) {
    sandKeys = { n, desert: game.desertTiles, beach: game.beachTiles, keys: new Set([...game.desertTiles, ...game.beachTiles].map(t => `${t.x},${t.y}`)) };
  }
  return sandKeys.keys;
}

export function drawWaterTile(w, tiles) {
  const G = target || ctx;
  const h = tileVariantHash(w.x, w.y);
  const open = openSides(tiles.water, w.x, w.y);
  const occupiedCorners = terrainCornerOccupancy(w.x, w.y, tiles);
  drawJoinedTile(w.x, w.y, open, '#2c83bd', WATER_SHADES[0], false, occupiedCorners);
  const land = side => open[side] && !tiles.rockAndOre.has(`${w.x + ({ w: -30, e: 30 }[side] || 0)},${w.y + ({ n: -30, s: 30 }[side] || 0)}`);
  const shore = { n: land('n'), s: land('s'), w: land('w'), e: land('e') };
  edgeBand(G, w.x, w.y, open, shore, '190, 230, 245', 0.24, 8, true, occupiedCorners);
  edgeBand(G, w.x, w.y, open, shore, '44, 131, 189', 0.16, 7, false, occupiedCorners);
  // a short light ripple on some tiles
  if (h % 3 === 0) {
    G.strokeStyle = 'rgba(255, 255, 255, 0.18)'; G.lineWidth = 1.5;
    const rx = w.x - 6 + ((h >>> 5) % 10), ry = w.y - 6 + ((h >>> 9) % 12);
    G.beginPath(); G.arc(rx, ry + 4, 5, Math.PI * 1.15, Math.PI * 1.85); G.stroke();
  }
}

// Natural rock (and the rock under ore): joins every rock and ore tile around it
export function drawRockTile(x, y, tiles) {
  const G = target || ctx;
  const h = tileVariantHash(x, y), open = openSides(tiles.rockAndOre, x, y);
  const edgeColor = '#1a252f', occupiedCorners = terrainCornerOccupancy(x, y, tiles), k = cornerRadii(open, occupiedCorners);
  drawJoinedTile(x, y, open, edgeColor, ROCK_SHADES[h % ROCK_SHADES.length], false, occupiedCorners);
  G.save(); G.beginPath();
  G.roundRect(x - 15 - over, y - 15 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2, [k.nw, k.ne, k.se, k.sw]);
  G.clip();
  // facets of the rock face, a little lighter, and a lit top edge and shaded bottom edge where the mass
  // ends (#251: flat squares)
  G.fillStyle = 'rgba(255, 255, 255, 0.07)';
  for (let k = 0; k < 2; k++) {
    const v = h >>> (k * 9), fx = x - 12 + (v % 14), fy = y - 12 + ((v >>> 4) % 14);
    G.beginPath(); G.moveTo(fx, fy); G.lineTo(fx + 8 + (v % 4), fy + 2); G.lineTo(fx + 5, fy + 8 + ((v >>> 2) % 3)); G.lineTo(fx - 1, fy + 5); G.closePath(); G.fill();
  }
  if (open.n) { G.fillStyle = 'rgba(255, 255, 255, 0.12)'; G.fillRect(x - 13 + Math.max(0, k.nw - 2), y - 13, TILE_SIZE - 4 - Math.max(0, k.nw - 2) - Math.max(0, k.ne - 2), 3); }
  if (open.s) { G.fillStyle = 'rgba(0, 0, 0, 0.25)'; G.fillRect(x - 13 + Math.max(0, k.sw - 2), y + 9, TILE_SIZE - 4 - Math.max(0, k.sw - 2) - Math.max(0, k.se - 2), 4); }
  // a crack or a couple of speckles
  if (h % 4 === 0) {
    G.strokeStyle = 'rgba(0, 0, 0, 0.25)'; G.lineWidth = 1;
    const cx = x - 7 + ((h >>> 6) % 12), cy = y - 7 + ((h >>> 11) % 12);
    G.beginPath(); G.moveTo(cx, cy); G.lineTo(cx + 4, cy + 3); G.lineTo(cx + 3, cy + 8); G.stroke();
  } else if (h % 4 === 1) {
    G.fillStyle = 'rgba(255, 255, 255, 0.06)';
    G.fillRect(x - 8 + ((h >>> 6) % 14), y - 8 + ((h >>> 11) % 14), 3, 3);
    G.fillRect(x - 4 + ((h >>> 16) % 10), y - 2 + ((h >>> 20) % 10), 2, 2);
  }
  G.restore();
  drawJoinedTileOutline(x, y, open, edgeColor, occupiedCorners);
}

export function drawDesertTile(tile) {
  const G = target || ctx;
  const h = tileVariantHash(tile.x, tile.y);
  // (#307) its outer corners rounded, and where grass meets it, the sand thinning out into it
  const tiles = getTileIndex(), occupiedCorners = terrainCornerOccupancy(tile.x, tile.y, tiles);
  const open = openSides(getSandKeys(), tile.x, tile.y), k = cornerRadii(open, occupiedCorners), shade = DESERT_SHADES[h % DESERT_SHADES.length];
  G.fillStyle = shade;
  if (k.nw || k.ne || k.se || k.sw) { G.beginPath(); G.roundRect(tile.x - 15 - over, tile.y - 15 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2, [k.nw, k.ne, k.se, k.sw]); G.fill(); }
  else G.fillRect(tile.x - 15 - over, tile.y - 15 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2);
  const n = parseInt(shade.slice(1), 16), rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
  edgeBand(G, tile.x, tile.y, open, open, rgb, 0.85, 7, false, occupiedCorners);
  G.fillStyle = 'rgba(255, 236, 179, 0.25)';
  if (h % 3 === 0) {
    // a dune ripple
    G.strokeStyle = 'rgba(120, 90, 40, 0.25)'; G.lineWidth = 1;
    const ry = tile.y - 6 + ((h >>> 7) % 12);
    G.beginPath(); G.moveTo(tile.x - 10, ry); G.quadraticCurveTo(tile.x, ry - 4, tile.x + 10, ry); G.stroke();
  } else {
    G.fillRect(tile.x - 10 + ((h >>> 5) % 16), tile.y - 8 + ((h >>> 9) % 14), 3, 2);
    G.fillRect(tile.x - 6 + ((h >>> 13) % 14), tile.y - 4 + ((h >>> 17) % 14), 2, 2);
  }
}

// Rock with ore veins, shared by ore tiles and ore spawners so they read as the same material.
// half: half the square's size (a full rock tile is 14)
export const ORE_COLORS = {
  iron: { body: '#aab7c3', shine: '#dfe6ed' }, // (#298: the old silver-grey again)
  coal: { body: '#050608', shine: '#6b7785' }
};

export function drawOreVeins(x, y, kind, half) {
  const G = target || ctx;
  const c = ORE_COLORS[kind];
  const k = half / 14;
  drawRockTile(x, y, getTileIndex());
  G.fillStyle = c.body;
  G.fillRect(x - 10 * k, y - 10 * k, 8 * k, 8 * k); G.fillRect(x + 1 * k, y - 5 * k, 9 * k, 9 * k); G.fillRect(x - 7 * k, y + 3 * k, 7 * k, 7 * k);
  G.fillStyle = c.shine;
  G.fillRect(x - 8 * k, y - 8 * k, 3 * k, 3 * k); G.fillRect(x + 4 * k, y - 2 * k, 3 * k, 3 * k); G.fillRect(x - 5 * k, y + 5 * k, 2 * k, 2 * k);
}

// Spawner: the same veined rock on a full tile, framed in the ore colour with a large crystal in the middle
export function drawOreSpawner(x, y, kind) {
  const G = target || ctx;
  const c = ORE_COLORS[kind];
  drawOreVeins(x, y, kind, 14);
  G.strokeStyle = c.body; G.lineWidth = 2; G.strokeRect(x - 11, y - 11, 22, 22);
  G.fillStyle = c.body;
  G.beginPath(); G.moveTo(x, y - 7); G.lineTo(x + 5, y); G.lineTo(x, y + 7); G.lineTo(x - 5, y); G.closePath(); G.fill();
  G.fillStyle = c.shine; G.fillRect(x - 1, y - 4, 2, 4);
}

// (#299) zoomed out this frame: rock, ore and their spawners are in the ground's pictures, not drawn one by one
export const isGroundCached = () => cached;

// The border zone round the map, and the line where it starts
export function drawMapBorder() {
  if (isContinentMap()) return; // (#326: a continent's edge is the sea, no strip or line round it)
  // (#299: only the part of it on the screen)
  const v = getViewRect(TILE_SIZE), M = BORDER_MARGIN * TILE_SIZE, W = game.WORLD_WIDTH, H = game.WORLD_HEIGHT;
  if (v.x0 > M && v.y0 > M && v.x1 < W - M && v.y1 < H - M) return;
  ctx.save(); ctx.beginPath(); ctx.rect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0); ctx.clip();
  if (game.gameMode !== 'battle') { // (in a battle the ground outside the line is the field's: grass or sand)
    ctx.fillStyle = '#2d4a22';
    ctx.fillRect(0, 0, game.WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
    ctx.fillRect(0, game.WORLD_HEIGHT - BORDER_MARGIN * TILE_SIZE, game.WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
    ctx.fillRect(0, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, game.WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
    ctx.fillRect(game.WORLD_WIDTH - BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, game.WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
  }

  ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, game.WORLD_WIDTH - 2 * BORDER_MARGIN * TILE_SIZE, game.WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
  ctx.restore();
}

// Desert and beach sand
// (#298) the ground that rarely changes (sand, water, natural rock): zoomed out, where thousands of tiles
// show, drawn into pictures (#299: in pieces, drawChunks) laid down each frame, a piece painted again only
// when a tile in it or next to it changes. (#322: at every zoom now; zoomed in it drew the tiles on screen one by one every
// frame, gradients and rounded corners each.) Zoomed out it drew every tile every frame: 180 fps down to 70
let view = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, cached = false;
const isRock = r => !r.oreSpawner;
const terrainLists = () => [game.desertTiles, game.beachTiles, game.waterTiles, game.naturalRocks, game.ironOres, game.coalOres];

// What the terrain in and round a piece is like (any tile of it coming or going changes it); worked out
// again only when one of the lists changed
/** @type {{ lists: any[], stamps: Map<string, string> }} */
let terrainStamps = { lists: [], stamps: new Map() };
function terrainStamp(cx, cy) {
  const lists = terrainLists().flatMap(listStamp);
  if (lists.length !== terrainStamps.lists.length || lists.some((v, i) => v !== terrainStamps.lists[i])) terrainStamps = { lists, stamps: new Map() };
  const key = `${cx},${cy}`;
  let stamp = terrainStamps.stamps.get(key);
  if (stamp === undefined) {
    const size = CHUNK * TILE_SIZE, x0 = cx * size - TILE_SIZE, y0 = cy * size - TILE_SIZE;
    let h = 0;
    terrainLists().forEach((list, n) => forEachInRect(list, x0, y0, x0 + size + 2 * TILE_SIZE, y0 + size + 2 * TILE_SIZE, o => {
      h = (h * 31 + o.x * 7919 + o.y * 31 + n + (o.oreSpawner ? 1 : 0)) | 0;
    }));
    terrainStamps.stamps.set(key, (stamp = String(h)));
  }
  return stamp;
}

// The tiles of a list round a piece, in rows (the same order whichever piece paints them: no seam)
function tilesAround(list, x0, y0, x1, y1) {
  const found = [];
  forEachInRect(list, x0 - TILE_SIZE, y0 - TILE_SIZE, x1 + TILE_SIZE, y1 + TILE_SIZE, o => { found.push(o); });
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}

function paintTerrain(g, x0, y0, x1, y1) {
  const terrain = getTileIndex();
  target = g;
  over = Math.max(0.5, 1 / g.getTransform().a); // (#326: a whole pixel over at a small picture's size: no grid of seams)
  try {
    tilesAround(game.desertTiles, x0, y0, x1, y1).forEach(drawDesertTile);
    tilesAround(game.beachTiles, x0, y0, x1, y1).forEach(drawDesertTile);
    tilesAround(game.waterTiles, x0, y0, x1, y1).forEach(t => drawWaterTile(t, terrain));
    tilesAround(game.naturalRocks, x0, y0, x1, y1).forEach(r => { if (isRock(r)) drawRockTile(r.x, r.y, terrain); else drawOreSpawner(r.x, r.y, r.oreSpawner); });
    tilesAround(game.ironOres, x0, y0, x1, y1).forEach(o => drawOreVeins(o.x, o.y, 'iron', 14));
    tilesAround(game.coalOres, x0, y0, x1, y1).forEach(o => drawOreVeins(o.x, o.y, 'coal', 14));
  } finally { target = null; over = 0.5; }
}

// A fast panning placeholder keeps the map's main land/water/sand shapes visible while
// the detailed chunk waits its turn in drawChunks' per-frame paint queue.
function previewTerrain(x0, y0, x1, y1) {
  const paintTiles = (list, color) => {
    ctx.fillStyle = color;
    forEachInRect(list, x0 - TILE_SIZE, y0 - TILE_SIZE, x1 + TILE_SIZE, y1 + TILE_SIZE, o => {
      ctx.fillRect(o.x - TILE_SIZE / 2, o.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    });
  };
  paintTiles(game.desertTiles, '#c9a66b');
  paintTiles(game.beachTiles, '#c9a66b');
  paintTiles(game.waterTiles, '#2c83bd');
  paintTiles(game.naturalRocks, '#34495e');
  paintTiles(game.ironOres, '#34495e');
  paintTiles(game.coalOres, '#34495e');
}

const inView = (list, fn) => forEachInRect(list, view.x0, view.y0, view.x1, view.y1, fn);

export function drawSand() {
  // this frame: zoomed out (the pictures), or the tiles on screen (with a tile's margin)
  view = getViewRect(TILE_SIZE);
  cached = typeof document !== 'undefined';
  if (cached) { drawChunks('terrain', terrainRes(), terrainStamp, paintTerrain, previewTerrain); return; }
  inView(game.desertTiles, drawDesertTile);
  inView(game.beachTiles, drawDesertTile);
}

// (#322) Zoomed out, where the tiles are in the pictures, a frame went through every water tile on the screen to find the few with a fish
// or a fishing spot. The tiles that may have a fish are found from the list of the water once, till the list changes (they never
// move); the fishing spots (the player puts and takes them) are looked for among the water every few ticks, a flag read each, not worked out
/** @type {{ lists: any[], list: any[] }} */
let fishy = { lists: [], list: [] };
/** @type {{ version: number, list: any[], acc: any[], at: number }} */
let spots = { version: -1, list: [], acc: [], at: 0 };
// a fishing spot marked or taken off (the player's tap): looked for at once; others set from elsewhere are found within a second
let fishingVersion = 0;
export function markFishingChanged() { fishingVersion++; }
// a sine from a table (a fish's swimming: a thousand of them a frame, a hundred-odd times a second)
const SINE = Array.from({ length: 256 }, (_, i) => Math.sin(i / 256 * Math.PI * 2));
const sinOf = x => SINE[((x * (256 / (Math.PI * 2))) & 255)];
const mayHaveFish = w => tileVariantHash(w.x, w.y) % 7 === 0;
function fishyWater() {
  const lists = listStamp(game.waterTiles);
  if (lists.length !== fishy.lists.length || lists.some((v, i) => v !== fishy.lists[i])) fishy = { lists, list: game.waterTiles.filter(mayHaveFish) };
  return fishy.list;
}
const SPOTS_PER_FRAME = 1500;
function fishingSpots() {
  const water = game.waterTiles;
  if (spots.version !== fishingVersion) spots = { version: fishingVersion, list: water.filter(w => w.isFishing), acc: [], at: 0 }; // (a tap: at once)
  // (a bit of the water a frame, round and round: a spot set from elsewhere shows within a second or two, and no frame goes through all of it)
  const end = Math.min(water.length, spots.at + SPOTS_PER_FRAME);
  for (let i = spots.at; i < end; i++) if (water[i].isFishing) spots.acc.push(water[i]);
  spots.at = end;
  if (spots.at >= water.length) { spots.list = spots.acc; spots.acc = []; spots.at = 0; }
  return spots.list;
}

// Water, and the fishing spots marked on it
export function drawWater(terrain) {
  // (#306) zoomed out a fish is under a pixel: the shoals are drawn only when there's room to see them
  const scale = getViewScale(), fishShown = scale >= 0.45;
  // (#322) fewer of them the farther out: every 14th water tile's, every 28th's... no more than the eye can tell apart; one clock read a frame, not one a fish
  const fishEvery = scale >= 0.9 ? 7 : scale >= 0.6 ? 14 : 28, clock = performance.now() / 850;
  ctx.fillStyle = 'rgba(18, 67, 91, 0.82)';
  const each = cached
    ? (/** @type {(w: any) => void} */ fn) => { if (fishShown) forEachInRect(fishyWater(), view.x0, view.y0, view.x1, view.y1, fn); for (const w of fishingSpots()) if (!mayHaveFish(w) && w.x >= view.x0 && w.x <= view.x1 && w.y >= view.y0 && w.y <= view.y1) fn(w); }
    : (/** @type {(w: any) => void} */ fn) => inView(game.waterTiles, fn);
  each(w => {
    if (!cached) drawWaterTile(w, terrain);
    const hash = tileVariantHash(w.x, w.y);
    // (#322) a shoal is one path and one fill, no save and restore (ten canvas calls each, a thousand of them on a big lake), and not
    // nor all of them when the view's wide: the fish that show are enough
    if (fishShown && (hash % 7 === 0) && (hash % fishEvery === 0) && (w.fishCount ?? GAME_CONFIG.fishing.fishCapacity) > 0) {
      const phase = clock + (hash % 100) / 13;
      const swim = sinOf(phase) * 6, f = sinOf(phase + 1.5708) < 0 ? -1 : 1;
      const fx = w.x + swim, fy = w.y + sinOf(phase * 0.7 + 1.5708) * 3;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 4, 2, 0, 0, Math.PI * 2);
      ctx.moveTo(fx - 3 * f, fy); ctx.lineTo(fx - 6 * f, fy - 2); ctx.lineTo(fx - 6 * f, fy + 2); ctx.closePath();
      ctx.fill();
    }
    if (w.isFishing) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3;
      ctx.strokeRect(w.x - 14, w.y - 14, 28, 28);
      drawIcon(ctx, 'rod', w.x, w.y, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(w.x - 14, w.y - 22, 28, 4);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(w.x - 13, w.y - 21, 26 * Math.min(1, (w.fishTimer || 0) / 3), 2);
      ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 1;
      ctx.strokeRect(w.x - 14, w.y - 22, 28, 4);
    }
  });
}

// Natural rock and ore spawners
export function drawRocks(terrain) {
  inView(game.naturalRocks, r => {
    if (cached) { drawHarvestProgress(r, 36); return; } // (the rock itself in the pictures)
    if (r.oreSpawner) {
      drawOreSpawner(r.x, r.y, r.oreSpawner);
    } else {
      drawRockTile(r.x, r.y, terrain);
    }
    drawHarvestProgress(r, 36);
  });
}
