// (#299) The world map, Endless: the whole map at once, a pixel or more a tile (water, sand, rock, ore, the
// trees, the buildings), dark where it's not been explored and dimmed where it isn't seen now; the base's
// land outlined, the settlers and the enemies seen as dots, the screen's view as a frame. A tap on it takes
// the camera there. Opened from the top bar's map button or M; Escape, the × or a tap shuts it.

import { TILE_SIZE, game, townHall } from '../engine/world/index.js';
import { camera, clampCamera, getViewRect, onTap } from '../engine/platform/index.js';
import { fogAt, getTerritoryBox, hasFog, inTerritory, isVisible } from '../domains/world/index.js';
import { closeSelectedCard } from './selected-card-state.js';

const COLORS = {
  grass: [62, 96, 44], water: [44, 131, 189], sand: [201, 166, 107], rock: [52, 73, 94], iron: [170, 183, 195], coal: [20, 22, 26],
  tree: [24, 54, 22], building: [233, 196, 106], hall: [241, 196, 15]
};
const DARK = [11, 15, 20];

let refresh = 0;

export const isWorldMapOpen = () => !document.getElementById('world-map').hidden;

export function openWorldMap() {
  if (game.gameMode !== 'endless' || !game.gameStarted) return;
  closeSelectedCard();
  document.getElementById('world-map').hidden = false;
  drawWorldMap();
  clearInterval(refresh);
  refresh = window.setInterval(() => { if (isWorldMapOpen()) drawWorldMap(); else clearInterval(refresh); }, 500);
}

export function closeWorldMap() {
  document.getElementById('world-map').hidden = true;
  clearInterval(refresh);
}

export function toggleWorldMap() {
  if (isWorldMapOpen()) closeWorldMap(); else openWorldMap();
}

// The map's picture: a pixel a tile, then stretched to fit
function drawWorldMap() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world-map-canvas'));
  const cols = game.COLS, rows = game.ROWS;
  if (canvas.width !== cols || canvas.height !== rows) {
    canvas.width = cols; canvas.height = rows;
    canvas.style.setProperty('--map-w', String(cols / Math.max(cols, rows))); canvas.style.setProperty('--map-h', String(rows / Math.max(cols, rows)));
  }
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const image = g.createImageData(cols, rows), px = image.data;
  const kind = new Uint8Array(cols * rows); // 0 grass and the indexes below
  const kinds = [null, 'water', 'sand', 'rock', 'iron', 'coal', 'tree', 'building', 'hall'];
  const mark = (list, k) => {
    for (const o of list) {
      const gx = Math.floor(o.x / TILE_SIZE), gy = Math.floor(o.y / TILE_SIZE);
      if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) kind[gy * cols + gx] = k;
    }
  };
  mark(game.desertTiles, 2); mark(game.beachTiles, 2); mark(game.waterTiles, 1); mark(game.trees, 6);
  mark(game.naturalRocks, 3); mark(game.ironOres, 4); mark(game.coalOres, 5);
  for (const r of game.naturalRocks) if (r.oreSpawner) mark([r], r.oreSpawner === 'iron' ? 4 : 5);
  mark(game.buildings, 7);
  mark([townHall], 8);
  for (let i = 0; i < cols * rows; i++) {
    const c = COLORS[kinds[kind[i]] || 'grass'], fog = fogAt(i), p = i * 4;
    // (dark unexplored, dimmed explored but not seen now)
    const k = fog === 0 ? 0 : fog === 1 ? 0.5 : 1;
    px[p] = DARK[0] + (c[0] - DARK[0]) * k; px[p + 1] = DARK[1] + (c[1] - DARK[1]) * k; px[p + 2] = DARK[2] + (c[2] - DARK[2]) * k; px[p + 3] = 255;
  }
  // the base's land: its edge a lighter line (looked for in the box round it)
  const box = getTerritoryBox();
  for (let gy = Math.max(0, box.y0 / TILE_SIZE); gy < Math.min(rows, box.y1 / TILE_SIZE); gy++) {
    for (let gx = Math.max(0, box.x0 / TILE_SIZE); gx < Math.min(cols, box.x1 / TILE_SIZE); gx++) {
      const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
      if (!inTerritory(x, y)) continue;
      if (inTerritory(x - TILE_SIZE, y) && inTerritory(x + TILE_SIZE, y) && inTerritory(x, y - TILE_SIZE) && inTerritory(x, y + TILE_SIZE)) continue;
      const p = (gy * cols + gx) * 4;
      px[p] = 241; px[p + 1] = 196; px[p + 2] = 15;
    }
  }
  // the settlers, and the enemies the colony sees
  const dot = (o, rgb) => {
    const gx = Math.floor(o.x / TILE_SIZE), gy = Math.floor(o.y / TILE_SIZE);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;
    const p = (gy * cols + gx) * 4;
    px[p] = rgb[0]; px[p + 1] = rgb[1]; px[p + 2] = rgb[2];
  };
  for (const s of game.settlers) dot(s, [255, 255, 255]);
  for (const en of [...game.enemies, ...game.scouts]) if (isVisible(en.x, en.y)) dot(en, [231, 76, 60]);
  g.putImageData(image, 0, 0);
  // the screen's view
  const v = getViewRect();
  g.strokeStyle = 'rgba(255, 255, 255, 0.9)'; g.lineWidth = Math.max(1, cols / 256);
  g.strokeRect(v.x0 / TILE_SIZE, v.y0 / TILE_SIZE, (v.x1 - v.x0) / TILE_SIZE, (v.y1 - v.y0) / TILE_SIZE);
  canvas.dataset.fog = hasFog() ? 'on' : 'off';
}

// A tap on the picture: the camera there, the map shut
function tapMap(e) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('world-map-canvas'));
  const rect = canvas.getBoundingClientRect();
  const point = e && e.changedTouches ? e.changedTouches[0] : e;
  if (!point || rect.width === 0) return;
  camera.x = (point.clientX - rect.left) / rect.width * game.WORLD_WIDTH;
  camera.y = (point.clientY - rect.top) / rect.height * game.WORLD_HEIGHT;
  clampCamera();
  closeWorldMap();
}

// The map's "to the base" button: the camera over the middle of the base's land
export function lookAtBase() {
  const box = getTerritoryBox();
  camera.x = (box.x0 + box.x1) / 2; camera.y = (box.y0 + box.y1) / 2;
  clampCamera();
}

// What this file sets up as the game starts (called by app/boot.js)
export function initWorldMap() {
  const canvas = document.getElementById('world-map-canvas');
  canvas.addEventListener('click', tapMap);
  onTap(document.getElementById('world-map-close'), () => closeWorldMap());
  onTap(document.getElementById('world-map-home'), () => { lookAtBase(); closeWorldMap(); });
  document.getElementById('world-map').addEventListener('click', e => { if (e.target === e.currentTarget) closeWorldMap(); });
  window.addEventListener('keydown', e => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.code === 'KeyM' && !e.repeat) toggleWorldMap();
    else if (e.code === 'Escape' && isWorldMapOpen()) closeWorldMap();
  });
}
