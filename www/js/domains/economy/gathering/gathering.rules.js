// Resources on the map: which can be gathered, adding one, what a finished one gives, and growing back

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, rand } from '../../../engine/world/index.js';
import { addCarryLoad, addResources, giveResourceToSettler } from '../../colony/storage/index.js';
import { ORE_KINDS, getMapCount, getOreSpawnerRadius, getOreSpawners, getOreSpotsAround, placeOre, spawnForestAware, spawnResource } from '../../world/index.js';
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

export function getHarvestableResources() {
  // ore spawners are natural rock that's never used up: only worked when marked, for its ore (#248)
  return [...getPlacedResources(false), ...game.farmPlots.filter(plot => plot.growth >= 100), ...game.boars];
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
  // (#279) a tree felled falls first, away from its cutter; (#298) nothing in hand yet: the log is cut up next
  const two = def.fellInTwo;
  if (two && !resource.fallen) {
    Object.assign(resource, { fallen: true, fallAt: game.pathTick, fallAngle: Math.atan2(resource.y - settler.y, resource.x - settler.x), applesReady: false });
    resource.hp = def.hp * two.logHp;
    resource.harvestProgress = 0;
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
    noteDay(settler, 'gathered', 'gathered', 0.1); // (its day, and now and then a word, #279)
  }
  const bonus = resource.apple ? GAME_CONFIG.appleTrees.fellBonusChance : def.bonusChance;
  for (const [item, chance] of Object.entries(bonus || {})) {
    if (rand() < chance) addResources({ [item]: 1 });
  }
  const list = game[def.list];
  const index = list.indexOf(resource);
  if (index !== -1) list.splice(index, 1);
  if (def.regrow) scheduleRespawn(kind, resource.x, resource.y);
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
    game.logs.push({ x: tree.x + side * (8 + i * 12), y: tree.y + 10, hp: 1, maxHp: 1, priority: 0, yield: { wood }, side });
  }
}

// ---- Delayed regrowth
// A harvested (or destroyed) resource doesn't reappear at once: it's queued and grows back after
// respawnDelay seconds (oreRespawnDelay for ore). nearX/nearY keep it near where it was (cacti).

export function scheduleRespawn(type, nearX = null, nearY = null) {
  const isOre = getMapResourceDef(type).regrow === 'spawner';
  const delay = getMapCount(isOre ? 'oreRespawnDelay' : 'respawnDelay', isOre ? 90 : 45);
  game.pendingRespawns.push({ type, nearX, nearY, timer: delay });
}

export function updatePendingRespawns(dt) {
  for (let i = game.pendingRespawns.length - 1; i >= 0; i--) {
    const pending = game.pendingRespawns[i];
    pending.timer -= dt;
    if (pending.timer > 0) continue;
    game.pendingRespawns.splice(i, 1);
    const def = getMapResourceDef(pending.type);
    if (def.regrow === 'spawner') respawnOre(Object.keys(ORE_KINDS).find(ore => ORE_KINDS[ore].resource === pending.type));
    else if (def.regrow === 'nearby') spawnResource(pending.type, pending.nearX, pending.nearY);
    else if (def.regrow === 'forest') spawnForestAware(pending.type);
    else spawnResource(pending.type);
    // things that need a tool to remove (trees, boulders, cacti, ore) block paths
    if (def.tool) invalidateAllPaths();
  }
}

// A mined ore grows back around a random spawner of its kind
export function respawnOre(kind) {
  const spawners = getOreSpawners(kind);
  if (spawners.length === 0) return;
  const spawner = spawners[Math.floor(rand() * spawners.length)];
  const spots = getOreSpotsAround(spawner, getOreSpawnerRadius());
  if (spots.length === 0) return;
  placeOre(kind, spots[Math.floor(rand() * spots.length)]);
  invalidateAllPaths();
}
