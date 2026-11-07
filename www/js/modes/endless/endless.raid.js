// The persistent enemy camp occupies a smaller marked area on the Endless map. Raids wait outside until
// commanded; scouting stays outside the camp and leaves the world running.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, clampCamera, ctx, onTap, t } from '../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, rand, townHall } from '../../engine/world/index.js';
import { getReachSteps, getSettlerReach, invalidateAllPaths, isTileBlockedForSettler, moveEntityTowards } from '../../engine/movement/index.js';
import { addResources, canAfford, deliverWhenNothingToDo, formatCost, moveSettlerToTownHall, payCost, showCostError, stock, takeStock } from '../../domains/colony/storage/index.js';
import { closeSelectedCard, drawIcon, escapeHtml, iconHtml, richText, showNotification } from '../../ui/index.js';
import { faceTowards } from '../../domains/colony/settlers/index.js';
import { armorOf, hasToolFamily, isRangedWeapon } from '../../domains/colony/equipment/index.js';
import { clearOrders, fightByOrders, orderTap } from '../../domains/conflict/combat/index.js';
import { treatWounded } from '../../domains/conflict/healing/index.js';
import { createConfiguredEnemy, dressForWave, getEnemyDef, getWavePresetPool } from '../../domains/conflict/waves/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../domains/factions/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { inEnemyTerritory, inTerritory, isNight } from '../../domains/world/index.js';
import { playSound } from '../../app/index.js';

const config = () => GAME_CONFIG.raid;
const CAMP_LAYOUTS = ['square', 'broken', 'open', 'stone'];
let lastCampGrowthWave = -1;
const camps = () => game.enemyCamps?.length ? game.enemyCamps : game.enemyCamp ? [game.enemyCamp] : [];
const campById = id => camps().find(camp => camp.id === id) || camps()[0] || null;
const currentRaidCamp = () => campById(raid.targetCampId);
const selectedRaidCamp = () => campById(game.raidCampId);
// The raid under way (not saved: a game can't be saved during one). phase: 'march' to the edge, 'staging'
// waiting outside, 'fight' in the camp, 'return' home; home: the base, put away while the party is raiding
export const raid = {
  /** @type {null | 'loading' | 'march' | 'staging' | 'fight' | 'return'} */
  phase: null,
  side: 'right',
  /** @type {any[]} */
  raiders: [],
  /** @type {number | null} */
  targetCampId: null,
  /** @type {any} */
  home: null,
  gather: { x: 0, y: 0 },
  won: false,
  timer: 0,
  defenders: 0,
  still: 0,     // seconds the party on its way home hasn't moved
  scouting: false, // (#279) one sent only to look at the camp: it isn't fought, and stays
  picking: false,
  retreating: false, // (#279) running back to the edge: out of the camp once each is there
  /** @type {any[]} */
  escaped: [],     // those out of the camp already
  entry: { x: 0, y: 0 },
  campSeed: 0,
  arrows: 0,       // the arrows the party took (#279)
  buildCamp: true,
  placing: false,  // the next tap in the camp pitches the shelter there
  /** @type {import('../../engine/world/types.js').Blueprint | import('../../engine/world/types.js').Building | null} */
  stagingShelter: null,
  placingPortal: false,
  /** @type {{ elapsed: number, guard?: import('../../engine/world/types.js').Enemy | null } | null} */
  scoutThreat: null,
  /** @type {import('../../engine/world/types.js').Building | null} */
  homePortal: null,
  /** @type {import('../../engine/world/types.js').Building | null} */
  exitPortal: null,
  portalReturning: false,
  /** @type {import('../../engine/world/types.js').Point | null} */
  rally: null,
  /** @type {import('../../engine/world/types.js').Point | null} */
  demonExit: null,
  costPaid: false
};

export const isRaiding = () => raid.phase !== null;
export const isInCamp = () => raid.phase === 'fight' && !raid.scouting;
// The game waits: the party being picked
export const isRaidPicking = () => raid.picking;
export const isPlacingRaidPortal = () => raid.placingPortal;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tileCenter = (gx, gy) => ({ x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 });
// A building standing (built) at `at`
/** @returns {any} */
const standing = (type, at, extra = {}) => {
  const b = /** @type {any} */ (Object.assign(createBuildingBlueprint(type, at.x, at.y), extra));
  delete b.progress; delete b.maxProgress;
  return b;
};
const waveOn = () => game.enemies.some(en => en.fromWave && en.hp > 0) ||
  game.enemyRafts.some(raft => raft.units.length > 0) ||
  (game.portalQueue || []).length > 0 ||
  game.enemyTents.some(tent => !tent.campStructure && tent.hp > 0) ||
  game.enemyTentBlueprints.length > 0;

// Spots for a party side by side along an edge, round `at`
function lineUp(at, side, i) {
  const step = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 18;
  return side === 'left' || side === 'right' ? { x: at.x, y: at.y + step } : { x: at.x + step, y: at.y };
}

// ---- The camp's zone, while it's there

// The armed, as the camp's defenders mirror them (#279: taken when the camp appears, so it's the same camp
// however the army changes after)
const armyOf = settlers => settlers.filter(s => s.weapon !== 'fist' || s.role === 'soldier' || s.role === 'archer')
  .map(s => ({ weapon: s.weapon, type: s.type, armor: s.armor || null, shield: !!s.shield, helmet: !!s.helmet }));

// Each tick (Endless): a camp opens after a wave beaten, and goes when its time is up
export function tickRaidCamp(dt) {
  if (game.gameMode !== 'endless' || !game.gameStarted || !camps().length) return;
  for (const camp of camps().slice()) {
    if (!game.enemyTents.some(tent => tent.campStructure && tent.outpost && tent.campId === camp.id && tent.hp > 0)) destroyEnemyCamp(camp);
  }
  if (camps().length && lastCampGrowthWave !== game.waveNum) {
    lastCampGrowthWave = game.waveNum;
    growCampDefenders(game.waveNum);
  }
  updateRaidBar();
}

function destroyEnemyCamp(camp = currentRaidCamp(), notify = true) {
  if (!camp) return;
  game.enemyCamps = camps().filter(other => other !== camp);
  game.enemyCamp = game.enemyCamps[0] || null;
  game.enemyCampDestroyed = game.enemyCamps.length === 0;
  if (game.raidCampId === camp.id) game.raidCampId = game.enemyCamps[0]?.id ?? null;
  game.enemyTents = game.enemyTents.filter(tent => !tent.campStructure || tent.campId !== camp.id);
  game.buildings = game.buildings.filter(building => !building.enemyCampStructure || building.campId !== camp.id);
  game.enemies = game.enemies.filter(enemy => !enemy.campGuard || enemy.campId !== camp.id);
  if (raid.targetCampId === camp.id) game.raidActive = false;
  if (notify) showNotification(t('raid.campDestroyed'), false);
  invalidateAllPaths();
}

/** @param {import('../../engine/world/types.js').Point | null} [at] */
function findEnemyCampCentre(at = null) {
  const radius = config().campRadiusTiles;
  const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const blocked = new Set([...game.waterTiles, ...game.naturalRocks, ...game.buildings]
    .map(object => `${getGridPos(object.x, object.y).gx},${getGridPos(object.x, object.y).gy}`));
  for (const camp of camps()) {
    const centre = getGridPos(camp.x, camp.y);
    for (let dy = -radius - 1; dy <= radius + 1; dy++) for (let dx = -radius - 1; dx <= radius + 1; dx++) {
      blocked.add(`${centre.gx + dx},${centre.gy + dy}`);
    }
  }
  for (const boar of game.boars) {
    const grid = getGridPos(boar.x, boar.y);
    blocked.add(`${grid.gx},${grid.gy}`);
  }
  if (at) {
    const centre = getGridPos(at.x, at.y);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const gx = centre.gx + dx, gy = centre.gy + dy;
      if (blocked.has(`${gx},${gy}`) || inTerritory(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15)) return null;
    }
    if (getReachSteps(reach, centre.gx, centre.gy) < 0) return null;
    return { gx: centre.gx, gy: centre.gy, radius };
  }
  const candidates = [];
  for (let gy = radius + BORDER_MARGIN; gy < game.ROWS - radius - BORDER_MARGIN; gy++) {
    for (let gx = radius + BORDER_MARGIN; gx < game.COLS - radius - BORDER_MARGIN; gx++) {
      let available = true;
      for (let dy = -radius; dy <= radius && available; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = gx + dx, y = gy + dy;
          if (blocked.has(`${x},${y}`) || inTerritory(x * TILE_SIZE + 15, y * TILE_SIZE + 15)) { available = false; break; }
        }
      }
      if (!available || getReachSteps(reach, gx, gy) < 0) continue;
      const distance = Math.hypot(gx * TILE_SIZE - townHall.x, gy * TILE_SIZE - townHall.y);
      candidates.push({ gx, gy, distance });
    }
  }
  candidates.sort((a, b) => b.distance - a.distance);
  const far = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.12)));
  const pick = far[Math.floor(rand() * far.length)];
  if (!pick) return null;
  return { gx: pick.gx, gy: pick.gy, radius };
}

/** @param {import('../../engine/world/types.js').Point | null} [at] */
export function createEnemyCamp(at = null) {
  if (game.gameMode !== 'endless' || game.enemyCampDestroyed) return null;
  const centre = findEnemyCampCentre(at);
  if (!centre) { showNotification(t('raid.campUnavailable'), true); return null; }
  const camp = {
    id: camps().reduce((max, existing) => Math.max(max, existing.id || 0), 0) + 1,
    x: centre.gx * TILE_SIZE + TILE_SIZE / 2,
    y: centre.gy * TILE_SIZE + TILE_SIZE / 2,
    radius: centre.radius,
    seed: Math.floor(rand() * 1e9),
    layout: CAMP_LAYOUTS[Math.floor(rand() * CAMP_LAYOUTS.length)],
    structureCount: 2 + Math.floor(rand() * 3),
    structureType: campStructureType()
  };
  game.enemyCamps = [...camps(), camp];
  game.enemyCamp = game.enemyCamps[0];
  layWorldCamp(centre.gx, centre.gy, camp);
  invalidateAllPaths();
  updateRaidBar();
  return camp;
}

export function createEnemyCamps(count = game.enemyCampCount ?? 1) {
  count = Math.max(0, Math.min(3, Math.floor(count)));
  game.enemyCamps = [];
  game.enemyCamp = null;
  game.enemyCampDestroyed = false;
  if (game.customMap) {
    for (const outpost of game.editorOutposts.slice(0, 3)) {
      if (!createEnemyCamp(outpost)) break;
    }
    game.enemyCampDestroyed = game.enemyCamps.length === 0;
    return;
  }
  for (let i = 0; i < count; i++) {
    if (!createEnemyCamp()) break;
  }
  game.enemyCampDestroyed = game.enemyCamps.length === 0;
  game.raidCampId = game.enemyCamps[0]?.id ?? null;
  return game.enemyCamps;
}

function layWorldCamp(midX, midY, camp) {
  const c = config(), R = c.campRadiusTiles;
  const clear = R + 1;
  const inside = object => {
    const grid = getGridPos(object.x, object.y);
    return Math.abs(grid.gx - midX) <= clear && Math.abs(grid.gy - midY) <= clear;
  };
  for (const list of ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres', 'beachTiles']) {
    game[list] = game[list].filter(object => !inside(object));
  }
  game.boars = game.boars.filter(boar => !inside(boar));
  const fire = getEnemyFaction().id === 'undead' ? null
    : standing('campfire', tileCenter(midX, midY), { side: 'red', enemyCampStructure: true, campId: camp.id });
  if (fire) game.buildings.push(fire);
  ensureCampInfrastructure(midX, midY, fire, camp);
  const occupied = new Set(game.buildings.map(building => {
    const grid = getGridPos(building.x, building.y);
    return `${grid.gx},${grid.gy}`;
  }));
  const tentTiles = new Set(game.enemyTents.filter(tent => tent.campStructure).map(tent => {
    const grid = getGridPos(tent.x, tent.y);
    return `${grid.gx},${grid.gy}`;
  }));
  const free = [];
  for (let gy = midY - R; gy <= midY + R; gy++) for (let gx = midX - R; gx <= midX + R; gx++) {
    if (occupied.has(`${gx},${gy}`) || tentTiles.has(`${gx},${gy}`) || inTerritory(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15)) continue;
    free.push([gx, gy]);
  }
  if (!free.length) throw new Error('Enemy camp has no free space for its defenders');
  const defenders = campDefenders(armyOf(game.settlers), game.waveNum);
  const keeperIndex = free.reduce((best, point, index) =>
    Math.hypot(point[0] - midX, point[1] - midY) < Math.hypot(free[best][0] - midX, free[best][1] - midY) ? index : best, 0);
  const keeperPost = fire ? tileCenter(...free.splice(keeperIndex, 1)[0]) : null;
  let keeperAssigned = false;
  for (const kind of defenders) {
    if (!free.length) break;
    const [gx, gy] = free.splice(Math.floor(rand() * free.length), 1)[0], pos = tileCenter(gx, gy);
    const enemy = makeCampGuard(pos, kind, camp);
    if (!enemy) continue;
    enemy.campFireKeeper = !!fire && !keeperAssigned;
    if (fire && !keeperAssigned && keeperPost) {
      enemy.x = keeperPost.x; enemy.y = keeperPost.y;
      enemy.guard = { ...keeperPost };
      keeperAssigned = true;
    } else enemy.guard = { x: pos.x, y: pos.y };
    enemy.campGuard = true;
    enemy.campId = camp.id;
    game.enemies.push(enemy);
  }
}

function makeCampGuard(pos, kind, camp, developmentWave = game.waveNum + 2) {
  const enemy = createConfiguredEnemy(pos, kind.id);
  if (!enemy) return null;
  const armour = armorOf({ armor: kind.armor === true ? 'iron' : kind.armor });
  if (armour) { enemy.armor = armour.armorKind; enemy.maxHp += armour.hpBonus; enemy.hp = enemy.maxHp; }
  if (kind.shield) enemy.shield = true;
  if (kind.helmet) enemy.helmet = true;
  dressForWave(enemy, getEnemyDef(enemy), developmentWave);
  enemy.campGuard = true;
  enemy.campId = camp.id;
  enemy.guardOff = false;
  return enemy;
}

function weaponStrength(enemy) {
  const weapon = GAME_CONFIG.weapons[getEnemyDef(enemy).weapon || 'sword'] || GAME_CONFIG.weapons.sword;
  const combat = weapon.combat || {};
  return (combat.damage || 0) / Math.max(0.1, combat.cooldown || 1) + (combat.range || 0) / 100;
}

function campGuardSpot(camp) {
  const centre = getGridPos(camp.x, camp.y);
  const radius = Math.max(2, (camp.radius || config().campRadiusTiles) - 1);
  const spots = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const gx = centre.gx + dx, gy = centre.gy + dy;
    const pos = tileCenter(gx, gy);
    if (Math.abs(dx) === radius || Math.abs(dy) === radius || inTerritory(pos.x, pos.y) ||
      isTileBlockedForSettler(gx, gy) ||
      game.buildings.some(building => getGridPos(building.x, building.y).gx === gx && getGridPos(building.x, building.y).gy === gy) ||
      game.enemyTents.some(tent => getGridPos(tent.x, tent.y).gx === gx && getGridPos(tent.x, tent.y).gy === gy) ||
      game.enemies.some(enemy => enemy.hp > 0 && Math.hypot(enemy.x - pos.x, enemy.y - pos.y) < 28)) continue;
    spots.push(pos);
  }
  return spots.length ? spots[Math.floor(rand() * spots.length)] : null;
}

function growCampDefenders(wave) {
  const targetRoster = campDefenders(armyOf(game.settlers), wave);
  for (const camp of camps()) {
    const guards = game.enemies.filter(enemy => enemy.campGuard && enemy.campId === camp.id && enemy.hp > 0);
    if (!targetRoster.length) continue;
    for (let i = 0; i < guards.length; i++) {
      let guard = guards[i];
      const desired = targetRoster[i % targetRoster.length];
      const desiredArmour = armorOf({ armor: desired.armor === true ? 'iron' : desired.armor });
      const needsPlayerGear = (!!desiredArmour && !guard.armor) || (!!desired.shield && !guard.shield) || (!!desired.helmet && !guard.helmet);
      if (weaponStrength({ enemyKey: desired.id }) > weaponStrength(guard) * 1.03 || needsPlayerGear) {
        const upgraded = makeCampGuard({ x: guard.x, y: guard.y }, desired, camp, wave + 2);
        if (upgraded) {
          Object.assign(upgraded, {
            guard: guard.guard ? { ...guard.guard } : { x: guard.x, y: guard.y },
            campFireKeeper: !!guard.campFireKeeper,
            guardOff: false,
            campTalkTimer: guard.campTalkTimer
          });
          game.enemies[game.enemies.indexOf(guard)] = upgraded;
          guard = upgraded;
          guards[i] = upgraded;
        }
      } else {
        const oldHp = guard.maxHp;
        dressForWave(guard, getEnemyDef(guard), wave + 2);
        if (guard.maxHp > oldHp) guard.hp += guard.maxHp - oldHp;
      }
    }
    while (guards.length < targetRoster.length) {
      const pos = campGuardSpot(camp);
      if (!pos) break;
      const guard = makeCampGuard(pos, targetRoster[guards.length], camp, wave + 2);
      if (!guard) break;
      guard.guard = { ...pos };
      guard.campFireKeeper = false;
      game.enemies.push(guard);
      guards.push(guard);
    }
    if (!guards.some(guard => guard.campFireKeeper) && guards.length) guards[0].campFireKeeper = true;
  }
  normalizeEnemyCamp();
}

function ensureCampInfrastructure(midX, midY, fire, camp) {
  const R = config().campRadiusTiles;
  const withinCamp = building => {
    const grid = getGridPos(building.x, building.y);
    return Math.abs(grid.gx - midX) <= R && Math.abs(grid.gy - midY) <= R;
  };
  const campBuildings = game.buildings.filter(building => building.enemyCampStructure &&
    (building.campId === camp.id || (building.campId === undefined && withinCamp(building))));
  for (const building of campBuildings) building.campId = camp.id;
  const outposts = game.enemyTents.filter(tent => tent.campStructure && tent.outpost &&
    (tent.campId === camp.id || (tent.campId === undefined && withinCamp(tent))));
  const outpost = outposts[0] || {
    x: tileCenter(midX, midY).x, y: tileCenter(midX, midY).y,
    hp: 100, maxHp: 100, outpost: true, campStructure: true, campId: camp.id, campType: 'outpost'
  };
  Object.assign(outpost, tileCenter(midX, midY), {
    hp: outpost.hp || 100, maxHp: outpost.maxHp || 100, outpost: true, campStructure: true, campId: camp.id, campType: 'outpost'
  });
  for (const duplicate of outposts.slice(1)) game.enemyTents.splice(game.enemyTents.indexOf(duplicate), 1);
  if (!game.enemyTents.includes(outpost)) game.enemyTents.push(outpost);
  camp.structureType ||= campStructureType();
  camp.structureCount = Math.max(2, Math.min(4, Math.floor(camp.structureCount || 3)));
  const campHomes = game.enemyTents.filter(tent => tent.campStructure && !tent.outpost && !tent.wavePortal &&
    (tent.campId === camp.id || (tent.campId === undefined && withinCamp(tent))));
  for (const home of campHomes) {
    home.campId = camp.id;
    home.campType ||= camp.structureType;
  }
  const validHomes = new Set();
  for (const home of campHomes) {
    const grid = getGridPos(home.x, home.y);
    const occupiedByBuilding = game.buildings.some(building => {
      const other = getGridPos(building.x, building.y);
      return other.gx === grid.gx && other.gy === grid.gy;
    });
    const occupiedByCamp = game.enemyTents.some(other => other !== home && other.campStructure &&
      other.campId === camp.id && getGridPos(other.x, other.y).gx === grid.gx &&
      getGridPos(other.x, other.y).gy === grid.gy);
    if (!occupiedByBuilding && !occupiedByCamp) validHomes.add(home);
  }
  game.enemyTents = game.enemyTents.filter(tent => !campHomes.includes(tent) || validHomes.has(tent));
  game.enemyTents = game.enemyTents.filter(tent => tent === outpost || !tent.campStructure ||
    tent.wavePortal || (tent.campId !== camp.id && (tent.campId !== undefined || !withinCamp(tent))) ||
    tent.campType === camp.structureType);
  for (const building of campBuildings.filter(building => building.enemyCampOutpost || building.type === 'warehouse')) {
    game.buildings.splice(game.buildings.indexOf(building), 1);
  }

  if (fire) {
    const fireGrid = getGridPos(fire.x, fire.y);
    const fireCell = `${fireGrid.gx},${fireGrid.gy}`;
    const fireNeighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({
      gx: midX + dx, gy: midY + dy, key: `${midX + dx},${midY + dy}`
    }));
    const fireSpot = fireNeighbors.find(spot => spot.key === fireCell) ||
      fireNeighbors.find(spot => !game.buildings.some(building => building !== fire && building !== outpost &&
        getGridPos(building.x, building.y).gx === spot.gx && getGridPos(building.x, building.y).gy === spot.gy));
    if (!fireSpot) throw new Error('Enemy camp has no clear tile beside its outpost for the fire');
    Object.assign(fire, tileCenter(fireSpot.gx, fireSpot.gy));
  }

  const towardX = Math.abs(townHall.x - outpost.x) >= Math.abs(townHall.y - outpost.y);
  const side = Math.sign(towardX ? townHall.x - outpost.x : townHall.y - outpost.y) || 1;
  const gateCell = (dx, dy) => towardX
    ? dx === side * R && Math.abs(dy) <= 1
    : dy === side * R && Math.abs(dx) <= 1;
  const torchPoints = towardX
    ? [[side * R, -2], [side * R, 2]]
    : [[-2, side * R], [2, side * R]];
  const isTorchCell = (dx, dy) => torchPoints.some(([tx, ty]) => tx === dx && ty === dy);
  const rearOpening = camp.layout === 'open' ? 1 : camp.layout === 'broken' ? 0 : -1;
  const rearGateCell = (dx, dy) => towardX
    ? dx === -side * R && Math.abs(dy) <= rearOpening
    : dy === -side * R && Math.abs(dx) <= rearOpening;
  const hasWall = (dx, dy) =>
    (Math.abs(dx) === R || Math.abs(dy) === R) && !gateCell(dx, dy) &&
    !rearGateCell(dx, dy) && !isTorchCell(dx, dy);
  const occupied = () => new Set(game.buildings.map(building => {
    const grid = getGridPos(building.x, building.y);
    return `${grid.gx},${grid.gy}`;
  }));
  for (const building of game.buildings.slice()) {
    if (!building.enemyCampStructure || building.campId !== camp.id || !/^wall_/.test(building.type)) continue;
    const grid = getGridPos(building.x, building.y);
    const dx = grid.gx - midX, dy = grid.gy - midY;
    if (!hasWall(dx, dy)) game.buildings.splice(game.buildings.indexOf(building), 1);
  }
  for (const [dx, dy] of torchPoints) {
    const gx = midX + dx, gy = midY + dy;
    const oldWall = game.buildings.find(building => building.enemyCampStructure && building.campId === camp.id && /^wall_/.test(building.type) &&
      getGridPos(building.x, building.y).gx === gx && getGridPos(building.x, building.y).gy === gy);
    if (oldWall) game.buildings.splice(game.buildings.indexOf(oldWall), 1);
    if (!game.buildings.some(building => getGridPos(building.x, building.y).gx === gx &&
      getGridPos(building.x, building.y).gy === gy)) {
      game.buildings.push(standing('torch', tileCenter(gx, gy), {
        side: 'red', enemyCampStructure: true, campId: camp.id, lit: true
      }));
    }
  }
  const wallType = camp.layout === 'stone' ? 'wall_stone' : 'wall_wood';
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (!hasWall(dx, dy)) continue;
    if (occupied().has(`${midX + dx},${midY + dy}`)) continue;
    game.buildings.push(standing(wallType, tileCenter(midX + dx, midY + dy), {
      side: 'red', enemyCampStructure: true, campId: camp.id
    }));
  }

  const homes = game.enemyTents.filter(tent => tent.campStructure && !tent.outpost &&
    !tent.wavePortal && tent.campId === camp.id && tent.campType === camp.structureType);
  const offsets = [
    [-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [3, 0],
    [0, 3], [-3, 0], [-1, -3], [3, -1], [1, 3], [-3, 1]
  ];
  const rotation = CAMP_LAYOUTS.indexOf(camp.layout || 'square');
  for (let i = homes.length; i < camp.structureCount; i++) {
    let placed = false;
    for (let offset = 0; offset < offsets.length; offset++) {
      const [rawX, rawY] = offsets[(offset + rotation * 3) % offsets.length];
      const [dx, dy] = rotation % 2 ? [-rawY, rawX] : [rawX, rawY];
      const gx = midX + dx, gy = midY + dy, point = tileCenter(gx, gy);
      if (game.buildings.some(building => {
        const grid = getGridPos(building.x, building.y);
        return grid.gx === gx && grid.gy === gy;
      }) || game.enemyTents.some(tent => {
        const grid = getGridPos(tent.x, tent.y);
        return grid.gx === gx && grid.gy === gy;
      }) || inTerritory(point.x, point.y)) continue;
      const definition = getDefinition('buildings', camp.structureType);
      const hp = definition?.build?.hp || 80;
      game.enemyTents.push({
        ...point, hp, maxHp: hp, campStructure: true, campId: camp.id, campType: camp.structureType
      });
      placed = true;
      break;
    }
    if (!placed) break;
  }
}

function campStructureType() {
  const faction = getEnemyFaction().id;
  return faction === 'undead' ? 'grave' : faction === 'demons' ? 'demon_den' : 'tent';
}

export function normalizeEnemyCamp() {
  if (!camps().length) return;
  game.enemyCamps = camps();
  game.enemyCamps.forEach((camp, index) => {
    camp.id = camp.id ?? index + 1;
    camp.layout ||= CAMP_LAYOUTS[Math.floor(rand() * CAMP_LAYOUTS.length)];
    camp.structureType ||= campStructureType();
    camp.structureCount ||= 2 + Math.floor(rand() * 3);
  });
  for (const camp of game.enemyCamps) normalizeOneEnemyCamp(camp);
  game.enemyCamp = game.enemyCamps[0];
  game.enemyCampDestroyed = false;
  if (!game.enemyCamps.some(camp => camp.id === game.raidCampId)) game.raidCampId = game.enemyCamps[0].id;
  game.boars = game.boars.filter(boar => !inEnemyTerritory(boar.x, boar.y));
  invalidateAllPaths();
}

function normalizeOneEnemyCamp(camp) {
  const centre = getGridPos(camp.x, camp.y);
  const withinCamp = object => {
    const grid = getGridPos(object.x, object.y);
    return Math.abs(grid.gx - centre.gx) <= config().campRadiusTiles &&
      Math.abs(grid.gy - centre.gy) <= config().campRadiusTiles;
  };
  const fires = game.buildings.filter(building => building.enemyCampStructure && building.type === 'campfire' &&
    (building.campId === camp.id || (building.campId === undefined && withinCamp(building))));
  const fire = getEnemyFaction().id === 'undead' ? null : fires.sort((a, b) => dist(a, camp) - dist(b, camp))[0] ||
    standing('campfire', tileCenter(centre.gx, centre.gy), { side: 'red', enemyCampStructure: true, campId: camp.id });
  if (fire) {
    fire.side = 'red';
    fire.enemyCampStructure = true;
    fire.campId = camp.id;
  }
  game.buildings = game.buildings.filter(building => !fires.includes(building) || building === fire);
  if (fire && !game.buildings.includes(fire)) game.buildings.push(fire);
  for (const building of game.buildings) {
    if (building.side === 'red' && withinCamp(building) &&
      ['warehouse', 'wall_wood', 'wall_stone', 'torch'].includes(building.type)) {
      building.enemyCampStructure = true;
      building.campId = camp.id;
    }
  }
  const oldOutposts = game.enemyTents.filter(tent => tent.campStructure && tent.outpost &&
    tent.campId === undefined && withinCamp(tent));
  oldOutposts.forEach(outpost => { outpost.campId = camp.id; });
  ensureCampInfrastructure(centre.gx, centre.gy, fire, camp);

  const guards = game.enemies.filter(enemy => enemy.campGuard && enemy.hp > 0 &&
    (enemy.campId === camp.id || (enemy.campId === undefined && withinCamp(enemy))));
  guards.forEach(enemy => { enemy.campId = camp.id; });
  const keeper = fire ? guards.find(enemy => enemy.campFireKeeper) || guards[0] : null;
  for (const enemy of guards) {
    delete enemy.campFireKeeper;
  }
  if (keeper && fire) {
    const fireGrid = getGridPos(fire.x, fire.y);
    const spots = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) =>
      tileCenter(fireGrid.gx + dx, fireGrid.gy + dy));
    const hasRoom = spot => {
      const grid = getGridPos(spot.x, spot.y);
      return !isTileBlockedForSettler(grid.gx, grid.gy) &&
        !game.enemies.some(enemy => enemy !== keeper && enemy.hp > 0 &&
          Math.hypot(enemy.x - spot.x, enemy.y - spot.y) < 26);
    };
    const currentDistance = keeper.guard ? dist(keeper.guard, fire) : 0;
    const currentPost = keeper.guard && currentDistance > TILE_SIZE + 10 &&
      currentDistance <= TILE_SIZE * Math.SQRT2 + 10 && hasRoom(keeper.guard)
      ? keeper.guard
      : null;
    let spot = currentPost || spots.find(hasRoom);
    if (!spot) {
      for (const candidate of spots) {
        const grid = getGridPos(candidate.x, candidate.y);
        if (isTileBlockedForSettler(grid.gx, grid.gy)) continue;
        const occupants = game.enemies.filter(enemy => enemy !== keeper && enemy.hp > 0 &&
          Math.hypot(enemy.x - candidate.x, enemy.y - candidate.y) < 26);
        if (!occupants.length || occupants.some(enemy => !enemy.campGuard || enemy.campId !== camp.id)) continue;
        for (const occupant of occupants) {
          const replacement = campGuardSpot(camp);
          if (!replacement) break;
          occupant.x = replacement.x;
          occupant.y = replacement.y;
          occupant.guard = { ...replacement };
        }
        if (hasRoom(candidate)) { spot = candidate; break; }
      }
    }
    if (!spot) throw new Error('Enemy camp has no clear campfire keeper post');
    keeper.campFireKeeper = true;
    keeper.x = spot.x;
    keeper.y = spot.y;
    keeper.guard = { ...spot };
  }
  invalidateAllPaths();
}

// ---- Setting out

// Who can go: anyone (the armed are picked to start with); (#298) asleep too: it's woken
const canGo = s => s.temporary === undefined;

function campDirection(camp) {
  const dx = camp.x - townHall.x, dy = camp.y - townHall.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : (dy < 0 ? 'north' : 'south');
}

function campDistance(camp) {
  return Math.round(Math.hypot(camp.x - townHall.x, camp.y - townHall.y) / TILE_SIZE);
}

// The picker: who goes on the raid (any number, and how many arrows they take, #279), or (scout) which one
// goes to look, one only
export function openRaidPicker(scout = false) {
  if (!camps().length || isRaiding()) return;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return; }
  raid.picking = true;
  const el = document.createElement('div');
  el.id = 'raid-picker';
  const campOptions = camps().length > 1
    ? `<div class="raid-camp-options" role="group" aria-label="${escapeHtml(t('raid.chooseCamp'))}">${camps().map((camp, index) =>
      `<button class="btn raid-camp-option${camp.id === selectedRaidCamp()?.id ? ' on' : ''}" data-camp-id="${camp.id}">${escapeHtml(t('raid.campLocated', {
        n: index + 1,
        direction: t(`raid.direction.${campDirection(camp)}`),
        distance: campDistance(camp)
      }))}</button>`).join('')}</div>`
    : '';
  el.innerHTML = `<div class="card-offer-title">${escapeHtml(t(scout ? 'raid.scoutPick' : 'raid.pickTitle'))}</div>${campOptions}<div class="raid-roster"></div>` +
    (scout ? '' : `<label class="raid-build-camp"><input type="checkbox" data-raid="build-camp" checked> ${escapeHtml(t('raid.buildCamp'))}</label><div class="raid-arrows"><button class="btn" data-raid="less">−</button><span class="raid-arrow-count"></span><button class="btn" data-raid="more">+</button></div>`) +
    `<div class="raid-picker-actions">${scout ? '' : `<button class="btn" data-raid="all">${escapeHtml(t('raid.all'))}</button>`}` +
    `<button class="btn raid-go" data-raid="go">${richText(t(scout ? 'raid.scoutSend' : 'raid.go'))}</button><button class="btn" data-raid="cancel">${escapeHtml(t('raid.cancel'))}</button></div>`;
  const roster = /** @type {HTMLElement} */ (el.querySelector('.raid-roster'));
  const first = scout ? scoutChoice() : null;
  for (const s of game.settlers.filter(canGo)) {
    const b = document.createElement('button');
    b.className = 'btn raid-unit' + ((scout ? s === first : s.weapon !== 'fist') ? ' on' : '');
    b.dataset.unit = String(s.id);
    const type = GAME_CONFIG.settlerTypes[s.type] || GAME_CONFIG.settlerTypes.normal;
    const weapon = getDefinition('weapons', s.weapon) || GAME_CONFIG.weapons.fist;
    const tool = s.weapon === 'fist' && s.tool && s.tool !== 'none' ? getDefinition('tools', s.tool) : null;
    b.innerHTML = `${iconHtml(type.icon)}${iconHtml(tool ? tool.icon : weapon.icon)}${armorOf(s) ? iconHtml(armorOf(s).icon) : ''}${s.shield ? iconHtml('shield') : ''}${s.helmet ? iconHtml('helmet') : ''}<span class="raid-hp">${Math.ceil(s.hp)}</span>`;
    onTap(b, () => {
      if (scout) roster.querySelectorAll('.raid-unit.on').forEach(o => { if (o !== b) o.classList.remove('on'); });
      b.classList.toggle('on');
      if (!scout) offerArrows();
    });
    roster.appendChild(b);
  }
  /** @returns {any[]} */
  const picked = () => [...roster.querySelectorAll('.raid-unit.on')].map(b => game.settlers.find(s => String(s.id) === /** @type {HTMLElement} */ (b).dataset.unit)).filter(s => !!s);
  // the arrows to take: as many as the archers picked can use, as far as the stock goes; more or fewer by hand
  let arrows = 0, touched = false;
  const buildCamp = /** @type {HTMLInputElement | null} */ (el.querySelector('[data-raid="build-camp"]'));
  const showArrows = () => { const n = el.querySelector('.raid-arrow-count'); if (n) n.innerHTML = richText(t('raid.arrows', { n: arrows })); };
  const offerArrows = () => { if (!touched) arrows = buildCamp?.checked ? Math.min(stock.arrows || 0, picked().filter(s => isRangedWeapon(s.weapon)).length * config().arrowsPerArcher) : 0; showArrows(); };
  const step = d => {
    touched = true;
    arrows = buildCamp?.checked ? Math.max(0, Math.min(stock.arrows || 0, arrows + d)) : 0;
    showArrows();
  };
  el.querySelectorAll('[data-camp-id]').forEach(button => onTap(/** @type {HTMLElement} */ (button), () => {
    game.raidCampId = Number(/** @type {HTMLElement} */ (button).dataset.campId);
    el.querySelectorAll('.raid-camp-option').forEach(option =>
      option.classList.toggle('on', option === button));
  }));
  if (!scout) {
    onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="all"]')), () => { roster.querySelectorAll('.raid-unit').forEach(b => b.classList.add('on')); offerArrows(); });
    onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="less"]')), () => step(-6));
    onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="more"]')), () => step(6));
    buildCamp?.addEventListener('change', () => { touched = false; offerArrows(); });
    offerArrows();
  }
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="cancel"]')), closeRaidPicker);
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="go"]')), () => {
    const party = picked();
    if (!party.length) { showNotification(t('raid.none'), true); return; }
    closeRaidPicker();
    if (scout) { startRaid(party, true); showNotification(t('raid.scoutOff'), false); return; }
    if (startRaid(party, false, 0, !!buildCamp?.checked)) {
      raid.arrows = takeStock('arrows', arrows);
      const medics = party.filter(s => s.role === 'worker' && s.tool && hasToolFamily(s.tool, 'medic'));
      const herbs = raid.buildCamp ? takeStock('herbs', medics.length * GAME_CONFIG.medic.bagSize) : 0;
      let remainingHerbs = herbs;
      for (const medic of medics) {
        const supply = Math.min(remainingHerbs, GAME_CONFIG.medic.bagSize - (medic.bagHerbs || 0));
        medic.bagHerbs = (medic.bagHerbs || 0) + supply;
        remainingHerbs -= supply;
      }
      if (remainingHerbs > 0) stock.herbs = (stock.herbs || 0) + remainingHerbs;
      updateRaidBar();
    }
  });
  document.body.appendChild(el);
}

function closeRaidPicker() {
  raid.picking = false;
  const el = document.getElementById('raid-picker');
  if (el) el.remove();
}

// The party sets out for the zone's side; the rest of the base rests
export function startRaid(party, scouting = false, arrows = 0, buildCamp = true) {
  const camp = selectedRaidCamp();
  if (!camp || isRaiding() || waveOn() || !party.length) return false;
  const demonRaid = !scouting && buildCamp && getPlayerFaction().id === 'demons';
  const cost = scouting || !buildCamp || demonRaid ? null : GAME_CONFIG.buildings[shelterType()].cost;
  if (cost && !canAfford(cost)) { showCostError(cost, GAME_CONFIG.buildings[shelterType()].label); return false; }
  game.raidCampId = camp.id;
  raid.targetCampId = camp.id;
  raid.defenders = game.enemies.filter(enemy => enemy.campGuard && enemy.campId === camp.id && enemy.hp > 0).length;
  const dx = camp.x - townHall.x, dy = camp.y - townHall.y;
  raid.side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
  Object.assign(raid, {
    phase: party.some(s => s.carrying) ? 'loading' : 'march',
    raiders: party, won: false, timer: 0, scouting, arrows, buildCamp, retreating: false, escaped: [], placing: false,
    placingPortal: false, stagingShelter: null, scoutThreat: null, costPaid: false
  });
  raid.gather = { x: camp.x, y: camp.y };
  if (raid.side === 'left') raid.gather.x -= (camp.radius + 1) * TILE_SIZE;
  else if (raid.side === 'right') raid.gather.x += (camp.radius + 1) * TILE_SIZE;
  else if (raid.side === 'top') raid.gather.y -= (camp.radius + 1) * TILE_SIZE;
  else raid.gather.y += (camp.radius + 1) * TILE_SIZE;
  party.forEach((s, i) => {
    s.raider = true; s.isPossessed = false;
    if (s.asleep) { s.asleep = false; s.sleepSpot = null; } // (woken for it, #298)
    s.raidSpot = lineUp(raid.gather, raid.side, i);
  });
  if (demonRaid && !prepareDemonRaidPortals(camp)) {
    resetRaidState();
    return false;
  }
  party.forEach((s, i) => { s.raidSpot = lineUp(raid.rally || raid.gather, raid.side, i); });
  closeSelectedCard();
  updateRaidBar();
  return true;
}

// (#279) a scout to look at the camp: the settler selected, else one with nothing to do (soldiers last)
function scoutChoice() {
  const picked = game.selectedSettler && game.settlers.includes(game.selectedSettler) && canGo(game.selectedSettler) ? game.selectedSettler : null;
  return picked || game.settlers.filter(canGo).sort((a, b) => (b.isIdle ? 1 : 0) - (a.isIdle ? 1 : 0) || (a.role === 'worker' ? -1 : 1))[0] || null;
}

// Sent at once, the one scoutChoice gives (the bar's button opens the picker to choose which)
export function sendScout() {
  if (!camps().length || isRaiding()) return false;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return false; }
  const scout = scoutChoice();
  if (!scout) { showNotification(t('raid.none'), true); return false; }
  startRaid([scout], true);
  showNotification(t('raid.scoutOff'), false);
  return true;
}

const arrived = () => raid.raiders.filter(s => game.settlers.includes(s) &&
  dist(s, raid.rally || raid.gather) < (raid.scouting ? 8 : 50 + 9 * raid.raiders.length)).length;
const liveRaiders = () => raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
const staged = () => liveRaiders().filter(s => dist(s, s.raidSpot) < 12).length;

// ---- The camp: the base put away, the zone's own map

// The party reaches the camp and starts its raid there
export function enterCamp() {
  if (raid.phase !== 'staging' || raid.scouting) return;
  const camp = currentRaidCamp();
  if (!camp) { endRaid(false); return; }
  const party = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
  if (!party.length) { leaveCamp(false); return; }
  if (raid.buildCamp && getPlayerFaction().id !== 'demons') {
    const cost = GAME_CONFIG.buildings[shelterType()].cost;
    if (!canAfford(cost)) { showCostError(cost, GAME_CONFIG.buildings[shelterType()].label); updateRaidBar(); return; }
    if (!raid.costPaid) { payCost(cost); raid.costPaid = true; }
  }
  game.selectedSettler = null;
  raid.entry = raid.gather;
  raid.raiders = party;
  raid.phase = 'fight';
  raid.timer = 0;
  game.raidActive = !raid.scouting;
  game.raidCampId = camp.id;
  for (const enemy of game.enemies) if (enemy.campGuard && enemy.campId === camp.id) enemy.guardOff = false;
  Object.assign(camera, { x: camp.x, y: camp.y });
  clampCamera();
  invalidateAllPaths();
  if (!raid.scouting) playSound('horn');
  updateRaidBar();
}

// The camp draws its own faction roster from the wave presets two levels ahead. Player equipment can
// influence guard gear, but the player's unit types do not limit the camp's composition.
export function campDefenders(army, wave = game.waveNum) {
  const c = config().defenders;
  const campLevel = wave + 2;
  const kinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id));
  const ofKey = key => kinds.find(def => /** @type {string[]} */ ([]).concat(def.waveKey).includes(key) && !def.healer && !def.necromancer && !def.pet) || kinds[0]; // (not a pet for a soldier: a dog in armour, #326)
  const pool = getWavePresetPool(getEnemyFaction().id, campLevel);
  const candidates = pool.filter(option => {
    const def = GAME_CONFIG.enemies[option.enemyKey];
    return !def.pet && !def.healer && !def.necromancer;
  });
  const chooseKind = () => {
    if (!candidates.length) return ofKey('raider');
    let roll = rand() * candidates.reduce((sum, option) => sum + option.weight, 0);
    for (const option of candidates) {
      roll -= option.weight;
      if (roll < 0) return GAME_CONFIG.enemies[option.enemyKey];
    }
    return GAME_CONFIG.enemies[candidates[candidates.length - 1].enemyKey];
  };
  const count = Math.max(c.min, Math.round(army.length * c.perSoldier) + Math.floor((campLevel - 1) / c.extraEveryWaves));
  const out = [];
  for (let i = 0; i < count; i++) {
    const def = chooseKind();
    const soldier = army[i % army.length];
    out.push({
      id: def.id,
      armor: soldier?.armor || null,
      shield: !!soldier?.shield && def.type === 'normal' && !def.ranged,
      helmet: !!soldier?.helmet
    });
  }
  return out;
}

// ---- Orders in the camp

// A tap in the camp: orders (see combat.orders.js). True: the tap was the raid's
export function raidTap(x, y) {
  if (raid.placingPortal && raid.phase === 'staging' && getPlayerFaction().id === 'demons') {
    placeDemonRaidPortal(x, y);
    return true;
  }
  if (!isInCamp()) return false;
  if (raid.placing) { pitchShelter(x, y); return true; }
  if (raid.retreating) return true;
  orderTap(x, y);
  return true;
}

// ---- (#279) a shelter in the camp

// The player's faction's: a tent, a grave, a den (the first of its homes)
export function shelterType() {
  const homes = Object.values(GAME_CONFIG.buildings).filter(def => def.group === 'homes' && def.population && (!def.factions || def.factions.includes(getPlayerFaction().id)));
  return (homes.find(def => def.healPerSecond) || homes[0] || GAME_CONFIG.buildings.tent).id;
}
const shelters = () => game.buildings.filter(b => b.raidShelter);

// Paid from the stock and put down where it was tapped (not on a wall, not in the enemy's reach): the nearest
// of the party not fighting builds it
function pitchShelter(x, y) {
  raid.placing = false;
  const type = shelterType(), def = GAME_CONFIG.buildings[type];
  const g = getGridPos(x, y);
  if (isTileBlockedForSettler(g.gx, g.gy) || game.enemies.some(en => en.hp > 0 && dist(en, { x, y }) < 60)) { showNotification(t('raid.shelterHere'), true); updateRaidBar(); return; }
  if (!canAfford(def.cost)) { showCostError(def.cost, def.label); updateRaidBar(); return; }
  payCost(def.cost);
  const at = tileCenter(g.gx, g.gy);
  const bp = /** @type {any} */ (createBuildingBlueprint(type, at.x, at.y));
  bp.raidShelter = true;
  const builder = [...game.settlers].sort((a, b) => (a.orderTarget ? 1 : 0) - (b.orderTarget ? 1 : 0) || dist(a, at) - dist(b, at))[0];
  bp.builderId = builder ? builder.id : null;
  game.blueprints.push(bp);
  playSound('click');
  updateRaidBar();
}

function findRaidPortalSpot(origin) {
  const centre = getGridPos(origin.x, origin.y);
  const points = [];
  for (let radius = 0; radius <= 6; radius++) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const point = tileCenter(centre.gx + dx, centre.gy + dy);
      if (isTileBlockedForSettler(centre.gx + dx, centre.gy + dy) ||
        game.buildings.some(building => dist(building, point) < 30) ||
        game.enemyTents.some(tent => dist(tent, point) < 30) ||
        game.settlers.some(settler => dist(settler, point) < 26) ||
        game.enemies.some(enemy => enemy.hp > 0 && dist(enemy, point) < 30)) continue;
      points.push(point);
    }
    if (points.length) return points[0];
  }
  return null;
}

function prepareDemonRaidPortals(camp) {
  const homeDirection = Math.atan2(camp.y - townHall.y, camp.x - townHall.x);
  const homeOrigin = {
    x: townHall.x + Math.cos(homeDirection) * TILE_SIZE * 3,
    y: townHall.y + Math.sin(homeDirection) * TILE_SIZE * 3
  };
  const home = findRaidPortalSpot(homeOrigin);
  if (!home) {
    showNotification(t('raid.portalUnavailable'), true);
    return false;
  }
  const portal = point => standing('portal', point, { side: 'green', raidPortal: true });
  const homePortal = portal(home);
  raid.homePortal = homePortal;
  raid.exitPortal = null;
  raid.demonExit = null;
  raid.rally = home;
  raid.placingPortal = false;
  game.buildings.push(homePortal);
  invalidateAllPaths();
  return true;
}

function placeDemonRaidPortal(x, y) {
  const camp = currentRaidCamp();
  if (!camp) return false;
  const grid = getGridPos(x, y), centre = getGridPos(camp.x, camp.y);
  const distance = Math.max(Math.abs(grid.gx - centre.gx), Math.abs(grid.gy - centre.gy));
  const point = tileCenter(grid.gx, grid.gy);
  if (grid.gx < 0 || grid.gy < 0 || grid.gx >= game.COLS || grid.gy >= game.ROWS ||
      distance > camp.radius + 2 || inTerritory(point.x, point.y) ||
      isTileBlockedForSettler(grid.gx, grid.gy) ||
      game.buildings.some(building => dist(building, point) < 30) ||
      game.enemyTents.some(tent => dist(tent, point) < 30) ||
      game.settlers.some(settler => dist(settler, point) < 26) ||
      game.enemies.some(enemy => enemy.hp > 0 && dist(enemy, point) < 60)) {
    showNotification(t('raid.portalHere'), true);
    return false;
  }
  const exitPortal = standing('portal', point, { side: 'green', raidPortal: true });
  game.buildings.push(exitPortal);
  raid.exitPortal = exitPortal;
  raid.demonExit = point;
  raid.gather = point;
  raid.placingPortal = false;
  raid.raiders.forEach((settler, i) => {
    const spot = lineUp(point, raid.side, i);
    settler.x = spot.x;
    settler.y = spot.y;
    settler.raidSpot = spot;
    settler.path = null;
    settler.pathTarget = null;
  });
  invalidateAllPaths();
  updateRaidBar();
  return true;
}

function prepareStagingShelter() {
  const type = shelterType(), definition = GAME_CONFIG.buildings[type];
  const centre = getGridPos(raid.gather.x, raid.gather.y);
  let point = null;
  for (let radius = 1; radius <= 2 && !point; radius++) {
    for (let dy = -radius; dy <= radius && !point; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const gx = centre.gx + dx, gy = centre.gy + dy, at = tileCenter(gx, gy);
      if (isTileBlockedForSettler(gx, gy) || game.buildings.some(building => dist(building, at) < 30) ||
        game.blueprints.some(bp => dist(bp, at) < 30) || game.enemyTents.some(tent => dist(tent, at) < 30) ||
        game.enemies.some(enemy => enemy.hp > 0 && dist(enemy, at) < 60)) continue;
      point = at;
      break;
    }
  }
  if (!point) return;
  const bp = /** @type {any} */ (createBuildingBlueprint(type, point.x, point.y));
  const builders = raid.raiders.filter(settler => !GAME_CONFIG.settlerTypes[settler.type]?.pet);
  const builder = (builders.length ? builders : raid.raiders)
    .sort((a, b) => dist(a, point) - dist(b, point))[0];
  if (!builder) return;
  Object.assign(bp, { raidShelter: true, raidStagingShelter: true, builderId: builder.id });
  raid.stagingShelter = bp;
  game.blueprints.push(bp);
}

function buildStagingShelter(settler, blueprint, dt) {
  if (dist(settler, blueprint) > 30) {
    moveEntityTowards(settler, blueprint.x, blueprint.y, settler.speed, false, dt);
    return;
  }
  faceTowards(settler, blueprint.x, blueprint.y);
  settler.working = 0.1;
  settler.workKind = 'build';
  blueprint.progress += dt * (blueprint.maxProgress / config().shelter.buildSeconds);
  if (blueprint.progress < blueprint.maxProgress) return;
  game.blueprints.splice(game.blueprints.indexOf(blueprint), 1);
  const building = standing(blueprint.type, blueprint, { raidShelter: true, raidStagingShelter: true });
  building.built = true;
  game.buildings.push(building);
  raid.stagingShelter = building;
  invalidateAllPaths();
  playSound('tentUp', building);
}

function cleanupRaidShelter() {
  const shelter = raid.stagingShelter;
  if (!shelter) return;
  game.blueprints = game.blueprints.filter(blueprint => blueprint !== shelter);
  game.buildings = game.buildings.filter(building => building !== shelter);
  raid.stagingShelter = null;
}

function finishDemonRaid(won, survivors) {
  if (!survivors.length) {
    removeRaidPortals();
    return;
  }
  if (!raid.homePortal || !raid.exitPortal) return;
  raid.portalReturning = true;
  for (const settler of survivors) delete settler.returnedViaPortal;
}

function removeRaidPortals() {
  game.buildings = game.buildings.filter(building => !building.raidPortal);
  raid.homePortal = null;
  raid.exitPortal = null;
  raid.portalReturning = false;
  invalidateAllPaths();
}

function tickScoutThreat(dt) {
  if (!raid.scouting || raid.phase !== 'fight' || !raid.raiders.length) return;
  const scout = raid.raiders[0];
  if (!raid.scoutThreat) raid.scoutThreat = { elapsed: 0 };
  raid.scoutThreat.elapsed += dt;
  if (raid.scoutThreat.guard && raid.scoutThreat.guard.hp > 0 &&
      dist(raid.scoutThreat.guard, scout) < config().scoutSeenTiles * TILE_SIZE) {
    returnScout();
    return;
  }
  if (raid.scoutThreat.elapsed < 10 || raid.scoutThreat.guard) return;
  const guard = game.enemies.filter(enemy => enemy.campGuard && enemy.campId === raid.targetCampId && enemy.hp > 0)
    .sort((a, b) => dist(a, scout) - dist(b, scout))[0];
  if (guard) {
    guard.guardOff = true;
    guard.scoutChasing = true;
    guard.attackTarget = scout;
    raid.scoutThreat.guard = guard;
  }
}

// The builder at its site: built a little; done, it stands
function buildShelter(s, bp, dt) {
  if (dist(s, bp) > 30) { moveEntityTowards(s, bp.x, bp.y, s.speed, false, dt); return; }
  faceTowards(s, bp.x, bp.y);
  s.working = 0.1; s.workKind = 'build';
  bp.progress += dt * (bp.maxProgress / config().shelter.buildSeconds);
  if (bp.progress < bp.maxProgress) return;
  game.blueprints.splice(game.blueprints.indexOf(bp), 1);
  game.buildings.push(standing(bp.type, bp, { raidShelter: true }));
  invalidateAllPaths();
  playSound('tentUp', bp);
}

// Each tick in the camp: by a shelter, one heals, and an archer fills its quiver from what the party took
function tickShelters(dt) {
  const c = config().shelter;
  for (const b of shelters()) {
    for (const s of game.settlers) {
      if (dist(s, b) > c.reach) continue;
      if (s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + c.healPerSecond * dt);
      const room = (/** @type {any} */ (s).quiverCapacity || 12) - (s.arrows || 0);
      if (isRangedWeapon(s.weapon) && s.quiver && room > 0 && raid.arrows > 0) { const n = Math.min(room, raid.arrows); s.arrows = (s.arrows || 0) + n; raid.arrows -= n; }
    }
  }
}

// The rest of the base while a party is out on a raid: it rests by the hall
export function restWhileRaid(s, tick) {
  if (!raid.phase || raid.scouting || game.gameMode !== 'endless' || s.raider) return false;
  if (dist(s, townHall) > townHall.radius + 50) moveSettlerToTownHall(s, s.speed, tick.dt);
  return true;
}

// A raider's behaviour (first in SETTLER_BEHAVIOURS after the possessed): it walks to the edge, fights in the
// camp and walks home
export function raidOrders(s, tick) {
  if (!raid.phase || game.gameMode !== 'endless' || !s.raider) return false;
  const dt = tick.dt;
  if (s.carrying && raid.phase === 'loading') {
    deliverWhenNothingToDo(s, tick);
    return true;
  }
  if (raid.phase === 'loading') return true;
  if (raid.phase === 'march') {
    if (dist(s, s.raidSpot) > 6) moveEntityTowards(s, s.raidSpot.x, s.raidSpot.y, s.speed, false, dt);
    else faceTowards(s, currentRaidCamp()?.x || s.x, currentRaidCamp()?.y || s.y);
    return true;
  }
  if (raid.phase === 'staging') {
    const shelter = raid.stagingShelter;
    if (shelter && shelter.builderId === s.id && !shelter.built) {
      buildStagingShelter(s, shelter, dt);
      return true;
    }
    if (dist(s, s.raidSpot) > 6) moveEntityTowards(s, s.raidSpot.x, s.raidSpot.y, s.speed, false, dt);
    else faceTowards(s, currentRaidCamp()?.x || s.x, currentRaidCamp()?.y || s.y);
    return true;
  }
  if (raid.phase === 'return') {
    if (raid.portalReturning && !s.returnedViaPortal && raid.exitPortal && raid.homePortal) {
      if (dist(s, raid.exitPortal) > 24) moveEntityTowards(s, raid.exitPortal.x, raid.exitPortal.y, s.speed, false, dt);
      else {
        s.x = raid.homePortal.x;
        s.y = raid.homePortal.y;
        s.path = null;
        s.pathTarget = null;
        s.returnedViaPortal = true;
      }
      return true;
    }
    if (dist(s, townHall) > townHall.radius + 40) moveSettlerToTownHall(s, s.speed, dt);
    return true;
  }
  // (#279) running back to the edge it came in by: out of the camp once there
  if (raid.retreating) {
    if (dist(s, s.exitSpot) > 10) moveEntityTowards(s, s.exitSpot.x, s.exitSpot.y, s.speed * 1.15, false, dt);
    else { raid.escaped.push(s); game.settlers = game.settlers.filter(o => o !== s); if (game.selectedSettler === s) game.selectedSettler = null; }
    return true;
  }
  // A scout observes the camp from outside its zone.
  if (raid.scouting) {
    faceTowards(s, currentRaidCamp()?.x || s.x, currentRaidCamp()?.y || s.y);
    return true;
  }
  if (GAME_CONFIG.settlerTypes[s.type]?.pet) return false;
  if (treatWounded(s, tick)) return true;
  // the shelter: its builder builds it; in the auto battle the badly hurt go to it, and an archer out of
  // arrows when there are some there (#279)
  const site = game.blueprints.find(bp => bp.raidShelter && bp.builderId === s.id);
  if (site && !s.orderTarget) { buildShelter(s, site, dt); return true; }
  const shelter = shelters().sort((a, b) => dist(a, s) - dist(b, s))[0];
  const empty = isRangedWeapon(s.weapon) && s.quiver && (s.arrows || 0) <= 0 && raid.arrows > 0;
  if (shelter && !s.orderTarget && ((s.hp < s.maxHp * config().shelter.woundedShare || (s.healing && s.hp < s.maxHp * 0.9)) || empty)) {
    s.healing = s.hp < s.maxHp * 0.9;
    if (dist(s, shelter) > config().shelter.reach - 10) moveEntityTowards(s, shelter.x, shelter.y, s.speed, false, dt);
    return true;
  }
  s.healing = false;
  fightByOrders(s, dt, true); // (in the camp)
  return true;
}

// ---- Each tick of a raid

export function tickRaid(dt) {
  if (!raid.phase || game.gameMode !== 'endless') return;
  raid.timer += dt;
  if (raid.phase === 'loading' && raid.raiders.every(s => !s.carrying)) {
    raid.phase = 'march';
    raid.timer = 0;
  }
  if (raid.phase === 'march') {
    raid.raiders = raid.raiders.filter(s => game.settlers.includes(s));
    if (!raid.raiders.length) endRaid(false);
    else if (arrived() >= raid.raiders.length || (!raid.scouting && raid.timer >= config().marchSeconds)) {
      if (raid.scouting) {
        raid.phase = 'fight';
        raid.timer = 0;
        const scout = raid.raiders[0];
        Object.assign(camera, { x: raid.gather.x, y: raid.gather.y });
        if (currentRaidCamp()) faceTowards(scout, currentRaidCamp().x, currentRaidCamp().y);
        clampCamera();
        invalidateAllPaths();
      } else {
        raid.phase = 'staging';
        raid.timer = 0;
        if (raid.exitPortal) {
          raid.raiders.forEach((settler, i) => {
            const spot = lineUp(raid.gather, raid.side, i);
            settler.x = spot.x; settler.y = spot.y;
            settler.raidSpot = spot;
            settler.path = null; settler.pathTarget = null;
          });
        } else if (raid.buildCamp && getPlayerFaction().id !== 'demons') prepareStagingShelter();
      }
    }
  } else if (raid.phase === 'staging') {
    if (!raid.raiders.some(s => game.settlers.includes(s) && s.hp > 0)) failRaid();
  } else if (raid.phase === 'fight') {
    tickShelters(dt);
    if (!raid.raiders.some(s => game.settlers.includes(s) && s.hp > 0)) failRaid();
    else if (raid.scouting) {
      tickScoutThreat(dt);
      if (raid.phase === 'fight' && raid.timer >= config().scoutSeconds) leaveCamp(false);
    }
    else if (!game.enemies.some(en => en.campGuard && en.hp > 0)) leaveCamp(true);
  } else if (raid.phase === 'return') {
    // home: all near the hall (#279: one pushed a little out by the rest kept it from ending), or none of
    // them going anywhere any more for a few seconds (stuck), or a minute gone
    const home = raid.raiders.filter(s => game.settlers.includes(s));
    const moved = home.reduce((sum, s) => sum + (s.lastStep ? dist(s, s.lastStep) : 1), 0);
    home.forEach(s => { s.lastStep = { x: s.x, y: s.y }; });
    raid.still = moved < 0.05 * home.length ? (raid.still || 0) + dt : 0;
    if (home.every(s => dist(s, townHall) < townHall.radius + 110) || raid.still > 3 || raid.timer > 60) endRaid(raid.won);
  }
  updateRaidBar();
}

// Back to the base: what the camp was is gone; the survivors (if any) at the side's edge
function restoreHome(survivors) {
  clearCampTargets(raid.targetCampId);
  for (const settler of survivors) {
    settler.raider = true;
    settler.path = null;
    settler.pathTarget = null;
    clearOrders(settler);
  }
  game.raidActive = false;
  for (const enemy of game.enemies) if (enemy.campGuard) {
    enemy.guardOff = false;
    delete enemy.scoutChasing;
    delete enemy.attackTarget;
  }
  game.selectedSettler = null;
  invalidateAllPaths();
}

function clearCampTargets(campId) {
  if (campId == null) return;
  for (const target of [...game.enemies, ...game.enemyTents, ...game.buildings]) {
    if (target.campId === campId && (target.campGuard || target.campStructure || target.enemyCampStructure)) {
      delete target.markedTarget;
    }
  }
}

// The camp beaten (won) or left (Retreat): the party walks home with what it took
// Retreat (#279): not at once; each runs back to its spot on the edge it came in by (the enemy after it), and
// once all who are left are out, the party's out of the camp
function startRetreat() {
  if (raid.phase === 'staging') {
    const survivors = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
    cleanupRaidShelter();
    finishDemonRaid(false, survivors);
    restoreHome(survivors);
    raid.raiders = survivors;
    raid.phase = 'return';
    raid.timer = 0;
    showNotification(t('raid.retreated'), true);
    updateRaidBar();
    return;
  }
  if (raid.phase !== 'fight' || raid.retreating) return;
  raid.placing = false;
  leaveCamp(false);
  if (!raid.scouting) showNotification(t('raid.retreated'), true);
  updateRaidBar();
}

export function leaveCamp(won) {
  if (raid.phase !== 'fight') return;
  const survivors = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
  survivors.forEach(s => { delete s.exitSpot; delete s.healing; });
  restoreHome(survivors);
  raid.retreating = false;
  raid.placingPortal = false;
  // the arrows not used, back in the stock
  if (raid.arrows > 0 && survivors.length) { stock.arrows = (stock.arrows || 0) + raid.arrows; raid.arrows = 0; }
  raid.raiders = survivors;
  raid.won = won && !raid.scouting;
  cleanupRaidShelter();
  if (getPlayerFaction().id === 'demons') finishDemonRaid(raid.won, survivors);
  if (raid.won) destroyEnemyCamp(currentRaidCamp(), false);
  raid.phase = 'return';
  raid.timer = 0;
  if (raid.won) {
    const c = config(), scale = 1 + c.rewardPerDefender * raid.defenders;
    const reward = Object.fromEntries(Object.entries(c.reward).map(([k, v]) => [k, Math.round(v * scale)]));
    if (!getPlayerFaction().eats) delete reward.food; // (the undead have no food)
    addResources(reward);
    showNotification(t('raid.won', { reward: formatCost(reward) }), false);
    playSound('craftDone');
  }
  updateRaidBar();
}

function returnScout() {
  if (!raid.scouting || raid.phase === 'return' || !raid.phase) return;
  if (raid.phase === 'fight') {
    leaveCamp(false);
    return;
  }
  if (raid.phase === 'march') {
    raid.phase = 'return';
    raid.timer = 0;
    updateRaidBar();
  }
}

// The whole party down: the camp goes at once, the base is back, a wave comes soon
function failRaid() {
  cleanupRaidShelter();
  removeRaidPortals();
  restoreHome([]);
  showNotification(t('raid.lost', { seconds: 0 }), true);
  playSound('defeat');
  raid.raiders = [];
  resetRaidState();
}

// Over: home (or never left). Won: the zone goes and the next wave waits twice as long
export function endRaid(won) {
  for (const s of raid.raiders) { delete s.raider; delete s.raidSpot; delete s.lastStep; clearOrders(s); }
  cleanupRaidShelter();
  removeRaidPortals();
  resetRaidState();
}

function resetRaidState() {
  cleanupRaidShelter();
  removeRaidPortals();
  const campId = raid.targetCampId;
  game.raidActive = false;
  clearCampTargets(campId);
  for (const s of game.settlers) { delete s.raider; delete s.raidSpot; clearOrders(s); }
  Object.assign(raid, {
    phase: null, raiders: [], targetCampId: null, home: null, won: false, timer: 0, defenders: 0, still: 0,
    scouting: false, retreating: false, escaped: [], arrows: 0, buildCamp: true, placing: false, placingPortal: false, stagingShelter: null,
    scoutThreat: null, homePortal: null, exitPortal: null, portalReturning: false, rally: null, demonExit: null, costPaid: false
  });
  updateRaidBar();
}

// A new game or one loaded: no raid going on (a party half way is back home, the base as it was)
export function resetRaid() {
  closeRaidPicker();
  lastCampGrowthWave = -1;
  resetRaidState();
}

// ---- On screen
// The bar under the top of the screen: the camp's time, the party on its way, the orders in the camp
let barKey = '';
export function updateRaidBar() {
  let bar = document.getElementById('raid-bar');
  const show = game.gameMode === 'endless' && game.gameStarted && isRaiding() && !raid.scouting;
  if (!show) {
    if (bar) bar.remove();
    barKey = '';
    document.dispatchEvent(new CustomEvent('endless-raid-status'));
    return;
  }
  let html = '';
  if (raid.retreating) {
    html = `<span>${escapeHtml(t(raid.scouting ? 'raid.scoutRunning' : 'raid.retreating'))}</span>`;
  } else if (raid.phase === 'march') {
    html = `<span>${escapeHtml(t('raid.marching', { n: arrived(), m: raid.raiders.length }))}</span>` +
      `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>`;
  } else if (raid.phase === 'staging') {
    const count = staged();
    const total = liveRaiders().length;
    const needsPortal = raid.buildCamp && getPlayerFaction().id === 'demons' && !raid.exitPortal;
    html = `<span>${escapeHtml(t('raid.staging', { n: count, m: total }))}</span>` +
      (needsPortal ? `<button class="btn${raid.placingPortal ? ' on' : ''}" data-raid-act="portal">${richText(t('raid.portalPlace'))}</button>` : '') +
      `<button class="btn" data-raid-act="attack"${count < total || needsPortal ? ' disabled' : ''}>${richText(t('raid.attack'))}</button>` +
      `<button class="btn" data-raid-act="retreat">${escapeHtml(t('raid.retreat'))}</button>`;
  } else if (raid.phase === 'fight') {
    const def = GAME_CONFIG.buildings[shelterType()], pitched = game.blueprints.some(bp => bp.raidShelter) || shelters().length > 0;
    html = `<span>${escapeHtml(t('raid.left', { n: game.enemies.filter(en => en.hp > 0 && en.campGuard).length }))}` +
      (raid.arrows > 0 ? ` · ${richText(t('raid.arrows', { n: raid.arrows }))}` : '') + `</span>` +
      (pitched || !raid.buildCamp ? '' : `<button class="btn${raid.placing ? ' on' : ''}" data-raid-act="shelter">${richText(`[[${def.icon}]] ${def.label}`)} <small>${richText(formatCost(def.cost))}</small></button>`) +
      `<button class="btn" data-raid-act="retreat">${escapeHtml(t('raid.retreat'))}</button>`;
  } else html = `<span>${escapeHtml(t('raid.returning'))}</span>`;
  if (html === barKey && bar) return;
  barKey = html;
  // (#279) over the bottom panel: first in the column over the dock, above the selected settler and the sheet
  if (!bar) { bar = document.createElement('div'); bar.id = 'raid-bar'; const over = document.getElementById('hud-bottom'); if (over) over.prepend(bar); else document.body.appendChild(bar); }
  bar.innerHTML = html;
  bar.querySelectorAll('[data-raid-act]').forEach(b => onTap(/** @type {HTMLElement} */ (b), () => raidAction(/** @type {HTMLElement} */ (b).dataset.raidAct)));
  document.dispatchEvent(new CustomEvent('endless-raid-status'));
}

export function raidAction(act) {
  if (act === 'attack' && raid.phase === 'staging' && staged() === liveRaiders().length) enterCamp();
  else if (act === 'call-off' && raid.phase === 'march') endRaid(false);
  else if (act === 'scout-return') returnScout();
  else if (act === 'portal' && raid.phase === 'staging' && getPlayerFaction().id === 'demons' && !raid.exitPortal) {
    raid.placingPortal = !raid.placingPortal;
    if (raid.placingPortal) showNotification(t('raid.portalTap'), false);
  }
  else if (act === 'retreat') startRetreat();
  else if (act === 'shelter' && isInCamp()) { raid.placing = !raid.placing; if (raid.placing) showNotification(t('raid.shelterTap'), false); }
  barKey = '';
  updateRaidBar();
}

export function initRaidControls() {
  document.addEventListener('endless-raid-action', event => {
    if (/** @type {CustomEvent} */ (event).detail === 'scout') openRaidPicker(true);
    else openRaidPicker(false);
  });
}
