// Buildings: where one can go, blueprints and what they cost, repairs, smelters, doors, and whether the
// base is walled in

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { t } from '../../../engine/platform/index.js';
import { TILE_SIZE, game, getTileIndex, townHall } from '../../../engine/world/index.js';
import { formatCost, getFreeStock } from '../../colony/storage/index.js';
import { showNotification } from '../../../ui/index.js';
import { getMapResourceDef } from '../gathering/index.js';
import { isShelter } from '../../conflict/healing/index.js';
import { getSettlerReach, invalidateAllPaths } from '../../../engine/movement/index.js';

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
  return game.trees.some(t => Math.hypot(t.x - x, t.y - y) < 20) ||
         game.cacti.some(c => Math.hypot(c.x - x, c.y - y) < 20) ||
         game.boulders.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         game.grassList.some(g => Math.hypot(g.x - x, g.y - y) < 20) ||
         game.sticks.some(s => Math.hypot(s.x - x, s.y - y) < 20) ||
         game.pebbles.some(p => Math.hypot(p.x - x, p.y - y) < 20) ||
         game.ironOres.some(i => Math.hypot(i.x - x, i.y - y) < 22) ||
         game.coalOres.some(c => Math.hypot(c.x - x, c.y - y) < 22) ||
         game.buildings.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         game.blueprints.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         game.naturalRocks.some(r => Math.hypot(r.x - x, r.y - y) < 24) ||
         game.waterTiles.some(w => Math.hypot(w.x - x, w.y - y) < 20) ||
         game.farmPlots.some(f => Math.hypot(f.x - x, f.y - y) < 20) ||
         game.berryBushes.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         game.boars.some(b => Math.hypot(b.x - x, b.y - y) < 20);
}

export function isBuildLocationAllowed(x, y) {
  return !isTileOccupied(x, y);
}

// map: a saved map (modes/editor) to play instead of generating one; Endless plays the one chosen in its menu
// A building is gone (broken by enemies or demolished)
export function removeBuilding(building) {
  const index = game.buildings.indexOf(building);
  if (index === -1) return;
  game.buildings.splice(index, 1);
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

export function createBuildingBlueprint(type, x, y) {
  const item = getDefinition('buildings', type);
  const build = item && item.build ? item.build : {};
  const blueprint = { type, x, y, progress: 0, maxProgress: build.maxProgress || 40 };
  if (build.hp) blueprint.hp = build.hp, blueprint.maxHp = build.hp;
  if (build.smelter) blueprint.smeltProgress = 0;
  if (build.trap) blueprint.usesLeft = build.trap.uses;
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
  const doors = game.buildings.filter(b => b.type === 'door');
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
      if (smelter.smeltProgress >= limits.seconds) {
        smelter.oreLoaded--;
        smelter.coalLoaded--;
        smelter.ironProduced++;
        smelter.smeltProgress = 0;
      }
    } else {
      smelter.smeltProgress = 0;
    }
  });
}
