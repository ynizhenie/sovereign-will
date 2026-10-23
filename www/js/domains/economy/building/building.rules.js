// Buildings: where one can go, blueprints and what they cost, repairs, smelters, doors, and whether the
// base is walled in

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { TILE_SIZE, anyWithin, game, getGridPos, getTileIndex, isDoor, isTownHallSpawnTile, townHall } from '../../../engine/world/index.js';
import { dropStoreContents, formatCost, getFreeStock } from '../../colony/storage/index.js';
import { showNotification } from '../../../ui/index.js';
import { getMapResourceDef } from '../gathering/index.js';
import { isShelter } from '../../conflict/healing/index.js';
import { getSettlerReach, invalidateAllPaths } from '../../../engine/movement/index.js';
import { playSound } from '../../../app/index.js';

export function isBuildingSingle(building) {
  if (!building) return true;
  for (let other of game.buildings) {
    if (other !== building) {
      let dx = Math.abs(other.x - building.x);
      let dy = Math.abs(other.y - building.y);
      if (dx <= TILE_SIZE + 5 && dy <= TILE_SIZE + 5) {
        return false;
      }
    }
  }
  return true;
}

export function isTileOccupied(x, y) {
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return true;
  // (#299: by the tiles round it, anyWithin, not through every list: a big map has thousands)
  return anyWithin(game.trees, x, y, 20) || anyWithin(game.cacti, x, y, 20) || anyWithin(game.boulders, x, y, 20) ||
         anyWithin(game.grassList, x, y, 20) || anyWithin(game.sticks, x, y, 20) || anyWithin(game.pebbles, x, y, 20) ||
         anyWithin(game.ironOres, x, y, 22) || anyWithin(game.coalOres, x, y, 22) || anyWithin(game.buildings, x, y, 20) ||
         anyWithin(game.blueprints, x, y, 20) || anyWithin(game.naturalRocks, x, y, 24) || anyWithin(game.waterTiles, x, y, 20) ||
         anyWithin(game.farmPlots, x, y, 20) || anyWithin(game.berryBushes, x, y, 20) ||
         game.boars.some(b => Math.hypot(b.x - x, b.y - y) < 20);
}

// Where something may grow or spawn (ore round a spawner, trees, grass...): free ground with no corpse
// and nobody on it, so a corpse raised there, or whoever stands there, isn't left inside it (#223)
export function isSpawnSpotFree(x, y) {
  if (isTileOccupied(x, y)) return false;
  const tile = getGridPos(x, y);
  if (game.enemyTents.some(camp => {
    if (!camp.outpost || camp.hp <= 0) return false;
    const center = getGridPos(camp.x, camp.y), dx = Math.abs(tile.gx - center.gx), dy = Math.abs(tile.gy - center.gy);
    const radius = GAME_CONFIG.raid.wallTiles;
    return camp.layout === 'round' ? Math.hypot(dx, dy) <= radius + 0.5 : Math.max(dx, dy) <= radius;
  })) return false;
  const near = p => Math.hypot(p.x - x, p.y - y) < 22;
  return !game.corpses.some(near) && !game.settlers.some(near) && !game.enemies.some(near) && !(game.enemyTents || []).some(near);
}

export function isBuildLocationAllowed(x, y) {
  const tile = getGridPos(x, y);
  return !isTownHallSpawnTile(tile.gx, tile.gy) && !isTileOccupied(x, y);
}

// map: a saved map (modes/editor) to play instead of generating one; Endless plays the one chosen in its menu
// A building is gone (broken by enemies or demolished)
export function removeBuilding(building) {
  const index = game.buildings.indexOf(building);
  if (index === -1) return;
  dropStoreContents(building); // (a warehouse: what it held onto the ground, #248)
  game.buildings.splice(index, 1);
  playSound('collapse', building);
  invalidateAllPaths();
}

// Building materials promised to blueprints and not brought to them yet: builders fetch them from
// storage (see build), so another building can't count on them
export function getReservedForBlueprints(id) {
  let reserved = 0;
  for (const bp of game.blueprints) reserved += (bp.needs && bp.needs[id]) || 0;
  for (const s of game.settlers) if (s.carrying && s.carrying.forBlueprint && s.carrying.type === id) reserved -= s.carrying.amount;
  return Math.max(0, reserved);
}

export function canBuild(buildingType) {
  const item = getDefinition('buildings', buildingType);
  return item ? Object.entries(item.cost || {}).every(([id, amount]) => getFreeStock(id) >= amount) : false;
}

// Damaged and ordered by the player; tents mend themselves
export function needsRepair(building) {
  if (!(building.hp < building.maxHp) || isShelter(building)) return false;
  return !!building.repairRequested;
}

// One repair step for a building: its own GAME_CONFIG.repairs entry, or a share of its build cost
export function getRepairStep(building) {
  const own = GAME_CONFIG.repairs[building.type];
  if (own) return own;
  const share = GAME_CONFIG.repairs.buildings;
  const item = getDefinition('buildings', building.type) || {};
  const cost = {};
  for (const [resource, amount] of Object.entries(item.cost || {})) cost[resource] = Math.ceil(amount * share.costShare);
  return { cost, hp: building.maxHp * share.hpShare, interval: share.interval };
}

// Order (or cancel) repairs of a damaged building; tents mend themselves
export function toggleBuildingRepair(building) {
  if (!(building.hp < building.maxHp) || isShelter(building)) return false;
  building.repairRequested = !building.repairRequested;
  const item = getDefinition('buildings', building.type);
  showNotification(building.repairRequested
    ? t('repair.ordered', { name: item ? item.label : '', cost: formatCost(getRepairStep(building).cost) })
    : t('repair.cancelled'), !building.repairRequested);
  return true;
}

// Order repairs of every damaged building and the town hall
export function repairAllBuildings() {
  let count = 0;
  for (const b of game.buildings) {
    if (b.hp < b.maxHp && !isShelter(b)) { b.repairRequested = true; count++; }
  }
  if (townHall.hp < townHall.maxHp) { townHall.repairRequested = true; count++; }
  showNotification(count > 0 ? t('repair.allOrdered', { count }) : t('repair.nothing'), count === 0);
}

export function getSmelterLimits() {
  return GAME_CONFIG.buildings.smelter.build.smelter;
}

/** @returns {import('../../../engine/world/types.js').Blueprint} */
export function createBuildingBlueprint(type, x, y) {
  const item = getDefinition('buildings', type);
  const build = item && item.build ? item.build : {};
  const blueprint = { type, x, y, progress: 0, maxProgress: build.maxProgress || 40 };
  if (build.hp) blueprint.hp = build.hp, blueprint.maxHp = build.hp;
  if (build.smelter) blueprint.smeltProgress = 0;
  // a trap's uses are its health: worn down step by step, repaired like any building (#232)
  if (build.trap) blueprint.usesLeft = blueprint.hp = blueprint.maxHp = build.trap.uses;
  if (build.tower) {
    blueprint.tower = { ...build.tower };
    blueprint.arrows = 0;
    blueprint.guards = [];
  }
  return blueprint;
}

// Some buildings take one settler at a time for each job: a smelter's `supplier` (brings ore/coal) and
// `collector` (takes the iron), a campfire's `cook`. A claim lasts while its settler keeps at it
// (renewed every tick); anyone else skips that building.
export function claimBuildingJob(smelter, job, s) {
  const claim = smelter[job];
  if (claim && claim.settler !== s && game.settlers.includes(claim.settler) && game.pathTick - claim.tick <= 1) return false;
  smelter[job] = { settler: s, tick: game.pathTick };
  return true;
}

export function isBuildingJobFree(smelter, job, s) {
  const claim = smelter[job];
  return !claim || claim.settler === s || !game.settlers.includes(claim.settler) || game.pathTick - claim.tick > 1;
}

// What a blueprint still needs brought, after what's on its way already: [id, amount] or null
/** @returns {[string, number] | null} */
export function getMissingMaterial(bp) {
  for (const [id, amount] of Object.entries(bp.needs || {})) {
    const coming = game.settlers.reduce((sum, o) => sum + (o.carrying && o.carrying.forBlueprint === bp && o.carrying.type === id ? o.carrying.amount : 0), 0);
    if (amount - coming > 0) return [id, amount - coming];
  }
  return null;
}

// Resources that block the way through a door: on a tile next to a door (not diagonally), and solid
// (trees, boulders, cacti, ore). Natural rock is left to the player to mark.
export function findDoorBlockers(allResources, resourceKind) {
  const blockers = new Set();
  const doors = game.buildings.filter(isDoor);
  if (doors.length === 0) return blockers;
  const beside = new Set();
  for (const door of doors) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) beside.add(`${door.x + dx * TILE_SIZE},${door.y + dy * TILE_SIZE}`);
  }
  const tiles = getTileIndex();
  for (const r of allResources) {
    const key = `${r.x},${r.y}`;
    if (!beside.has(key) || !(tiles.trees.has(key) || tiles.solids.has(key))) continue;
    const def = getMapResourceDef(resourceKind.get(r));
    if (def && !def.markOnly) blockers.add(r);
  }
  return blockers;
}

// Whether no settler can walk from the town hall to the edge of the map (the base is walled in)
export const hallReachHolder = { x: 0, y: 0 };
export function isBaseSealed() {
  hallReachHolder.x = townHall.x; hallReachHolder.y = townHall.y;
  const reach = getSettlerReach(hallReachHolder);
  for (let gx = 0; gx < game.COLS; gx++) {
    if (reach[gx] !== -1 || reach[(game.ROWS - 1) * game.COLS + gx] !== -1) return false;
  }
  for (let gy = 0; gy < game.ROWS; gy++) {
    if (reach[gy * game.COLS] !== -1 || reach[gy * game.COLS + game.COLS - 1] !== -1) return false;
  }
  return true;
}

// Smelters turn ore and coal into iron
export function tickSmelters(dt) {
  game.buildings.filter(b => b.type === 'smelter').forEach(smelter => {
    smelter.oreLoaded = smelter.oreLoaded || 0;
    smelter.coalLoaded = smelter.coalLoaded || 0;
    smelter.ironProduced = smelter.ironProduced || 0;

    const limits = getSmelterLimits();
    if (smelter.oreLoaded > 0 && smelter.coalLoaded > 0 && smelter.ironProduced < limits.maxIron) {
      smelter.smeltProgress = (smelter.smeltProgress || 0) + dt;
      if ((smelter.smeltProgress || 0) >= limits.seconds) {
        smelter.oreLoaded--;
        smelter.coalLoaded--;
        smelter.ironProduced++;
        playSound('smelt', smelter);
        smelter.smeltProgress = 0;
      }
    } else {
      smelter.smeltProgress = 0;
    }
  });
}
