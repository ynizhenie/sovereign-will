// Map editor: make a map by hand, tile by tile, save it on the device, and play it in Endless
// ("Custom map" there, see renderCustomMapList). A new map starts empty or from the generator (the
// seed and generator settings of the Endless screen); a saved one can be opened again and changed.
//
// In the editor the world is the ordinary game world with the clock stopped: a tool puts its thing on
// the tapped tile (the brush can cover 3×3), replacing what was there; on a tile that already has that
// thing it clears it instead. Rows and columns can be added or taken away at any edge. Saved maps are
// plain data (serializeMap), keyed by name in localStorage; loadCustomMap() builds the world from one.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, setZoom, t } from '../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, applySeedFromUI, game, getGridPos, isBorderZone, resetTileIndex, townHall } from '../../engine/world/index.js';
import { isTileOccupied } from '../../domains/economy/building/index.js';
import { closeOverlays, showNotification } from '../../ui/index.js';
import { addMapResource, getMapResourceDef } from '../../domains/economy/gathering/index.js';
import { makeAppleTree } from '../../domains/economy/farming/index.js';
import { exitToMainMenu, resetGame } from '../../app/index.js';
import { invalidateAllPaths } from '../../engine/movement/index.js';
import { showMenuScreen } from '../menu/index.js';
import { setMapSource, startGame } from '../endless/index.js';
import { loadSavedMaps, makeBuilt, placeBoar, serializeMap, storeSavedMaps } from './editor.maps.js';
import { renderEditorMapList, renderEditorPanel } from './editor.panel.js';

// What can be put on a tile, by palette category (the eraser has its own button), in sections (#255: ore
// with the ground). kind: a GAME_CONFIG.mapResources entry; building: a GAME_CONFIG.buildings one.
export const EDITOR_CATEGORIES = ['terrain', 'nature', 'buildings'];
/** @type {{ id: string, icon: string, category?: string, section?: string, kind?: string, building?: string, list?: string, spawner?: string }[]} */
export const EDITOR_TOOLS = [
  { id: 'erase', icon: 'eraser' },
  { id: 'water', icon: 'water', category: 'terrain', section: 'ground' },
  { id: 'rock', icon: 'rock', category: 'terrain', section: 'ground' },
  { id: 'sand', icon: 'sand', category: 'terrain', section: 'ground' },
  { id: 'tree', icon: 'tree', kind: 'tree', category: 'nature' },
  { id: 'apple_tree', icon: 'apple_tree', kind: 'tree', category: 'nature' },
  { id: 'cactus', icon: 'cactus', kind: 'cactus', category: 'nature' },
  { id: 'boulder', icon: 'boulder', kind: 'boulder', category: 'nature' },
  { id: 'grass', icon: 'grass', kind: 'grass', category: 'nature' },
  { id: 'berry_bush', icon: 'berry_bush', kind: 'berry_bush', category: 'nature' },
  { id: 'stick', icon: 'stick', kind: 'stick', category: 'nature' },
  { id: 'pebble', icon: 'pebble', kind: 'pebble', category: 'nature' },
  { id: 'boar', icon: 'boar', category: 'nature' },
  { id: 'iron_ore', icon: 'iron_ore', kind: 'iron_ore', category: 'terrain', section: 'ore' },
  { id: 'coal_ore', icon: 'coal_ore', kind: 'coal_ore', category: 'terrain', section: 'ore' },
  { id: 'iron_spawner', icon: 'iron_spawner', spawner: 'iron', category: 'terrain', section: 'ore' },
  { id: 'coal_spawner', icon: 'coal_spawner', spawner: 'coal', category: 'terrain', section: 'ore' },
  { id: 'town_hall', icon: 'hall', category: 'buildings', section: 'hall' },
  // buildings, except crops (those are planted in farm zones)
  ...Object.values(GAME_CONFIG.buildings)
    .filter(b => !Object.values(GAME_CONFIG.farming.crops).includes(b.id))
    .map(b => ({ id: b.id, icon: b.icon, building: b.id, category: 'buildings', section: b.tab || b.group || 'economy' }))
];

// how small and big a map can be made (the same as the Endless custom size)
export const EDITOR_MIN_TILES = 20, EDITOR_MAX_TILES = 100;

export const editor = {
  tool: 'tree',
  category: 'nature',
  brush: 1,     // 1, 3 or 5: a 3×3 (5×5) brush covers the tapped tile and the ones round it
  dragPaint: false, // a drag paints with the brush instead of moving the view (#255)
  startTime: 'morning', // the time of day an Endless game on it starts at (#257): morning, day, evening, night
  name: '',     // the name it was opened or last saved as
  faction: 'humans' // whose map it is (the player's side is 'humans' until the saved sides load): its buildings in the palette, its town hall; Endless plays it as them
};

// ---- Editing

export const tileKey = (x, y) => `${x},${y}`;

// Take away whatever stands on the tile (sand stays: it's ground)
export function clearEditorTile(x, y) {
  const here = o => Math.abs(o.x - x) < TILE_SIZE / 2 && Math.abs(o.y - y) < TILE_SIZE / 2;
  for (const list of ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres',
    'naturalRocks', 'waterTiles', 'boars', 'buildings']) {
    game[list] = game[list].filter(o => !here(o));
  }
}

export function hasSomethingOn(x, y) {
  return isTileOccupied(x, y) && Math.hypot(x - townHall.x, y - townHall.y) >= townHall.radius + 15;
}

// Does the tile already have what this tool puts there?
export function tileHasTool(tool, gx, gy) {
  const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
  const at = list => game[list].find(o => o.x === x && o.y === y);
  if (tool.id === 'water') return !!at('waterTiles');
  if (tool.id === 'sand') return !!at('desertTiles');
  if (tool.id === 'rock') { const r = at('naturalRocks'); return !!r && !r.oreSpawner; }
  if (tool.spawner) { const r = at('naturalRocks'); return !!r && r.oreSpawner === tool.spawner; }
  if (tool.id === 'boar') return !!at('boars');
  if (tool.building) { const b = at('buildings'); return !!b && b.type === tool.building; }
  if (tool.kind) {
    const r = at(getMapResourceDef(tool.kind).list);
    return !!r && (tool.kind !== 'tree' || !!r.apple === (tool.id === 'apple_tree'));
  }
  return false;
}

// The tool on one tile; clearing: take that thing away instead (a second tap with the same tool)
export function applyEditorTool(tool, gx, gy, clearing) {
  if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS) return;
  const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
  if (clearing) {
    if (!tileHasTool(tool, gx, gy)) return;
    if (tool.id === 'sand') game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    else clearEditorTile(x, y);
    return;
  }
  if (tool.id === 'erase') {
    if (hasSomethingOn(x, y)) clearEditorTile(x, y);
    else game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    return;
  }
  // the border is where enemies come from: nothing goes there
  if (isBorderZone(gx, gy)) return;
  if (tool.id === 'sand') {
    game.waterTiles = game.waterTiles.filter(w => w.x !== x || w.y !== y);
    game.naturalRocks = game.naturalRocks.filter(r => r.x !== x || r.y !== y);
    if (!game.desertTiles.some(d => d.x === x && d.y === y)) game.desertTiles.push({ x, y });
    return;
  }
  // the town hall's own tiles stay free
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return;
  clearEditorTile(x, y);
  if (tool.id === 'water') {
    game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    game.waterTiles.push({ x, y, isFishing: false, fishTimer: 0 });
  } else if (tool.id === 'rock') {
    addMapResource('natural_rock', x, y);
  } else if (tool.spawner) {
    addMapResource('natural_rock', x, y).oreSpawner = tool.spawner;
  } else if (tool.id === 'boar') {
    placeBoar({ x, y });
  } else if (tool.building) {
    game.buildings.push(makeBuilt(tool.building, x, y));
  } else if (tool.kind) {
    const r = addMapResource(tool.kind, x, y);
    if (tool.id === 'apple_tree') makeAppleTree(r);
  }
}

// The town hall moves to the tile corner nearest the tap; what was under it goes
export function moveTownHall(x, y) {
  const cx = Math.round(x / TILE_SIZE) * TILE_SIZE, cy = Math.round(y / TILE_SIZE) * TILE_SIZE;
  const g = getGridPos(cx - 1, cy - 1);
  if (isBorderZone(g.gx, g.gy) || isBorderZone(g.gx + 1, g.gy + 1)) return;
  townHall.x = cx; townHall.y = cy;
  for (let gy = g.gy - 1; gy <= g.gy + 2; gy++) {
    for (let gx = g.gx - 1; gx <= g.gx + 2; gx++) {
      const tx = gx * TILE_SIZE + 15, ty = gy * TILE_SIZE + 15;
      if (Math.hypot(tx - cx, ty - cy) < townHall.radius + 15) clearEditorTile(tx, ty);
    }
  }
}

// The brush on the tile (gx, gy): it and the ones round it, as big as the brush
function brushAt(tool, gx, gy, clearing) {
  const r = (editor.brush - 1) / 2;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) applyEditorTool(tool, gx + dx, gy + dy, clearing);
}

export function editorTap(x, y) {
  const tool = EDITOR_TOOLS.find(tl => tl.id === editor.tool);
  if (!tool) return;
  remember();
  if (tool.id === 'town_hall') moveTownHall(x, y);
  else {
    const g = getGridPos(x, y);
    // the tapped tile already has it: this tap clears it (and the same around it, with the big brush)
    brushAt(tool, g.gx, g.gy, tileHasTool(tool, g.gx, g.gy));
  }
  resetTileIndex();
}

// A drag with the brush (#255, with dragPaint on): from the tile it began on along every tile it goes over;
// begun on a tile that has the tool's thing, it clears it instead, all the way
/** @type {{ tool: any, clearing: boolean, last: { gx: number, gy: number } } | null} */
let stroke = null;
let pressedAt = { x: 0, y: 0 };
export function editorPaint(phase, x, y) {
  if (game.gameMode !== 'editor') return false;
  if (phase === 'start') { pressedAt = { x, y }; stroke = null; return false; }
  if (phase === 'end') { if (stroke) resetTileIndex(); stroke = null; return false; }
  if (!editor.dragPaint) return false;
  const tool = EDITOR_TOOLS.find(tl => tl.id === editor.tool);
  if (!tool || tool.id === 'town_hall') return false;
  const g = getGridPos(x, y);
  if (!stroke) {
    remember();
    const from = getGridPos(pressedAt.x, pressedAt.y);
    stroke = { tool, clearing: tileHasTool(tool, from.gx, from.gy), last: from };
    brushAt(tool, from.gx, from.gy, stroke.clearing);
  }
  // every tile between the last one and this (a quick drag skips none)
  const steps = Math.max(Math.abs(g.gx - stroke.last.gx), Math.abs(g.gy - stroke.last.gy));
  for (let i = 1; i <= steps; i++) {
    brushAt(tool, Math.round(stroke.last.gx + (g.gx - stroke.last.gx) * i / steps), Math.round(stroke.last.gy + (g.gy - stroke.last.gy) * i / steps), stroke.clearing);
  }
  stroke.last = g;
  resetTileIndex();
  return true;
}

// ---- Undo and redo (#255): the map as it was before each change, the last HISTORY_SIZE of them

const HISTORY_SIZE = 40;
/** @type {any[]} */
const undoStack = [];
/** @type {any[]} */
const redoStack = [];
const snapshot = () => ({
  lists: Object.fromEntries(EDITOR_LISTS.map(list => [list, structuredClone(game[list])])),
  hall: { x: townHall.x, y: townHall.y }, cols: game.COLS, rows: game.ROWS
});
function restore(shot) {
  for (const list of EDITOR_LISTS) game[list] = shot.lists[list];
  townHall.x = shot.hall.x; townHall.y = shot.hall.y;
  game.COLS = shot.cols; game.ROWS = shot.rows;
  game.WORLD_WIDTH = shot.cols * TILE_SIZE; game.WORLD_HEIGHT = shot.rows * TILE_SIZE;
  clampCamera();
  resetTileIndex();
  invalidateAllPaths();
  renderEditorPanel();
}

// Before a change: the map as it is, to undo to; what was undone can't be redone after it
export function remember() {
  undoStack.push(snapshot());
  if (undoStack.length > HISTORY_SIZE) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

export function undoEditor() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  updateHistoryButtons();
}

export function redoEditor() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  updateHistoryButtons();
}

export function updateHistoryButtons() {
  const undo = /** @type {HTMLButtonElement | null} */ (document.getElementById('editor-undo'));
  const redo = /** @type {HTMLButtonElement | null} */ (document.getElementById('editor-redo'));
  if (undo) undo.disabled = !undoStack.length;
  if (redo) redo.disabled = !redoStack.length;
}

// Everything off the map (the town hall stays), at a second press within a few seconds
let clearAsked = -Infinity; // (not 0: a page a moment old would clear at the first press)
export function clearEditorMap() {
  if (performance.now() - clearAsked > 3000) { clearAsked = performance.now(); showNotification(t('editor.clearAsk'), true); return false; }
  clearAsked = -Infinity;
  remember();
  for (const list of EDITOR_LISTS) game[list] = [];
  resetTileIndex();
  invalidateAllPaths();
  showNotification(t('editor.cleared'), false);
  return true;
}

// ---- Map size

export const EDITOR_LISTS = ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres',
  'naturalRocks', 'waterTiles', 'desertTiles', 'beachTiles', 'boars', 'buildings'];

// Add (delta 1) or take away (delta -1) a whole row or column of tiles at one edge: top, bottom, left,
// right. What would end up off the map or on the new border goes; the town hall must stay clear of it.
export function resizeEditorMap(side, delta) {
  const horizontal = side === 'left' || side === 'right';
  const cols = game.COLS + (horizontal ? delta : 0), rows = game.ROWS + (horizontal ? 0 : delta);
  if (Math.min(cols, rows) < EDITOR_MIN_TILES || Math.max(cols, rows) > EDITOR_MAX_TILES) return;
  remember();
  const shiftX = side === 'left' ? delta * TILE_SIZE : 0, shiftY = side === 'top' ? delta * TILE_SIZE : 0;
  const inBorder = (gx, gy) => gx < BORDER_MARGIN || gy < BORDER_MARGIN || gx >= cols - BORDER_MARGIN || gy >= rows - BORDER_MARGIN;
  const hall = getGridPos(townHall.x + shiftX - 1, townHall.y + shiftY - 1);
  if (inBorder(hall.gx, hall.gy) || inBorder(hall.gx + 1, hall.gy + 1)) { showNotification(t('editor.hallInTheWay'), true); return; }
  for (const list of EDITOR_LISTS) {
    game[list] = game[list].filter(o => {
      o.x += shiftX; o.y += shiftY;
      const g = getGridPos(o.x, o.y);
      return !inBorder(g.gx, g.gy);
    });
  }
  townHall.x += shiftX; townHall.y += shiftY;
  game.COLS = cols; game.ROWS = rows;
  game.WORLD_WIDTH = cols * TILE_SIZE; game.WORLD_HEIGHT = rows * TILE_SIZE;
  camera.x += shiftX; camera.y += shiftY;
  clampCamera();
  resetTileIndex();
  invalidateAllPaths();
  renderEditorPanel();
}

// ---- Opening and leaving the editor

// source: { map } a saved map, or { cols, rows, generate } a new one (generate: from the generator, else empty)
export function startEditor(source) {
  game.gameMode = 'editor';
  if (source.map) {
    editor.name = source.map.name;
    editor.faction = source.map.faction || 'humans';
    editor.startTime = source.map.startTime || 'morning';
    resetGame(source.map);
  } else {
    // a generated map uses the Endless seed and generator settings, at the size picked here
    editor.name = '';
    editor.startTime = 'morning';
    const endlessSize = game.mapSettings;
    game.mapSettings = { cols: source.cols, rows: source.rows };
    applySeedFromUI();
    resetGame(source.generate ? null : { cols: source.cols, rows: source.rows });
    game.mapSettings = endlessSize;
  }
  game.settlers = []; game.enemies = []; game.corpses = [];
  game.waveTimer = Infinity; game.boarRespawnTimer = Infinity;
  resetTileIndex();
  setZoom(0); clampCamera();
  game.gameStarted = true;
  document.getElementById('main-menu').style.display = 'none';
  document.body.classList.add('editor-mode');
  closeOverlays();
  document.getElementById('editor-name').value = editor.name;
  undoStack.length = 0; redoStack.length = 0;
  updateHistoryButtons();
  renderEditorPanel();
}

export function leaveEditor() {
  game.gameMode = 'endless';
  document.body.classList.remove('editor-mode');
  exitToMainMenu();
  renderEditorMapList();
  showMenuScreen('editor');
}

export function saveEditorMap() {
  const name = document.getElementById('editor-name').value.trim();
  if (!name) { showNotification(t('editor.needName'), true); return false; }
  const maps = loadSavedMaps();
  maps[name] = serializeMap(name);
  if (!storeSavedMaps(maps)) { showNotification(t('editor.saveFailed'), true); return false; }
  editor.name = name;
  showNotification(t('editor.saved', { name }), false);
  return true;
}

// Play it (#255): saved, then an Endless game on it
export function playEditorMap() {
  if (!saveEditorMap()) return;
  const map = loadSavedMaps()[editor.name];
  game.gameMode = 'endless';
  document.body.classList.remove('editor-mode');
  game.customMap = map;
  setMapSource('custom');
  startGame();
}
