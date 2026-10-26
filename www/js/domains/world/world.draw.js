// The ground: grass, water, rock, desert and ore, each joining its own kind

import { drawIcon } from '../../ui/index.js';
import { BORDER_MARGIN, TILE_SIZE, forEachInRect, game, getTileIndex, listStamp } from '../../engine/world/index.js';
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

/** @typedef {{ canvas: HTMLCanvasElement, pad: number, pw: number, ph: number, stamp: string }} Chunk */
// layer -> its pictures by "res|cx,cy"
/** @type {Map<string, Map<string, Chunk>>} */
const chunkLayers = new Map();

// Zoomed out, panning shows many new pieces at once: painted for at most this long a frame (ms), the rest
// the next frames (an old picture meanwhile, or the plain ground: fill)
const PAINT_MS = 4;
// (#306) world px painted past a piece's edge: a patch of grass crossing the edge is whole on either side of it,
// instead of being cut off at it
const PAD = 6;

// The layer's pictures on the screen at resolution res (canvas pixels per world unit), each painted by
// paint(g, x0, y0, x1, y1) when it's new or its stamp(cx, cy) changed
/** @param {string} layer @param {number} res @param {(cx: number, cy: number) => string} stamp @param {Function} paint @param {string | null} [fill] */
function drawChunks(layer, res, stamp, paint, fill = null) {
  if (typeof document === 'undefined') return;
  let chunks = chunkLayers.get(layer);
  if (!chunks) chunkLayers.set(layer, (chunks = new Map()));
  const size = CHUNK * TILE_SIZE, v = getViewRect(), started = performance.now();
  // (#306) a picture lands on whole screen pixels, and its edge is its neighbour's: no hairline of the ground
  // shows between two pieces, which read as square joins between them
  const m = ctx.getTransform();
  const snapX = x => (Math.round(m.e + m.a * x) - m.e) / m.a, snapY = y => (Math.round(m.f + m.d * y) - m.f) / m.d;
  const cx0 = Math.max(0, Math.floor(v.x0 / size)), cx1 = Math.min(Math.ceil(game.COLS / CHUNK) - 1, Math.floor(v.x1 / size));
  const cy0 = Math.max(0, Math.floor(v.y0 / size)), cy1 = Math.min(Math.ceil(game.ROWS / CHUNK) - 1, Math.floor(v.y1 / size));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const key = `${res}|${cx},${cy}`, now = `${game.COLS}x${game.ROWS}|${stamp(cx, cy)}`;
      let chunk = chunks.get(key);
      if (chunk) chunks.delete(key); // (to the end: the most recently shown)
      const x0 = cx * size, y0 = cy * size, x1 = Math.min(game.WORLD_WIDTH, x0 + size), y1 = Math.min(game.WORLD_HEIGHT, y0 + size);
      const dx0 = snapX(x0), dy0 = snapY(y0), dw = snapX(x1) - dx0, dh = snapY(y1) - dy0;
      if ((!chunk || chunk.stamp !== now) && res < 1 && performance.now() - started > PAINT_MS) {
        if (chunk) { chunks.set(key, chunk); } else if (fill) { ctx.fillStyle = fill; ctx.fillRect(dx0, dy0, dw, dh); }
        if (chunk) ctx.drawImage(chunk.canvas, chunk.pad, chunk.pad, chunk.pw, chunk.ph, dx0, dy0, dw, dh);
        continue;
      }
      if (!chunk || chunk.stamp !== now) {
        const canvas = chunk ? chunk.canvas : document.createElement('canvas');
        const pad = Math.ceil(PAD * res), bleed = pad / res;
        const pw = Math.ceil((x1 - x0) * res), ph = Math.ceil((y1 - y0) * res);
        canvas.width = pw + pad * 2; canvas.height = ph + pad * 2;
        const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        g.setTransform(res, 0, 0, res, pad - x0 * res, pad - y0 * res);
        paint(g, x0 - bleed, y0 - bleed, x1 + bleed, y1 + bleed);
        chunk = { canvas, pad, pw, ph, stamp: now };
      }
      chunks.set(key, chunk);
      ctx.drawImage(chunk.canvas, chunk.pad, chunk.pad, chunk.pw, chunk.ph, dx0, dy0, dw, dh);
    }
  }
  while (chunks.size > MAX_CHUNKS) chunks.delete(/** @type {string} */ (chunks.keys().next().value));
}

// full-size pictures zoomed in, half zoomed out
// (#306) How fine a piece is painted: about what the screen shows, and no finer (a power of two, so a piece
// isn't painted again for every little change of zoom). Zoomed out to the whole map it used to paint and lay
// down sixteen times the pixels that showed, which was most of what that view cost
const chunkRes = () => Math.min(1, 2 ** Math.floor(Math.log2(Math.max(getViewScale(), 0.0625))));

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
  drawChunks('grass', chunkRes(), () => '', paintGrass, '#2d4a22');
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
// when a tile in it or next to it changes; zoomed in, only the tiles on screen are drawn. Zoomed out it drew
// every tile every frame: 180 fps down to 70
const ZOOMED_OUT = 0.75;
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

const inView = (list, fn) => forEachInRect(list, view.x0, view.y0, view.x1, view.y1, fn);

export function drawSand() {
  // this frame: zoomed out (the pictures), or the tiles on screen (with a tile's margin)
  view = getViewRect(TILE_SIZE);
  cached = getViewScale() < ZOOMED_OUT && typeof document !== 'undefined';
  if (cached) { drawChunks('terrain', chunkRes(), terrainStamp, paintTerrain); return; }
  inView(game.desertTiles, drawDesertTile);
  inView(game.beachTiles, drawDesertTile);
}

// Water, and the fishing spots marked on it
export function drawWater(terrain) {
  // (#306) zoomed out a fish is under a pixel: the shoals are drawn only when there's room to see them
  const fishShown = getViewScale() >= 0.45;
  inView(game.waterTiles, w => {
    if (!cached) drawWaterTile(w, terrain);
    const hash = tileVariantHash(w.x, w.y);
    if (fishShown && (w.fishCount ?? GAME_CONFIG.fishing.fishCapacity) > 0 && hash % 7 === 0) {
      const phase = performance.now() / 850 + (hash % 100) / 13;
      const swim = Math.sin(phase) * 6;
      const fx = w.x + swim, fy = w.y + Math.cos(phase * 0.7) * 3;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(Math.cos(phase) < 0 ? -1 : 1, 1);
      ctx.fillStyle = 'rgba(18, 67, 91, 0.82)';
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-6, -2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(190, 229, 240, 0.75)';
      ctx.beginPath(); ctx.arc(2, -0.5, 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
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
