// The persistent enemy camp occupies a smaller marked area on the Endless map. Raids and scouting parties
// leave from the town hall; a raid pauses the wave clock and activates the camp's defenders.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, clampCamera, ctx, onTap, t } from '../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, rand, townHall } from '../../engine/world/index.js';
import { getReachSteps, getSettlerReach, invalidateAllPaths, isTileBlockedForSettler, moveEntityTowards } from '../../engine/movement/index.js';
import { addResources, canAfford, formatCost, moveSettlerToTownHall, payCost, showCostError, stock, takeStock } from '../../domains/colony/storage/index.js';
import { faceTowards } from '../../domains/colony/settlers/index.js';
import { armorOf, isRangedWeapon } from '../../domains/colony/equipment/index.js';
import { clearOrders, fightByOrders, orderTap } from '../../domains/conflict/combat/index.js';
import { createConfiguredEnemy } from '../../domains/conflict/waves/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../domains/factions/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { inTerritory } from '../../domains/world/index.js';
import { drawIcon, escapeHtml, iconHtml, richText, showNotification } from '../../ui/index.js';
import { playSound } from '../../app/index.js';

const config = () => GAME_CONFIG.raid;
// The raid under way (not saved: a game can't be saved during one). phase: 'march' to the edge, 'fight' in
// the camp, 'return' home; home: the base, put away while the party is in the camp
export const raid = {
  /** @type {null | 'march' | 'fight' | 'return'} */
  phase: null,
  side: 'right',
  /** @type {any[]} */
  raiders: [],
  /** @type {any} */
  home: null,
  gather: { x: 0, y: 0 },
  auto: false,
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
  placing: false   // the next tap in the camp pitches the shelter there
};

export const isRaiding = () => raid.phase !== null;
export const isInCamp = () => raid.phase === 'fight';
// The game waits: the party being picked
export const isRaidPicking = () => raid.picking;

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
  game.enemyTents.some(tent => !tent.campStructure && (tent.summonsLeft || 0) > 0) ||
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
  if (game.gameMode !== 'endless' || !game.gameStarted || !game.enemyCamp) return;
  if (!game.buildings.some(building => building.enemyCampStructure && building.type === 'campfire' && building.hp > 0)) destroyEnemyCamp();
  updateRaidBar();
}

function destroyEnemyCamp(notify = true) {
  const camp = game.enemyCamp;
  if (!camp) return;
  game.enemyCamp = null;
  game.enemyCampDestroyed = true;
  game.enemyTents = game.enemyTents.filter(tent => !tent.campStructure);
  game.buildings = game.buildings.filter(building => !building.enemyCampStructure);
  game.enemies = game.enemies.filter(enemy => !enemy.campGuard);
  if (notify) showNotification(t('raid.campDestroyed'), false);
  invalidateAllPaths();
}

function findEnemyCampCentre() {
  const radius = config().campRadiusTiles;
  const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
  const blocked = new Set([...game.waterTiles, ...game.naturalRocks, ...game.buildings]
    .map(object => `${getGridPos(object.x, object.y).gx},${getGridPos(object.x, object.y).gy}`));
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

export function createEnemyCamp() {
  if (game.gameMode !== 'endless' || game.enemyCamp || game.enemyCampDestroyed) return;
  const centre = findEnemyCampCentre();
  if (!centre) { showNotification(t('raid.campUnavailable'), true); return; }
  game.enemyCamp = {
    x: centre.gx * TILE_SIZE + TILE_SIZE / 2,
    y: centre.gy * TILE_SIZE + TILE_SIZE / 2,
    radius: centre.radius,
    seed: Math.floor(rand() * 1e9)
  };
  layWorldCamp(centre.gx, centre.gy);
  invalidateAllPaths();
  updateRaidBar();
}

function layWorldCamp(midX, midY) {
  const c = config(), R = c.campRadiusTiles;
  const clear = R + 1;
  const inside = object => {
    const grid = getGridPos(object.x, object.y);
    return Math.abs(grid.gx - midX) <= clear && Math.abs(grid.gy - midY) <= clear;
  };
  for (const list of ['trees', 'cacti', 'boulders', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres', 'beachTiles']) {
    game[list] = game[list].filter(object => !inside(object));
  }
  const fireAt = tileCenter(midX, midY);
  const fire = standing('campfire', fireAt, { side: 'red', enemyCampStructure: true });
  game.buildings.push(fire);
  const occupied = new Set(game.buildings.map(building => {
    const grid = getGridPos(building.x, building.y);
    return `${grid.gx},${grid.gy}`;
  }));
  const free = [];
  for (let gy = midY - R; gy <= midY + R; gy++) for (let gx = midX - R; gx <= midX + R; gx++) {
    if (occupied.has(`${gx},${gy}`) || inTerritory(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15)) continue;
    free.push([gx, gy]);
  }
  if (!free.length) throw new Error('Enemy camp has no free space for its defenders');
  const defenders = campDefenders(armyOf(game.settlers), game.waveNum);
  raid.defenders = defenders.length;
  const keeperIndex = free.reduce((best, point, index) =>
    Math.hypot(point[0] - midX, point[1] - midY) < Math.hypot(free[best][0] - midX, free[best][1] - midY) ? index : best, 0);
  const keeperPost = tileCenter(...free.splice(keeperIndex, 1)[0]);
  let keeperAssigned = false;
  for (const kind of defenders) {
    if (!free.length) break;
    const [gx, gy] = free.splice(Math.floor(rand() * free.length), 1)[0], pos = tileCenter(gx, gy);
    const enemy = createConfiguredEnemy(pos, kind.id);
    if (!enemy) continue;
    const armour = armorOf({ armor: kind.armor === true ? 'iron' : kind.armor });
    if (armour) { enemy.armor = armour.armorKind; enemy.maxHp += armour.hpBonus; enemy.hp = enemy.maxHp; }
    if (kind.shield) enemy.shield = true;
    if (kind.helmet) enemy.helmet = true;
    enemy.campFireKeeper = !keeperAssigned;
    if (!keeperAssigned) {
      enemy.x = keeperPost.x; enemy.y = keeperPost.y;
      enemy.guard = { ...keeperPost };
      keeperAssigned = true;
    } else enemy.guard = { x: pos.x, y: pos.y };
    enemy.campGuard = true;
    game.enemies.push(enemy);
  }
}

export function normalizeEnemyCamp() {
  if (!game.enemyCamp) return;
  game.enemyTents = game.enemyTents.filter(tent => !tent.campStructure);
  const centre = getGridPos(game.enemyCamp.x, game.enemyCamp.y);
  const fires = game.buildings.filter(building => building.enemyCampStructure && building.type === 'campfire');
  const fire = fires.sort((a, b) => dist(a, game.enemyCamp) - dist(b, game.enemyCamp))[0] ||
    standing('campfire', tileCenter(centre.gx, centre.gy), { side: 'red', enemyCampStructure: true });
  fire.side = 'red';
  fire.enemyCampStructure = true;
  game.buildings = game.buildings.filter(building => !building.enemyCampStructure || building === fire);
  if (!game.buildings.includes(fire)) game.buildings.push(fire);

  const guards = game.enemies.filter(enemy => enemy.campGuard && enemy.hp > 0);
  const keeper = guards.find(enemy => enemy.campFireKeeper) || guards[0];
  for (const enemy of game.enemies) {
    delete enemy.campFireKeeper;
    delete enemy.campFuelDuty;
    delete enemy.campFuelLoad;
    delete enemy.campFuelTarget;
  }
  if (keeper) {
    const spot = { x: fire.x + TILE_SIZE, y: fire.y };
    keeper.campFireKeeper = true;
    keeper.x = spot.x; keeper.y = spot.y;
    keeper.guard = spot;
  }
}

// ---- Setting out

// Who can go: anyone (the armed are picked to start with); (#298) asleep too: it's woken
const canGo = s => s.temporary === undefined;

// The picker: who goes on the raid (any number, and how many arrows they take, #279), or (scout) which one
// goes to look, one only
export function openRaidPicker(scout = false) {
  if (!game.enemyCamp || isRaiding()) return;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return; }
  raid.picking = true;
  const el = document.createElement('div');
  el.id = 'raid-picker';
  el.innerHTML = `<div class="card-offer-title">${escapeHtml(t(scout ? 'raid.scoutPick' : 'raid.pickTitle'))}</div><div class="raid-roster"></div>` +
    (scout ? '' : `<div class="raid-arrows"><button class="btn" data-raid="less">−</button><span class="raid-arrow-count"></span><button class="btn" data-raid="more">+</button></div>`) +
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
  const showArrows = () => { const n = el.querySelector('.raid-arrow-count'); if (n) n.innerHTML = richText(t('raid.arrows', { n: arrows })); };
  const offerArrows = () => { if (!touched) arrows = Math.min(stock.arrows || 0, picked().filter(s => isRangedWeapon(s.weapon)).length * config().arrowsPerArcher); showArrows(); };
  const step = d => { touched = true; arrows = Math.max(0, Math.min(stock.arrows || 0, arrows + d)); showArrows(); };
  if (!scout) {
    onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="all"]')), () => { roster.querySelectorAll('.raid-unit').forEach(b => b.classList.add('on')); offerArrows(); });
    onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="less"]')), () => step(-6));
    onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="more"]')), () => step(6));
    offerArrows();
  }
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="cancel"]')), closeRaidPicker);
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="go"]')), () => {
    const party = picked();
    if (!party.length) { showNotification(t('raid.none'), true); return; }
    closeRaidPicker();
    if (scout) { startRaid(party, true); showNotification(t('raid.scoutOff'), false); return; }
    startRaid(party, false, takeStock('arrows', arrows));
  });
  document.body.appendChild(el);
}

function closeRaidPicker() {
  raid.picking = false;
  const el = document.getElementById('raid-picker');
  if (el) el.remove();
}

// The party sets out for the zone's side; the rest of the base rests
export function startRaid(party, scouting = false, arrows = 0) {
  if (!game.enemyCamp || isRaiding() || !party.length) return false;
  const camp = game.enemyCamp;
  const dx = camp.x - townHall.x, dy = camp.y - townHall.y, distance = Math.max(1, Math.hypot(dx, dy));
  raid.side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom');
  Object.assign(raid, { phase: 'march', raiders: party, auto: false, won: false, timer: 0, scouting, arrows, retreating: false, escaped: [], placing: false });
  raid.gather = { x: camp.x - dx / distance * (camp.radius + 1) * TILE_SIZE, y: camp.y - dy / distance * (camp.radius + 1) * TILE_SIZE };
  party.forEach((s, i) => {
    s.raider = true; s.isPossessed = false;
    if (s.asleep) { s.asleep = false; s.sleepSpot = null; } // (woken for it, #298)
    s.raidSpot = lineUp(raid.gather, raid.side, i);
  });
  game.selectedSettler = null;
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
  if (!game.enemyCamp || isRaiding()) return false;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return false; }
  const scout = scoutChoice();
  if (!scout) { showNotification(t('raid.none'), true); return false; }
  startRaid([scout], true);
  showNotification(t('raid.scoutOff'), false);
  return true;
}

const arrived = () => raid.raiders.filter(s => game.settlers.includes(s) && dist(s, raid.gather) < 50 + 9 * raid.raiders.length).length;

// ---- The camp: the base put away, the zone's own map

// The party reaches the camp and starts its raid there
export function enterCamp() {
  if (raid.phase !== 'march') return;
  const camp = game.enemyCamp;
  if (!camp) { endRaid(false); return; }
  const party = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
  if (!party.length) { leaveCamp(false); return; }
  game.selectedSettler = null;
  raid.entry = raid.gather;
  raid.raiders = party;
  raid.phase = 'fight';
  raid.timer = 0;
  game.raidActive = !raid.scouting;
  for (const enemy of game.enemies) if (enemy.campGuard) enemy.guardOff = false;
  if (raid.scouting) {
    const scout = party[0];
    scout.orderSpot = { x: camp.x, y: camp.y };
  }
  Object.assign(camera, { x: camp.x, y: camp.y });
  clampCamera();
  invalidateAllPaths();
  if (!raid.scouting) playSound('horn');
  updateRaidBar();
}

// The camp's defenders: one for each of the player's armed (its kind by the weapon and the body, its
// armour and shield as theirs), more with the waves
export function campDefenders(army, wave = game.waveNum) {
  const c = config().defenders;
  const kinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id));
  const ofKey = key => kinds.find(def => /** @type {string[]} */ ([]).concat(def.waveKey).includes(key) && !def.healer && !def.necromancer && !def.pet) || kinds[0]; // (not a pet for a soldier: a dog in armour, #326)
  const list = army.map(s => {
    const key = isRangedWeapon(s.weapon) ? 'archer' : (GAME_CONFIG.settlerTypes[s.type] || {}).big ? 'brute' : s.weapon === 'fist' || s.weapon === 'club' ? 'club' : 'raider';
    const def = ofKey(key);
    return { id: def.id, armor: s.armor || null, shield: !!s.shield && def.type === 'normal' && !def.ranged, helmet: !!s.helmet };
  });
  const count = Math.max(c.min, Math.round(army.length * c.perSoldier) + Math.floor((wave - 1) / c.extraEveryWaves));
  const out = [];
  for (let i = 0; i < count; i++) out.push(list.length ? list[i % list.length] : { id: ofKey('raider').id, armor: false, shield: false });
  return out;
}

// ---- Orders in the camp

// A tap in the camp: orders (see combat.orders.js). True: the tap was the raid's
export function raidTap(x, y) {
  if (!isInCamp()) return false;
  if (raid.placing) { pitchShelter(x, y); return true; }
  if (raid.retreating) return true;
  // a scout: where it creeps to (#279)
  if (raid.scouting) { const s = game.settlers[0]; if (s) s.orderSpot = { x, y }; return true; }
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
  if (!raid.phase || game.gameMode !== 'endless' || s.raider) return false;
  if (dist(s, townHall) > townHall.radius + 50) moveSettlerToTownHall(s, s.speed, tick.dt);
  return true;
}

// A raider's behaviour (first in SETTLER_BEHAVIOURS after the possessed): it walks to the edge, fights in the
// camp and walks home
export function raidOrders(s, tick) {
  if (!raid.phase || game.gameMode !== 'endless' || !s.raider) return false;
  const dt = tick.dt;
  if (raid.phase === 'march') {
    if (dist(s, s.raidSpot) > 6) moveEntityTowards(s, s.raidSpot.x, s.raidSpot.y, s.speed, false, dt);
    else faceTowards(s, s.raidSpot.x + (raid.side === 'right' ? 10 : raid.side === 'left' ? -10 : 0), s.raidSpot.y + (raid.side === 'bottom' ? 10 : raid.side === 'top' ? -10 : 0));
    return true;
  }
  if (raid.phase === 'return') {
    if (dist(s, townHall) > townHall.radius + 40) moveSettlerToTownHall(s, s.speed, dt);
    return true;
  }
  // (#279) running back to the edge it came in by: out of the camp once there
  if (raid.retreating) {
    if (dist(s, s.exitSpot) > 10) moveEntityTowards(s, s.exitSpot.x, s.exitSpot.y, s.speed * 1.15, false, dt);
    else { raid.escaped.push(s); game.settlers = game.settlers.filter(o => o !== s); if (game.selectedSettler === s) game.selectedSettler = null; }
    return true;
  }
  // a scout creeps where it's told (from the edge, to start with), looking at the camp (#279)
  if (raid.scouting) {
    if (s.orderSpot && dist(s, s.orderSpot) > 6) moveEntityTowards(s, s.orderSpot.x, s.orderSpot.y, s.speed * 0.7, false, dt);
    else faceTowards(s, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT / 2);
    return true;
  }
  // the shelter: its builder builds it; in the auto battle the badly hurt go to it, and an archer out of
  // arrows when there are some there (#279)
  const site = game.blueprints.find(bp => bp.raidShelter && bp.builderId === s.id);
  if (site && !s.orderTarget) { buildShelter(s, site, dt); return true; }
  const shelter = shelters().sort((a, b) => dist(a, s) - dist(b, s))[0];
  const empty = isRangedWeapon(s.weapon) && s.quiver && (s.arrows || 0) <= 0 && raid.arrows > 0;
  if (shelter && !s.orderTarget && ((raid.auto && (s.hp < s.maxHp * config().shelter.woundedShare || (s.healing && s.hp < s.maxHp * 0.9))) || empty)) {
    s.healing = s.hp < s.maxHp * 0.9;
    if (dist(s, shelter) > config().shelter.reach - 10) moveEntityTowards(s, shelter.x, shelter.y, s.speed, false, dt);
    return true;
  }
  s.healing = false;
  fightByOrders(s, dt, raid.auto); // (in the camp)
  return true;
}

// ---- Each tick of a raid

export function tickRaid(dt) {
  if (!raid.phase || game.gameMode !== 'endless') return;
  raid.timer += dt;
  if (raid.phase === 'march') {
    raid.raiders = raid.raiders.filter(s => game.settlers.includes(s));
    if (!raid.raiders.length) endRaid(false);
    else if (arrived() >= raid.raiders.length || raid.timer >= config().marchSeconds) enterCamp();
  } else if (raid.phase === 'fight') {
    tickShelters(dt);
    if (!raid.raiders.some(s => game.settlers.includes(s) && s.hp > 0)) failRaid();
    else if (raid.scouting) {
      if (raid.timer >= config().scoutSeconds) leaveCamp(false);
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
  for (const settler of survivors) {
    settler.raider = true;
    settler.path = null;
    settler.pathTarget = null;
    clearOrders(settler);
  }
  game.raidActive = false;
  for (const enemy of game.enemies) if (enemy.campGuard) enemy.guardOff = false;
  game.selectedSettler = null;
  invalidateAllPaths();
}

// The camp beaten (won) or left (Retreat): the party walks home with what it took
// Retreat (#279): not at once; each runs back to its spot on the edge it came in by (the enemy after it), and
// once all who are left are out, the party's out of the camp
function startRetreat() {
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
  // the arrows not used, back in the stock
  if (raid.arrows > 0 && survivors.length) { stock.arrows = (stock.arrows || 0) + raid.arrows; raid.arrows = 0; }
  raid.raiders = survivors;
  raid.won = won && !raid.scouting;
  raid.scouting = false;
  if (raid.won) destroyEnemyCamp(false);
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

// The whole party down: the camp goes at once, the base is back, a wave comes soon
function failRaid() {
  restoreHome([]);
  showNotification(t('raid.lost', { seconds: 0 }), true);
  playSound('defeat');
  raid.raiders = [];
  resetRaidState();
}

// Over: home (or never left). Won: the zone goes and the next wave waits twice as long
export function endRaid(won) {
  for (const s of raid.raiders) { delete s.raider; delete s.raidSpot; delete s.lastStep; clearOrders(s); }
  resetRaidState();
}

function resetRaidState() {
  game.raidActive = false;
  for (const s of game.settlers) { delete s.raider; delete s.raidSpot; clearOrders(s); }
  Object.assign(raid, { phase: null, raiders: [], home: null, auto: false, won: false, timer: 0, defenders: 0, still: 0, scouting: false, retreating: false, escaped: [], arrows: 0, placing: false });
  updateRaidBar();
}

// A new game or one loaded: no raid going on (a party half way is back home, the base as it was)
export function resetRaid() {
  closeRaidPicker();
  resetRaidState();
}

// ---- On screen
// The bar under the top of the screen: the camp's time, the party on its way, the orders in the camp
let barKey = '';
export function updateRaidBar() {
  let bar = document.getElementById('raid-bar');
  const show = game.gameMode === 'endless' && game.gameStarted && isRaiding();
  if (!show) { if (bar) bar.remove(); barKey = ''; return; }
  let html = '';
  if (raid.retreating) {
    html = `<span>${escapeHtml(t(raid.scouting ? 'raid.scoutRunning' : 'raid.retreating'))}</span>`;
  } else if (raid.scouting) {
    html = `<span>${escapeHtml(t(raid.phase === 'march' ? 'raid.scoutGoing' : raid.phase === 'fight' ? 'raid.scoutLooking' : 'raid.returning'))}</span>` +
      (raid.phase === 'march' ? `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>` : '');
  } else if (raid.phase === 'march') {
    html = `<span>${escapeHtml(t('raid.marching', { n: arrived(), m: raid.raiders.length }))}</span>` +
      `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>`;
  } else if (raid.phase === 'fight') {
    const def = GAME_CONFIG.buildings[shelterType()], pitched = game.blueprints.some(bp => bp.raidShelter) || shelters().length > 0;
    html = `<span>${escapeHtml(t('raid.left', { n: game.enemies.filter(en => en.hp > 0 && en.campGuard).length }))}` +
      (raid.arrows > 0 ? ` · ${richText(t('raid.arrows', { n: raid.arrows }))}` : '') + `</span>` +
      `<button class="btn${raid.auto ? ' on' : ''}" data-raid-act="auto">${richText(t('raid.auto'))}</button>` +
      (pitched ? '' : `<button class="btn${raid.placing ? ' on' : ''}" data-raid-act="shelter">${richText(`[[${def.icon}]] ${def.label}`)} <small>${richText(formatCost(def.cost))}</small></button>`) +
      `<button class="btn" data-raid-act="retreat">${escapeHtml(t('raid.retreat'))}</button>`;
  } else html = `<span>${escapeHtml(t('raid.returning'))}</span>`;
  if (html === barKey && bar) return;
  barKey = html;
  // (#279) over the bottom panel: first in the column over the dock, above the selected settler and the sheet
  if (!bar) { bar = document.createElement('div'); bar.id = 'raid-bar'; const over = document.getElementById('hud-bottom'); if (over) over.prepend(bar); else document.body.appendChild(bar); }
  bar.innerHTML = html;
  bar.querySelectorAll('[data-raid-act]').forEach(b => onTap(/** @type {HTMLElement} */ (b), () => raidAction(/** @type {HTMLElement} */ (b).dataset.raidAct)));
}

export function raidAction(act) {
  if (act === 'attack') enterCamp();
  else if (act === 'call-off' && raid.phase === 'march') endRaid(false);
  else if (act === 'auto') raid.auto = !raid.auto;
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
