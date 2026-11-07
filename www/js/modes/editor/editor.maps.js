// Saved maps: stored on the device as plain data, and a world built from one

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, loadData, saveData, t } from '../../engine/platform/index.js';
import { TILE_SIZE, game, newWorldEpoch, rand, townHall } from '../../engine/world/index.js';
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
    name, cols: game.COLS, rows: game.ROWS, faction: editor.faction, startTime: editor.startTime,
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
  game.dayTime = startAt[map.startTime] ?? startAt.day;
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
