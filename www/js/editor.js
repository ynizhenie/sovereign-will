// Map editor (#37): make a map by hand, tile by tile, save it on the device, and play it in Endless
// ("Custom map" there, see renderCustomMapList). A new map starts empty or from the generator (the
// seed and generator settings of the Endless screen); a saved one can be opened again and changed.
//
// In the editor the world is the ordinary game world with the clock stopped: a tool puts its thing on
// the tapped tile (the brush can cover 3×3), replacing what was there. Saved maps are plain data
// (serializeMap), keyed by name in localStorage; loadCustomMap() builds the world from one.

const MAP_STORAGE_KEY = 'sovereign-will-maps';

// What can be put on a tile. kind: a GAME_CONFIG.mapResources entry; building: a GAME_CONFIG.buildings one.
const EDITOR_TOOLS = [
  { id: 'erase', icon: '🧽' },
  { id: 'water', icon: '🌊' },
  { id: 'rock', icon: '⛰️' },
  { id: 'sand', icon: '🏜️' },
  { id: 'town_hall', icon: '🏛️' },
  { id: 'tree', icon: '🌲', kind: 'tree' },
  { id: 'apple_tree', icon: '🍎', kind: 'tree' },
  { id: 'cactus', icon: '🌵', kind: 'cactus' },
  { id: 'boulder', icon: '🪨', kind: 'boulder' },
  { id: 'grass', icon: '🌿', kind: 'grass' },
  { id: 'berry_bush', icon: '🫐', kind: 'berry_bush' },
  { id: 'stick', icon: '🥢', kind: 'stick' },
  { id: 'pebble', icon: '🔘', kind: 'pebble' },
  { id: 'iron_ore', icon: '🟤', kind: 'iron_ore' },
  { id: 'coal_ore', icon: '⚫', kind: 'coal_ore' },
  { id: 'iron_spawner', icon: '🟫', spawner: 'iron' },
  { id: 'coal_spawner', icon: '⬛', spawner: 'coal' },
  { id: 'boar', icon: '🐗' },
  // buildings, except crops (those are planted in farm zones)
  ...Object.values(GAME_CONFIG.buildings)
    .filter(b => !Object.values(GAME_CONFIG.farming.crops).includes(b.id))
    .map(b => ({ id: b.id, icon: b.icon, building: b.id }))
];

const editor = {
  tool: 'tree',
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

// The tool on one tile
function applyEditorTool(tool, gx, gy) {
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;
  const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
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
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) applyEditorTool(tool, g.gx + dx, g.gy + dy);
  }
  resetTileIndex();
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
  for (const tool of EDITOR_TOOLS) {
    const button = document.createElement('button');
    button.className = 'btn' + (editor.tool === tool.id ? ' active' : '');
    button.dataset.tool = tool.id;
    const label = tool.building ? getDefinition('buildings', tool.building).label : t(`editor.tool.${tool.id}`);
    button.textContent = `${tool.icon} ${label}`;
    onTap(button, () => { editor.tool = tool.id; renderEditorPanel(); });
    tools.appendChild(button);
  }
  document.querySelectorAll('[data-brush]').forEach(b => b.classList.toggle('active', Number(b.dataset.brush) === editor.brush));
}

// The editor's menu screen: new map (size, empty or generated) and the saved maps to open or delete
function renderEditorMapList() {
  renderSavedMapList(document.getElementById('editor-map-list'), {
    open: map => startEditor({ map }),
    remove: name => { const maps = loadSavedMaps(); delete maps[name]; storeSavedMaps(maps); renderEditorMapList(); }
  });
}

function renderSavedMapList(list, { open, remove, selected }) {
  list.innerHTML = '';
  const maps = loadSavedMaps();
  if (Object.keys(maps).length === 0) {
    const empty = document.createElement('div');
    empty.className = 'map-list-empty';
    empty.textContent = t('editor.noMaps');
    list.appendChild(empty);
    return;
  }
  for (const [name, map] of Object.entries(maps)) {
    const item = document.createElement('span');
    const pick = document.createElement('button');
    pick.className = 'fps-option' + (selected === name ? ' active' : '');
    pick.textContent = `${name} · ${map.cols}×${map.rows}`;
    pick.dataset.map = name;
    onTap(pick, () => open(map));
    item.appendChild(pick);
    if (remove) {
      const del = document.createElement('button');
      del.className = 'fps-option';
      del.textContent = '✖';
      del.dataset.deleteMap = name;
      onTap(del, () => remove(name));
      item.appendChild(del);
    }
    list.appendChild(item);
  }
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
onTap(document.getElementById('editor-menu'), leaveEditor);
document.querySelectorAll('[data-brush]').forEach(button => onTap(button, () => { editor.brush = Number(button.dataset.brush); renderEditorPanel(); }));
document.querySelectorAll('[data-map-source]').forEach(button => onTap(button, () => setMapSource(button.dataset.mapSource)));
onTap(document.getElementById('mode-endless'), renderCustomMapList); // maps may have changed in the editor
