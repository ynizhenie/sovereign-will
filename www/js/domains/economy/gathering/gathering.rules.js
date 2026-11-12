// Resources on the map: which can be gathered, adding one, what a finished one gives, and growing back

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, forEachInRect, game, rand } from '../../../engine/world/index.js';
import { addCarryLoad, addResources, giveResourceToSettler } from '../../colony/storage/index.js';
import { ORE_KINDS, getFrontier, getMapCount, getOreSpawnerRadius, getOreSpawners, getOreSpotsAround, getTerritoryBox, inEnemyTerritory, inTerritory, placeOre, pointIn, spawnForestAware, spawnResource } from '../../world/index.js';
import { invalidateAllPaths } from '../../../engine/movement/index.js';
import { noteDay } from '../../colony/settlers/index.js';
import { playSound } from '../../../app/index.js';

export function getPlacedResources(includeGrowingTrees = true) {
  return [
    ...(includeGrowingTrees ? game.trees : game.trees.filter(tree => !tree.isGrowing)),
    ...game.cacti, ...game.boulders, ...game.grassList, ...game.berryBushes,
    ...game.sticks, ...game.pebbles, ...game.logs, ...game.loot, ...game.ironOres, ...game.coalOres, ...game.naturalRocks
  ];
}

// (#326, 27.10, 26) An ore source with a mine built on it: worked unmarked, as ore is; one without, not at all
export function hasMine(r) {
  return !!r.oreSpawner && game.buildings.some(b => b.type === 'mine' && b.side !== 'red' && b.x === r.x && b.y === r.y);
}

export function getHarvestableResources() {
  // ore spawners are natural rock that's never used up: only worked when marked, for its ore (#248)
  return [...getPlacedResources(false), ...game.farmPlots.filter(plot => plot.growth >= 100), ...game.boars];
}

const BOAR_STRAY = 12;

// (#299) The same, only those on the base's land (inTerritory), found within the box round it: settlers
// work only there, and a big map's thousands far off aren't gone through every tick. found(o, list): told
// the list each one's from
/** @param {(o: any, list: any[]) => void} [found] */
export function getWorkableResources(found = () => {}) {
  const box = getTerritoryBox(), all = [];
  const take = list => o => { if (inTerritory(o.x, o.y)) { all.push(o); found(o, list); } };
  for (const list of [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs,
    game.loot, game.ironOres, game.coalOres, game.naturalRocks]) {
    const add = take(list);
    forEachInRect(list, box.x0, box.y0, box.x1, box.y1, o => { if (list !== game.trees || !o.isGrowing) add(o); });
  }
  const plot = take(game.farmPlots);
  for (const p of game.farmPlots) if (p.growth >= 100) plot(p);
  // (#326) a boar in the dark isn't seen: a worker doesn't go for it (canSettlerHarvest), a soldier goes looking
  // for it (huntBoar; 27.10, 6). One that's been on the base's land is hunted after it ran off it too, while
  // it's within BOAR_STRAY tiles of it
  const stray = BOAR_STRAY * TILE_SIZE;
  for (const b of game.boars) {
    if (inEnemyTerritory(b.x, b.y)) continue;
    if (inTerritory(b.x, b.y)) b.homeZone = true;
    else if (!b.homeZone || b.x < box.x0 - stray || b.x > box.x1 + stray || b.y < box.y0 - stray || b.y > box.y1 + stray) continue;
    all.push(b); found(b, game.boars);
  }
  return all;
}

// ---- Map resources (GAME_CONFIG.mapResources)

export function getMapResourceDef(kind) {
  return GAME_CONFIG.mapResources[kind] || null;
}

// Which GAME_CONFIG.mapResources entry an object on the map is, by the list it's in
export function getMapResourceKind(resource) {
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (game[def.list].includes(resource)) return kind;
  }
  return null;
}

export function addMapResource(kind, x, y) {
  const def = GAME_CONFIG.mapResources[kind];
  const resource = { x, y, hp: def.hp, maxHp: def.hp, priority: 0 };
  if (def.list === 'trees') Object.assign(resource, { isGrowing: false, growProgress: 0 });
  game[def.list].push(resource);
  return resource;
}

// A resource is done: the settler gets what it yields (more off a fertilised plot, #201), it's removed,
// and queued to grow back if it does
export function finishHarvest(settler, resource, kind) {
  const def = GAME_CONFIG.mapResources[kind];
  const factor = resource.fertilized ? GAME_CONFIG.fertilizer.yieldFactor : 1;
  // (#279) a tree felled falls first, away from its cutter, and leaves its stump where it stood, till a tree
  // grows again (anywhere); (#298) nothing in hand yet: the log is cut up next
  const two = def.fellInTwo;
  if (two && !resource.fallen) {
    Object.assign(resource, { fallen: true, fallAt: game.pathTick, fallAngle: Math.atan2(resource.y - settler.y, resource.x - settler.x), applesReady: false });
    resource.hp = def.hp * two.logHp;
    resource.maxHp = def.hp * two.logHp; // (the lying log has its own bar, from empty: a little of it to cut up)
    resource.harvestProgress = 0;
    resource.stump = { x: resource.x, y: resource.y + 10 };
    game.stumps.push(resource.stump);
    const fellBonus = resource.apple ? GAME_CONFIG.appleTrees.fellBonusChance : def.bonusChance;
    for (const [item, chance] of Object.entries(fellBonus || {})) {
      if (rand() < chance) {
        giveResourceToSettler(settler, item, 1);
        if (settler.carrying && settler.carrying.loads === undefined) settler.carrying.loads = 0;
      }
    }
    playSound('collapse', resource);
    return;
  }
  // (#298) the log cut up: its pieces lie along where it fell, each its share of the wood, to be carried off
  if (two) cutIntoLogs(resource, def, two, factor);
  else for (const [item, amount] of Object.entries(resource.yield || def.yield || {})) giveResourceToSettler(settler, item, amount * factor);
  // loot's things are carried to a storage whole, into the armory there (#210; #261: not at once)
  for (const key of resource.items || []) giveResourceToSettler(settler, `armory:${key}`, 1);
  if (!two) {
    addCarryLoad(settler);
    noteDay(settler, kind === 'farm' ? 'farmed' : 'gathered', 'gathered', 0.1); // (its day, and now and then a word, #279; the harvest its own, #306)
  }
  const bonus = resource.apple ? GAME_CONFIG.appleTrees.fellBonusChance : def.bonusChance;
  if (!two) {
    for (const [item, chance] of Object.entries(bonus || {})) {
      if (rand() < chance) {
        giveResourceToSettler(settler, item, 1);
        if (settler.carrying && settler.carrying.loads === undefined) settler.carrying.loads = 0;
      }
    }
  }
  const list = game[def.list];
  const index = list.indexOf(resource);
  if (index !== -1) list.splice(index, 1);
  if (def.regrow) scheduleRespawn(kind, resource.x, resource.y, resource.stump, resource);
  if (def.clearsPath) invalidateAllPaths();
}

// The pieces of a felled tree's log (#298): its wood shared out in whole pieces (3 into 2: 2 and 1), laid along
// the way it fell
function cutIntoLogs(tree, def, two, factor) {
  const total = Math.round((((tree.yield || def.yield || {}).wood) || 0) * factor);
  const n = Math.max(1, Math.min(two.pieces, total));
  const side = Math.cos(tree.fallAngle || 0) >= 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const wood = Math.floor(total / n) + (i < total % n ? 1 : 0);
    // (clear of the stump: two pieces, not one long log over it)
    game.logs.push({ x: tree.x + side * (14 + i * 14), y: tree.y + 10, hp: 1, maxHp: 1, priority: 0, yield: { wood }, side });
  }
}

// ---- Delayed regrowth
// A harvested (or destroyed) resource doesn't reappear at once: it's queued and grows back after
// respawnDelay seconds (oreRespawnDelay for ore). nearX/nearY keep it near where it was (cacti). A tree hands
// over the stump it was felled at: that goes once the tree's back, wherever it grew

/**
 * @param {string} kind
 * @param {number | null} x
 * @param {number | null} y
 */
function nearestOreSpawner(kind, x = null, y = null) {
  const spawners = getOreSpawners(kind);
  if (!spawners.length) return null;
  if (x === null || y === null) return spawners[0];
  let nearest = spawners[0], distance = Math.hypot(nearest.x - x, nearest.y - y);
  for (const spawner of spawners.slice(1)) {
    const candidateDistance = Math.hypot(spawner.x - x, spawner.y - y);
    if (candidateDistance < distance) { nearest = spawner; distance = candidateDistance; }
  }
  return nearest;
}

/**
 * @param {string} type
 * @param {number | null} nearX
 * @param {number | null} nearY
 * @param {Object | null} stump
 * @param {{ oreSpawnerX?: number, oreSpawnerY?: number, zoneBound?: boolean, zoneRegrowths?: number } | null} resource
 */
export function scheduleRespawn(type, nearX = null, nearY = null, stump = null, resource = null) {
  const isOre = getMapResourceDef(type).regrow === 'spawner';
  const oreKind = isOre ? Object.keys(ORE_KINDS).find(ore => ORE_KINDS[ore].resource === type) : null;
  const source = isOre && oreKind
    ? resource?.oreSpawnerX !== undefined && resource?.oreSpawnerY !== undefined
      ? { x: resource.oreSpawnerX, y: resource.oreSpawnerY }
      : nearestOreSpawner(oreKind, nearX, nearY)
    : null;
  const delay = getMapCount(isOre ? 'oreRespawnDelay' : 'respawnDelay', isOre ? 90 : 45);
  game.pendingRespawns.push({
    type, nearX, nearY, stump, timer: delay,
    zoneBound: !!resource?.zoneBound,
    zoneRegrowths: resource?.zoneRegrowths || 0,
    oreSpawnerX: source?.x,
    oreSpawnerY: source?.y
  });
}

export function updatePendingRespawns(dt) {
  for (let i = game.pendingRespawns.length - 1; i >= 0; i--) {
    const pending = game.pendingRespawns[i];
    pending.timer -= dt;
    if (pending.timer > 0) continue;
    const def = getMapResourceDef(pending.type);
    // it's back (wherever it grew): the stump left where it stood is gone
    if (pending.stump) {
      const at = game.stumps.indexOf(pending.stump);
      if (at !== -1) game.stumps.splice(at, 1);
    }
    // (#299) on a big map within the frontier, round the base it was taken from (a default map's is all of it)
    const area = regrowArea();
    const zoneBound = pending.zoneBound && (pending.zoneRegrowths || 0) < 10;
    const keepInZone = zoneBound ? point => inTerritory(point.x, point.y) : null;
    let respawned = true;
    if (def.regrow === 'spawner') {
      const oreKind = Object.keys(ORE_KINDS).find(ore => ORE_KINDS[ore].resource === pending.type);
      if (pending.oreSpawnerX === undefined || pending.oreSpawnerY === undefined) {
        const source = oreKind && nearestOreSpawner(oreKind, pending.nearX, pending.nearY);
        if (source) { pending.oreSpawnerX = source.x; pending.oreSpawnerY = source.y; }
      }
      respawned = respawnOre(oreKind, pending.oreSpawnerX, pending.oreSpawnerY);
    }
    else if (def.regrow === 'nearby') respawned = !!spawnResource(pending.type, pending.nearX, pending.nearY, 180, null, keepInZone);
    else if (def.regrow === 'forest') respawned = !!spawnForestAware(pending.type, area, keepInZone);
    else respawned = !!spawnResource(pending.type, null, null, 180, area ? pointIn(area) : null, keepInZone);
    if (!respawned) {
      pending.timer = 1;
      continue;
    }
    if (zoneBound) {
      const defList = game[getMapResourceDef(pending.type).list];
      const regrown = defList[defList.length - 1];
      regrown.zoneRegrowths = (pending.zoneRegrowths || 0) + 1;
      if (regrown.zoneRegrowths < 10) regrown.zoneBound = true;
    }
    game.pendingRespawns.splice(i, 1);
    // things that need a tool to remove (trees, boulders, cacti, ore) block paths
    if (def.tool) invalidateAllPaths();
  }
}

// The frontier, when it isn't the whole map (a big map's): what's taken grows back in it
function regrowArea() {
  const f = getFrontier();
  return f.x0 > 0 || f.y0 > 0 || f.x1 < game.WORLD_WIDTH || f.y1 < game.WORLD_HEIGHT ? f : null;
}

// A mined ore grows back around the exact spawner it came from.
/** @param {string | undefined} kind @param {number | undefined} sourceX @param {number | undefined} sourceY */
export function respawnOre(kind, sourceX = undefined, sourceY = undefined) {
  if (!kind || sourceX === undefined || sourceY === undefined) return false;
  const all = getOreSpawners(kind);
  const spawner = all.find(r => r.x === sourceX && r.y === sourceY);
  if (!spawner) return false;
  const spots = getOreSpotsAround(spawner, getOreSpawnerRadius()).filter(spot => !inEnemyTerritory(spot.x, spot.y));
  if (spots.length === 0) return false;
  placeOre(kind, spots[Math.floor(rand() * spots.length)], spawner);
  invalidateAllPaths();
  return true;
}
