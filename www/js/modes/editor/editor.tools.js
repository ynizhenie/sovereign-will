// Map editor: make a map by hand, tile by tile, save it on the device, and play it in Endless
// ("Custom map" there, see renderCustomMapList). A new map starts empty or from the generator (the
// editor screen's own seed, and the generator's settings, its gear); a saved one can be opened again and changed.
//
// In the editor the world is the ordinary game world with the clock stopped: a tool puts its thing on
// the tapped tile (the brush can cover 3×3), replacing what was there; on a tile that already has that
// thing it clears it instead. Saved maps are plain data (serializeMap), keyed by name in localStorage;
// loadCustomMap() builds the world from one.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, setZoom, t } from '../../engine/platform/index.js';
import { TILE_SIZE, applySeedFromUI, game, getGridPos, isBorderZone, resetTileIndex, townHall } from '../../engine/world/index.js';
import { isTileOccupied } from '../../domains/economy/building/index.js';
import { isWaterReachable, timeOfPhase } from '../../domains/world/index.js';
import { closeOverlays, runLoading, showNotification } from '../../ui/index.js';
import { addMapResource, getMapResourceDef } from '../../domains/economy/gathering/index.js';
import { makeAppleTree } from '../../domains/economy/farming/index.js';
import { exitToMainMenu, resetGameSteps } from '../../app/index.js';
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
  { id: 'savanna', icon: 'savanna', category: 'terrain', section: 'ground' },
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
  { id: 'outpost', icon: 'enemyTent', category: 'buildings', section: 'outposts' },
  // buildings, except crops (those are planted in farm zones)
  ...Object.values(GAME_CONFIG.buildings)
    .filter(b => !Object.values(GAME_CONFIG.farming.crops).includes(b.id))
    .map(b => ({ id: b.id, icon: b.icon, building: b.id, category: 'buildings', section: b.tab || b.group || 'economy' }))
];

export const editor = {
  tool: 'tree',
  category: 'nature',
  brush: 1,     // 1, 3 or 5: a 3×3 (5×5) brush covers the tapped tile and the ones round it
  startTime: 'day', // the time of day an Endless game on it starts at (#257): morning, day, evening, night
  name: '',     // the name it was opened or last saved as
  faction: 'humans' // whose map it is (the player's side is 'humans' until the saved sides load): its buildings in the palette, its town hall; Endless plays it as them
};

// ---- Editing

export const tileKey = (x, y) => `${x},${y}`;

// Take away whatever stands on the tile (sand stays: it's ground)
export function clearEditorTile(x, y) {
  const here = o => Math.abs(o.x - x) < TILE_SIZE / 2 && Math.abs(o.y - y) < TILE_SIZE / 2;
  for (const list of ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres',
    'naturalRocks', 'waterTiles', 'boars', 'buildings', 'editorOutposts']) {
    game[list] = game[list].filter(o => !here(o));
  }
}

export function hasSomethingOn(x, y) {
  return (isTileOccupied(x, y) || game.editorOutposts.some(o => o.x === x && o.y === y)) &&
    Math.hypot(x - townHall.x, y - townHall.y) >= townHall.radius + 15;
}

// Does the tile already have what this tool puts there?
export function tileHasTool(tool, gx, gy) {
  const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
  if (tool.id === 'outpost') return game.editorOutposts.some(o => o.x === x && o.y === y);
  const at = list => game[list].find(o => o.x === x && o.y === y);
  if (tool.id === 'water') return !!at('waterTiles');
  if (tool.id === 'sand') return !!at('desertTiles');
  if (tool.id === 'savanna') return !!at('savannaTiles');
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
    if (tool.id === 'outpost') game.editorOutposts = game.editorOutposts.filter(o => o.x !== x || o.y !== y);
    else if (tool.id === 'sand') game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    else if (tool.id === 'savanna') game.savannaTiles = game.savannaTiles.filter(d => d.x !== x || d.y !== y);
    else if (tool.building && GAME_CONFIG.buildings[tool.building].onWater) {
      game.buildings = game.buildings.filter(b => b.x !== x || b.y !== y || b.type !== tool.building);
    }
    else clearEditorTile(x, y);
    return;
  }
  if (tool.id === 'erase') {
    if (hasSomethingOn(x, y)) clearEditorTile(x, y);
    else game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    game.savannaTiles = game.savannaTiles.filter(d => d.x !== x || d.y !== y);
    return;
  }
  // the border is where enemies come from: nothing goes there
  if (isBorderZone(gx, gy)) return;
  if (tool.id === 'sand') {
    game.waterTiles = game.waterTiles.filter(w => w.x !== x || w.y !== y);
    game.naturalRocks = game.naturalRocks.filter(r => r.x !== x || r.y !== y);
    game.savannaTiles = game.savannaTiles.filter(d => d.x !== x || d.y !== y);
    if (!game.desertTiles.some(d => d.x === x && d.y === y)) game.desertTiles.push({ x, y });
    return;
  }
  if (tool.id === 'savanna') {
    game.waterTiles = game.waterTiles.filter(w => w.x !== x || w.y !== y);
    game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    if (!game.savannaTiles.some(d => d.x === x && d.y === y)) game.savannaTiles.push({ x, y });
    return;
  }
  // the town hall's own tiles stay free
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return;
  if (tool.id === 'outpost') {
    if (game.editorOutposts.length >= 3) { showNotification(t('editor.outpostsLimit'), true); return; }
    const grid = getGridPos(x, y), hall = getGridPos(townHall.x, townHall.y);
    const startRadius = GAME_CONFIG.territory.startTiles / 2;
    if (Math.abs(grid.gx - hall.gx) < startRadius && Math.abs(grid.gy - hall.gy) < startRadius) return;
    const expansion = GAME_CONFIG.territory.buildingTiles;
    if (game.buildings.some(building => !GAME_CONFIG.territory.skip.includes(building.type) &&
      Math.hypot(getGridPos(building.x, building.y).gx - grid.gx, getGridPos(building.x, building.y).gy - grid.gy) <= expansion)) return;
    clearEditorTile(x, y);
    game.editorOutposts.push({ x, y });
    return;
  }
  // (#248) a fish trap sits on water; keep the water tile beneath it
  if (tool.building && GAME_CONFIG.buildings[tool.building].onWater) {
    const water = game.waterTiles.find(w => w.x === x && w.y === y);
    if (!water || !isWaterReachable(water) || game.buildings.some(b => b.x === x && b.y === y)) return;
    game.buildings.push(makeBuilt(tool.building, x, y));
    return;
  }
  // (#326, 27.10, 26) a mine goes on a source, which stays under it
  if (tool.building && GAME_CONFIG.buildings[tool.building].onSpawner) {
    if (game.naturalRocks.some(r => r.oreSpawner && r.x === x && r.y === y) && !game.buildings.some(b => b.x === x && b.y === y)) game.buildings.push(makeBuilt(tool.building, x, y));
    return;
  }
  clearEditorTile(x, y);
  if (tool.id === 'water') {
    game.desertTiles = game.desertTiles.filter(d => d.x !== x || d.y !== y);
    game.savannaTiles = game.savannaTiles.filter(d => d.x !== x || d.y !== y);
    game.waterTiles.push({ x, y, isFishing: false, fishTimer: 0, fishCount: GAME_CONFIG.fishing.fishCapacity, fishRegrowTimer: 0 });
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
  if (tool.id === 'outpost') { applyEditorTool(tool, gx, gy, clearing); return; }
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

// ---- Undo and redo (#255): the map as it was before each change, the last HISTORY_SIZE of them

const HISTORY_SIZE = 40;
/** @type {any[]} */
const undoStack = [];
/** @type {any[]} */
const redoStack = [];
const snapshot = () => ({
  lists: Object.fromEntries(EDITOR_LISTS.map(list => [list, structuredClone(game[list])])),
  hall: { x: townHall.x, y: townHall.y }
});
function restore(shot) {
  for (const list of EDITOR_LISTS) game[list] = shot.lists[list];
  townHall.x = shot.hall.x; townHall.y = shot.hall.y;
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

export const EDITOR_LISTS = ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres',
  'naturalRocks', 'waterTiles', 'desertTiles', 'savannaTiles', 'beachTiles', 'boars', 'buildings', 'editorOutposts'];

// ---- Opening and leaving the editor

// source: { map } a saved map, or { cols, rows, generate } a new one (generate: from the generator, else empty)
let startingEditor = false;
export async function startEditor(source) {
  if (startingEditor) return;
  startingEditor = true;
  game.gameMode = 'editor';
  const endlessSize = game.mapSettings;
  try {
    if (source.map) {
      editor.name = source.map.name;
      editor.faction = source.map.faction || 'humans';
      editor.startTime = source.map.startTime || 'day';
    } else {
      // a generated map: the editor's own seed, the generator's settings (its gear), the size picked here
      editor.name = '';
      editor.startTime = 'day';
      game.mapSettings = { cols: source.cols, rows: source.rows };
      applySeedFromUI();
    }
    const map = source.map || (source.generate ? undefined : { cols: source.cols, rows: source.rows });
    await runLoading('loading.world', resetGameSteps(map), () => {
      game.dayTime = timeOfPhase(editor.startTime);
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
    });
  } finally {
    game.mapSettings = endlessSize;
    startingEditor = false;
  }
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
  game.gameStarted = false;
  game.gameMode = 'endless';
  document.body.classList.remove('editor-mode');
  game.customMap = map;
  setMapSource('custom');
  startGame();
}
