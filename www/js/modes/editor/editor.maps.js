// Saved maps: stored on the device as plain data, and a world built from one

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, loadData, saveData, t } from '../../engine/platform/index.js';
import { TILE_SIZE, game, rand, townHall } from '../../engine/world/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { placeBeaches } from '../../domains/world/index.js';
import { addMapResource } from '../../domains/economy/gathering/index.js';
import { makeAppleTree } from '../../domains/economy/farming/index.js';
import { renderItemList } from '../../ui/index.js';
import { editor } from './editor.tools.js';

// ---- Saved maps

export function loadSavedMaps() {
  return loadData('maps', {});
}

export function storeSavedMaps(maps) {
  return saveData('maps', maps);
}

// The world as plain data: tiles by grid position
export function serializeMap(name) {
  const tile = o => [Math.floor(o.x / TILE_SIZE), Math.floor(o.y / TILE_SIZE)];
  const resources = {};
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (kind === 'boar' || kind === 'farm' || kind === 'loot') continue;
    resources[kind] = game[def.list].filter(r => !r.oreSpawner).map(tile);
  }
  return {
    name, cols: game.COLS, rows: game.ROWS, faction: editor.faction, startTime: editor.startTime,
    hall: [townHall.x, townHall.y],
    water: game.waterTiles.map(tile),
    sand: game.desertTiles.map(tile),
    resources,
    apples: game.trees.filter(tr => tr.apple).map(tile),
    spawners: game.naturalRocks.filter(r => r.oreSpawner).map(r => [...tile(r), r.oreSpawner]),
    boars: game.boars.filter(b => !b.isCarcass).map(tile),
    buildings: game.buildings.map(b => [b.type, ...tile(b)])
  };
}

// Build the world from a saved map, in place of generateMap() (see resetGame)
export function loadCustomMap(map) {
  game.naturalRocks = []; game.waterTiles = []; game.desertTiles = []; game.desertRegion = null; game.beachTiles = []; game.forests = [];
  game.trees = []; game.cacti = []; game.boulders = []; game.grassList = []; game.berryBushes = []; game.sticks = []; game.pebbles = []; game.logs = []; game.stumps = [];
  game.ironOres = []; game.coalOres = []; game.boars = []; game.buildings = [];
  const at = ([gx, gy]) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
  if (map.hall) { townHall.x = map.hall[0]; townHall.y = map.hall[1]; }
  for (const t of map.water || []) game.waterTiles.push({ ...at(t), isFishing: false, fishTimer: 0, fishCount: GAME_CONFIG.fishing.fishCapacity, fishRegrowTimer: 0 });
  for (const t of map.sand || []) game.desertTiles.push(at(t));
  for (const [kind, tiles] of Object.entries(map.resources || {})) {
    if (!GAME_CONFIG.mapResources[kind]) continue;
    for (const t of tiles) { const p = at(t); addMapResource(kind, p.x, p.y); }
  }
  const appleKeys = new Set((map.apples || []).map(t => `${t[0]},${t[1]}`));
  for (const tr of game.trees) if (appleKeys.has(`${Math.floor(tr.x / TILE_SIZE)},${Math.floor(tr.y / TILE_SIZE)}`)) makeAppleTree(tr);
  for (const [gx, gy, kind] of map.spawners || []) {
    const p = at([gx, gy]);
    addMapResource('natural_rock', p.x, p.y).oreSpawner = kind;
  }
  for (const t of map.boars || []) placeBoar(at(t));
  for (const [type, gx, gy] of map.buildings || []) {
    if (!getDefinition('buildings', type)) continue;
    const p = at([gx, gy]);
    game.buildings.push(makeBuilt(type, p.x, p.y));
  }
  placeBeaches();
  // the time of day it starts at (#257): a little into that part of the day; the morning as ever by default
  const c = GAME_CONFIG.daytime, startAt = { morning: c.morning / 2, day: c.morning + 1, evening: c.morning + c.day + 1, night: c.morning + c.day + c.evening + 1 };
  game.dayTime = startAt[map.startTime] ?? startAt.morning;
  camera.x = townHall.x; camera.y = townHall.y;
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
