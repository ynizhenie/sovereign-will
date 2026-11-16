// Saved maps: stored on the device as plain data, and a world built from one

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, loadData, onTap, saveData, t } from '../../engine/platform/index.js';
import { TILE_SIZE, game, newWorldEpoch, rand, townHall } from '../../engine/world/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { placeBeaches, setStartingWeather } from '../../domains/world/index.js';
import { addMapResource } from '../../domains/economy/gathering/index.js';
import { makeAppleTree } from '../../domains/economy/farming/index.js';
import { escapeHtml, iconHtml, renderItemList } from '../../ui/index.js';
import { showMenuScreen } from '../menu/index.js';
import { editor } from './editor.tools.js';

// ---- Saved maps

export function loadSavedMaps() {
  return loadData('maps', {});
}

export function storeSavedMaps(maps) {
  return saveData('maps', maps);
}

// (#326) Tiles of one kind as runs along a row, [row, first column, how many]: a continent's sea is a hundred thousand tiles, a
// run each many (a map saved with the tiles one by one, `water` and `sand`, loads as ever)
function toRuns(list) {
  const rows = new Map();
  for (const o of list) {
    const gx = Math.floor(o.x / TILE_SIZE), gy = Math.floor(o.y / TILE_SIZE);
    if (!rows.has(gy)) rows.set(gy, []);
    rows.get(gy).push(gx);
  }
  const runs = [];
  for (const [gy, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0], prev = xs[0];
    for (const gx of xs.slice(1)) {
      if (gx === prev + 1) { prev = gx; continue; }
      if (gx === prev) continue;
      runs.push([gy, start, prev - start + 1]); start = prev = gx;
    }
    runs.push([gy, start, prev - start + 1]);
  }
  return runs;
}
const fromRuns = function* (runs) {
  for (const [gy, gx, count] of runs) {
    for (let k = 0; k < count; k++) yield [gx + k, gy];
  }
};
const countRunTiles = runs => runs.reduce((count, run) => count + run[2], 0);

// The world as plain data: tiles by grid position
export function serializeMap(name) {
  placeBeaches();
  const tile = o => [Math.floor(o.x / TILE_SIZE), Math.floor(o.y / TILE_SIZE)];
  const resources = {};
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (kind === 'boar' || kind === 'farm' || kind === 'loot') continue;
    resources[kind] = game[def.list].filter(r => !r.oreSpawner).map(tile);
  }
  return {
    name, cols: game.COLS, rows: game.ROWS, faction: editor.faction, startTime: editor.startTime, weather: editor.weather,
    hall: [townHall.x, townHall.y],
    waterRuns: toRuns(game.waterTiles),
    sandRuns: toRuns(game.desertTiles),
    savannaRuns: toRuns(game.savannaTiles),
    beachRuns: toRuns(game.beachTiles),
    resources,
    apples: game.trees.filter(tr => tr.apple).map(tile),
    spawners: game.naturalRocks.filter(r => r.oreSpawner).map(r => [...tile(r), r.oreSpawner]),
    boars: game.boars.filter(b => !b.isCarcass).map(tile),
    outposts: game.editorOutposts.map(tile),
    buildings: game.buildings.map(b => [b.type, ...tile(b)])
  };
}

// Build the world from a saved map, in place of generateMap() (see resetGame)
export function loadCustomMap(map) {
  for (const _ of loadCustomMapSteps(map));
}

export function* loadCustomMapSteps(map) {
  game.naturalRocks = []; game.waterTiles = []; game.desertTiles = []; game.desertRegion = null; game.savannaTiles = []; game.beachTiles = []; game.forests = [];
  game.trees = []; game.cacti = []; game.boulders = []; game.grassList = []; game.berryBushes = []; game.sticks = []; game.pebbles = []; game.logs = []; game.stumps = [];
  game.ironOres = []; game.coalOres = []; game.boars = []; game.buildings = []; game.editorOutposts = [];
  const at = ([gx, gy]) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
  if (map.hall) { townHall.x = map.hall[0]; townHall.y = map.hall[1]; }
  const water = map.waterRuns ? fromRuns(map.waterRuns) : map.water || [];
  const sand = map.sandRuns ? fromRuns(map.sandRuns) : map.sand || [];
  const savanna = map.savannaRuns ? fromRuns(map.savannaRuns) : map.savanna || [];
  const resources = Object.entries(map.resources || {}).filter(([kind]) => !!GAME_CONFIG.mapResources[kind]);
  const apples = map.apples || [], spawners = map.spawners || [], boars = map.boars || [];
  const buildings = map.buildings || [], outposts = (map.outposts || []).slice(0, 3);
  const hasBeachRuns = !!map.beachRuns?.length;
  const beaches = hasBeachRuns ? fromRuns(map.beachRuns) : [];
  const count = (runs, entries) => runs ? countRunTiles(runs) : entries.length;
  const total = Math.max(1, count(map.waterRuns, map.water || []) + count(map.sandRuns, map.sand || []) +
    count(map.savannaRuns, map.savanna || []) +
    resources.reduce((sum, [, tiles]) => sum + tiles.length, 0) + apples.length + spawners.length +
    boars.length + buildings.length + outposts.length + (hasBeachRuns ? countRunTiles(map.beachRuns) : 0));
  let completed = 0, lastYield = 0;
  const loadEntries = function* (entries, load) {
    for (const entry of entries) {
      load(entry);
      completed++;
      if (completed - lastYield >= 128 || completed === total) {
        lastYield = completed;
        yield 0.1 + 0.75 * completed / total;
      }
    }
    if (lastYield !== completed) {
      lastYield = completed;
      yield 0.1 + 0.75 * completed / total;
    }
  };
  yield 0.1;
  yield* loadEntries(water, t => game.waterTiles.push({ ...at(t), isFishing: false, fishTimer: 0, fishCount: GAME_CONFIG.fishing.fishCapacity, fishRegrowTimer: 0 }));
  yield* loadEntries(sand, t => game.desertTiles.push(at(t)));
  yield* loadEntries(savanna, t => game.savannaTiles.push(at(t)));
  for (const [kind, tiles] of resources) {
    yield* loadEntries(tiles, t => { const p = at(t); addMapResource(kind, p.x, p.y); });
  }
  if (apples.length) {
    const appleKeys = new Set(apples.map(([gx, gy]) => `${gx},${gy}`));
    for (const tree of game.trees) {
      const key = `${Math.floor(tree.x / TILE_SIZE)},${Math.floor(tree.y / TILE_SIZE)}`;
      if (!appleKeys.delete(key)) continue;
      makeAppleTree(tree);
      completed++;
      if (completed - lastYield >= 128 || completed === total) {
        lastYield = completed;
        yield 0.1 + 0.75 * completed / total;
      }
    }
    if (lastYield < completed) {
      lastYield = completed;
      yield 0.1 + 0.75 * completed / total;
    }
  }
  yield* loadEntries(spawners, ([gx, gy, kind]) => {
    const p = at([gx, gy]);
    addMapResource('natural_rock', p.x, p.y).oreSpawner = kind;
  });
  yield* loadEntries(boars, t => placeBoar(at(t)));
  yield* loadEntries(buildings, ([type, gx, gy]) => {
    if (!getDefinition('buildings', type)) return;
    const p = at([gx, gy]);
    game.buildings.push(makeBuilt(type, p.x, p.y));
  });
  game.editorOutposts = outposts.map(at);
  completed += outposts.length;
  if (outposts.length) yield 0.1 + 0.75 * completed / total;
  camera.x = townHall.x; camera.y = townHall.y;
  if (hasBeachRuns) {
    yield* loadEntries(beaches, t => game.beachTiles.push(at(t)));
  } else {
    placeBeaches();
  }
  // The terrain chunks may have been painted while this same-sized editor map was still open.
  newWorldEpoch();
  // the time of day it starts at (#257): a little into that part of the day; the morning as ever by default
  const c = GAME_CONFIG.daytime, startAt = { morning: c.morning / 2, day: c.morning + 1, evening: c.morning + c.day + 1, night: c.morning + c.day + c.evening + 1 };
  game.dayTime = startAt[map.startTime] ?? startAt.morning;
  setStartingWeather(['clear', 'rain', 'fog', 'storm'].includes(map.weather) ? map.weather : 'clear');
  yield 0.85;
}

export function placeBoar({ x, y }) {
  const hp = GAME_CONFIG.mapResources.boar.hp;
  game.boars.push({ x, y, hp, maxHp: hp, priority: 0, wanderTimer: rand() * 4, wanderInterval: 3 + rand() * 3, targetX: x, targetY: y });
}

// A finished building (a blueprint with its building work done)
/** @returns {import('../../engine/world/types.js').Building} */
export function makeBuilt(type, x, y) {
  const b = /** @type {any} */ (createBuildingBlueprint(type, x, y));
  delete b.progress;
  delete b.maxProgress;
  return b;
}

// The saved maps, one per row: its name and size; in the editor's menu also a delete button (asks first)
/** @param {Element} list @param {{ open: (map: Object) => void, remove?: (name: string) => void, selected?: string }} options */
export function renderSavedMapList(list, { open, remove, selected }) {
  const maps = loadSavedMaps();
  renderItemList(list, Object.values(maps).map(map => ({ id: map.name, label: `${map.name} · ${map.cols}×${map.rows}` })), {
    attr: 'map', selected, emptyText: t('editor.noMaps'),
    onPick: name => open(maps[name]),
    onDelete: remove
  });
  list.classList.toggle('no-delete', !remove);
}

function showMapManagerStatus(text) {
  const status = document.getElementById('map-manager-status');
  if (status) status.textContent = text;
}

function safeMapFilename(name) {
  return [...name].map(char => {
    const code = char.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char;
  }).join('').trim().slice(0, 64) || 'map';
}

function exportMap(map) {
  const blob = new Blob([JSON.stringify({ format: 'sovereign-will-map', version: 1, map }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeMapFilename(map.name)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isValidSavedMap(map) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const integer = value => Number.isInteger(value) && value >= 128 && value <= 512;
  const hall = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
  const points = (value, cols, rows) => Array.isArray(value) && value.every(point =>
    Array.isArray(point) && point.length === 2 && point.every(Number.isInteger) &&
      point[0] >= 0 && point[0] < cols && point[1] >= 0 && point[1] < rows);
  const runs = (value, cols, rows) => Array.isArray(value) && value.every(run =>
    Array.isArray(run) && run.length === 3 && run.every(Number.isInteger) &&
      run[0] >= 0 && run[0] < rows && run[1] >= 0 && run[1] < cols &&
      run[2] > 0 && run[1] + run[2] <= cols);
  if (!object(map) || !integer(map.cols) || !integer(map.rows)) return false;
  const { cols, rows } = map;
  return object(map) && typeof map.name === 'string' && integer(map.cols) && integer(map.rows) &&
    hall(map.hall) && map.hall[0] >= 0 && map.hall[0] <= cols * TILE_SIZE &&
    map.hall[1] >= 0 && map.hall[1] <= rows * TILE_SIZE && object(map.resources) &&
    (map.waterRuns ? runs(map.waterRuns, cols, rows) : points(map.water || [], cols, rows)) &&
    (map.sandRuns ? runs(map.sandRuns, cols, rows) : points(map.sand || [], cols, rows)) &&
    (map.savannaRuns ? runs(map.savannaRuns, cols, rows) : points(map.savanna || [], cols, rows)) &&
    (map.beachRuns ? runs(map.beachRuns, cols, rows) : points(map.beaches || [], cols, rows)) &&
    Object.values(map.resources).every(value => points(value, cols, rows)) && points(map.apples || [], cols, rows) &&
    Array.isArray(map.spawners) && map.spawners.every(row =>
      Array.isArray(row) && row.length === 3 && points([row.slice(0, 2)], cols, rows) && typeof row[2] === 'string') &&
    points(map.boars || [], cols, rows) && points(map.outposts || [], cols, rows) &&
    Array.isArray(map.buildings) && map.buildings.every(row =>
      Array.isArray(row) && row.length === 3 && typeof row[0] === 'string' && points([row.slice(1)], cols, rows));
}

function nextMapName(maps, name) {
  let suffix = 2, candidate = name;
  while (maps[candidate]) candidate = `${name} (${suffix++})`;
  return candidate;
}

async function importMapFile(file, changed, refresh) {
  let map;
  try {
    const envelope = JSON.parse(await file.text());
    if (envelope?.format !== 'sovereign-will-map' || envelope.version !== 1 || !isValidSavedMap(envelope.map)) {
      throw new Error('Unsupported or invalid map file');
    }
    map = envelope.map;
  } catch (error) {
    console.error('Could not import map file', error);
    showMapManagerStatus(t('editor.mapImportFailed'));
    return;
  }
  const maps = loadSavedMaps();
  const sourceName = String(map.name).trim().slice(0, 48) || t('editor.importedMap');
  const name = nextMapName(maps, sourceName);
  const imported = { ...map, name };
  maps[name] = imported;
  if (!storeSavedMaps(maps)) {
    showMapManagerStatus(t('editor.saveFailed'));
    return;
  }
  changed(null, name, maps);
  showMapManagerStatus(t('editor.mapImportDone', { name }));
  refresh();
}

/** @param {Element} list @param {{ select: (map: Object) => void, selected?: string | (() => string | null) | null, changed: (oldName: string | null, newName: string | null, maps: Record<string, any>) => void }} options */
export function renderMapManager(list, options) {
  const refresh = () => renderMapManager(list, options);
  const maps = loadSavedMaps();
  list.innerHTML = '';
  list.className = 'tile-grid save-tiles map-manager-tiles';
  const names = Object.keys(maps);
  if (!names.length) {
    const empty = document.createElement('div');
    empty.className = 'item-list-empty';
    empty.textContent = t('editor.noMaps');
    list.appendChild(empty);
    return;
  }
  const selected = typeof options.selected === 'function' ? options.selected() : options.selected;
  for (const name of names) {
    const map = maps[name];
    const wrap = document.createElement('div');
    wrap.className = `save-tile-wrap${name === selected ? ' current' : ''}`;
    const tile = document.createElement('button');
    tile.className = 'btn tile save-tile';
    tile.dataset.map = name;
    tile.innerHTML = `<span class="tile-name"><b>${escapeHtml(name)}</b></span>` +
      `<span class="tile-cost">${map.cols}×${map.rows}</span>`;
    onTap(tile, () => options.select(map));
    const nameInput = document.createElement('input');
    nameInput.className = 'menu-number save-name-input';
    nameInput.type = 'text';
    nameInput.maxLength = 48;
    nameInput.value = name;
    nameInput.placeholder = t('editor.mapNamePlaceholder');
    nameInput.setAttribute('aria-label', t('editor.renameMap'));
    nameInput.dataset.mapName = name;
    nameInput.addEventListener('change', () => {
      const newName = nameInput.value.trim().slice(0, 48);
      if (!newName) {
        showMapManagerStatus(t('editor.needMapName'));
        refresh();
        return;
      }
      const latest = loadSavedMaps();
      if (!latest[name]) return;
      if (newName !== name && latest[newName]) {
        showMapManagerStatus(t('editor.mapRenameExists'));
        refresh();
        return;
      }
      if (newName === name) return;
      latest[newName] = { ...latest[name], name: newName };
      delete latest[name];
      if (!storeSavedMaps(latest)) {
        showMapManagerStatus(t('editor.saveFailed'));
        refresh();
        return;
      }
      options.changed(name, newName, latest);
      showMapManagerStatus(t('editor.mapRenameDone', { name: newName }));
      refresh();
    });
    const exportButton = document.createElement('button');
    exportButton.className = 'btn tile-act save-export';
    exportButton.dataset.exportMap = name;
    exportButton.textContent = t('editor.exportMap');
    onTap(exportButton, () => exportMap(loadSavedMaps()[name]));
    wrap.append(nameInput, exportButton);
    const removeButton = document.createElement('button');
    removeButton.className = 'btn tile-act save-delete';
    removeButton.dataset.deleteMap = name;
    removeButton.setAttribute('aria-label', t('list.deleteQuestion', { name }));
    removeButton.innerHTML = iconHtml('close');
    onTap(removeButton, () => {
      removeButton.hidden = true;
      const question = document.createElement('span');
      question.className = 'item-question';
      question.textContent = t('list.deleteQuestion', { name: `${name} · ${map.cols}×${map.rows}` });
      const confirm = document.createElement('button');
      confirm.className = 'btn tile-act item-confirm';
      confirm.textContent = t('list.yes');
      confirm.dataset.confirmDelete = name;
      const cancel = document.createElement('button');
      cancel.className = 'btn tile-act item-cancel';
      cancel.textContent = t('list.no');
      cancel.dataset.cancelDelete = name;
      onTap(cancel, () => renderMapManager(list, options));
      onTap(confirm, () => {
        const latest = loadSavedMaps();
        delete latest[name];
        if (!storeSavedMaps(latest)) {
          showMapManagerStatus(t('editor.saveFailed'));
          return;
        }
        options.changed(name, null, latest);
        refresh();
      });
      wrap.append(question, confirm, cancel);
    });
    wrap.append(tile, removeButton);
    list.appendChild(wrap);
  }
}

/** @param {{ openEditor: (map: Object) => void, selectEndless: (map: Object) => void, selectedEndless: () => string | null, changed: (oldName: string | null, newName: string | null, maps: Record<string, any>) => void }} actions */
export function initMapManager(actions) {
  const list = document.getElementById('map-manager-list');
  const back = /** @type {HTMLElement | null} */ (document.querySelector('[data-screen="maps"] [data-back]'));
  if (!list || !back) throw new Error('The saved maps menu is incomplete');
  let origin = 'endless';
  const render = () => renderMapManager(list, {
    selected: origin === 'endless' ? actions.selectedEndless : null,
    select: map => origin === 'editor' ? actions.openEditor(map) : actions.selectEndless(map),
    changed: actions.changed
  });
  /** @param {'editor' | 'endless'} mode */
  const open = mode => {
    origin = mode;
    back.dataset.backTo = mode;
    showMapManagerStatus('');
    showMenuScreen('maps');
    render();
  };
  onTap(document.getElementById('editor-open-maps'), () => open('editor'));
  onTap(document.getElementById('endless-open-maps'), () => open('endless'));
  const input = /** @type {HTMLInputElement} */ (document.getElementById('map-import-file'));
  onTap(document.getElementById('map-import-button'), () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) importMapFile(file, (oldName, newName, maps) => actions.changed(oldName, newName, maps), render);
  });
}
