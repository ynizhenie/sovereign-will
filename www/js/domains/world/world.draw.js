// The ground: grass, water, rock, desert and ore, each joining its own kind

import { drawIcon } from '../../ui/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getTileIndex } from '../../engine/world/index.js';
import { camera, canvas, ctx, getViewScale } from '../../engine/platform/index.js';
import { drawHarvestProgress } from '../economy/gathering/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';

// A few close shades of the base grass color, plus an occasional darker speckle, so the ground
// isn't one flat repeating fill. Picked per-tile from a coordinate hash, not rand(), so it
// stays put across frames without disturbing the seeded world-gen RNG sequence.
export const GRASS_SHADES = ['#2d4a22', '#2f4d25', '#2a4620', '#31501f', '#294419', '#2e4b28'];

export function tileVariantHash(gx, gy) {
  let h = Math.imul(gx, 374761393) + Math.imul(gy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// The grass (#251: per-tile shades read as a grid): one green under everything, soft patches of the close
// shades over it, crossing the tiles' edges, and a tuft or a speckle here and there. It never changes, so it's
// drawn once into a picture of the whole map (half size on a big one) and that's laid down each frame
/** @type {{ key: string, canvas: HTMLCanvasElement | null, scale: number }} */
const grassCache = { key: '', canvas: null, scale: 1 };
function paintGrass() {
  const w = game.COLS * TILE_SIZE, h = game.ROWS * TILE_SIZE;
  const scale = w * h > 4e6 ? 0.5 : 1;
  const canvas = grassCache.canvas || document.createElement('canvas');
  canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.fillStyle = '#2d4a22'; g.fillRect(0, 0, w, h);
  for (let gy = 0; gy < game.ROWS; gy++) {
    for (let gx = 0; gx < game.COLS; gx++) {
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
  Object.assign(grassCache, { canvas, scale });
}

export function drawGrassGround() {
  const key = `${game.COLS}x${game.ROWS}`;
  if (grassCache.key !== key || !grassCache.canvas) { paintGrass(); grassCache.key = key; }
  const c = /** @type {HTMLCanvasElement} */ (grassCache.canvas);
  ctx.drawImage(c, 0, 0, c.width / grassCache.scale, c.height / grassCache.scale);
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

// Which sides (and corners) of tile (x, y) have no neighbour in `keys` (a Set of "x,y" tile centres)
export function openSides(keys, x, y) {
  const T = TILE_SIZE;
  return {
    n: !keys.has(`${x},${y - T}`), s: !keys.has(`${x},${y + T}`),
    w: !keys.has(`${x - T},${y}`), e: !keys.has(`${x + T},${y}`),
    nw: !keys.has(`${x - T},${y - T}`), ne: !keys.has(`${x + T},${y - T}`),
    sw: !keys.has(`${x - T},${y + T}`), se: !keys.has(`${x + T},${y + T}`)
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
  if (k.nw || k.ne || k.se || k.sw) { G.beginPath(); G.roundRect(x0 - 0.5, y0 - 0.5, TILE_SIZE + 1, TILE_SIZE + 1, [k.nw, k.ne, k.se, k.sw]); G.fill(); }
  else G.fillRect(x0 - 0.5, y0 - 0.5, TILE_SIZE + 1, TILE_SIZE + 1);
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
  if (inside) { G.save(); G.beginPath(); G.roundRect(x0 - 0.5, y0 - 0.5, T + 1, T + 1, [k.nw, k.ne, k.se, k.sw]); G.clip(); } // (its half pixel over too)
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
  G.roundRect(x - 15.5, y - 15.5, TILE_SIZE + 1, TILE_SIZE + 1, [k.nw, k.ne, k.se, k.sw]);
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
  if (k.nw || k.ne || k.se || k.sw) { G.beginPath(); G.roundRect(tile.x - 15.5, tile.y - 15.5, TILE_SIZE + 1, TILE_SIZE + 1, [k.nw, k.ne, k.se, k.sw]); G.fill(); }
  else G.fillRect(tile.x - 15.5, tile.y - 15.5, TILE_SIZE + 1, TILE_SIZE + 1);
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
  const c = ORE_COLORS[kind];
  const k = half / 14;
  drawRockTile(x, y, getTileIndex());
  ctx.fillStyle = c.body;
  ctx.fillRect(x - 10 * k, y - 10 * k, 8 * k, 8 * k); ctx.fillRect(x + 1 * k, y - 5 * k, 9 * k, 9 * k); ctx.fillRect(x - 7 * k, y + 3 * k, 7 * k, 7 * k);
  ctx.fillStyle = c.shine;
  ctx.fillRect(x - 8 * k, y - 8 * k, 3 * k, 3 * k); ctx.fillRect(x + 4 * k, y - 2 * k, 3 * k, 3 * k); ctx.fillRect(x - 5 * k, y + 5 * k, 2 * k, 2 * k);
}

// Spawner: the same veined rock on a full tile, framed in the ore colour with a large crystal in the middle
export function drawOreSpawner(x, y, kind) {
  const c = ORE_COLORS[kind];
  drawOreVeins(x, y, kind, 14);
  ctx.strokeStyle = c.body; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 11, 22, 22);
  ctx.fillStyle = c.body;
  ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.shine; ctx.fillRect(x - 1, y - 4, 2, 4);
}

// The border zone round the map, and the line where it starts
export function drawMapBorder() {
  ctx.fillStyle = '#2d4a22';
  ctx.fillRect(0, 0, game.WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, game.WORLD_HEIGHT - BORDER_MARGIN * TILE_SIZE, game.WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, game.WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(game.WORLD_WIDTH - BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, game.WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);

  ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, game.WORLD_WIDTH - 2 * BORDER_MARGIN * TILE_SIZE, game.WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
}

// Desert and beach sand
// (#298) the ground that rarely changes (sand, water, natural rock): zoomed out, where thousands of tiles
// show, drawn once into a picture of the whole map (as the grass, half size on a big one) and laid down each
// frame, painted again only when one of them changes (or where the settlers can reach on the water); zoomed
// in, only the tiles on screen are drawn. Zoomed out it drew every tile every frame: 180 fps down to 70
const ZOOMED_OUT = 0.75;
/** @type {{ key: string, canvas: HTMLCanvasElement | null, scale: number }} */
const terrainCache = { key: '', canvas: null, scale: 1 };
let view = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, cached = false;
const onScreen = o => o.x > view.x0 && o.x < view.x1 && o.y > view.y0 && o.y < view.y1;
const isRock = r => !r.oreSpawner;
function terrainKey(terrain) {
  return `${game.COLS}x${game.ROWS}|${terrain.signature}|${game.desertTiles.length}|${game.beachTiles.length}`;
}
function paintTerrain(terrain) {
  const w = game.COLS * TILE_SIZE, h = game.ROWS * TILE_SIZE;
  const scale = w * h > 4e6 ? 0.5 : 1;
  const canvas = terrainCache.canvas || document.createElement('canvas');
  canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  g.setTransform(scale, 0, 0, scale, 0, 0);
  target = g;
  try {
    game.desertTiles.forEach(drawDesertTile);
    game.beachTiles.forEach(drawDesertTile);
    game.waterTiles.forEach(t => drawWaterTile(t, terrain));
    game.naturalRocks.forEach(r => { if (isRock(r)) drawRockTile(r.x, r.y, terrain); });
  } finally { target = null; }
  Object.assign(terrainCache, { canvas, scale });
}

export function drawSand() {
  // this frame: zoomed out (the picture), or the tiles on screen (with a tile's margin)
  const scale = getViewScale(), terrain = getTileIndex();
  cached = scale < ZOOMED_OUT && typeof document !== 'undefined';
  if (cached) {
    view = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    const key = terrainKey(terrain);
    if (terrainCache.key !== key || !terrainCache.canvas) { paintTerrain(terrain); terrainCache.key = key; }
    const c = /** @type {HTMLCanvasElement} */ (terrainCache.canvas);
    ctx.drawImage(c, 0, 0, c.width / terrainCache.scale, c.height / terrainCache.scale);
    return;
  }
  const halfW = canvas.width / 2 / scale + TILE_SIZE, halfH = canvas.height / 2 / scale + TILE_SIZE;
  view = { x0: camera.x - halfW, y0: camera.y - halfH, x1: camera.x + halfW, y1: camera.y + halfH };
  for (const t of game.desertTiles) if (onScreen(t)) drawDesertTile(t);
  for (const t of game.beachTiles) if (onScreen(t)) drawDesertTile(t);
}

// Water, and the fishing spots marked on it
export function drawWater(terrain) {
  game.waterTiles.forEach(w => {
    if (!onScreen(w)) return;
    if (!cached) drawWaterTile(w, terrain);
    const hash = tileVariantHash(w.x, w.y);
    if ((w.fishCount ?? GAME_CONFIG.fishing.fishCapacity) > 0 && hash % 7 === 0) {
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
  game.naturalRocks.forEach(r => {
    if (!onScreen(r)) return;
    if (r.oreSpawner) {
      drawOreSpawner(r.x, r.y, r.oreSpawner);
    } else if (!cached) {
      drawRockTile(r.x, r.y, terrain);
    }
    drawHarvestProgress(r, 36);
  });
}
