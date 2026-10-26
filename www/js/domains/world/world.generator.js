// Making a map: water, desert, rock and ore, forests, boulders, beaches, and everything that grows on it,
// in the numbers GAME_CONFIG.map asks for (scaled to the map's size)

import { GAME_CONFIG } from '../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, anyWithin, game, getGridPos, getMapAreaScale, isBorderZone, rand, resetTileIndex, someNear, thingAt, townHall } from '../../engine/world/index.js';
import { isSpawnSpotFree, isTileOccupied } from '../economy/building/index.js';
import { addMapResource, getMapResourceDef } from '../economy/gathering/index.js';
import { placeAppleTrees } from '../economy/farming/index.js';
import { getReachSteps, getSettlerReach, isTileBlockedForSettler } from '../../engine/movement/index.js';
import { tileVariantHash } from './world.draw.js';
import { generateContinent, isContinentMap } from './world.continent.js';

// counts that grow with the map's area (see getMapAreaScale); the rest are sizes or per-cluster counts
export const AREA_SCALED_COUNTS = new Set(['trees', 'boulders', 'grass', 'berryBushes', 'sticks', 'pebbles', 'boars',
  'forests', 'boulderPiles', 'ironSpawners', 'coalSpawners']);

export function getMapCount(key, fallback) {
  const count = getUnscaledMapCount(key, fallback);
  return AREA_SCALED_COUNTS.has(key) ? Math.max(count > 0 ? 1 : 0, Math.round(count * getMapAreaScale())) : count;
}

export function getUnscaledMapCount(key, fallback) {
  const value = GAME_CONFIG.map && GAME_CONFIG.map[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') {
    const min = Math.max(0, Math.floor(Number(value.min ?? fallback)));
    const max = Math.max(min, Math.floor(Number(value.max ?? min)));
    return min + Math.floor(rand() * (max - min + 1));
  }
  return Math.max(0, Math.floor(Number(value)));
}

export function getMapRange(key, fallbackMin, fallbackMax) {
  const configured = GAME_CONFIG.map && GAME_CONFIG.map[key];
  const min = Math.max(0, Number(configured && configured.min !== undefined ? configured.min : fallbackMin));
  const max = Math.max(min, Number(configured && configured.max !== undefined ? configured.max : fallbackMax));
  return { min, max };
}

export function isDesertTile(x, y) {
  if (thingAt(game.desertTiles, x, y)) return true;
  if (!game.desertRegion) return false;
  return Math.hypot((x - game.desertRegion.x) / (TILE_SIZE * game.desertRegion.rx), (y - game.desertRegion.y) / (TILE_SIZE * game.desertRegion.ry)) <= 1;
}

// ---- Ore spawners
// A spawner is a natural rock tile marked oreSpawner: 'iron' | 'coal'. It blocks and draws like rock but
// can't be mined, and ores of its kind appear within a few tiles of it: on free ground, or inside the
// rock itself (the ore replaces that rock tile, so mining it cuts into the rock).

export const ORE_KINDS = {
  iron: { resource: 'iron_ore', spawnerKey: 'ironSpawners' },
  coal: { resource: 'coal_ore', spawnerKey: 'coalSpawners' }
};

export function getOreSpawnerRadius() {
  return getMapCount('oreSpawnerRadius', 3);
}

export function getOreSpawners(kind) {
  return game.naturalRocks.filter(r => r.oreSpawner === kind);
}

// Tiles around a spawner where an ore can appear; rock is set when the ore would replace natural rock.
// keep / enough (#299): only the spots keep() takes, and no more than enough of them (stops there)
/** @param {any} spawner @param {number} radius @param {((spot: { x: number, y: number }) => boolean) | null} [keep] @param {number} [enough] */
export function getOreSpotsAround(spawner, radius, keep = null, enough = Infinity) {
  const spots = [];
  const center = getGridPos(spawner.x, spawner.y);
  for (let gy = center.gy - radius; gy <= center.gy + radius; gy++) {
    for (let gx = center.gx - radius; gx <= center.gx + radius; gx++) {
      if (gx === center.gx && gy === center.gy) continue;
      if (gx < 0 || gy < 0 || gx >= game.COLS || gy >= game.ROWS || isBorderZone(gx, gy)) continue;
      const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
      if (Math.hypot(x - townHall.x, y - townHall.y) < 150) continue;
      // free ground only: ore never replaces natural rock
      if (keep && !keep({ x, y })) continue;
      if (!isDesertTile(x, y) && isSpawnSpotFree(x, y) && spots.push({ x, y }) >= enough) return spots;
    }
  }
  return spots;
}

export function placeOre(kind, spot) {
  addMapResource(ORE_KINDS[kind].resource, spot.x, spot.y);
}

// A spot is exposed when a settler starting at the town hall can stand next to it
export function isOreSpotExposed(spot, reach) {
  const g = getGridPos(spot.x, spot.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => getReachSteps(reach, g.gx + dx, g.gy + dy) >= 0);
}

// Put a small rock outcrop on free ground far from the hall, for maps with no usable rock
export function placeRockOutcrop() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const gx = BORDER_MARGIN + 1 + Math.floor(rand() * (game.COLS - 2 * BORDER_MARGIN - 3));
    const gy = BORDER_MARGIN + 1 + Math.floor(rand() * (game.ROWS - 2 * BORDER_MARGIN - 3));
    const tiles = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: (gx + dx) * TILE_SIZE + 15, y: (gy + dy) * TILE_SIZE + 15 }));
    if (tiles.some(t => Math.hypot(t.x - townHall.x, t.y - townHall.y) < 220 || isTileOccupied(t.x, t.y) || isDesertTile(t.x, t.y))) continue;
    for (const t of tiles) addMapResource('natural_rock', t.x, t.y);
    return true;
  }
  return false;
}

// nearStart (#299): the first one there ({ x, y, r }), if any rock there will do
/** @param {string} kind @param {number} count @param {{ x: number, y: number, r: number } | null} [nearStart] */
export function placeOreSpawners(kind, count, nearStart = null) {
  const radius = getOreSpawnerRadius();
  // (#299) on a big map (hundreds of spawners, tens of thousands of rocks) the walk from the hall is worked
  // out once, not for each spawner, and whether a rock has room is kept, asked again only round the spawner
  // just placed: it took minutes
  const big = game.COLS * game.ROWS > 6400, room = new Map();
  // the tiles within six of a spawner (none goes there: spawners apart), marked as each is placed
  const near = new Uint8Array(game.COLS * game.ROWS), apart = 6 * TILE_SIZE;
  const keepAway = o => {
    const g = getGridPos(o.x, o.y);
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const gx = g.gx + dx, gy = g.gy + dy;
        if (gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS && Math.hypot(dx * TILE_SIZE, dy * TILE_SIZE) <= apart) near[gy * game.COLS + gx] = 1;
      }
    }
  };
  game.naturalRocks.forEach(r => { if (r.oreSpawner) keepAway(r); });
  let reach = null;
  for (let n = 0; n < count; n++) {
    if (!big || !reach) { resetTileIndex(); reach = getSettlerReach({ x: townHall.x, y: townHall.y }); }
    const walk = reach;
    // (a big map's after the first: room round it is enough, it needn't be walked to from the hall yet)
    const exposed = !big || n === 0 ? s => isOreSpotExposed(s, walk) : null;
    const hasRoom = r => {
      if (!big) return getOreSpotsAround(r, radius, exposed, 2).length >= 2;
      const key = n === 0 ? 'first' : 'rest';
      if (!room.has(r) || room.get(r).key !== key) room.set(r, { key, ok: getOreSpotsAround(r, radius, exposed, 2).length >= 2 });
      return room.get(r).ok;
    };
    // rock far from the hall and from other spawners, with room for ores and at least one reachable spot
    const candidates = game.naturalRocks.filter(r => !r.oreSpawner &&
      Math.hypot(r.x - townHall.x, r.y - townHall.y) > 220 &&
      !near[Math.floor(r.y / TILE_SIZE) * game.COLS + Math.floor(r.x / TILE_SIZE)] && hasRoom(r));
    const close = n === 0 && nearStart ? candidates.filter(r => Math.hypot(r.x - nearStart.x, r.y - nearStart.y) <= nearStart.r) : [];
    const from = close.length ? close : candidates;
    let spawner = from.length ? from[Math.floor(rand() * from.length)] : null;
    if (!spawner) {
      if (n > 0 || !placeRockOutcrop()) continue;
      spawner = game.naturalRocks[game.naturalRocks.length - 1];
    }
    spawner.oreSpawner = kind;
    keepAway(spawner);

    const spots = getOreSpotsAround(spawner, radius);
    const reachable = spots.filter(s => isOreSpotExposed(s, reach));
    const ores = getMapCount('orePerSpawner', 5);
    // one ore is always reachable from the start; the rest land anywhere around the spawner
    const first = reachable[Math.floor(rand() * reachable.length)] || (big && n > 0 ? spots[Math.floor(rand() * spots.length)] : undefined);
    if (first) placeOre(kind, first);
    for (let i = 1; i < ores; i++) {
      const free = getOreSpotsAround(spawner, radius);
      if (free.length === 0) break;
      placeOre(kind, free[Math.floor(rand() * free.length)]);
    }
    if (big) someNear(game.naturalRocks, spawner.x, spawner.y, (2 * radius + 2) * TILE_SIZE, r => { room.delete(r); });
  }
  resetTileIndex();
}

// spread: side of the square (px) around nearX/nearY to pick a spot in
// pickPoint: optional () => { x, y } to try instead of a square around (nearX, nearY) (forest shapes)
/** @param {string} type @param {number | null} [nearX] @param {number | null} [nearY] @param {number} [spread]
 * @param {(() => { x: number, y: number }) | null} [pickPoint] */
export function spawnResource(type, nearX = null, nearY = null, spread = 180, pickPoint = null) {
  let tx, ty, isValid = false, attempts = 0;
  while (!isValid && attempts < 100) {
    attempts++;
    let gx, gy;
    if (pickPoint || (nearX !== null && nearY !== null)) {
      const point = pickPoint ? pickPoint() : { x: /** @type {number} */ (nearX) + (rand() - 0.5) * spread, y: /** @type {number} */ (nearY) + (rand() - 0.5) * spread };
      tx = point.x;
      ty = point.y;
      gx = Math.max(BORDER_MARGIN, Math.min(game.COLS - BORDER_MARGIN - 1, Math.floor(tx / TILE_SIZE)));
      gy = Math.max(BORDER_MARGIN, Math.min(game.ROWS - BORDER_MARGIN - 1, Math.floor(ty / TILE_SIZE)));
    } else {
      gx = Math.floor(rand() * (game.COLS - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
      gy = Math.floor(rand() * (game.ROWS - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
    }
    tx = gx * TILE_SIZE + 15;
    ty = gy * TILE_SIZE + 15;
    let inDesert = isDesertTile(tx, ty);
    let desertResource = type === 'cactus' || type === 'pebble';
    let cactusOutsideDesert = type === 'cactus' && !inDesert;
    // (#326) a beach: only pebbles and stones on it
    const offBeach = type === 'pebble' || type === 'boulder' || !thingAt(game.beachTiles, tx, ty);
    if (Math.hypot(tx - townHall.x, ty - townHall.y) > 140 && isSpawnSpotFree(tx, ty) &&
        (!inDesert || desertResource) && !cactusOutsideDesert && offBeach) {
      isValid = true;
    }
  }
  if (isValid) {
    if (type === 'boar') {
      const hp = GAME_CONFIG.mapResources.boar.hp;
      game.boars.push({ x: tx, y: ty, hp, maxHp: hp, priority: 0, wanderTimer: rand() * 4, wanderInterval: 3 + rand() * 3, targetX: tx, targetY: ty });
    } else {
      addMapResource(type, tx, ty);
    }
  }
}

export function spawnResourceCluster(type, count, centerX, centerY, spread = 180) {
  for (let i = 0; i < count; i++) {
    spawnResource(type, centerX, centerY, spread);
  }
}

// ---- Forests
// Trees grow in forests; grass, berry bushes and sticks favour them too (forestUndergrowthShare), both at
// map generation and when they grow back. Forest centres are kept in `forests`.

export function getForestSpread() {
  return (getMapCount('forestRadius', 3) * 2 + 1) * TILE_SIZE;
}

// area (#299): only there (a forest in it, a spot in it), when given
/** @param {string} type @param {{ x0: number, y0: number, x1: number, y1: number } | null} [area] */
export function spawnForestAware(type, area = null) {
  // trees (forestShare 1) always grow back in a forest, so forests don't thin out into a scatter
  const share = getMapResourceDef(type).forestShare ?? GAME_CONFIG.map.forestUndergrowthShare ?? 0.7;
  const forests = area ? game.forests.filter(f => f.x >= area.x0 && f.x <= area.x1 && f.y >= area.y0 && f.y <= area.y1) : game.forests;
  if (forests.length > 0 && rand() < share) {
    const forest = forests[Math.floor(rand() * forests.length)];
    spawnResource(type, forest.x, forest.y, getForestSpread(), () => pickForestPoint(forest));
  } else {
    spawnResource(type, null, null, 180, area ? pointIn(area) : null);
  }
}

// A random spot in an area, again each time it's asked
export const pointIn = area => () => ({ x: area.x0 + rand() * (area.x1 - area.x0), y: area.y0 + rand() * (area.y1 - area.y0) });

// A forest is a few overlapping round lobes around its centre, so it grows into an uneven blob rather
// than a square
export function makeForestLobes(x, y) {
  const reach = getForestSpread() / 2;
  const lobes = [{ x, y, r: reach * 0.8 }];
  const extra = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < extra; i++) {
    const angle = rand() * Math.PI * 2, dist = reach * (0.5 + rand() * 0.6);
    lobes.push({ x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, r: reach * (0.45 + rand() * 0.35) });
  }
  return lobes;
}

// A random point in one of the forest's lobes
export function pickForestPoint(forest) {
  const lobe = forest.lobes[Math.floor(rand() * forest.lobes.length)];
  const angle = rand() * Math.PI * 2, dist = lobe.r * Math.sqrt(rand());
  return { x: lobe.x + Math.cos(angle) * dist, y: lobe.y + Math.sin(angle) * dist };
}

export function placeForests() {
  game.forests = [];
  for (let n = 0; n < getMapCount('forests', 4); n++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = (BORDER_MARGIN + 3 + Math.floor(rand() * (game.COLS - 2 * BORDER_MARGIN - 6))) * TILE_SIZE + 15;
      const y = (BORDER_MARGIN + 3 + Math.floor(rand() * (game.ROWS - 2 * BORDER_MARGIN - 6))) * TILE_SIZE + 15;
      const valid = Math.hypot(x - townHall.x, y - townHall.y) > 180 &&
        !isDesertTile(x, y) &&
        !anyWithin(game.waterTiles, x, y, 90) &&
        game.forests.every(f => Math.hypot(f.x - x, f.y - y) > 6 * TILE_SIZE);
      if (!valid) continue;
      const forest = { x, y, lobes: makeForestLobes(x, y) };
      game.forests.push(forest);
      for (let i = 0; i < getMapCount('forestTrees', 9); i++) spawnResource('tree', x, y, getForestSpread(), () => pickForestPoint(forest));
      break;
    }
  }
}

// ---- Boulder piles: a few boulders on touching tiles

export function placeBoulderPiles() {
  for (let n = 0; n < getMapCount('boulderPiles', 2); n++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const gx = BORDER_MARGIN + 1 + Math.floor(rand() * (game.COLS - 2 * BORDER_MARGIN - 2));
      const gy = BORDER_MARGIN + 1 + Math.floor(rand() * (game.ROWS - 2 * BORDER_MARGIN - 2));
      const free = (tx, ty) => tx >= BORDER_MARGIN && ty >= BORDER_MARGIN && tx < game.COLS - BORDER_MARGIN && ty < game.ROWS - BORDER_MARGIN &&
        Math.hypot(tx * TILE_SIZE + 15 - townHall.x, ty * TILE_SIZE + 15 - townHall.y) > 180 &&
        !isDesertTile(tx * TILE_SIZE + 15, ty * TILE_SIZE + 15) && !isTileOccupied(tx * TILE_SIZE + 15, ty * TILE_SIZE + 15);
      if (!free(gx, gy)) continue;
      const pile = [{ gx, gy }];
      const size = getMapCount('boulderPileSize', 4);
      for (let grow = 0; grow < size * 8 && pile.length < size; grow++) {
        const from = pile[Math.floor(rand() * pile.length)];
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
        const next = { gx: from.gx + dx, gy: from.gy + dy };
        if (pile.some(t => t.gx === next.gx && t.gy === next.gy) || !free(next.gx, next.gy)) continue;
        pile.push(next);
      }
      for (const t of pile) addMapResource('boulder', t.gx * TILE_SIZE + 15, t.gy * TILE_SIZE + 15);
      break;
    }
  }
}

export function isWaterReachable(w) {
  let gx = Math.floor(w.x / TILE_SIZE);
  let gy = Math.floor(w.y / TILE_SIZE);
  let dirs = [
    {gx: gx + 1, gy: gy}, {gx: gx - 1, gy: gy},
    {gx: gx, gy: gy + 1}, {gx: gx, gy: gy - 1}
  ];
  // a fisher needs a tile to stand on next to the water; rock or trees on the shore don't count
  return dirs.some(d => !isTileBlockedForSettler(d.gx, d.gy));
}

export function generateMap() {
  for (const _ of generateMapSteps()); // (all at once)
}

// (#326) The map made in steps, each yielding how far along it is (a loading screen draws a frame between them)
export function* generateMapSteps() {
  game.naturalRocks = []; game.waterTiles = []; game.desertTiles = []; game.desertRegion = null; game.trees = []; game.cacti = []; game.boulders = [];
  game.grassList = []; game.berryBushes = []; game.sticks = []; game.pebbles = []; game.logs = []; game.ironOres = []; game.coalOres = []; game.boars = []; game.beachTiles = []; // (#326: the last map's beaches gone before anything's placed)
  yield 0.1;
  if (isContinentMap()) { generateContinent(); return; } // (#299: a big map, a continent)

  placeLakes();
  yield 0.2;
  placeDeserts();
  placeRockClusters();
  yield 0.3;

  placeForests();
  yield 0.5;
  for (let i = 0; i < getMapCount('trees', 8); i++) spawnResource('tree');  // lone trees outside forests
  placeBoulderPiles();
  for (let i = 0; i < getMapCount('boulders', 15); i++) spawnResource('boulder');
  for (let i = 0; i < getMapCount('grass', 16); i++) spawnForestAware('grass');
  for (let i = 0; i < getMapCount('berryBushes', 8); i++) spawnForestAware('berry_bush');
  for (let i = 0; i < getMapCount('sticks', 15); i++) spawnForestAware('stick');
  for (let i = 0; i < getMapCount('pebbles', 14); i++) spawnResource('pebble');
  yield 0.7;

  // at least one spawner of each kind, even if the config says 0
  for (const kind of Object.keys(ORE_KINDS)) {
    placeOreSpawners(kind, Math.max(1, getMapCount(ORE_KINDS[kind].spawnerKey, 1)));
  }

  for (let i = 0; i < getMapCount('boars', 4); i++) spawnResource('boar');
  yield 0.85;
  placeBeaches();
  placeAppleTrees();
}

// Lakes: a few blobs of water with wavy shores, apart from each other and away from the town hall
function placeLakes() {
  const lakeRange = getMapRange('lakes', 1, 4);
  const lakeWidthRange = getMapRange('lakeWidth', 3, 8);
  const lakeHeightRange = getMapRange('lakeHeight', 3, 8);
  const lakeDistRange = getMapRange('lakeMinDistance', 1, 3);

  let numLakes = Math.round((lakeRange.min + Math.floor(rand() * (lakeRange.max - lakeRange.min + 1))) * getMapAreaScale());
  const lakeCenters = [];

  for (let l = 0; l < numLakes; l++) {
    let lw = lakeWidthRange.min + Math.floor(rand() * (lakeWidthRange.max - lakeWidthRange.min + 1));
    let lh = lakeHeightRange.min + Math.floor(rand() * (lakeHeightRange.max - lakeHeightRange.min + 1));
    let lx = BORDER_MARGIN;
    let ly = BORDER_MARGIN;
    let placed = false;

    let minDistance = lakeDistRange.min + rand() * (lakeDistRange.max - lakeDistRange.min);

    for (let attempt = 0; attempt < 60; attempt++) {
      const candidateX = Math.floor(rand() * (game.COLS - lw - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
      const candidateY = Math.floor(rand() * (game.ROWS - lh - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
      const candidateCenter = { x: candidateX + (lw - 1) / 2, y: candidateY + (lh - 1) / 2 };

      const isSeparated = lakeCenters.every(center => 
        Math.hypot(center.x - candidateCenter.x, center.y - candidateCenter.y) >= minDistance
      );

      if (isSeparated) {
        lx = candidateX;
        ly = candidateY;
        placed = true;
        break;
      }
    }

    if (!placed) continue;

    let lakeCenterX = lx + (lw - 1) / 2;
    let lakeCenterY = ly + (lh - 1) / 2;

    let waves = 2 + Math.floor(rand() * 2);
    let phase = rand() * Math.PI * 2;
    let amp = (lw <= 3 || lh <= 3) ? 0.05 : (0.08 + rand() * 0.1); 

    const tempTiles = [];

    for (let wx = lx; wx < lx + lw; wx++) {
      for (let wy = ly; wy < ly + lh; wy++) {
        let tx = wx * TILE_SIZE + 15;
        let ty = wy * TILE_SIZE + 15;

        let dx = (wx - lakeCenterX) / (lw / 2);
        let dy = (wy - lakeCenterY) / (lh / 2);
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        let dynamicThreshold = Math.max(0.75, 0.9 + Math.sin(angle * waves + phase) * amp);

        if (dist <= dynamicThreshold && Math.hypot(tx - townHall.x, ty - townHall.y) > 160) {
          if (!thingAt(game.waterTiles, tx, ty)) {
            tempTiles.push({ x: tx, y: ty, isFishing: false, fishTimer: 0, fishCount: GAME_CONFIG.fishing.fishCapacity, fishRegrowTimer: 0 });
          }
        }
      }
    }

    if (tempTiles.length >= 3) {
      lakeCenters.push({ x: lakeCenterX, y: lakeCenterY });
      game.waterTiles.push(...tempTiles);
    }
  }
}

// Deserts: sand in a few overlapping blobs, away from the hall and the water, with cacti and pebbles on it
function placeDeserts() {
  const desertRange = getMapRange('deserts', 1, 1);
  const desertRxRange = getMapRange('desertRadiusX', 3, 5);
  const desertRyRange = getMapRange('desertRadiusY', 2, 4);

  let numDeserts = Math.round((desertRange.min + Math.floor(rand() * (desertRange.max - desertRange.min + 1))) * getMapAreaScale());
  const desertCenters = [];

  for (let d = 0; d < numDeserts; d++) {
    let rx = desertRxRange.min + Math.floor(rand() * (desertRxRange.max - desertRxRange.min + 1));
    let ry = desertRyRange.min + Math.floor(rand() * (desertRyRange.max - desertRyRange.min + 1));

    let desertCenterX = 0, desertCenterY = 0, desertPlaced = false;

    for (let attempt = 0; attempt < 100 && !desertPlaced; attempt++) {
      let centerGx = Math.floor(rand() * (game.COLS - 2 * rx - 2 * BORDER_MARGIN)) + BORDER_MARGIN + rx;
      let centerGy = Math.floor(rand() * (game.ROWS - 2 * ry - 2 * BORDER_MARGIN)) + BORDER_MARGIN + ry;

      centerGx = Math.max(BORDER_MARGIN + rx, Math.min(game.COLS - BORDER_MARGIN - rx, centerGx));
      centerGy = Math.max(BORDER_MARGIN + ry, Math.min(game.ROWS - BORDER_MARGIN - ry, centerGy));

      desertCenterX = centerGx * TILE_SIZE + 15;
      desertCenterY = centerGy * TILE_SIZE + 15;

      desertPlaced = Math.hypot(desertCenterX - townHall.x, desertCenterY - townHall.y) > 200 &&
        !anyWithin(game.waterTiles, desertCenterX, desertCenterY, 110) &&
        desertCenters.every(dc => Math.hypot(dc.x - desertCenterX, dc.y - desertCenterY) > 150);
    }

    if (desertPlaced) {
      desertCenters.push({ x: desertCenterX, y: desertCenterY });
      if (!game.desertRegion) game.desertRegion = { x: desertCenterX, y: desertCenterY, rx, ry };

      const subBlobs = [];
      let numBlobs = 2 + Math.floor(rand() * 2);
      for (let b = 0; b < numBlobs; b++) {
        subBlobs.push({
          offsetX: (rand() - 0.5) * rx * 0.8,
          offsetY: (rand() - 0.5) * ry * 0.8,
          rX: rx * (0.7 + rand() * 0.4),
          rY: ry * (0.7 + rand() * 0.4),
          threshold: 0.9 + rand() * 0.2
        });
      }

      for (let dx = -rx * 2; dx <= rx * 2; dx++) {
        for (let dy = -ry * 2; dy <= ry * 2; dy++) {
          let tileX = desertCenterX + dx * TILE_SIZE;
          let tileY = desertCenterY + dy * TILE_SIZE;

          let isInside = subBlobs.some(b => {
            let distX = (dx - b.offsetX) / b.rX;
            let distY = (dy - b.offsetY) / b.rY;
            return Math.hypot(distX, distY) <= b.threshold;
          });

          if (isInside &&
              tileX >= BORDER_MARGIN * TILE_SIZE + 15 && tileX < (game.COLS - BORDER_MARGIN) * TILE_SIZE - 15 &&
              tileY >= BORDER_MARGIN * TILE_SIZE + 15 && tileY < (game.ROWS - BORDER_MARGIN) * TILE_SIZE - 15 &&
              !thingAt(game.waterTiles, tileX, tileY) &&
              !thingAt(game.desertTiles, tileX, tileY)) {
            game.desertTiles.push({ x: tileX, y: tileY });
          }
        }
      }

      spawnResourceCluster('cactus', getMapCount('desertCactus', 6), desertCenterX, desertCenterY);
      spawnResourceCluster('pebble', getMapCount('desertPebbles', 5), desertCenterX, desertCenterY);
    }
  }
}

// Rock: clusters of natural rock with wavy edges, not on sand, away from the hall
function placeRockClusters() {
  const cfg = GAME_CONFIG.map;
  let numRockClusters = Math.round((cfg.rockClusters.min + Math.floor(rand() * (cfg.rockClusters.max - cfg.rockClusters.min + 1))) * getMapAreaScale());

  for (let c = 0; c < numRockClusters; c++) {
    let rw = cfg.rockClusterWidth.min + Math.floor(rand() * (cfg.rockClusterWidth.max - cfg.rockClusterWidth.min + 1));
    let rh = cfg.rockClusterHeight.min + Math.floor(rand() * (cfg.rockClusterHeight.max - cfg.rockClusterHeight.min + 1));
    let rx = Math.floor(rand() * (game.COLS - rw - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
    let ry = Math.floor(rand() * (game.ROWS - rh - 2 * BORDER_MARGIN)) + BORDER_MARGIN;

    let rockCenterX = rx + (rw - 1) / 2;
    let rockCenterY = ry + (rh - 1) / 2;

    let waves = 2 + Math.floor(rand() * 2);
    let phase = rand() * Math.PI * 2;
    let amp = (rw <= 2 || rh <= 2) ? 0 : (0.1 + rand() * 0.15);

    for (let x = rx; x < rx + rw; x++) {
      for (let y = ry; y < ry + rh; y++) {
        let tx = x * TILE_SIZE + 15;
        let ty = y * TILE_SIZE + 15;

        let dx = (x - rockCenterX) / (rw / 2);
        let dy = (y - rockCenterY) / (rh / 2);
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        let dynamicThreshold = 0.85 + Math.sin(angle * waves + phase) * amp;

        if (dist <= dynamicThreshold && Math.hypot(tx - townHall.x, ty - townHall.y) > 150 && !isDesertTile(tx, ty) && !isTileOccupied(tx, ty)) {
          addMapResource('natural_rock', tx, ty);
        }
      }
    }
  }
}

// Sand on one stretch of each lake's shore: the tiles touching the water on one side of the lake.
// The side comes from the lake's own shape, not rand(), so the rest of the seeded map doesn't change.
// Only drawn: for everything else (building, regrowth, cacti) a beach is ordinary ground.
export const BEACH_SPREAD = Math.PI * 0.4; // how far around the lake from the chosen side the sand reaches

export function placeBeaches() {
  game.beachTiles = [];
  const key = (x, y) => `${x},${y}`;
  const water = new Set(game.waterTiles.map(w => key(w.x, w.y)));
  const rock = new Set(game.naturalRocks.map(r => key(r.x, r.y)));
  const beach = new Set();
  const seen = new Set();
  for (const first of game.waterTiles) {
    if (seen.has(key(first.x, first.y))) continue;
    // one lake: the water tiles joined to this one
    const lake = [first];
    seen.add(key(first.x, first.y));
    for (let i = 0; i < lake.length; i++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = lake[i].x + dx * TILE_SIZE, y = lake[i].y + dy * TILE_SIZE;
        if (water.has(key(x, y)) && !seen.has(key(x, y))) { seen.add(key(x, y)); lake.push({ x, y }); }
      }
    }
    const cx = lake.reduce((sum, w) => sum + w.x, 0) / lake.length;
    const cy = lake.reduce((sum, w) => sum + w.y, 0) / lake.length;
    const minX = Math.min(...lake.map(w => w.x)), minY = Math.min(...lake.map(w => w.y));
    const side = (tileVariantHash(minX + lake.length, minY) % 360) * Math.PI / 180;
    for (const w of lake) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = w.x + dx * TILE_SIZE, y = w.y + dy * TILE_SIZE;
          const g = getGridPos(x, y);
          if (water.has(key(x, y)) || rock.has(key(x, y)) || beach.has(key(x, y)) || isBorderZone(g.gx, g.gy)) continue;
          let off = Math.abs(Math.atan2(y - cy, x - cx) - side) % (Math.PI * 2);
          if (off > Math.PI) off = Math.PI * 2 - off;
          if (off <= BEACH_SPREAD) { beach.add(key(x, y)); game.beachTiles.push({ x, y }); }
        }
      }
    }
  }
}
