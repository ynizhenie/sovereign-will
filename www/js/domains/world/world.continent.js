// (#299, step 2) A big map is a continent: one mass of land in the sea, never touching the map's edge, its
// shape from noise (a stretched, turned oval, its coast warped and broken up), with a few islands off it.
// Its land in biomes by height and wetness (GAME_CONFIG.continent): mountains (natural rock) the highest,
// desert the driest, forest the wettest, grassland the rest, lakes in low wet hollows; sand along the sea.
// What grows on each biome by its own chances per tile. The base starts on grassland well away from the sea,
// with rock and ore near by. A smaller map is made as before (world.generator.js).

import { GAME_CONFIG } from '../../content/configs/index.js';
import { DEFAULT_MAP_TILES, TILE_SIZE, game, rand, townHall } from '../../engine/world/index.js';
import { camera } from '../../engine/platform/index.js';
import { addMapResource } from '../economy/gathering/index.js';
import { placeAppleTrees } from '../economy/farming/index.js';
import { ORE_KINDS, getUnscaledMapCount, makeForestLobes, placeOreSpawners } from './world.generator.js';

const config = () => GAME_CONFIG.continent;

export const isContinentMap = () => Math.min(game.COLS, game.ROWS) >= config().from;

// a tile's biome
const SEA = 0, LAKE = 1, GRASS = 2, FOREST = 3, DESERT = 4, MOUNTAIN = 5;
const BIOME_TABLE = { [GRASS]: 'grassland', [FOREST]: 'forest', [DESERT]: 'desert' };

// Smooth noise 0..1 from the world's random (so a seed makes the same continent): values on a lattice,
// blended between; fbm adds octaves of it, each finer and fainter
function makeNoise() {
  const perm = new Uint8Array(512), values = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) values[i] = rand();
  const at = (x, y) => values[perm[(x & 255) + perm[y & 255]]];
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, octaves = 4) => {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) { sum += noise(x * f + o * 17.3, y * f + o * 31.7) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
}

// The value below which `share` of the values are (of a sample of them)
function quantile(values, share) {
  const sample = [];
  const step = Math.max(1, Math.floor(values.length / 20000));
  for (let i = 0; i < values.length; i += step) sample.push(values[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.max(0, Math.floor(share * sample.length)))];
}

export function generateContinent() {
  const C = config(), cols = game.COLS, rows = game.ROWS, n = cols * rows, side = Math.min(cols, rows);
  const shapeNoise = makeNoise(), warpNoise = makeNoise(), heightNoise = makeNoise(), wetNoise = makeNoise(), hollowNoise = makeNoise();
  const at = (gx, gy) => gy * cols + gx;
  const scale = 6 / side; // (the noise's features a sixth of the map across)

  // ---- The land: an oval, stretched and turned, its coast warped by noise; the sea at the edges
  const cx = cols * (0.5 + (rand() - 0.5) * 0.08), cy = rows * (0.5 + (rand() - 0.5) * 0.08);
  const turn = rand() * Math.PI, rx = cols * (0.37 + rand() * 0.07), ry = rows * (0.31 + rand() * 0.09);
  const margin = Math.max(5, Math.round(side * C.margin));
  const elevation = new Float32Array(n), land = new Uint8Array(n);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const wx = gx + (warpNoise(gx * scale * 1.5, gy * scale * 1.5) - 0.5) * cols * 0.14;
      const wy = gy + (warpNoise(gx * scale * 1.5 + 50, gy * scale * 1.5 + 50) - 0.5) * rows * 0.14;
      const dx = wx - cx, dy = wy - cy;
      const u = dx * Math.cos(turn) + dy * Math.sin(turn), v = -dx * Math.sin(turn) + dy * Math.cos(turn);
      let e = 1 - Math.hypot(u / rx, v / ry) + (shapeNoise(gx * scale, gy * scale) - 0.5) * 0.9;
      const fromEdge = Math.min(gx, gy, cols - 1 - gx, rows - 1 - gy);
      if (fromEdge < margin) e = -1;
      else e -= Math.max(0, (margin * 2 - fromEdge) / (margin * 2)) * 0.7; // (thinning out towards the edge)
      elevation[at(gx, gy)] = e;
      land[at(gx, gy)] = e > 0.08 ? 1 : 0;
    }
  }
  // the biggest mass is the continent; islands of 30 tiles or more stay, smaller ones go under
  const mass = new Int32Array(n).fill(-1), sizes = [];
  for (let i = 0; i < n; i++) {
    if (!land[i] || mass[i] !== -1) continue;
    const id = sizes.length, queue = [i];
    mass[i] = id;
    for (let k = 0; k < queue.length; k++) {
      const c = queue[k], gx = c % cols, gy = (c - gx) / cols;
      for (const [x, y] of [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]]) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const j = at(x, y);
        if (land[j] && mass[j] === -1) { mass[j] = id; queue.push(j); }
      }
    }
    sizes.push(queue.length);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < n; i++) if (land[i] && mass[i] !== main && sizes[mass[i]] < 30) land[i] = 0;

  // ---- How far each land tile is from the sea
  const coast = new Int16Array(n).fill(-1), queue = [];
  for (let i = 0; i < n; i++) if (!land[i]) { coast[i] = 0; queue.push(i); }
  for (let k = 0; k < queue.length; k++) {
    const c = queue[k], gx = c % cols, gy = (c - gx) / cols;
    for (const [x, y] of [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]]) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const j = at(x, y);
      if (coast[j] === -1) { coast[j] = coast[c] + 1; queue.push(j); }
    }
  }

  // ---- Biomes: by height (with its own noise) and wetness, each the share the config asks of the land
  const height = new Float32Array(n), wet = new Float32Array(n), hollow = new Float32Array(n);
  const landTiles = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const i = at(gx, gy);
      if (!land[i]) continue;
      landTiles.push(i);
      // (ranges here and there, a little more inland)
      height[i] = elevation[i] * 0.25 + heightNoise(gx * scale * 2.6, gy * scale * 2.6) + (heightNoise(gx * scale * 9, gy * scale * 9) - 0.5) * 0.15;
      wet[i] = wetNoise(gx * scale * 1.3, gy * scale * 1.3);
      hollow[i] = hollowNoise(gx * scale * 3, gy * scale * 3) * (1 - Math.min(1, height[i]));
    }
  }
  /** @param {Float32Array} values @param {number} share @returns {number} */
  const pick = (values, share) => quantile(landTiles.map(i => values[i]), share);
  const mountainAt = pick(height, 1 - C.mountains), desertAt = pick(wet, C.desert), forestAt = pick(wet, 1 - C.forest), lakeAt = pick(hollow, 1 - C.lakes);
  const biome = new Uint8Array(n); // (SEA)
  for (const i of landTiles) {
    biome[i] = height[i] >= mountainAt ? MOUNTAIN : hollow[i] >= lakeAt && coast[i] > 3 ? LAKE : wet[i] <= desertAt ? DESERT : wet[i] >= forestAt ? FOREST : GRASS;
  }

  // ---- The start: grassland far from the sea, with land, rock and trees round it, lakes and deserts few
  const start = chooseStart(biome, coast, cols, rows, C);
  // (on the corner of four tiles, as on a default map: the tiles round it laid out for walking up to it)
  townHall.x = start.gx * TILE_SIZE; townHall.y = start.gy * TILE_SIZE;
  camera.x = townHall.x; camera.y = townHall.y;
  // clear ground round the hall; rock near by if there's none
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const gx = start.gx + dx, gy = start.gy + dy;
      if (dx * dx + dy * dy <= 30 && biome[at(gx, gy)] !== SEA) biome[at(gx, gy)] = GRASS;
    }
  }
  if (!countNear(biome, MOUNTAIN, start, C.startNear, cols, rows)) {
    const a = rand() * Math.PI * 2, d = 12 + rand() * 6;
    const bx = Math.round(start.gx + Math.cos(a) * d), by = Math.round(start.gy + Math.sin(a) * d);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const gx = bx + dx, gy = by + dy;
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows || dx * dx + dy * dy > 6 + rand() * 4) continue;
        if (biome[at(gx, gy)] !== SEA && biome[at(gx, gy)] !== LAKE) biome[at(gx, gy)] = MOUNTAIN;
      }
    }
  }

  // ---- The tiles into the world's lists
  game.beachTiles = [];
  const tile = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
  const sand = new Uint8Array(n);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const i = at(gx, gy), b = biome[i], { x, y } = tile(gx, gy);
      if (b === SEA || b === LAKE) game.waterTiles.push({ x, y, isFishing: false, fishTimer: 0, fishCount: GAME_CONFIG.fishing.fishCapacity, fishRegrowTimer: 0 });
      else if (b === MOUNTAIN) addMapResource('natural_rock', x, y);
      else if (b === DESERT) { game.desertTiles.push({ x, y }); sand[i] = 1; }
      // a beach along the sea: the land touching it, a tile or two deep
      else if (coast[i] === 1 || (coast[i] === 2 && shapeNoise(gx * 0.3, gy * 0.3) > 0.55)) { game.beachTiles.push({ x, y }); sand[i] = 1; }
    }
  }
  game.desertRegion = null;

  // ---- What grows on it: each biome's things by their chances (the foot of the mountains its own)
  const hall = { gx: start.gx, gy: start.gy };
  const nearMountain = (gx, gy) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (biome[at(Math.min(cols - 1, Math.max(0, gx + dx)), Math.min(rows - 1, Math.max(0, gy + dy)))] === MOUNTAIN) return true;
    return false;
  };
  const boar = GAME_CONFIG.mapResources.boar;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const i = at(gx, gy), b = biome[i];
      // (nothing within five tiles of the hall: room to walk up to it, as on a default map)
      if (!BIOME_TABLE[b] || Math.hypot(gx - hall.gx, gy - hall.gy) < 5) continue;
      const table = (b !== DESERT && nearMountain(gx, gy)) ? C.grow.foothills : C.grow[BIOME_TABLE[b]];
      const roll = rand();
      let sum = 0;
      for (const [kind, chance] of Object.entries(table)) {
        sum += chance;
        if (roll >= sum) continue;
        const { x, y } = tile(gx, gy);
        if (kind === 'boar') game.boars.push({ x, y, hp: boar.hp, maxHp: boar.hp, priority: 0, wanderTimer: rand() * 4, wanderInterval: 3 + rand() * 3, targetX: x, targetY: y });
        else if (!(sand[i] && kind === 'tree')) addMapResource(kind, x, y);
        break;
      }
    }
  }

  // ---- Forests (where trees grow back, see spawnForestAware): the middle of the forest in each patch of it
  game.forests = [];
  const cell = 12;
  for (let y0 = 0; y0 < rows; y0 += cell) {
    for (let x0 = 0; x0 < cols; x0 += cell) {
      let count = 0, sx = 0, sy = 0;
      for (let gy = y0; gy < Math.min(rows, y0 + cell); gy++) for (let gx = x0; gx < Math.min(cols, x0 + cell); gx++) if (biome[at(gx, gy)] === FOREST) { count++; sx += gx; sy += gy; }
      if (count < cell * cell * 0.25) continue;
      const { x, y } = tile(Math.round(sx / count), Math.round(sy / count));
      game.forests.push({ x, y, lobes: makeForestLobes(x, y) });
    }
  }

  // ---- Ore in the mountains: the first of each kind near the start
  // (as many to the land as a default map has to its whole: the sea's not counted)
  const perLand = landTiles.length / (DEFAULT_MAP_TILES * DEFAULT_MAP_TILES);
  for (const kind of Object.keys(ORE_KINDS)) {
    placeOreSpawners(kind, Math.max(1, Math.round(getUnscaledMapCount(ORE_KINDS[kind].spawnerKey, 1) * perLand)), { x: townHall.x, y: townHall.y, r: C.startNear * TILE_SIZE });
  }
  placeAppleTrees();
}

// How many tiles of a biome within r tiles of the spot
function countNear(biome, kind, spot, r, cols, rows) {
  let count = 0;
  for (let gy = Math.max(0, spot.gy - r); gy <= Math.min(rows - 1, spot.gy + r); gy++) {
    for (let gx = Math.max(0, spot.gx - r); gx <= Math.min(cols - 1, spot.gx + r); gx++) if (biome[gy * cols + gx] === kind) count++;
  }
  return count;
}

// The best of some grassland tiles far from the sea: most land round it in a default map's square, some forest
// and rock near, few lakes and little desert
function chooseStart(biome, coast, cols, rows, C) {
  const half = GAME_CONFIG.territory.startTiles / 2;
  let best = null, bestScore = -Infinity;
  for (let attempt = 0; attempt < 400; attempt++) {
    const gx = Math.floor(half + rand() * (cols - 2 * half)), gy = Math.floor(half + rand() * (rows - 2 * half));
    const i = gy * cols + gx;
    if (biome[i] !== GRASS || coast[i] < Math.min(C.startCoast, 6)) continue;
    let landTiles = 0, forest = 0, rock = 0, lake = 0, desert = 0, total = 0;
    for (let y = gy - half; y < gy + half; y += 2) {
      for (let x = gx - half; x < gx + half; x += 2) {
        total++;
        const b = biome[y * cols + x];
        if (b !== SEA) landTiles++;
        if (b === FOREST) forest++; else if (b === MOUNTAIN) rock++; else if (b === LAKE) lake++; else if (b === DESERT) desert++;
      }
    }
    // (some rock, not hemmed in by it)
    const score = landTiles / total * 3 + Math.min(forest / total, 0.25) * 4 + Math.min(rock / total, 0.06) * 10 - Math.max(0, rock / total - 0.1) * 8 +
      Math.min(lake, 3) * 0.1 - desert / total * 2 + Math.min(coast[i], C.startCoast) / C.startCoast;
    if (score > bestScore) { bestScore = score; best = { gx, gy }; }
  }
  return best || { gx: Math.floor(cols / 2), gy: Math.floor(rows / 2) };
}
