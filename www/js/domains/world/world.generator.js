// Making a map: water, desert and savanna, rock and ore, forests, boulders, beaches, and everything that grows on it,
// in the numbers GAME_CONFIG.map asks for (scaled to the map's size)

import { GAME_CONFIG } from '../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, anyWithin, game, getGridPos, getMapAreaScale, isBorderZone, isWithinTownHallResourceBuffer, rand, resetTileIndex, someNear, thingAt, townHall } from '../../engine/world/index.js';
import { isSpawnSpotFree, isTileOccupied } from '../economy/building/index.js';
import { addMapResource, getMapResourceDef } from '../economy/gathering/index.js';
import { placeAppleTrees } from '../economy/farming/index.js';
import { getReachDistanceToResource, getReachSteps, getSettlerReach, isTileBlockedForSettler } from '../../engine/movement/index.js';
import { tileVariantHash } from './world.draw.js';
import { generateContinent, isContinentMap } from './world.continent.js';
import { inEnemyTerritory } from './world.territory.js';

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

export function isSavannaTile(x, y) {
  return !!thingAt(game.savannaTiles, x, y);
}

// Rock, ore and ore sources standing in the desert: sand under them too, and the tile counts as desert
// (the ground it leaves when mined, what may grow there, its look). Only the tiles in the desert are
// marked: a mass that reaches out of it keeps its ordinary rock outside, tile by tile.
export function markDesertUnderRocks() {
  for (const o of [...game.naturalRocks, ...game.ironOres, ...game.coalOres]) {
    if (!thingAt(game.desertTiles, o.x, o.y) && isDesertTile(o.x, o.y)) game.desertTiles.push({ x: o.x, y: o.y });
  }
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

/** @type {{ list: any[] | null, keys: Set<string> }} */
let waterGridCache = { list: null, keys: new Set() };
function waterGridKeys() {
  if (waterGridCache.list !== game.waterTiles) {
    waterGridCache = {
      list: game.waterTiles,
      keys: new Set(game.waterTiles.map(tile => {
        const grid = getGridPos(tile.x, tile.y);
        return `${grid.gx},${grid.gy}`;
      }))
    };
  }
  return waterGridCache.keys;
}

export function touchesWaterCorner(gx, gy) {
  const water = waterGridKeys();
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]]
    .some(([dx, dy]) => water.has(`${gx + dx},${gy + dy}`));
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
      if (isWithinTownHallResourceBuffer(x, y)) continue;
      // free ground only: ore never replaces natural rock (the desert's sand is free ground too)
      if (keep && !keep({ x, y })) continue;
      if (isSpawnSpotFree(x, y) && spots.push({ x, y }) >= enough) return spots;
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

// Put a small rock outcrop on free ground far from the hall, for maps with no usable rock (in the desert
// too: the sand goes under it, see markDesertUnderRocks)
export function placeRockOutcrop(startOnly = false) {
  const hall = getGridPos(townHall.x, townHall.y);
  const startHalf = GAME_CONFIG.territory.startTiles / 2;
  const maxDistance = startOnly ? Math.floor(startHalf) - 2 : 24;
  for (let d = 8; d <= maxDistance; d++) {
    const gx = hall.gx + d, gy = hall.gy;
    const tiles = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: (gx + dx) * TILE_SIZE + 15, y: (gy + dy) * TILE_SIZE + 15 }));
    if (tiles.some(t => isWithinTownHallResourceBuffer(t.x, t.y) || isTileOccupied(t.x, t.y) ||
      (startOnly && !inStartTerritory(t.x, t.y, hall, startHalf)))) continue;
    tiles.forEach(t => addMapResource('natural_rock', t.x, t.y));
    return true;
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const minGx = startOnly ? Math.max(BORDER_MARGIN + 1, Math.ceil(hall.gx - startHalf)) : BORDER_MARGIN + 1;
    const minGy = startOnly ? Math.max(BORDER_MARGIN + 1, Math.ceil(hall.gy - startHalf)) : BORDER_MARGIN + 1;
    const maxGx = startOnly ? Math.min(game.COLS - BORDER_MARGIN - 3, Math.floor(hall.gx + startHalf) - 2) : game.COLS - BORDER_MARGIN - 3;
    const maxGy = startOnly ? Math.min(game.ROWS - BORDER_MARGIN - 3, Math.floor(hall.gy + startHalf) - 2) : game.ROWS - BORDER_MARGIN - 3;
    if (maxGx < minGx || maxGy < minGy) return false;
    const gx = minGx + Math.floor(rand() * (maxGx - minGx + 1));
    const gy = minGy + Math.floor(rand() * (maxGy - minGy + 1));
    const tiles = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: (gx + dx) * TILE_SIZE + 15, y: (gy + dy) * TILE_SIZE + 15 }));
    if (tiles.some(t => isWithinTownHallResourceBuffer(t.x, t.y) || isTileOccupied(t.x, t.y))) continue;
    for (const t of tiles) addMapResource('natural_rock', t.x, t.y);
    return true;
  }
  return false;
}

function inStartTerritory(x, y, hall, half) {
  const g = getGridPos(x, y);
  return g.gx >= Math.ceil(hall.gx - half) && g.gx < hall.gx + half &&
    g.gy >= Math.ceil(hall.gy - half) && g.gy < hall.gy + half;
}

// nearStart (#299): the first one there ({ x, y, r }), if any rock there will do
/** @param {string} kind @param {number} count @param {{ x: number, y: number, r: number } | null} [nearStart] */
export function placeOreSpawners(kind, count, nearStart = null) {
  const radius = getOreSpawnerRadius();
  const hall = getGridPos(townHall.x, townHall.y);
  const startHalf = GAME_CONFIG.territory.startTiles / 2;
  const startsAtBase = rock => inStartTerritory(rock.x, rock.y, hall, startHalf);
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
    // Generated placement is the same in Editor and Endless, irrespective of Endless territory bounds.
    if (!big || !reach) { resetTileIndex(); reach = getSettlerReach({ x: townHall.x, y: townHall.y }, true); }
    const walk = reach;
    // (a big map's after the first: room round it is enough, it needn't be walked to from the hall yet)
    const exposed = !big || n === 0 ? s => isOreSpotExposed(s, walk) : null;
    const hasRoom = r => {
      if (!big) return getOreSpotsAround(r, radius, exposed, 2).length >= 2;
      const key = n === 0 ? 'first' : 'rest';
      if (!room.has(r) || room.get(r).key !== key) room.set(r, { key, ok: getOreSpotsAround(r, radius, exposed, 2).length >= 2 });
      return room.get(r).ok;
    };
    // a reachable rock source in the start zone first; further sources stay at least six tiles apart
    const startingCount = getOreSpawners(kind).filter(startsAtBase).length;
    const candidates = game.naturalRocks.filter(r => !r.oreSpawner &&
      !isWithinTownHallResourceBuffer(r.x, r.y) &&
      (startingCount === 0 ? startsAtBase(r) : startingCount >= 3 ? !startsAtBase(r) : true) &&
      !near[Math.floor(r.y / TILE_SIZE) * game.COLS + Math.floor(r.x / TILE_SIZE)] && hasRoom(r));
    const close = n === 0 && nearStart ? candidates.filter(r => Math.hypot(r.x - nearStart.x, r.y - nearStart.y) <= nearStart.r) : [];
    const from = close.length ? close : candidates;
    let spawner = from.length ? from[Math.floor(rand() * from.length)] : null;
    if (!spawner) {
      if (startingCount > 0 || !placeRockOutcrop(true)) continue;
      spawner = game.naturalRocks[game.naturalRocks.length - 1];
    }
    const spots = getOreSpotsAround(spawner, radius);
    let reachable = spots.filter(s => isOreSpotExposed(s, reach));
    if (!reachable.length && (!big || n === 0)) {
      keepAway(spawner);
      if (placeRockOutcrop(startingCount === 0)) {
        spawner = game.naturalRocks[game.naturalRocks.length - 1];
        reachable = getOreSpotsAround(spawner, radius).filter(s => isOreSpotExposed(s, reach));
      }
      if (!reachable.length) {
        for (let dy = -12; dy <= 12 && !reachable.length; dy++) {
          for (let dx = -12; dx <= 12 && !reachable.length; dx++) {
            const gx = hall.gx + dx, gy = hall.gy + dy;
            if (getReachSteps(reach, gx, gy) < 0) continue;
            const center = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
            game.naturalRocks = game.naturalRocks.filter(r => Math.hypot(r.x - center.x, r.y - center.y) > TILE_SIZE);
            game.naturalRocks.push({ x: center.x, y: center.y, hp: 100, maxHp: 100, oreSpawner: kind });
            spawner = game.naturalRocks[game.naturalRocks.length - 1];
            resetTileIndex();
            const freshReach = getSettlerReach({ x: townHall.x, y: townHall.y }, true);
            const adjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]]
              .map(([ox, oy]) => ({ gx: gx + ox, gy: gy + oy }))
              .find(p => getReachSteps(freshReach, p.gx, p.gy) >= 0 &&
                isSpawnSpotFree(p.gx * TILE_SIZE + 15, p.gy * TILE_SIZE + 15));
            if (adjacent) reachable = [{ x: adjacent.gx * TILE_SIZE + 15, y: adjacent.gy * TILE_SIZE + 15 }];
            if (!adjacent) {
              for (let oy = -2; oy <= 2 && !reachable.length; oy++) {
                for (let ox = -2; ox <= 2; ox++) {
                  const px = gx + ox, py = gy + oy;
                  const spot = { x: px * TILE_SIZE + 15, y: py * TILE_SIZE + 15 };
                  if (getReachSteps(freshReach, px, py) >= 0 && isSpawnSpotFree(spot.x, spot.y)) {
                    reachable = [spot];
                    break;
                  }
                }
              }
            }
          }
        }
      }
      if (!reachable.length) {
        for (let dy = -18; dy <= 18 && !reachable.length; dy += 2) {
          for (let dx = -18; dx <= 18 && !reachable.length; dx += 2) {
            const gx = hall.gx + dx, gy = hall.gy + dy;
            const center = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
            if (!isSpawnSpotFree(center.x, center.y) || isWithinTownHallResourceBuffer(center.x, center.y)) continue;
            const ore = [[1, 0], [-1, 0], [0, 1], [0, -1]]
              .map(([ox, oy]) => ({ x: center.x + ox * TILE_SIZE, y: center.y + oy * TILE_SIZE }))
              .find(p => isOreSpotExposed(p, reach) && isSpawnSpotFree(p.x, p.y));
            if (ore) {
              const rock = { x: center.x, y: center.y, hp: 100, maxHp: 100, oreSpawner: kind };
              game.naturalRocks.push(rock);
              spawner = rock;
              reachable = [ore];
            }
          }
        }
      }
      if (!reachable.length) continue;
    }
    spawner.oreSpawner = kind;
    keepAway(spawner);
    const ores = getMapCount('orePerSpawner', 5);
    // one ore is always reachable from the start; the rest land anywhere around the spawner
    const first = reachable[Math.floor(rand() * reachable.length)] || (big && n > 0 ? spots[Math.floor(rand() * spots.length)] : undefined);
    if (first) placeOre(kind, first);
    for (let i = 1; i < ores; i++) {
      const free = getOreSpotsAround(spawner, radius);
      if (free.length === 0) break;
      placeOre(kind, free[Math.floor(rand() * free.length)]);
    }
    resetTileIndex();
    const oresForKind = kind === 'iron' ? game.ironOres : game.coalOres;
    let finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
    if (!oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) {
      for (let gy = 0; gy < game.ROWS && !oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity); gy++) {
        for (let gx = 0; gx < game.COLS; gx++) {
          if (getReachSteps(finalReach, gx, gy) < 0) continue;
          const oreSpot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([dx, dy]) => ({ gx: gx + dx, gy: gy + dy }))
            .find(p => p.gx >= 0 && p.gy >= 0 && p.gx < game.COLS && p.gy < game.ROWS &&
              getReachSteps(finalReach, p.gx, p.gy) >= 0 && !isWithinTownHallResourceBuffer(p.gx * TILE_SIZE + 15, p.gy * TILE_SIZE + 15));
          if (!oreSpot) continue;
          const oreX = oreSpot.gx * TILE_SIZE + 15, oreY = oreSpot.gy * TILE_SIZE + 15;
          game.naturalRocks = game.naturalRocks.filter(rock => rock.oreSpawner || rock.x !== oreX || rock.y !== oreY);
          resetTileIndex();
          placeOre(kind, { x: oreX, y: oreY });
          resetTileIndex();
          finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
          if (!oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) {
            const firstOre = oresForKind[0];
            if (firstOre) {
              const standing = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
                .map(([dx, dy]) => ({ gx: oreSpot.gx + dx, gy: oreSpot.gy + dy }))
                .find(p => getReachSteps(finalReach, p.gx, p.gy) >= 0);
              if (standing) {
                firstOre.x = oreSpot.gx * TILE_SIZE + 15;
                firstOre.y = oreSpot.gy * TILE_SIZE + 15;
                resetTileIndex();
                finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
              }
            }
          }
          break;
        }
      }
    }
    if (!oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) {
      for (let gy = 0; gy < game.ROWS; gy++) {
        let added = false;
        for (let gx = 0; gx < game.COLS; gx++) {
          if (getReachSteps(finalReach, gx, gy) < 0) continue;
          const oreX = gx * TILE_SIZE + 15, oreY = gy * TILE_SIZE + 15;
          if (isWithinTownHallResourceBuffer(oreX, oreY)) continue;
          game.naturalRocks = game.naturalRocks.filter(rock => rock.oreSpawner ||
            rock.x !== oreX || rock.y !== oreY);
          game.ironOres = game.ironOres.filter(ore => ore.x !== oreX || ore.y !== oreY);
          game.coalOres = game.coalOres.filter(ore => ore.x !== oreX || ore.y !== oreY);
          for (const listName of ['waterTiles', 'trees', 'cacti', 'boulders', 'grassList', 'sticks', 'pebbles', 'buildings', 'blueprints', 'farmPlots', 'berryBushes']) {
            if (game[listName]) game[listName] = game[listName].filter(item => Math.hypot(item.x - oreX, item.y - oreY) >= 22);
          }
          resetTileIndex();
          placeOre(kind, { x: oreX, y: oreY });
          added = true;
          break;
        }
        if (added) break;
      }
      resetTileIndex();
      finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
    }
    if (!oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) {
      throw new Error(`Unable to place reachable ${kind} ore`);
    }
    for (let gy = 0; gy < game.ROWS && !oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity); gy++) {
      for (let gx = 0; gx < game.COLS; gx++) {
        if (getReachSteps(finalReach, gx, gy) < 0) continue;
        const oreSpot = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ gx: gx + dx, gy: gy + dy }))
          .find(p => p.gx >= 0 && p.gy >= 0 && p.gx < game.COLS && p.gy < game.ROWS &&
            !isWithinTownHallResourceBuffer(p.gx * TILE_SIZE + 15, p.gy * TILE_SIZE + 15));
        if (!oreSpot) continue;
        const standingX = gx * TILE_SIZE + 15, standingY = gy * TILE_SIZE + 15;
        const oreX = oreSpot.gx * TILE_SIZE + 15, oreY = oreSpot.gy * TILE_SIZE + 15;
        game.naturalRocks = game.naturalRocks.filter(rock =>
          rock.oreSpawner || ((rock.x !== standingX || rock.y !== standingY) && (rock.x !== oreX || rock.y !== oreY)));
        oresForKind[0].x = oreX; oresForKind[0].y = oreY;
        resetTileIndex();
        finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
        gy = game.ROWS;
        break;
      }
    }
    if (!oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) {
      for (let d = 3; d <= 12; d++) {
        const standing = { gx: hall.gx + d - 1, gy: hall.gy };
        if (getReachSteps(finalReach, standing.gx, standing.gy) < 0) continue;
        const spot = { x: (hall.gx + d) * TILE_SIZE + 15, y: hall.gy * TILE_SIZE + 15 };
        const standingX = standing.gx * TILE_SIZE + 15, standingY = standing.gy * TILE_SIZE + 15;
        game.naturalRocks = game.naturalRocks.filter(rock =>
          rock.oreSpawner || ((rock.x !== spot.x || rock.y !== spot.y) && (rock.x !== standingX || rock.y !== standingY)));
        oresForKind[0].x = spot.x; oresForKind[0].y = spot.y;
        resetTileIndex();
        finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
        break;
      }
      for (let d = 3; d <= 12 && !oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity); d++) {
        const spot = { x: (hall.gx + d) * TILE_SIZE + 15, y: hall.gy * TILE_SIZE + 15 };
        if (!isOreSpotExposed({ x: (hall.gx + d - 1) * TILE_SIZE + 15, y: spot.y }, finalReach)) continue;
        game.naturalRocks = game.naturalRocks.filter(rock => rock.oreSpawner || Math.hypot(rock.x - spot.x, rock.y - spot.y) >= 1);
        if (!isSpawnSpotFree(spot.x, spot.y)) continue;
        oresForKind[0].x = spot.x;
        oresForKind[0].y = spot.y;
        resetTileIndex();
        finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
      }
      for (let dy = -60; dy <= 60 && !oresForKind.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity); dy++) {
        for (let dx = -60; dx <= 60; dx++) {
          const gx = hall.gx + dx, gy = hall.gy + dy;
          const spot = { x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 };
          const exposedByNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .some(([ox, oy]) => getReachSteps(finalReach, gx + ox, gy + oy) >= 0);
          if (!exposedByNeighbor || isWithinTownHallResourceBuffer(spot.x, spot.y)) continue;
          const matchingRock = game.naturalRocks.find(rock => rock.x === spot.x && rock.y === spot.y);
          if (matchingRock) game.naturalRocks.splice(game.naturalRocks.indexOf(matchingRock), 1);
          if (!isSpawnSpotFree(spot.x, spot.y)) continue;
          const existing = oresForKind[0];
          const oldX = existing.x, oldY = existing.y;
          existing.x = spot.x;
          existing.y = spot.y;
          resetTileIndex();
          finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
          if (getReachDistanceToResource(finalReach, spot) === Infinity) {
            existing.x = oldX;
            existing.y = oldY;
            resetTileIndex();
            finalReach = getSettlerReach({ x: townHall.x, y: townHall.y }, true);
            continue;
          }
          break;
        }
      }
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
    if (Math.hypot(tx - townHall.x, ty - townHall.y) > 140 && !inEnemyTerritory(tx, ty) && isSpawnSpotFree(tx, ty) &&
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

function placeSavannas() {
  const count = getMapCount('savannas', 0);
  const rxRange = getMapRange('savannaRadiusX', 3, 5);
  const ryRange = getMapRange('savannaRadiusY', 2, 4);
  for (let n = 0; n < count; n++) {
    const rx = rxRange.min + Math.floor(rand() * (rxRange.max - rxRange.min + 1));
    const ry = ryRange.min + Math.floor(rand() * (ryRange.max - ryRange.min + 1));
    for (let attempt = 0; attempt < 60; attempt++) {
      const gx = BORDER_MARGIN + rx + Math.floor(rand() * Math.max(1, game.COLS - 2 * BORDER_MARGIN - 2 * rx));
      const gy = BORDER_MARGIN + ry + Math.floor(rand() * Math.max(1, game.ROWS - 2 * BORDER_MARGIN - 2 * ry));
      const cx = gx * TILE_SIZE + 15, cy = gy * TILE_SIZE + 15;
      if (Math.hypot(cx - townHall.x, cy - townHall.y) < townHall.radius + TILE_SIZE ||
          anyWithin(game.waterTiles, cx, cy, 90) || anyWithin(game.savannaTiles, cx, cy, Math.min(rx, ry) * TILE_SIZE)) continue;
      for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
        const x = (gx + dx) * TILE_SIZE + 15, y = (gy + dy) * TILE_SIZE + 15;
        if (x < BORDER_MARGIN * TILE_SIZE || y < BORDER_MARGIN * TILE_SIZE ||
            x >= (game.COLS - BORDER_MARGIN) * TILE_SIZE || y >= (game.ROWS - BORDER_MARGIN) * TILE_SIZE ||
            Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + TILE_SIZE / 2 ||
            thingAt(game.waterTiles, x, y) || thingAt(game.desertTiles, x, y) || isSavannaTile(x, y)) continue;
        game.savannaTiles.push({ x, y });
      }
      break;
    }
  }
}

function placeSavannaPlants() {
  for (const tile of game.savannaTiles) {
    if (Math.hypot(tile.x - townHall.x, tile.y - townHall.y) < 150 ||
        anyWithin(game.waterTiles, tile.x, tile.y, TILE_SIZE * 1.5) || !isSpawnSpotFree(tile.x, tile.y)) continue;
    const roll = rand();
    const kind = roll < 0.06 ? 'tree' : roll < 0.095 ? 'grass' : roll < 0.12 ? 'berry_bush' : null;
    if (kind) addMapResource(kind, tile.x, tile.y);
  }
}

// (#326) The map made in steps, each yielding how far along it is (a loading screen draws a frame between them)
export function* generateMapSteps() {
  game.naturalRocks = []; game.waterTiles = []; game.desertTiles = []; game.desertRegion = null; game.savannaTiles = []; game.trees = []; game.cacti = []; game.boulders = [];
  game.grassList = []; game.berryBushes = []; game.sticks = []; game.pebbles = []; game.logs = []; game.ironOres = []; game.coalOres = []; game.boars = []; game.beachTiles = []; // (#326: the last map's beaches gone before anything's placed)
  yield 0.1;
  if (isContinentMap()) { yield* generateContinent(); return; } // (#299: a big map, a continent)

  placeLakes();
  yield 0.2;
  placeDeserts();
  placeSavannas();
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
  placeSavannaPlants();
  yield 0.7;

  // at least one spawner of each kind, even if the config says 0
  for (const kind of Object.keys(ORE_KINDS)) {
    placeOreSpawners(kind, Math.max(1, getMapCount(ORE_KINDS[kind].spawnerKey, 1)));
  }
  resetTileIndex();
  let finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
  for (const kind of Object.keys(ORE_KINDS)) {
    const ores = kind === 'iron' ? game.ironOres : game.coalOres;
    if (ores.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) continue;
    for (let gy = 0; gy < game.ROWS; gy++) {
      let placed = false;
      for (let gx = 0; gx < game.COLS; gx++) {
        if (getReachSteps(finalReach, gx, gy) < 0) continue;
        const neighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => ({ gx: gx + dx, gy: gy + dy }))
          .find(p => p.gx >= 0 && p.gy >= 0 && p.gx < game.COLS && p.gy < game.ROWS &&
            getReachSteps(finalReach, p.gx, p.gy) >= 0 &&
            !isWithinTownHallResourceBuffer(p.gx * TILE_SIZE + 15, p.gy * TILE_SIZE + 15));
        if (!neighbor) continue;
        const x = neighbor.gx * TILE_SIZE + 15, y = neighbor.gy * TILE_SIZE + 15;
        game.naturalRocks = game.naturalRocks.filter(rock => rock.oreSpawner || rock.x !== x || rock.y !== y);
        for (const listName of ['waterTiles', 'trees', 'cacti', 'boulders', 'grassList', 'sticks', 'pebbles', 'berryBushes']) {
          if (game[listName]) game[listName] = game[listName].filter(item => Math.hypot(item.x - x, item.y - y) >= 22);
        }
        if (ores[0]) {
          ores[0].x = x;
          ores[0].y = y;
        } else {
          placeOre(kind, { x, y });
        }
        resetTileIndex();
        finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
        placed = ores.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity);
        break;
      }
      if (placed) break;
    }
    resetTileIndex();
    finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
    if (ores.some(ore => getReachDistanceToResource(finalReach, ore) < Infinity)) continue;
      const hall = getGridPos(townHall.x, townHall.y);
      for (let d = 3; d < Math.max(game.COLS, game.ROWS) && ores[0]; d++) {
        const oreX = (hall.gx + d) * TILE_SIZE + 15, oreY = hall.gy * TILE_SIZE + 15;
        const standingX = (hall.gx + d - 1) * TILE_SIZE + 15;
        if (oreX < TILE_SIZE || oreX >= game.COLS * TILE_SIZE || isWithinTownHallResourceBuffer(oreX, oreY)) continue;
        game.naturalRocks = game.naturalRocks.filter(rock => rock.oreSpawner ||
          (rock.x !== oreX || rock.y !== oreY) && (rock.x !== standingX || rock.y !== oreY));
        game.waterTiles = game.waterTiles.filter(tile => Math.hypot(tile.x - oreX, tile.y - oreY) >= TILE_SIZE &&
          Math.hypot(tile.x - standingX, tile.y - oreY) >= TILE_SIZE);
        ores[0].x = oreX; ores[0].y = oreY;
        resetTileIndex();
        finalReach = getSettlerReach({ x: townHall.x, y: townHall.y });
        if (getReachDistanceToResource(finalReach, ores[0]) < Infinity) break;
      }
  }
  for (let i = 0; i < getMapCount('boars', 4); i++) spawnResource('boar');
  placeStartingBoars();
  yield 0.85;
  placeBeaches();
  placeAppleTrees();
  markDesertUnderRocks();
}

export function startingBoarCount() {
  const seed = String(game.worldSeed && game.worldSeed.value || 'default-world-seed');
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0;
  return 3 + hash % 3;
}

function placeStartingBoars() {
  const target = startingBoarCount(), half = GAME_CONFIG.territory.startTiles / 2;
  const inStart = boar => {
    const gx = Math.floor(boar.x / TILE_SIZE), gy = Math.floor(boar.y / TILE_SIZE);
    const hall = getGridPos(townHall.x, townHall.y);
    return gx >= hall.gx - half && gx < hall.gx + half && gy >= hall.gy - half && gy < hall.gy + half;
  };
  const local = game.boars.filter(boar => !boar.isCarcass && inStart(boar));
  local.forEach(boar => { boar.inBase = true; });
  local.sort((a, b) => Math.hypot(a.x - townHall.x, a.y - townHall.y) - Math.hypot(b.x - townHall.x, b.y - townHall.y));
  for (const extra of local.slice(target)) game.boars.splice(game.boars.indexOf(extra), 1);
  while (local.length < target) {
    const before = game.boars.length;
    spawnResource('boar', townHall.x, townHall.y, GAME_CONFIG.territory.startTiles * TILE_SIZE);
    if (game.boars.length === before) break;
    game.boars[game.boars.length - 1].inBase = true;
    local.push(game.boars[game.boars.length - 1]);
  }
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

        if (dist <= dynamicThreshold && !isWithinTownHallResourceBuffer(tx, ty)) {
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

// Rock: clusters of natural rock with wavy edges, away from the hall; in the desert too, the sand
// going under the rock (see markDesertUnderRocks)
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

        if (dist <= dynamicThreshold && !isWithinTownHallResourceBuffer(tx, ty) && !isTileOccupied(tx, ty)) {
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
          if (water.has(key(x, y)) || rock.has(key(x, y)) || beach.has(key(x, y)) ||
              thingAt(game.desertTiles, x, y) || isBorderZone(g.gx, g.gy)) continue;
          let off = Math.abs(Math.atan2(y - cy, x - cx) - side) % (Math.PI * 2);
          if (off > Math.PI) off = Math.PI * 2 - off;
          if (off <= BEACH_SPREAD) { beach.add(key(x, y)); game.beachTiles.push({ x, y }); }
        }
      }
    }
  }
}
