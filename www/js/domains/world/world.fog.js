// (#299) Fog of war, Endless at home: what the colony hasn't seen is dark; what it's seen but doesn't see now
// is dimmed, its enemies and boars not shown; what it sees now is clear. The town hall, the buildings
// (a watchtower farther) and the settlers see round them (GAME_CONFIG.fog). It starts with the base's
// start land seen. Worked out a few times a second, not every frame.
//
// On the screen it's a picture one pixel a tile, laid over the world stretched (smoothed: soft edges),
// painted again only where the seeing changed.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { TILE_SIZE, game, getGridPos, townHall } from '../../engine/world/index.js';
import { ctx } from '../../engine/platform/index.js';
import { hasTerritory } from './world.territory.js';

const config = () => GAME_CONFIG.fog;

// per tile: explored (ever seen, saved with the game) and seen now
/** @type {Uint8Array} */
let explored = new Uint8Array(0);
/** @type {Uint8Array} */
let seen = new Uint8Array(0);
let cols = 0, rows = 0, clock = 0;
// the box last seen in (tiles, both ends in): what's painted again next time
let seenBox = { gx0: 0, gy0: 0, gx1: -1, gy1: -1 };
/** @type {HTMLCanvasElement | null} */
let picture = null;

export const hasFog = () => hasTerritory();

// A new map: nothing seen but the base's start land (as big as a default map) round the hall
export function resetFog() {
  cols = game.COLS; rows = game.ROWS;
  explored = new Uint8Array(cols * rows); seen = new Uint8Array(cols * rows);
  const hall = getGridPos(townHall.x, townHall.y), half = GAME_CONFIG.territory.startTiles / 2;
  for (let gy = Math.max(0, Math.ceil(hall.gy - half)); gy < Math.min(rows, hall.gy + half); gy++) {
    for (let gx = Math.max(0, Math.ceil(hall.gx - half)); gx < Math.min(cols, hall.gx + half); gx++) explored[gy * cols + gx] = 1;
  }
  seenBox = { gx0: 0, gy0: 0, gx1: -1, gy1: -1 };
  paintAll();
  clock = Infinity; tickFog(0); // (what's seen at once, not after the first moment)
}

// For a save: what's been explored, as text (the tiles' 0s and 1s, eight to a letter)
export function exportFog() {
  let text = '';
  for (let i = 0; i < explored.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) if (explored[i + b]) byte |= 1 << b;
    text += String.fromCharCode(byte);
  }
  return { cols, rows, explored: btoa(text) };
}

// From a save (none, in one from before: the start land seen)
export function importFog(saved) {
  resetFog();
  if (!saved || saved.cols !== cols || saved.rows !== rows) return;
  const text = atob(saved.explored);
  for (let i = 0; i < explored.length; i++) explored[i] = (text.charCodeAt(i >> 3) >> (i & 7)) & 1;
  paintAll();
}

function ready() {
  return hasFog() && cols === game.COLS && rows === game.ROWS && explored.length === cols * rows;
}

// Whether the colony sees (x, y) now / has ever seen it (everywhere, without fog)
export function isVisible(x, y) {
  if (!ready()) return true;
  const gx = Math.floor(x / TILE_SIZE), gy = Math.floor(y / TILE_SIZE);
  return gx >= 0 && gy >= 0 && gx < cols && gy < rows && seen[gy * cols + gx] === 1;
}
export function isExplored(x, y) {
  if (!ready()) return true;
  const gx = Math.floor(x / TILE_SIZE), gy = Math.floor(y / TILE_SIZE);
  return gx >= 0 && gy >= 0 && gx < cols && gy < rows && explored[gy * cols + gx] === 1;
}
// the tile's state by index: 0 unexplored, 1 explored, 2 seen now (the world map's)
export function fogAt(index) {
  if (!ready()) return 2;
  return seen[index] ? 2 : explored[index];
}

// Each tick: now and then, what's seen worked out again
export function tickFog(dt) {
  if (!ready()) return;
  clock += dt;
  if (clock < config().everySeconds) return;
  clock = 0;
  const before = seenBox;
  // (cleared in the old box: the rest is 0 already)
  for (let gy = Math.max(0, before.gy0); gy <= Math.min(rows - 1, before.gy1); gy++) seen.fill(0, gy * cols + Math.max(0, before.gx0), gy * cols + Math.min(cols - 1, before.gx1) + 1);
  const box = { gx0: Infinity, gy0: Infinity, gx1: -Infinity, gy1: -Infinity };
  const look = (x, y, tiles) => {
    const g = getGridPos(x, y), r = Math.ceil(tiles);
    for (let dy = -r; dy <= r; dy++) {
      const gy = g.gy + dy;
      if (gy < 0 || gy >= rows) continue;
      for (let dx = -r; dx <= r; dx++) {
        const gx = g.gx + dx;
        if (gx < 0 || gx >= cols || dx * dx + dy * dy > tiles * tiles) continue;
        seen[gy * cols + gx] = 1; explored[gy * cols + gx] = 1;
      }
    }
    box.gx0 = Math.min(box.gx0, g.gx - r); box.gy0 = Math.min(box.gy0, g.gy - r); box.gx1 = Math.max(box.gx1, g.gx + r); box.gy1 = Math.max(box.gy1, g.gy + r);
  };
  const c = config();
  look(townHall.x, townHall.y, c.hallTiles);
  for (const b of game.buildings) look(b.x, b.y, b.type === 'watchtower' ? c.towerTiles : c.buildingTiles);
  for (const s of game.settlers) if (s.hp > 0) look(s.x, s.y, c.settlerTiles);
  seenBox = box;
  // painted again where it changed: the old box and the new
  paint(Math.min(before.gx0, box.gx0), Math.min(before.gy0, box.gy0), Math.max(before.gx1, box.gx1), Math.max(before.gy1, box.gy1));
}

// ---- On screen

const SHADE = [11, 15, 20]; // (the dark of the unexplored)

function paintAll() {
  if (typeof document === 'undefined' || !cols) return;
  picture = picture || document.createElement('canvas');
  if (picture.width !== cols || picture.height !== rows) { picture.width = cols; picture.height = rows; }
  paint(0, 0, cols - 1, rows - 1);
}

function paint(gx0, gy0, gx1, gy1) {
  if (!picture) return;
  gx0 = Math.max(0, gx0); gy0 = Math.max(0, gy0); gx1 = Math.min(cols - 1, gx1); gy1 = Math.min(rows - 1, gy1);
  if (gx1 < gx0 || gy1 < gy0) return;
  const g = /** @type {CanvasRenderingContext2D} */ (picture.getContext('2d'));
  const w = gx1 - gx0 + 1, h = gy1 - gy0 + 1, image = g.createImageData(w, h), dim = Math.round(config().dim * 255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (gy0 + y) * cols + gx0 + x, p = (y * w + x) * 4;
      image.data[p] = SHADE[0]; image.data[p + 1] = SHADE[1]; image.data[p + 2] = SHADE[2];
      image.data[p + 3] = seen[i] ? 0 : explored[i] ? dim : 255;
    }
  }
  g.putImageData(image, gx0, gy0);
}

// Over the world (after everything on it, before the night)
export function drawFog() {
  if (!ready() || !picture) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(picture, 0, 0, cols * TILE_SIZE, rows * TILE_SIZE);
  ctx.restore();
}
