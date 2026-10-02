// Map editor (#37): make a map by hand, tile by tile, save it on the device, and play it in Endless
// ("Custom map" there, see renderCustomMapList). A new map starts empty or from the generator (the
// seed and generator settings of the Endless screen); a saved one can be opened again and changed.
//
// In the editor the world is the ordinary game world with the clock stopped: a tool puts its thing on
// the tapped tile (the brush can cover 3×3), replacing what was there; on a tile that already has that
// thing it clears it instead. Rows and columns can be added or taken away at any edge. Saved maps are
// plain data (serializeMap), keyed by name in localStorage; loadCustomMap() builds the world from one.

const MAP_STORAGE_KEY = 'sovereign-will-maps';

// What can be put on a tile, by palette category (the eraser has its own button). kind: a
// GAME_CONFIG.mapResources entry; building: a GAME_CONFIG.buildings one.
const EDITOR_CATEGORIES = ['terrain', 'nature', 'ore', 'buildings'];
const EDITOR_TOOLS = [
  { id: 'erase', icon: 'eraser' },
  { id: 'water', icon: 'water', category: 'terrain' },
  { id: 'rock', icon: 'rock', category: 'terrain' },
  { id: 'sand', icon: 'sand', category: 'terrain' },
  { id: 'tree', icon: 'tree', kind: 'tree', category: 'nature' },
  { id: 'apple_tree', icon: 'apple_tree', kind: 'tree', category: 'nature' },
  { id: 'cactus', icon: 'cactus', kind: 'cactus', category: 'nature' },
  { id: 'boulder', icon: 'boulder', kind: 'boulder', category: 'nature' },
  { id: 'grass', icon: 'grass', kind: 'grass', category: 'nature' },
  { id: 'berry_bush', icon: 'berry_bush', kind: 'berry_bush', category: 'nature' },
  { id: 'stick', icon: 'stick', kind: 'stick', category: 'nature' },
  { id: 'pebble', icon: 'pebble', kind: 'pebble', category: 'nature' },
  { id: 'boar', icon: 'boar', category: 'nature' },
  { id: 'iron_ore', icon: 'iron_ore', kind: 'iron_ore', category: 'ore' },
  { id: 'coal_ore', icon: 'coal_ore', kind: 'coal_ore', category: 'ore' },
  { id: 'iron_spawner', icon: 'iron_spawner', spawner: 'iron', category: 'ore' },
  { id: 'coal_spawner', icon: 'coal_spawner', spawner: 'coal', category: 'ore' },
  { id: 'town_hall', icon: 'hall', category: 'buildings' },
  // buildings, except crops (those are planted in farm zones)
  ...Object.values(GAME_CONFIG.buildings)
    .filter(b => !Object.values(GAME_CONFIG.farming.crops).includes(b.id))
    .map(b => ({ id: b.id, icon: b.icon, building: b.id, category: 'buildings' }))
];

// how small and big a map can be made (the same as the Endless custom size)
const EDITOR_MIN_TILES = 20, EDITOR_MAX_TILES = 100;

const editor = {
  tool: 'tree',
  category: 'nature',
  brush: 1,     // 1 or 3: a 3×3 brush covers the tapped tile and the ones around it
  name: ''      // the name it was opened or last saved as
};

// ---- Saved maps

function loadSavedMaps() {
  try { return JSON.parse(localStorage.getItem(MAP_STORAGE_KEY)) || {}; } catch (e) { return {}; }
}

function storeSavedMaps(maps) {
  try { localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(maps)); return true; } catch (e) { return false; }
}

// The world as plain data: tiles by grid position
function serializeMap(name) {
  const tile = o => [Math.floor(o.x / TILE_SIZE), Math.floor(o.y / TILE_SIZE)];
  const resources = {};
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (kind === 'boar' || kind === 'farm') continue;
    resources[kind] = WORLD[def.list].filter(r => !r.oreSpawner).map(tile);
  }
  return {
    name, cols: COLS, rows: ROWS,
    hall: [townHall.x, townHall.y],
    water: waterTiles.map(tile),
    sand: desertTiles.map(tile),
    resources,
    apples: trees.filter(tr => tr.apple).map(tile),
    spawners: naturalRocks.filter(r => r.oreSpawner).map(r => [...tile(r), r.oreSpawner]),
    boars: boars.filter(b => !b.isCarcass).map(tile),
    buildings: buildings.map(b => [b.type, ...tile(b)])
  };
}

// Build the world from a saved map, in place of generateMap() (see resetGame)
function loadCustomMap(map) {
  naturalRocks = []; waterTiles = []; desertTiles = []; desertRegion = null; beachTiles = []; forests = [];
  trees = []; cacti = []; boulders = []; grassList = []; berryBushes = []; sticks = []; pebbles = [];
  ironOres = []; coalOres = []; boars = []; buildings = [];
  const at = ([gx, gy]) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
  if (map.hall) { townHall.x = map.hall[0]; townHall.y = map.hall[1]; }
  for (const t of map.water || []) waterTiles.push({ ...at(t), isFishing: false, fishTimer: 0 });
  for (const t of map.sand || []) desertTiles.push(at(t));
  for (const [kind, tiles] of Object.entries(map.resources || {})) {
    if (!GAME_CONFIG.mapResources[kind]) continue;
    for (const t of tiles) { const p = at(t); addMapResource(kind, p.x, p.y); }
  }
  const appleKeys = new Set((map.apples || []).map(t => `${t[0]},${t[1]}`));
  for (const tr of trees) if (appleKeys.has(`${Math.floor(tr.x / TILE_SIZE)},${Math.floor(tr.y / TILE_SIZE)}`)) makeAppleTree(tr);
  for (const [gx, gy, kind] of map.spawners || []) {
    const p = at([gx, gy]);
    addMapResource('natural_rock', p.x, p.y).oreSpawner = kind;
  }
  for (const t of map.boars || []) placeBoar(at(t));
  for (const [type, gx, gy] of map.buildings || []) {
    if (!getDefinition('buildings', type)) continue;
    const p = at([gx, gy]);
    buildings.push(makeBuilt(type, p.x, p.y));
  }
  placeBeaches();
  camera.x = townHall.x; camera.y = townHall.y;
}

function placeBoar({ x, y }) {
  const hp = GAME_CONFIG.mapResources.boar.hp;
  boars.push({ x, y, hp, maxHp: hp, priority: 0, wanderTimer: rand() * 4, wanderInterval: 3 + rand() * 3, targetX: x, targetY: y });
}

// A finished building (a blueprint with its building work done)
function makeBuilt(type, x, y) {
  const b = createBuildingBlueprint(type, x, y);
  delete b.progress;
  delete b.maxProgress;
  return b;
}

// ---- Editing

const tileKey = (x, y) => `${x},${y}`;

// Take away whatever stands on the tile (sand stays: it's ground)
function clearEditorTile(x, y) {
  const here = o => Math.abs(o.x - x) < TILE_SIZE / 2 && Math.abs(o.y - y) < TILE_SIZE / 2;
  for (const list of ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres',
    'naturalRocks', 'waterTiles', 'boars', 'buildings']) {
    WORLD[list] = WORLD[list].filter(o => !here(o));
  }
}

function hasSomethingOn(x, y) {
  return isTileOccupied(x, y) && Math.hypot(x - townHall.x, y - townHall.y) >= townHall.radius + 15;
}

// Does the tile already have what this tool puts there?
function tileHasTool(tool, gx, gy) {
  const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
  const at = list => WORLD[list].find(o => o.x === x && o.y === y);
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
function applyEditorTool(tool, gx, gy, clearing) {
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;
  const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
  if (clearing) {
    if (!tileHasTool(tool, gx, gy)) return;
    if (tool.id === 'sand') desertTiles = desertTiles.filter(d => d.x !== x || d.y !== y);
    else clearEditorTile(x, y);
    return;
  }
  if (tool.id === 'erase') {
    if (hasSomethingOn(x, y)) clearEditorTile(x, y);
    else desertTiles = desertTiles.filter(d => d.x !== x || d.y !== y);
    return;
  }
  // the border is where enemies come from: nothing goes there
  if (isBorderZone(gx, gy)) return;
  if (tool.id === 'sand') {
    waterTiles = waterTiles.filter(w => w.x !== x || w.y !== y);
    naturalRocks = naturalRocks.filter(r => r.x !== x || r.y !== y);
    if (!desertTiles.some(d => d.x === x && d.y === y)) desertTiles.push({ x, y });
    return;
  }
  // the town hall's own tiles stay free
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return;
  clearEditorTile(x, y);
  if (tool.id === 'water') {
    desertTiles = desertTiles.filter(d => d.x !== x || d.y !== y);
    waterTiles.push({ x, y, isFishing: false, fishTimer: 0 });
  } else if (tool.id === 'rock') {
    addMapResource('natural_rock', x, y);
  } else if (tool.spawner) {
    addMapResource('natural_rock', x, y).oreSpawner = tool.spawner;
  } else if (tool.id === 'boar') {
    placeBoar({ x, y });
  } else if (tool.building) {
    buildings.push(makeBuilt(tool.building, x, y));
  } else if (tool.kind) {
    const r = addMapResource(tool.kind, x, y);
    if (tool.id === 'apple_tree') makeAppleTree(r);
  }
}

// The town hall moves to the tile corner nearest the tap; what was under it goes
function moveTownHall(x, y) {
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

function editorTap(x, y) {
  const tool = EDITOR_TOOLS.find(tl => tl.id === editor.tool);
  if (!tool) return;
  if (tool.id === 'town_hall') moveTownHall(x, y);
  else {
    const g = getGridPos(x, y);
    const r = editor.brush === 3 ? 1 : 0;
    // the tapped tile already has it: this tap clears it (and the same around it, with the big brush)
    const clearing = tileHasTool(tool, g.gx, g.gy);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) applyEditorTool(tool, g.gx + dx, g.gy + dy, clearing);
  }
  resetTileIndex();
}

// ---- Map size

const EDITOR_LISTS = ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres',
  'naturalRocks', 'waterTiles', 'desertTiles', 'beachTiles', 'boars', 'buildings'];

// Add (delta 1) or take away (delta -1) a whole row or column of tiles at one edge: top, bottom, left,
// right. What would end up off the map or on the new border goes; the town hall must stay clear of it.
function resizeEditorMap(side, delta) {
  const horizontal = side === 'left' || side === 'right';
  const cols = COLS + (horizontal ? delta : 0), rows = ROWS + (horizontal ? 0 : delta);
  if (Math.min(cols, rows) < EDITOR_MIN_TILES || Math.max(cols, rows) > EDITOR_MAX_TILES) return;
  const shiftX = side === 'left' ? delta * TILE_SIZE : 0, shiftY = side === 'top' ? delta * TILE_SIZE : 0;
  const inBorder = (gx, gy) => gx < BORDER_MARGIN || gy < BORDER_MARGIN || gx >= cols - BORDER_MARGIN || gy >= rows - BORDER_MARGIN;
  const hall = getGridPos(townHall.x + shiftX - 1, townHall.y + shiftY - 1);
  if (inBorder(hall.gx, hall.gy) || inBorder(hall.gx + 1, hall.gy + 1)) { showNotification(t('editor.hallInTheWay'), true); return; }
  for (const list of EDITOR_LISTS) {
    WORLD[list] = WORLD[list].filter(o => {
      o.x += shiftX; o.y += shiftY;
      const g = getGridPos(o.x, o.y);
      return !inBorder(g.gx, g.gy);
    });
  }
  townHall.x += shiftX; townHall.y += shiftY;
  COLS = cols; ROWS = rows;
  WORLD_WIDTH = cols * TILE_SIZE; WORLD_HEIGHT = rows * TILE_SIZE;
  camera.x += shiftX; camera.y += shiftY;
  clampCamera();
  resetTileIndex();
  invalidateAllPaths();
  renderEditorPanel();
}

// ---- Opening and leaving the editor

// source: { map } a saved map, or { cols, rows, generate } a new one (generate: from the generator, else empty)
function startEditor(source) {
  gameMode = 'editor';
  if (source.map) {
    editor.name = source.map.name;
    resetGame(source.map);
  } else {
    // a generated map uses the Endless seed and generator settings, at the size picked here
    editor.name = '';
    const endlessSize = mapSettings;
    mapSettings = { cols: source.cols, rows: source.rows };
    applySeedFromUI();
    resetGame(source.generate ? null : { cols: source.cols, rows: source.rows });
    mapSettings = endlessSize;
  }
  settlers = []; enemies = []; corpses = [];
  waveTimer = Infinity; foodTimer = Infinity; boarRespawnTimer = Infinity;
  resetTileIndex();
  setZoom(0); clampCamera();
  gameStarted = true;
  document.getElementById('main-menu').style.display = 'none';
  document.body.classList.add('editor-mode');
  document.getElementById('editor-name').value = editor.name;
  renderEditorPanel();
}

function leaveEditor() {
  gameMode = 'endless';
  document.body.classList.remove('editor-mode');
  exitToMainMenu();
  renderEditorMapList();
  showMenuScreen('editor');
}

function saveEditorMap() {
  const name = document.getElementById('editor-name').value.trim();
  if (!name) { showNotification(t('editor.needName'), true); return; }
  const maps = loadSavedMaps();
  maps[name] = serializeMap(name);
  if (!storeSavedMaps(maps)) { showNotification(t('editor.saveFailed'), true); return; }
  editor.name = name;
  showNotification(t('editor.saved', { name }), false);
}

// ---- Panels

function renderEditorPanel() {
  const tools = document.getElementById('editor-tools');
  tools.innerHTML = '';
  for (const tool of EDITOR_TOOLS.filter(tl => tl.category === editor.category)) {
    const button = document.createElement('button');
    button.className = 'btn' + (editor.tool === tool.id ? ' active' : '');
    button.dataset.tool = tool.id;
    const label = tool.building ? getDefinition('buildings', tool.building).label : t(`editor.tool.${tool.id}`);
    setRichText(button, `[[${tool.icon}]] ${label}`);
    onTap(button, () => { editor.tool = tool.id; renderEditorPanel(); });
    tools.appendChild(button);
  }
  document.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('active', Number(b.dataset.brush) === editor.brush));
  document.querySelectorAll('[data-editor-category]').forEach(b => b.classList.toggle('active', b.dataset.editorCategory === editor.category));
  document.getElementById('editor-erase').classList.toggle('active', editor.tool === 'erase');
  document.getElementById('editor-size').textContent = `${COLS}×${ROWS}`;
}

// The editor's menu screen: new map (size, empty or generated) and the saved maps to open or delete
function renderEditorMapList() {
  renderSavedMapList(document.getElementById('editor-map-list'), {
    open: map => startEditor({ map }),
    remove: name => { const maps = loadSavedMaps(); delete maps[name]; storeSavedMaps(maps); renderEditorMapList(); }
  });
}

// The saved maps, one per row: its name and size; in the editor's menu also a delete button (asks first)
function renderSavedMapList(list, { open, remove, selected }) {
  const maps = loadSavedMaps();
  renderItemList(list, Object.values(maps).map(map => ({ id: map.name, label: `${map.name} · ${map.cols}×${map.rows}` })), {
    attr: 'map', selected, emptyText: t('editor.noMaps'),
    onPick: name => open(maps[name]),
    onDelete: remove
  });
  list.classList.toggle('no-delete', !remove);
}

// Endless: random (generated) map, or one of the saved maps
let mapSource = 'random';

function renderCustomMapList() {
  const maps = loadSavedMaps();
  // the chosen map may have been deleted or changed in the editor since
  if (customMap) customMap = maps[customMap.name] || null;
  if (mapSource === 'custom' && !customMap) customMap = Object.values(maps)[0] || null;
  renderSavedMapList(document.getElementById('custom-map-list'), {
    selected: customMap && customMap.name,
    open: map => { customMap = map; renderCustomMapList(); }
  });
}

function setMapSource(source) {
  mapSource = source;
  document.querySelectorAll('[data-map-source]').forEach(b => b.classList.toggle('active', b.dataset.mapSource === source));
  document.getElementById('main-menu').classList.toggle('custom-map', source === 'custom');
  if (source === 'random') customMap = null;
  renderCustomMapList();
}

let editorNewSize = 40;
document.querySelectorAll('[data-editor-size]').forEach(button => onTap(button, () => {
  editorNewSize = Number(button.dataset.editorSize);
  document.querySelectorAll('[data-editor-size]').forEach(b => b.classList.toggle('active', b === button));
}));

document.getElementById('mode-editor').disabled = false;
onTap(document.getElementById('mode-editor'), () => { renderEditorMapList(); showMenuScreen('editor'); });
onTap(document.getElementById('editor-new-empty'), () => startEditor({ cols: editorNewSize, rows: editorNewSize, generate: false }));
onTap(document.getElementById('editor-new-generated'), () => startEditor({ cols: editorNewSize, rows: editorNewSize, generate: true }));
onTap(document.getElementById('editor-save'), saveEditorMap);
document.querySelectorAll('[data-brush]').forEach(button => onTap(button, () => { editor.brush = Number(button.dataset.brush); renderEditorPanel(); }));
document.querySelectorAll('[data-editor-category]').forEach(button => onTap(button, () => {
  editor.category = button.dataset.editorCategory;
  if (editor.tool !== 'erase') editor.tool = EDITOR_TOOLS.find(tl => tl.category === editor.category).id;
  renderEditorPanel();
}));
onTap(document.getElementById('editor-erase'), () => { editor.tool = 'erase'; renderEditorPanel(); });
onTap(document.getElementById('editor-resize'), () => { document.getElementById('editor-resize-panel').hidden ^= true; });
document.querySelectorAll('[data-resize]').forEach(button => onTap(button, () => {
  const [side, delta] = button.dataset.resize.split(':');
  resizeEditorMap(side, Number(delta));
}));
document.querySelectorAll('[data-map-source]').forEach(button => onTap(button, () => setMapSource(button.dataset.mapSource)));
onTap(document.getElementById('mode-endless'), renderCustomMapList); // maps may have changed in the editor
