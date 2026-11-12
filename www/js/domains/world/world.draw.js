// The ground: grass, water, rock, desert and ore, each joining its own kind

import { drawIcon } from '../../ui/index.js';
import { BORDER_MARGIN, TILE_SIZE, forEachInRect, game, getTileIndex, listStamp, townHall, worldEpoch } from '../../engine/world/index.js';
import { camera, canvas, ctx, getViewRect, getViewScale } from '../../engine/platform/index.js';
import { drawHarvestProgress } from '../economy/gathering/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { isContinentMap } from './world.continent.js';
import { areShadowsEnabled, getSun, MIN_SHADOW_ALPHA } from './world.daytime.js';

// A few close shades of the base grass color, plus an occasional darker speckle, so the ground
// isn't one flat repeating fill. Picked per-tile from a coordinate hash, not rand(), so it
// stays put across frames without disturbing the seeded world-gen RNG sequence.
export const GRASS_SHADES = ['#2d4a22', '#2f4d25', '#2a4620', '#31501f', '#294419', '#2e4b28'];
const SAVANNA_GRASS_BASE = '#77763a';
const SAVANNA_GRASS_SHADES = ['#79793d', '#7b7c3d', '#747236', '#7b7c37', '#737034', '#787741'];

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

/** @typedef {{ canvas: HTMLCanvasElement, pad: number, pw: number, ph: number, stamp: string, frame: number, x0: number, y0: number, x1: number, y1: number }} Chunk */
/** @typedef {((cx: number, cy: number) => string) & { dirty?: (cx: number, cy: number) => boolean, empty?: (cx: number, cy: number) => boolean, bounds?: (cx: number, cy: number) => number[] | undefined }} ChunkStamp */
// layer -> its pictures by "res|cx,cy"
/** @type {Map<string, Map<string, Chunk>>} */
const chunkLayers = new Map();
const drawnChunks = new Map();
let prewarmingChunks = false;
export const isPrewarmingChunks = () => prewarmingChunks;
export function setPrewarmingChunks(prewarming) { prewarmingChunks = prewarming; }

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
const stats = { holes: 0, late: 0, pending: 0, warmReady: 0, warmTotal: 0 };
export const chunkStats = () => ({ ...stats });

// The layer's pictures on the screen at resolution res (canvas pixels per world unit), each painted by
// paint(g, x0, y0, x1, y1) when it's new or its stamp(cx, cy) changed, laid down on target. keepOld: a piece
// waiting its turn to be painted shows any picture of it there is meanwhile (out of date, or of another size)
/** @param {string} layer @param {number} res @param {ChunkStamp} stamp @param {Function} paint @param {(x0: number, y0: number, x1: number, y1: number) => void} [preview] @param {CanvasRenderingContext2D} [target] */
export function drawChunks(layer, res, stamp, paint, preview, target = ctx, keepOld = false) {
  if (typeof document === 'undefined') return;
  const epoch = worldEpoch();
  if (cacheWorldEpoch !== epoch) {
    // Chunk canvases contain map-specific pixels; don't let equal-sized worlds reuse them.
    chunkLayers.clear();
    drawnChunks.clear();
    cacheWorldEpoch = epoch;
    previousView = null; previousScale = 0;
    stats.holes = 0; stats.late = 0; stats.pending = 0; stats.warmReady = 0; stats.warmTotal = 0;
    // These derived indexes are tied to world lists and may have identical lengths on a new map.
    sandKeys = { n: -1, desert: null, beach: null, keys: new Set() };
    terrainStamps = { lists: [], stamps: new Map(), empty: new Set(), sea: new Set(), bounds: new Map() };
    grassStamps = { lists: [], stamps: new Map() };
    fishy = { lists: [], list: [] };
    spots = { version: -1, list: [], acc: [], at: 0 };
  }
  let chunks = chunkLayers.get(layer);
  if (!chunks) chunkLayers.set(layer, (chunks = new Map()));
  const visible = new Set();
  const size = CHUNK * TILE_SIZE, v = getViewRect(), scale = getViewScale();
  if (layer === 'grass') {
    const moving = previousView && (Math.abs(v.x0 - previousView.x0) > 0.5 || Math.abs(v.y0 - previousView.y0) > 0.5 || Math.abs(scale - previousScale) > 0.002);
    previousView = v; previousScale = scale;
    frameOf++; stats.holes = 0; stats.late = 0; stats.pending = 0; stats.warmReady = 0; stats.warmTotal = 0; framePaints = 0; framePaintMs = 0; framePaintLimit = moving ? 1 : STILL_PAINTS_PER_FRAME; priorityPassed = false;
    const layers = scale < 0.7 ? ['grass', 'terrain', 'nature', 'tufts'] : scale < 0.95 ? ['grass', 'terrain', 'nature'] : ['grass', 'terrain'];
    if (areShadowsEnabled() && getSun().alpha >= MIN_SHADOW_ALPHA) layers.push('shadows');
    // While still, let every layer use the remaining paint budget. Rotating priorities
    // is useful only during movement, when a coarse first pass keeps the pan responsive.
    framePaintLayer = moving ? layers[(frameOf - 1) % layers.length] : layers[0];
  } // (the first layer of a frame)
  // (#306) a picture lands on whole screen pixels, and its edge is its neighbour's: no hairline of the ground
  // shows between two pieces, which read as square joins between them
  const m = target.getTransform();
  const snapX = x => (Math.round(m.e + m.a * x) - m.e) / m.a, snapY = y => (Math.round(m.f + m.d * y) - m.f) / m.d;
  // (a picture covers the rectangle it was painted for: the piece, or the part of it its layer has anything in, see bounds)
  /** @param {Chunk} p */
  const blit = p => {
    const dx0 = snapX(p.x0), dy0 = snapY(p.y0), dw = snapX(p.x1) - dx0, dh = snapY(p.y1) - dy0;
    target.drawImage(p.canvas, p.pad, p.pad, p.pw, p.ph, dx0, dy0, dw, dh);
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
    return { canvas, pad, pw, ph, stamp: now, frame: frameOf, x0, y0, x1, y1 };
  };
  // the screen's pieces first (a changed one repainted before any painting ahead), then the ring round it
  for (const ahead of [false, true]) {
    for (let cy = Math.max(0, cy0 - AHEAD); cy <= Math.min(lastY, cy1 + AHEAD); cy++) {
      for (let cx = Math.max(0, cx0 - AHEAD); cx <= Math.min(lastX, cx1 + AHEAD); cx++) {
        const shown = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
        if (shown === ahead) continue;
        if (shown) stats.warmTotal++;
        const key = `${res}|${cx},${cy}`;
        // (nothing of this layer in the piece: no picture of it)
        if (stamp.empty && stamp.empty(cx, cy)) { if (shown) stats.warmReady++; continue; }
        let chunk = chunks.get(key);
        let x0 = cx * size, y0 = cy * size, x1 = Math.min(game.WORLD_WIDTH, x0 + size), y1 = Math.min(game.WORLD_HEIGHT, y0 + size);
        // (#322) only the part of the piece the layer has anything in is painted, kept and laid down
        const part = stamp.bounds && stamp.bounds(cx, cy);
        if (part) { x0 = Math.max(x0, part[0]); y0 = Math.max(y0, part[1]); x1 = Math.min(x1, part[2]); y1 = Math.min(y1, part[3]); }
        const free = prewarmingChunks || (framePaints < framePaintLimit && framePaintMs < PAINT_MS && (layer === framePaintLayer || priorityPassed));
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
          if (chunk && (!invalidated || keepOld)) {
            if (!invalidated) stats.warmReady++;
            else stats.pending++;
            chunk.frame = frameOf; chunks.set(key, chunk); blit(chunk); visible.add(key);
          } else if (keepOld && oldPicture(chunks, cx, cy)) {
            blit(/** @type {Chunk} */ (oldPicture(chunks, cx, cy)));
            stats.pending++;
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
        if (chunk) { stats.warmReady++; chunk.frame = frameOf; chunks.set(key, chunk); blit(chunk); visible.add(key); }
      }
    }
  }
  if (layer === framePaintLayer) priorityPassed = true;
  drawnChunks.set(layer, visible);
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

// (#392) a piece's picture at any size, the finest first
const SIZES = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
/** @param {Map<string, Chunk>} chunks @param {number} cx @param {number} cy */
const oldPicture = (chunks, cx, cy) => {
  for (const res of SIZES) { const chunk = chunks.get(`${res}|${cx},${cy}`); if (chunk) return chunk; }
  return null;
};

export function wasChunkDrawn(layer, res, x, y) {
  const size = CHUNK * TILE_SIZE, cx = Math.floor(x / size), cy = Math.floor(y / size);
  const visible = drawnChunks.get(layer);
  return visible ? visible.has(`${res}|${cx},${cy}`) : false;
}

// full-size pictures zoomed in, half zoomed out
// (#306) How fine a piece is painted: about what the screen shows, and no finer (a power of two, so a piece
// isn't painted again for every little change of zoom). Zoomed out to the whole map it used to paint and lay
// down sixteen times the pixels that showed, which was most of what that view cost
// (#322) and a size is kept while the zoom is within a little of it (a hair either side of a threshold painted two sizes in turn, and
// the whole screen of pieces again each time)
let heldRes = 1;
const chunkRes = () => {
  return 1;
};
// (#322) The terrain's pieces are laid down at every zoom (what's drawn tile by tile each frame, with its gradients and rounded
// corners, was most of what a view of lake or desert cost): as fine as the screen shows, up to twice a world unit
let heldTerrain = 1;
const terrainRes = () => {
  return 1;
};

function mixGrassColor(from, to, amount) {
  const channel = (color, shift) => parseInt(color.slice(shift, shift + 2), 16);
  const mixed = [1, 3, 5].map(shift => Math.round(channel(from, shift) * (1 - amount) + channel(to, shift) * amount));
  return `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

let savannaWeightEpoch = -1;
let savannaWeightSignature = '';
const savannaWeightCache = new Map();

function savannaWeightAt(x, y) {
  const epoch = worldEpoch();
  const first = game.savannaTiles[0], last = game.savannaTiles[game.savannaTiles.length - 1];
  const signature = `${epoch}|${game.savannaTiles.length}|${first?.x ?? ''},${first?.y ?? ''}|${last?.x ?? ''},${last?.y ?? ''}`;
  if (savannaWeightEpoch !== epoch || savannaWeightSignature !== signature) {
    savannaWeightEpoch = epoch;
    savannaWeightSignature = signature;
    savannaWeightCache.clear();
  }
  const key = `${x},${y}`;
  const cached = savannaWeightCache.get(key);
  if (cached !== undefined) return cached;
  let weight = 0;
  const fadeDistance = TILE_SIZE * 2;
  forEachInRect(game.savannaTiles, x - fadeDistance - 15, y - fadeDistance - 15, x + fadeDistance + 15, y + fadeDistance + 15, tile => {
    const dx = Math.max(0, Math.abs(tile.x - x) - TILE_SIZE / 2);
    const dy = Math.max(0, Math.abs(tile.y - y) - TILE_SIZE / 2);
    const distance = Math.hypot(dx, dy);
    if (distance === 0) { weight = 1; return; }
    if (distance < fadeDistance) {
      const fade = 1 - distance / fadeDistance;
      weight = Math.max(weight, fade * fade * (3 - 2 * fade));
    }
  });
  savannaWeightCache.set(key, weight);
  return weight;
}

// Keep the same patches, tufts and speckles in both biomes; only blend their palette across the biome edge.
function paintGrass(g, x0, y0, x1, y1) {
  g.fillStyle = '#2d4a22'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Whole tiles: with the piece's bleed its edge isn't on one, and fractional tiles drew other patches
  // than the piece beside them, leaving a seam.
  const gx0 = Math.max(0, Math.floor(x0 / TILE_SIZE) - 1), gx1 = Math.min(game.COLS - 1, Math.ceil(x1 / TILE_SIZE));
  const gy0 = Math.max(0, Math.floor(y0 / TILE_SIZE) - 1), gy1 = Math.min(game.ROWS - 1, Math.ceil(y1 / TILE_SIZE));
  // Lay every cell's base down first. Otherwise a later cell's fill cuts off patches spilling over its edge.
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const x = gx * TILE_SIZE, y = gy * TILE_SIZE;
      const cornerWeights = [
        savannaWeightAt(x, y), savannaWeightAt(x + TILE_SIZE, y),
        savannaWeightAt(x, y + TILE_SIZE), savannaWeightAt(x + TILE_SIZE, y + TILE_SIZE)
      ];
      const gradientRows = 10;
      const rowHeight = TILE_SIZE / gradientRows;
      for (let row = 0; row < gradientRows; row++) {
        const t = (row + 0.5) / gradientRows;
        const leftWeight = cornerWeights[0] * (1 - t) + cornerWeights[2] * t;
        const rightWeight = cornerWeights[1] * (1 - t) + cornerWeights[3] * t;
        const gradient = g.createLinearGradient(x, y + row * rowHeight, x + TILE_SIZE, y + row * rowHeight);
        gradient.addColorStop(0, mixGrassColor('#2d4a22', SAVANNA_GRASS_BASE, leftWeight));
        gradient.addColorStop(1, mixGrassColor('#2d4a22', SAVANNA_GRASS_BASE, rightWeight));
        g.fillStyle = gradient;
        g.fillRect(x, y + row * rowHeight, TILE_SIZE + 0.5, rowHeight + 0.05);
      }
    }
  }
  // Then draw the texture over all cells so the soft patches can cross their borders uninterrupted.
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const hsh = tileVariantHash(gx, gy), x = gx * TILE_SIZE, y = gy * TILE_SIZE;
      for (let k = 0; k < 2; k++) {
        const v = k ? hsh >>> 11 : hsh;
        const px = x + (v >>> 6) % TILE_SIZE, py = y + (v >>> 9) % TILE_SIZE;
        const patchWeight = savannaWeightAt(px, py);
        g.globalAlpha = 0.28 + (v % 5) * 0.035;
        const shade = (v >>> 3) % GRASS_SHADES.length;
        g.fillStyle = mixGrassColor(GRASS_SHADES[shade], SAVANNA_GRASS_SHADES[shade], patchWeight);
        g.beginPath();
        g.ellipse(px, py, 13 + (v >>> 12) % 17, 10 + (v >>> 15) % 14, ((v >>> 18) % 6) / 2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      if (hsh % 5 === 0) {
        // a tuft: a few blades
        const tx = x + 6 + (hsh >>> 7) % 18, ty = y + 10 + (hsh >>> 13) % 14;
        const tuftWeight = savannaWeightAt(tx, ty);
        g.strokeStyle = mixGrassColor(hsh % 2 ? '#5a8c3c' : '#14230f', hsh % 2 ? '#c1ae5c' : '#34351b', tuftWeight);
        g.globalAlpha = hsh % 2 ? 0.55 : 0.45; g.lineWidth = 1;
        g.beginPath();
        for (const dx of [-2, 0, 2]) { g.moveTo(tx + dx, ty); g.lineTo(tx + dx * 1.6, ty - 4 - Math.abs(dx)); }
        g.stroke();
        g.globalAlpha = 1;
      } else if (hsh % 7 === 0) {
        g.fillStyle = 'rgba(0, 0, 0, 0.1)';
        g.fillRect(x + 4 + ((hsh >>> 8) % (TILE_SIZE - 10)), y + 4 + ((hsh >>> 14) % (TILE_SIZE - 10)), 3, 3);
      }
      paintGroundDetail(g, gx, gy, x, y);
    }
  }
  g.globalAlpha = 1;
}

// Small things in the grass, here and there, so a meadow isn't one flat green: a few flowers, a patch of clover, a couple of
// little stones, a bare spot of earth. By a hash of the tile (its own, not the one the patches and tufts use), each well
// inside its tile; in the savanna the flowers are the dry yellows only and there's no clover
const FLOWERS = ['#e9edda', '#e7c94c', '#d98fab', '#93b3e2'], DRY_FLOWERS = ['#d9b85a', '#c9903f'];
function paintGroundDetail(g, gx, gy, x, y) {
  const h = tileVariantHash(gx * 3 + 1, gy * 5 + 2);
  const at = (shift, span) => 6 + ((h >>> shift) % span); // (a place in the tile, off its edges)
  const kind = h % 23;
  if (kind > 6) return;
  const dry = savannaWeightAt(x + TILE_SIZE / 2, y + TILE_SIZE / 2) > 0.5;
  if (kind <= 1) {
    // flowers: three to five, each a few petals round a middle
    const colours = dry ? DRY_FLOWERS : FLOWERS, colour = colours[(h >>> 5) % colours.length], n = 3 + ((h >>> 8) % 3);
    for (let i = 0; i < n; i++) {
      const fx = x + at(10 + i * 3, 18), fy = y + at(12 + i * 4, 18);
      g.globalAlpha = 0.9; g.fillStyle = colour;
      g.beginPath();
      for (const [dx, dy] of [[-1.1, 0], [1.1, 0], [0, -1.1], [0, 1.1]]) { g.moveTo(fx + dx + 0.9, fy + dy); g.arc(fx + dx, fy + dy, 0.9, 0, Math.PI * 2); }
      g.fill();
      g.fillStyle = dry ? '#7a5a22' : '#f2d65c'; g.fillRect(fx - 0.5, fy - 0.5, 1, 1);
    }
  } else if (kind <= 3 && !dry) {
    // clover: a few round leaves, a little lighter than the grass
    g.globalAlpha = 0.55; g.fillStyle = '#42702f';
    const cx = x + at(6, 16), cy = y + at(11, 16);
    g.beginPath();
    for (let i = 0; i < 5; i++) { const lx = cx + ((h >>> (i * 3)) % 9) - 4, ly = cy + ((h >>> (i * 3 + 2)) % 7) - 3; g.moveTo(lx + 2, ly); g.arc(lx, ly, 2, 0, Math.PI * 2); }
    g.fill();
  } else if (kind === 4) {
    // two little stones
    const sx = x + at(7, 16), sy = y + at(13, 16);
    g.globalAlpha = 0.8; g.fillStyle = '#5f685e';
    g.beginPath(); g.ellipse(sx, sy, 2.2, 1.6, 0, 0, Math.PI * 2); g.ellipse(sx + 4, sy + 1.5, 1.5, 1.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8b958a'; g.fillRect(sx - 1, sy - 1, 1.2, 0.8);
  } else if (kind >= 5) {
    // a bare spot of earth
    g.globalAlpha = 0.16; g.fillStyle = '#5a4526';
    g.beginPath(); g.ellipse(x + at(9, 16), y + at(14, 16), 6 + ((h >>> 20) % 4), 4 + ((h >>> 23) % 3), ((h >>> 17) % 6) / 2, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

export function drawGrassGround() {
  drawChunks('grass', chunkRes(), grassStamp, paintGrass, (x0, y0, x1, y1) => {
    ctx.fillStyle = '#2d4a22'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  });
}

export function prewarmVisibleWorldChunks() {
  const transform = ctx.getTransform();
  const scale = getViewScale();
  ctx.setTransform(scale, 0, 0, scale, canvas.width / 2 - camera.x * scale, canvas.height / 2 - camera.y * scale);
  try {
    drawGrassGround();
    drawSand();
  } finally {
    ctx.setTransform(transform);
  }
}

// (#322) What the savanna in and round a piece is like, kept till a tile of it comes or goes: it was worked out for every piece on
// the screen every frame, from every tile round it (most of what a frame of a quiet map cost)
/** @type {{ lists: any[], stamps: Map<number, string> }} */
let grassStamps = { lists: [], stamps: new Map() };
function grassStamp(cx, cy) {
  const lists = listStamp(game.savannaTiles);
  if (lists.length !== grassStamps.lists.length || lists.some((v, i) => v !== grassStamps.lists[i])) grassStamps = { lists, stamps: new Map() };
  const key = cy * 4096 + cx;
  let stamp = grassStamps.stamps.get(key);
  if (stamp === undefined) {
    const size = CHUNK * TILE_SIZE;
    let hash = 0;
    const margin = TILE_SIZE * 3;
    forEachInRect(game.savannaTiles, cx * size - margin, cy * size - margin, (cx + 1) * size + margin, (cy + 1) * size + margin, tile => {
      hash = (hash * 31 + tile.x * 7919 + tile.y * 31) | 0;
    });
    grassStamps.stamps.set(key, (stamp = String(hash)));
  }
  return stamp;
}

// ---- Terrain that joins up
//
// Water joins water, natural rock joins rock and ore: every tile covers its whole square, and gets an
// outline only on sides with no neighbour of its kind, so lakes and rock masses read as shapes instead
// of a grid of separate squares. Shades and details vary per tile (tileVariantHash).
export const WATER_SHADES = ['#2c83bd', '#2a80b9', '#2d85be', '#2a7db5'];
export const ROCK_SHADES = ['#34495e', '#33475b', '#364b60', '#32465a', '#354a5f'];
const ROCK_PALETTES = [
  { shades: ROCK_SHADES, edge: '#1a252f' }
];
// Sand: one base with close patches over it, as the grass has (not a shade per tile: that read as a grid)
export const SAND_BASE = '#c9a66b';
export const DESERT_SHADES = ['#cba96f', '#c7a468', '#cdab72', '#c5a166', '#cfad74'];
// Rock standing in the desert: sandstone a little darker than the sand, its layers and a dark edge
// making it stone (a much redder rock stood out of the desert; a muddy brown read as a patch of dirt)
export const DESERT_ROCK_SHADES = ['#b38d5a', '#b7905d', '#af8956', '#bb945f', '#b18b58'];
export const DESERT_ROCK_EDGE = '#63431f';
let rockMassPaletteCache = { signature: -1, palettes: new Map() };

function rockMassPalettes(tiles) {
  if (rockMassPaletteCache.signature === tiles.signature) return rockMassPaletteCache.palettes;
  const palettes = new Map(), remaining = new Set(tiles.rockAndOre);
  const oreTiles = new Set([...game.ironOres, ...game.coalOres, ...game.naturalRocks.filter(r => r.oreSpawner)]
    .map(r => `${r.x},${r.y}`));
  while (remaining.size) {
    const first = remaining.values().next().value;
    const queue = [first], component = [];
    remaining.delete(first);
    let minX = Infinity, minY = Infinity;
    for (let i = 0; i < queue.length; i++) {
      const key = queue[i], [x, y] = key.split(',').map(Number);
      component.push(key);
      if (y < minY || (y === minY && x < minX)) { minX = x; minY = y; }
      for (const neighbor of [`${x - TILE_SIZE},${y}`, `${x + TILE_SIZE},${y}`, `${x},${y - TILE_SIZE}`, `${x},${y + TILE_SIZE}`]) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    const palette = component.some(key => oreTiles.has(key)) ? 0 : tileVariantHash(minX, minY) % ROCK_PALETTES.length;
    for (const key of component) palettes.set(key, palette);
  }
  rockMassPaletteCache = { signature: tiles.signature, palettes };
  return palettes;
}

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

function terrainCornerOccupancy(x, y, tiles, includeSand = true) {
  const sand = getSandKeys(), has = (dx, dy) => {
    const key = `${x + dx * TILE_SIZE},${y + dy * TILE_SIZE}`;
    return tiles.water.has(key) || tiles.rockAndOre.has(key) || (includeSand && sand.has(key));
  };
  return { nw: has(-1, -1), ne: has(1, -1), se: has(1, 1), sw: has(-1, 1) };
}

function drawJoinedTileOutline(x, y, open, edgeColor, occupiedCorners) {
  const G = target || ctx;
  const k = cornerRadii(open, occupiedCorners), x0 = x - 15, y0 = y - 15, x1 = x + 15, y1 = y + 15;
  const transform = G.getTransform(), scale = Math.max(0.001, Math.min(Math.abs(transform.a), Math.abs(transform.d)));
  G.strokeStyle = edgeColor; G.lineWidth = Math.max(2, 1 / scale); G.lineCap = 'round'; G.lineJoin = 'round';
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
  if (!open.n && !open.w && open.nw) { G.moveTo(x0 + 1, y0); G.lineTo(x0, y0 + 1); }
  if (!open.n && !open.e && open.ne) { G.moveTo(x1 - 1, y0); G.lineTo(x1, y0 + 1); }
  if (!open.s && !open.e && open.se) { G.moveTo(x1, y1 - 1); G.lineTo(x1 - 1, y1); }
  if (!open.s && !open.w && open.sw) { G.moveTo(x0, y1 - 1); G.lineTo(x0 + 1, y1); }
  G.stroke();
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
  // foam along the shore: a couple of short light strokes a little way in from the land, each bowed towards the water, at
  // places of the tile's own (not by rock: the water's deep there)
  G.strokeStyle = 'rgba(228, 245, 252, 0.34)'; G.lineWidth = 1.1; G.lineCap = 'round';
  G.beginPath();
  const HALF = TILE_SIZE / 2;
  ['n', 's', 'w', 'e'].forEach((side, n) => {
    if (!shore[side]) return;
    for (let k = 0; k < 2; k++) {
      const v = h >>> (n * 5 + k * 3), len = 5 + (v % 5), from = -HALF + 3 + k * 13 + (v >>> 3) % 4, inset = 3 + (v >>> 5) % 3;
      // (along the side from `from`, `inset` in from the edge; the middle a little further in)
      const along = side === 'n' || side === 's', sign = side === 'n' || side === 'w' ? 1 : -1;
      const edge = -sign * HALF + sign * inset;
      const p = (t, bow) => (along ? [w.x + from + len * t, w.y + edge + sign * bow] : [w.x + edge + sign * bow, w.y + from + len * t]);
      const [x0, y0] = p(0, 0), [cx, cy] = p(0.5, 1.6), [x1, y1] = p(1, 0);
      G.moveTo(x0, y0); G.quadraticCurveTo(cx, cy, x1, y1);
    }
  });
  G.stroke();
  G.lineCap = 'butt';
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
  // a rock standing in the desert (the sand is under it, see markDesertUnderRocks): warm sandstone, its own edge
  const desert = getSandKeys().has(`${x},${y}`);
  // (one shade under a whole desert mass: the layers and facets give it its texture, not a shade a tile)
  const palette = ROCK_PALETTES[rockMassPalettes(tiles).get(`${x},${y}`) || 0];
  const fill = desert ? DESERT_ROCK_SHADES[0] : palette.shades[h % palette.shades.length];
  const edgeColor = desert ? DESERT_ROCK_EDGE : palette.edge, occupiedCorners = terrainCornerOccupancy(x, y, tiles, false), k = cornerRadii(open, occupiedCorners);
  drawJoinedTile(x, y, open, edgeColor, fill, false, occupiedCorners);
  G.save(); G.beginPath();
  G.roundRect(x - 15 - over, y - 15 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2, [k.nw, k.ne, k.se, k.sw]);
  G.clip();
  // facets of the rock face, a little lighter, and a lit top edge and shaded bottom edge where the mass
  // ends (#251: flat squares)
  if (desert) {
    // layers of sediment across the face: what makes it read as sandstone rather than a patch of dirt.
    // They sit at the same heights in every tile, so a mass of rock has one set of layers across it,
    // not a band a tile (which read as rows of bricks)
    for (let sy = Math.floor((y - 15) / 12) * 12; sy < y + 15; sy += 12) {
      G.fillStyle = Math.round(sy / 12) % 3 === 0 ? 'rgba(96, 62, 24, 0.18)' : 'rgba(255, 232, 188, 0.16)';
      G.fillRect(x - 15, sy, TILE_SIZE, 2);
    }
  }
  G.fillStyle = desert ? 'rgba(255, 224, 176, 0.2)' : 'rgba(255, 255, 255, 0.07)';
  for (let k = 0; k < 2; k++) {
    const v = h >>> (k * 9), fx = x - 12 + (v % 14), fy = y - 12 + ((v >>> 4) % 14);
    G.beginPath(); G.moveTo(fx, fy); G.lineTo(fx + 8 + (v % 4), fy + 2); G.lineTo(fx + 5, fy + 8 + ((v >>> 2) % 3)); G.lineTo(fx - 1, fy + 5); G.closePath(); G.fill();
  }
  if (open.n) { G.fillStyle = desert ? 'rgba(255, 236, 198, 0.28)' : 'rgba(255, 255, 255, 0.12)'; G.fillRect(x - 13 + Math.max(0, k.nw - 2), y - 13, TILE_SIZE - 4 - Math.max(0, k.nw - 2) - Math.max(0, k.ne - 2), 3); }
  if (open.s) { G.fillStyle = desert ? 'rgba(62, 38, 12, 0.34)' : 'rgba(0, 0, 0, 0.25)'; G.fillRect(x - 13 + Math.max(0, k.sw - 2), y + 9, TILE_SIZE - 4 - Math.max(0, k.sw - 2) - Math.max(0, k.se - 2), 4); }
  // a crack or a couple of speckles
  if (h % 4 === 0) {
    G.strokeStyle = desert ? 'rgba(74, 48, 18, 0.4)' : 'rgba(0, 0, 0, 0.25)'; G.lineWidth = 1;
    const cx = x - 7 + ((h >>> 6) % 12), cy = y - 7 + ((h >>> 11) % 12);
    G.beginPath(); G.moveTo(cx, cy); G.lineTo(cx + 4, cy + 3); G.lineTo(cx + 3, cy + 8); G.stroke();
  } else if (h % 4 === 1) {
    G.fillStyle = desert ? 'rgba(255, 226, 188, 0.16)' : 'rgba(255, 255, 255, 0.06)';
    G.fillRect(x - 8 + ((h >>> 6) % 14), y - 8 + ((h >>> 11) % 14), 3, 3);
    G.fillRect(x - 4 + ((h >>> 16) % 10), y - 2 + ((h >>> 20) % 10), 2, 2);
  }
  G.restore();
  drawJoinedTileOutline(x, y, open, edgeColor, occupiedCorners);
}

// ---- Sand (desert and beach)
//
// As the grass: one base under the whole desert, soft patches of close shades crossing the tiles' edges,
// dunes and speckles here and there, and a soft band where it meets the grass. A tile's own shade no
// longer makes a grid of squares: only the shape's edge follows the tiles.
function sandTilesAround(x0, y0, x1, y1) {
  const found = [];
  forEachInRect(game.desertTiles, x0 - TILE_SIZE, y0 - TILE_SIZE, x1 + TILE_SIZE, y1 + TILE_SIZE, o => { found.push(o); });
  forEachInRect(game.beachTiles, x0 - TILE_SIZE, y0 - TILE_SIZE, x1 + TILE_SIZE, y1 + TILE_SIZE, o => { found.push(o); });
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function paintSandGround(g, x0, y0, x1, y1) {
  const tiles = sandTilesAround(x0, y0, x1, y1);
  if (!tiles.length) return;
  const keys = getSandKeys(), terrain = getTileIndex();
  // the sand's shape: the tiles' squares joined, their outer corners rounded (as water and rock)
  g.save();
  g.beginPath();
  for (const t of tiles) {
    const open = openSides(keys, t.x, t.y), k = cornerRadii(open, terrainCornerOccupancy(t.x, t.y, terrain));
    g.roundRect(t.x - 15 - over, t.y - 15 - over, TILE_SIZE + over * 2, TILE_SIZE + over * 2, [k.nw, k.ne, k.se, k.sw]);
  }
  g.clip();
  g.fillStyle = SAND_BASE;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (const t of tiles) {
    const hsh = tileVariantHash(t.x, t.y), x = t.x - 15, y = t.y - 15;
    // two soft patches a tile, anywhere in it and spilling out of it (as the grass: no grid)
    for (let k = 0; k < 2; k++) {
      const v = k ? hsh >>> 11 : hsh;
      g.globalAlpha = 0.3 + (v % 4) * 0.05;
      g.fillStyle = DESERT_SHADES[(v >>> 3) % DESERT_SHADES.length];
      g.beginPath();
      g.ellipse(x + (v >>> 6) % TILE_SIZE, y + (v >>> 9) % TILE_SIZE, 9 + (v >>> 12) % 12, 7 + (v >>> 15) % 10, ((v >>> 18) % 6) / 2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (hsh % 3 === 0) {
      // a dune ripple
      g.strokeStyle = 'rgba(120, 90, 40, 0.22)'; g.lineWidth = 1;
      const ry = y + 8 + ((hsh >>> 7) % 14);
      g.beginPath(); g.moveTo(x + 5, ry); g.quadraticCurveTo(x + 15, ry - 4, x + 25, ry); g.stroke();
    } else if (hsh % 7 === 0) {
      g.fillStyle = 'rgba(255, 240, 200, 0.22)';
      g.fillRect(x + 4 + ((hsh >>> 5) % (TILE_SIZE - 8)), y + 4 + ((hsh >>> 9) % (TILE_SIZE - 8)), 3, 2);
      g.fillRect(x + 4 + ((hsh >>> 13) % (TILE_SIZE - 8)), y + 4 + ((hsh >>> 17) % (TILE_SIZE - 8)), 2, 2);
    }
  }
  g.restore();
  // where it meets the grass: the sand thinning out into it (a soft band outside the open sides)
  const n = parseInt(SAND_BASE.slice(1), 16), rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
  for (const t of tiles) {
    const open = openSides(keys, t.x, t.y);
    edgeBand(g, t.x, t.y, open, open, rgb, 0.8, 7, false, terrainCornerOccupancy(t.x, t.y, terrain));
  }
}

// Rock with ore veins, shared by ore tiles and ore spawners so they read as the same material.
// half: half the square's size (a full rock tile is 14)
export const ORE_COLORS = {
  iron: { body: '#aab7c3', shine: '#dfe6ed' }, // (#298: the old silver-grey again)
  coal: { body: '#050608', shine: '#6b7785' }
};
// the same ore in a desert rock: the metal cool and bright against the red sandstone (a warm beige
// vein on warm rock disappeared into it, as a stain)
export const DESERT_ORE_COLORS = {
  iron: { body: '#b7c4d1', shine: '#eef4fa' },
  coal: { body: '#0d0a08', shine: '#8b7c6c' }
};
const oreColorsAt = (x, y) => (getSandKeys().has(`${x},${y}`) ? DESERT_ORE_COLORS : ORE_COLORS);

export function drawOreVeins(x, y, kind, half) {
  const G = target || ctx;
  const c = oreColorsAt(x, y)[kind];
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
  const c = oreColorsAt(x, y)[kind];
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
  if (game.plagueMode) return;
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

// What the terrain in and round a piece is like (any tile coming or going changes it)
/** @type {{ lists: any[], stamps: Map<string, string>, empty: Set<string>, sea: Set<string>, bounds: Map<string, number[]> }} */
let terrainStamps = { lists: [], stamps: new Map(), empty: new Set(), sea: new Set(), bounds: new Map() };
function terrainStamp(cx, cy) {
  const lists = terrainLists().flatMap(listStamp);
  if (lists.length !== terrainStamps.lists.length || lists.some((v, i) => v !== terrainStamps.lists[i])) terrainStamps = { lists, stamps: new Map(), empty: new Set(), sea: new Set(), bounds: new Map() };
  const key = `${cx},${cy}`;
  let stamp = terrainStamps.stamps.get(key);
  if (stamp === undefined) {
    const size = CHUNK * TILE_SIZE, x0 = cx * size - TILE_SIZE, y0 = cy * size - TILE_SIZE;
    let h = 0, count = 0, water = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    terrainLists().forEach((list, n) => forEachInRect(list, x0, y0, x0 + size + 2 * TILE_SIZE, y0 + size + 2 * TILE_SIZE, o => {
      h = (h * 31 + o.x * 7919 + o.y * 31 + n + (o.oreSpawner ? 1 : 0)) | 0; count++;
      if (list === game.waterTiles) water++;
      if (o.x < bx0) bx0 = o.x; if (o.x > bx1) bx1 = o.x; if (o.y < by0) by0 = o.y; if (o.y > by1) by1 = o.y;
    }));
    terrainStamps.stamps.set(key, (stamp = String(h)));
    if (!count) terrainStamps.empty.add(key);
    else terrainStamps.bounds.set(key, [bx0 - TERRAIN_REACH, by0 - TERRAIN_REACH, bx1 + TERRAIN_REACH, by1 + TERRAIN_REACH]);
    // (every tile of the piece and of the ring round it, as far as the map goes)
    const gx0 = Math.max(0, cx * CHUNK - 1), gx1 = Math.min(game.COLS - 1, (cx + 1) * CHUNK), gy0 = Math.max(0, cy * CHUNK - 1), gy1 = Math.min(game.ROWS - 1, (cy + 1) * CHUNK);
    if (water === count && water === (gx1 - gx0 + 1) * (gy1 - gy0 + 1)) terrainStamps.sea.add(key);
  }
  return stamp;
}
// (#322) a piece that's all water, and the tiles round it too: the grass under it never shows, so it has no picture of grass (on a
// big screen zoomed out, a frame's pictures of the ground were more than the browser takes in one go, and it stopped to draw
// what it had so far at every piece after that)
// (#322) and the part of a piece its sand, water and rock reach: a few rocks in a meadow had a whole piece's picture, clear but for them
const TERRAIN_REACH = TILE_SIZE / 2 + 12; // (from a tile's centre: its square, and the band its edge fades into the grass with)
terrainStamp.bounds = (cx, cy) => { terrainStamp(cx, cy); return terrainStamps.bounds.get(`${cx},${cy}`); };
const isSea = (cx, cy) => { terrainStamp(cx, cy); return terrainStamps.sea.has(`${cx},${cy}`); };
grassStamp.empty = isSea;
// (#322) a piece with no sand, water or rock in or round it has no picture: none made, kept or laid down (plain grass is most of a map)
terrainStamp.empty = (cx, cy) => { terrainStamp(cx, cy); return terrainStamps.empty.has(`${cx},${cy}`); };

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
    paintSandGround(g, x0, y0, x1, y1);
    tilesAround(game.waterTiles, x0, y0, x1, y1).forEach(t => drawWaterTile(t, terrain));
    tilesAround(game.naturalRocks, x0, y0, x1, y1).forEach(r => { if (isRock(r)) drawRockTile(r.x, r.y, terrain); else drawOreSpawner(r.x, r.y, r.oreSpawner); });
    tilesAround(game.ironOres, x0, y0, x1, y1).forEach(o => drawOreVeins(o.x, o.y, 'iron', 14));
    tilesAround(game.coalOres, x0, y0, x1, y1).forEach(o => drawOreVeins(o.x, o.y, 'coal', 14));
  } finally { target = null; over = 0.5; }
}

// A fast panning placeholder keeps the map's main land/water/sand shapes visible while
// the detailed chunk waits its turn in drawChunks' per-frame paint queue.
function previewTerrain(x0, y0, x1, y1) {
  const sand = getSandKeys();
  // the preview must use the same palette as the picture it stands in for: a desert rock shown dark
  // for a frame while the chunk is painted read as ordinary rock flashing over it on every zoom
  const palettes = rockMassPalettes(getTileIndex());
  const rockColor = o => (sand.has(`${o.x},${o.y}`)
    ? DESERT_ROCK_SHADES[0]
    : ROCK_PALETTES[palettes.get(`${o.x},${o.y}`) || 0].shades[0]);
  const paintTiles = (list, color) => {
    forEachInRect(list, x0 - TILE_SIZE, y0 - TILE_SIZE, x1 + TILE_SIZE, y1 + TILE_SIZE, o => {
      ctx.fillStyle = typeof color === 'function' ? color(o) : color;
      ctx.fillRect(o.x - TILE_SIZE / 2, o.y - TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    });
  };
  paintTiles(game.desertTiles, SAND_BASE);
  paintTiles(game.beachTiles, SAND_BASE);
  paintTiles(game.waterTiles, WATER_SHADES[0]);
  paintTiles(game.naturalRocks, rockColor);
  paintTiles(game.ironOres, rockColor);
  paintTiles(game.coalOres, rockColor);
}

const inView = (list, fn) => forEachInRect(list, view.x0, view.y0, view.x1, view.y1, fn);

export function drawSand() {
  // this frame: zoomed out (the pictures), or the tiles on screen (with a tile's margin)
  view = getViewRect(TILE_SIZE);
  cached = typeof document !== 'undefined';
  if (cached) { drawChunks('terrain', terrainRes(), terrainStamp, paintTerrain, previewTerrain); return; }
  paintSandGround(ctx, view.x0, view.y0, view.x1, view.y1);
}

// (each rock tile's rounded corners, worked out once while the tiles stay as they are: a dozen lookups a tile)
/** @type {{ tiles: object | null, of: Map<object, number[]> }} */
let rockCorners = { tiles: null, of: new Map() };

// The shadows of the rock and ore tiles round a piece of the ground (x0..x1, y0..y1), cast by the sun (dx, dy),
// into the shadows' picture g; then the tiles themselves taken out of it, nothing's shadow falling on their tops
/** @param {CanvasRenderingContext2D} g @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {{ dx: number, dy: number }} sun */
export function paintRockShadows(g, x0, y0, x1, y1, sun) {
  const height = 18, ox = sun.dx * height, oy = sun.dy * height, margin = Math.max(Math.abs(ox), Math.abs(oy)) + TILE_SIZE;
  const tiles = getTileIndex(), shadow = new Path2D(), tops = new Path2D();
  if (rockCorners.tiles !== tiles) rockCorners = { tiles, of: new Map() };
  const addTile = tile => {
    let radii = rockCorners.of.get(tile);
    if (!radii) {
      const { nw, ne, se, sw } = cornerRadii(openSides(tiles.rockAndOre, tile.x, tile.y), terrainCornerOccupancy(tile.x, tile.y, tiles, false));
      rockCorners.of.set(tile, (radii = [nw, ne, se, sw]));
    }
    tops.roundRect(tile.x - 15, tile.y - 15, TILE_SIZE, TILE_SIZE, radii);
    shadow.roundRect(tile.x - 15 + Math.min(0, ox), tile.y - 15 + Math.min(0, oy), TILE_SIZE + Math.abs(ox), TILE_SIZE + Math.abs(oy), radii);
  };
  for (const list of [game.naturalRocks, game.ironOres, game.coalOres]) forEachInRect(list, x0 - margin, y0 - margin, x1 + margin, y1 + margin, addTile);
  g.save();
  g.fillStyle = '#000';
  g.fill(shadow);
  g.globalCompositeOperation = 'destination-out';
  g.fill(tops);
  g.restore();
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
      ctx.fillStyle = 'rgba(18, 67, 91, 0.82)';
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
