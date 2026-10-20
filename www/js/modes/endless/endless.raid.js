// A raid on an enemy camp (#255). Now and then, a wave beaten, a zone with an enemy camp opens beyond a side of
// the map for a while (GAME_CONFIG.raid). The player picks who goes; while they're away the base waits: its
// settlers rest and the wave clock stops. The party walks to that side's edge and waits there; Attack! and
// the base is put away, only the camp's zone is seen (a map of its own, made for it: a palisade round an
// outpost, tents, defenders as strong as the player's army). There the player gives orders (tap a raider,
// then an enemy, a tent or a spot; or an enemy with nobody picked: all of them) or turns on the auto battle,
// which fights as the base's defenders would. The outpost and every enemy down: spoils, the party walks home,
// the zone goes once they're back, and the next wave waits twice as long. The whole party down: the camp
// goes at once, the base is back and a wave comes in a few seconds.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, clampCamera, ctx, onTap, t } from '../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, WORLD_LISTS, createWorldSeed, game, getGridPos, rand, resetTileIndex, setWorldSize, townHall } from '../../engine/world/index.js';
import { getReachSteps, getSettlerReach, invalidateAllPaths, isTileBlockedForSettler, moveEntityTowards } from '../../engine/movement/index.js';
import { addResources, formatCost, moveSettlerToTownHall } from '../../domains/colony/storage/index.js';
import { faceTowards, someoneSays } from '../../domains/colony/settlers/index.js';
import { isBowWeapon } from '../../domains/colony/equipment/index.js';
import { clearOrders, fightByOrders, orderTap } from '../../domains/conflict/combat/index.js';
import { createConfiguredEnemy } from '../../domains/conflict/waves/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../domains/factions/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { generateMap } from '../../domains/world/index.js';
import { drawIcon, escapeHtml, iconHtml, richText, showNotification } from '../../ui/index.js';
import { playSound } from '../../app/index.js';

const config = () => GAME_CONFIG.raid;
const SIDES = ['left', 'right', 'top', 'bottom'];
const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

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
  picking: false
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
const waveOn = () => game.enemies.some(en => en.fromWave && en.hp > 0) || (game.portalQueue || []).length > 0;

// A free tile by a side of the map, near its middle, `depth` tiles in (one the settler `from` can walk
// to, if given)
function edgeSpot(side, from = null, firstDepth = BORDER_MARGIN) {
  const reach = from ? getSettlerReach(from) : null;
  for (let depth = firstDepth; depth < BORDER_MARGIN + 6; depth++) {
    for (let k = 0; k < 24; k++) {
      const offset = (k % 2 ? 1 : -1) * Math.ceil(k / 2);
      const along = (side === 'left' || side === 'right' ? game.ROWS : game.COLS) / 2 + offset;
      const gx = side === 'left' ? depth : side === 'right' ? game.COLS - 1 - depth : Math.floor(along);
      const gy = side === 'top' ? depth : side === 'bottom' ? game.ROWS - 1 - depth : Math.floor(along);
      if (isTileBlockedForSettler(gx, gy)) continue;
      if (reach && getReachSteps(reach, gx, gy) === -1) continue;
      return tileCenter(gx, gy);
    }
  }
  return tileCenter(Math.floor(game.COLS / 2), Math.floor(game.ROWS / 2));
}

// Spots for a party side by side along an edge, round `at`
function lineUp(at, side, i) {
  const step = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 18;
  return side === 'left' || side === 'right' ? { x: at.x, y: at.y + step } : { x: at.x + step, y: at.y };
}

// ---- The camp's zone, while it's there

// Each tick (Endless): a camp opens after a wave beaten, and goes when its time is up
export function tickRaidCamp(dt) {
  if (game.gameMode !== 'endless' || !game.gameStarted || isRaiding()) return;
  const c = config(), beaten = game.waveNum - 1;
  if (!game.raidCamp && beaten >= c.fromWave && beaten - (game.raidCampWave || 0) >= c.everyWaves && !waveOn()) {
    game.raidCamp = { side: SIDES[Math.floor(rand() * SIDES.length)], timeLeft: c.seconds, seed: Math.floor(rand() * 1e9), layout: c.layouts[Math.floor(rand() * c.layouts.length)] };
    game.raidCampWave = beaten;
    showNotification(t('raid.appeared'), false);
    playSound('horn');
  }
  if (game.raidCamp) {
    game.raidCamp.timeLeft -= dt;
    if (game.raidCamp.timeLeft <= 0) { game.raidCamp = null; showNotification(t('raid.gone'), true); }
  }
  updateRaidBar();
}

// ---- Setting out

// Who can go: anyone (the armed are picked to start with)
const canGo = s => s.temporary === undefined && !s.asleep;

export function openRaidPicker() {
  if (!game.raidCamp || isRaiding()) return;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return; }
  raid.picking = true;
  const el = document.createElement('div');
  el.id = 'raid-picker';
  el.innerHTML = `<div class="card-offer-title">${escapeHtml(t('raid.pickTitle'))}</div><div class="raid-roster"></div>` +
    `<div class="raid-picker-actions"><button class="btn" data-raid="all">${escapeHtml(t('raid.all'))}</button>` +
    `<button class="btn raid-go" data-raid="go">${richText(t('raid.go'))}</button><button class="btn" data-raid="cancel">${escapeHtml(t('raid.cancel'))}</button></div>`;
  const roster = /** @type {HTMLElement} */ (el.querySelector('.raid-roster'));
  for (const s of game.settlers.filter(canGo)) {
    const b = document.createElement('button');
    b.className = 'btn raid-unit' + (s.weapon !== 'fist' ? ' on' : '');
    b.dataset.unit = String(s.id);
    const type = GAME_CONFIG.settlerTypes[s.type] || GAME_CONFIG.settlerTypes.normal;
    const weapon = getDefinition('weapons', s.weapon) || GAME_CONFIG.weapons.fist;
    b.innerHTML = `${iconHtml(type.icon)}${iconHtml(weapon.icon)}${s.armor ? iconHtml('armor') : ''}${s.shield ? iconHtml('shield') : ''}<span class="raid-hp">${Math.ceil(s.hp)}</span>`;
    onTap(b, () => b.classList.toggle('on'));
    roster.appendChild(b);
  }
  const picked = () => [...roster.querySelectorAll('.raid-unit.on')].map(b => game.settlers.find(s => String(s.id) === b.dataset.unit)).filter(Boolean);
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="all"]')), () => roster.querySelectorAll('.raid-unit').forEach(b => b.classList.add('on')));
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="cancel"]')), closeRaidPicker);
  onTap(/** @type {HTMLElement} */ (el.querySelector('[data-raid="go"]')), () => {
    const party = picked();
    if (!party.length) { showNotification(t('raid.none'), true); return; }
    closeRaidPicker();
    startRaid(party);
  });
  document.body.appendChild(el);
}

function closeRaidPicker() {
  raid.picking = false;
  const el = document.getElementById('raid-picker');
  if (el) el.remove();
}

// The party sets out for the zone's side; the rest of the base rests
export function startRaid(party, scouting = false) {
  if (!game.raidCamp || isRaiding() || !party.length) return false;
  Object.assign(raid, { phase: 'march', side: game.raidCamp.side, raiders: party, auto: false, won: false, timer: 0, scouting });
  raid.gather = edgeSpot(raid.side, party[0]);
  party.forEach((s, i) => {
    s.raider = true; s.isPossessed = false;
    s.raidSpot = lineUp(raid.gather, raid.side, i);
  });
  game.selectedSettler = null;
  updateRaidBar();
  return true;
}

// (#279) a scout sent to look at the camp: the settler picked, else one with nothing to do (soldiers last)
export function sendScout() {
  if (!game.raidCamp || isRaiding()) return false;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return false; }
  const picked = game.selectedSettler && game.settlers.includes(game.selectedSettler) && canGo(game.selectedSettler) ? game.selectedSettler : null;
  const scout = picked || game.settlers.filter(canGo).sort((a, b) => (b.isIdle ? 1 : 0) - (a.isIdle ? 1 : 0) || (a.role === 'worker' ? -1 : 1))[0];
  if (!scout) { showNotification(t('raid.none'), true); return false; }
  startRaid([scout], true);
  showNotification(t('raid.scoutOff'), false);
  return true;
}

const arrived = () => raid.raiders.filter(s => game.settlers.includes(s) && dist(s, raid.gather) < 50 + 9 * raid.raiders.length).length;

// ---- The camp: the base put away, the zone's own map

// What each of the base's lists becomes in the camp: arrays and objects empty, the rest (the time of day,
// the cards' counts...) as they are
function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return {};
  return value;
}

// Put the base away and make the camp; the party comes in by the zone's near side
export function enterCamp() {
  if (raid.phase !== 'march') return;
  const party = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
  if (!party.length) { endRaid(false); return; }
  const army = game.settlers.filter(s => s.weapon !== 'fist' || s.role === 'soldier' || s.role === 'archer');
  raid.home = {
    lists: Object.fromEntries(WORLD_LISTS.map(k => [k, game[k]])),
    hall: { x: townHall.x, y: townHall.y },
    cols: game.COLS, rows: game.ROWS,
    camera: { x: camera.x, y: camera.y, zoom: camera.zoom }
  };
  raid.home.lists.settlers = game.settlers.filter(s => !party.includes(s));
  const camp = game.raidCamp || { side: raid.side }; // (taken before the lists are emptied: it's one of them)
  for (const k of WORLD_LISTS) game[k] = emptyLike(game[k]);
  game.selectedSettler = null;
  buildCamp(army, camp);
  // the party at the zone's near edge, out past its red line (#279), waiting for orders
  const entry = edgeSpot(OPPOSITE[raid.side], null, 0);
  party.forEach((s, i) => {
    Object.assign(s, lineUp(entry, OPPOSITE[raid.side], i));
    s.orderSpot = { x: s.x, y: s.y }; s.orderTarget = null; s.path = null; s.pathTarget = null; s.carrying = null;
  });
  game.settlers = party;
  raid.raiders = party;
  raid.phase = 'fight';
  raid.timer = 0;
  // a scout looks over the camp: the view on it (#279); a party sees where it stands
  const look = raid.scouting ? { x: game.WORLD_WIDTH / 2 * 0.6 + entry.x * 0.4, y: game.WORLD_HEIGHT / 2 * 0.6 + entry.y * 0.4 } : entry;
  Object.assign(camera, { x: look.x, y: look.y });
  clampCamera();
  invalidateAllPaths();
  if (!raid.scouting) playSound('horn');
  updateRaidBar();
}

// The camp's map (#279: of its own seed, the same every time it's seen, so a scout's look holds for the raid):
// the ground as any (made for it), cleared round its middle; the outpost in the middle, round it as its layout
// has it (a square palisade, a round one, a fort of two rings, or no walls but spikes), tents (calling more out
// in the fight), campfires and its faction's own buildings, the defenders at their posts
function buildCamp(army, camp) {
  const c = config();
  const worldSeed = game.worldSeed;
  game.worldSeed = createWorldSeed(`camp-${camp.seed || 0}`);
  try {
    setWorldSize(c.zoneTiles, c.zoneTiles);
    generateMap();
    game.boars = [];
    layCamp(army, camp.layout || 'square');
  } finally { game.worldSeed = worldSeed; }
  // the base's hall isn't here
  townHall.x = townHall.y = -100000;
  resetTileIndex();
}

// Tiles of a ring round the middle: a square one (the Chebyshev distance r) or a round one
function ringTiles(mid, r, round) {
  const out = [];
  for (let gy = mid - r - 1; gy <= mid + r + 1; gy++) {
    for (let gx = mid - r - 1; gx <= mid + r + 1; gx++) {
      const d = round ? Math.hypot(gx - mid, gy - mid) : Math.max(Math.abs(gx - mid), Math.abs(gy - mid));
      if (round ? Math.abs(d - r) < 0.55 : d === r) out.push([gx, gy]);
    }
  }
  return out;
}

function layCamp(army, layout) {
  const c = config();
  const mid = Math.floor(c.zoneTiles / 2), R = c.wallTiles, centre = tileCenter(mid, mid);
  const round = layout === 'round', open = layout === 'scattered', fort = layout === 'fort';
  const span = open ? R + 1 : R;
  // nothing natural inside the camp or on its walls
  const clear = span + 2;
  const inside = o => Math.abs(getGridPos(o.x, o.y).gx - mid) <= clear && Math.abs(getGridPos(o.x, o.y).gy - mid) <= clear;
  for (const list of ['trees', 'cacti', 'boulders', 'naturalRocks', 'waterTiles', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres', 'beachTiles']) {
    game[list] = game[list].filter(o => !inside(o));
  }
  const entryAngle = { left: Math.PI, right: 0, top: -Math.PI / 2, bottom: Math.PI / 2 }[OPPOSITE[raid.side]];
  // a ring of wall with ways in: one towards where the party comes from, `gaps` more at random
  const wallRing = (r, type, gapCount, torches = true) => {
    const ring = ringTiles(mid, r, round);
    const angles = [entryAngle];
    for (let i = 0; i < gapCount; i++) angles.push(rand() * Math.PI * 2);
    const toward = a => p => Math.hypot(p[0] - (mid + Math.cos(a) * r), p[1] - (mid + Math.sin(a) * r));
    /** @type {number[][]} */
    const gapAt = angles.map(a => [...ring].sort((p, q) => toward(a)(p) - toward(a)(q))[0]);
    const isGap = p => { const [gx, gy] = p; return gapAt.some(([x, y]) => Math.hypot(gx - x, gy - y) < 1.5); };
    for (const p of ring) if (!isGap(p)) game.buildings.push(standing(type, tileCenter(p[0], p[1])));
    // torches by each way in
    if (torches) for (const [gx, gy] of gapAt) {
      for (const p of ring.filter(q => Math.abs(Math.hypot(q[0] - gx, q[1] - gy) - 2) < 0.6).slice(0, 2)) {
        const at = tileCenter(p[0], p[1]), k = game.buildings.findIndex(b => b.x === at.x && b.y === at.y);
        if (k >= 0) game.buildings[k] = standing('torch', at, { lit: true });
      }
    }
  };
  const stone = game.waveNum >= c.stoneFromWave;
  if (fort) { wallRing(R, 'wall_stone', c.gaps); wallRing(R - 2, 'wall_wood', 0, false); } // (the inner ring: one way in, the party's side)
  else if (!open) wallRing(R, stone ? 'wall_stone' : 'wall_wood', c.gaps);
  // what's free inside: not the outpost's tile, not a wall
  const taken = new Set(game.buildings.map(b => `${getGridPos(b.x, b.y).gx},${getGridPos(b.x, b.y).gy}`));
  const free = [];
  for (let gy = mid - span + 1; gy <= mid + span - 1; gy++) {
    for (let gx = mid - span + 1; gx <= mid + span - 1; gx++) {
      if ((gx === mid && gy === mid) || taken.has(`${gx},${gy}`)) continue;
      if (round && Math.hypot(gx - mid, gy - mid) > R - 0.6) continue;
      free.push([gx, gy]);
    }
  }
  const takeFree = (near = Infinity, far = 0) => {
    const ok = free.filter(([gx, gy]) => { const d = Math.max(Math.abs(gx - mid), Math.abs(gy - mid)); return d <= near && d >= far; });
    const from = ok.length ? ok : free;
    const pick = from[Math.floor(rand() * from.length)];
    free.splice(free.indexOf(pick), 1);
    return tileCenter(pick[0], pick[1]);
  };
  // fires (more in a camp with no walls), spikes round an open one, and its faction's own buildings
  for (let i = 0; i < (open ? 3 : 2); i++) game.buildings.push(standing('campfire', takeFree(span - 2), { fuelLeft: 1e6 }));
  if (open) for (let i = 0; i < 8; i++) game.buildings.push(standing('spikes', takeFree(span, span - 1)));
  for (const type of (c.decor[getEnemyFaction().id] || [])) game.buildings.push(standing(type, takeFree(span - 1, 2)));
  // the outpost, and the tents
  game.enemyTents.push({ x: centre.x, y: centre.y, hp: c.outpostHp, maxHp: c.outpostHp, outpost: true, summonTimer: 0, summonsLeft: 0 });
  const tents = c.tents.min + Math.floor(rand() * (c.tents.max - c.tents.min + 1)) + (open ? 1 : 0);
  for (let i = 0; i < tents; i++) {
    const at = takeFree(fort ? R - 3 : span - 2);
    game.enemyTents.push({ x: at.x, y: at.y, hp: GAME_CONFIG.enemyTents.hp, maxHp: GAME_CONFIG.enemyTents.hp, summonTimer: 0, summonsLeft: c.tentSummons });
  }
  // the defenders, mirroring the player's army
  const defenders = campDefenders(army);
  raid.defenders = defenders.length;
  for (const kind of defenders) {
    const at = takeFree();
    const en = createConfiguredEnemy(at, kind.id);
    if (!en) continue;
    if (kind.armor) { en.armor = 'iron'; en.maxHp += GAME_CONFIG.gear.armor.hpBonus; en.hp = en.maxHp; }
    if (kind.shield) en.shield = true;
    en.guard = { x: at.x, y: at.y };
    game.enemies.push(en);
  }
}

// The camp's defenders: one for each of the player's armed (its kind by the weapon and the body, its
// armour and shield as theirs), more with the waves
export function campDefenders(army) {
  const c = config().defenders;
  const kinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id));
  const ofKey = key => kinds.find(def => /** @type {string[]} */ ([]).concat(def.waveKey).includes(key) && !def.healer && !def.necromancer) || kinds[0];
  const list = army.map(s => {
    const key = isBowWeapon(s.weapon) ? 'archer' : (GAME_CONFIG.settlerTypes[s.type] || {}).big ? 'brute' : s.weapon === 'fist' || s.weapon === 'club' ? 'club' : 'raider';
    const def = ofKey(key);
    return { id: def.id, armor: !!s.armor, shield: !!s.shield && def.type === 'normal' && !def.ranged };
  });
  const count = Math.max(c.min, Math.round(army.length * c.perSoldier) + Math.floor((game.waveNum - 1) / c.extraEveryWaves));
  const out = [];
  for (let i = 0; i < count; i++) out.push(list.length ? list[i % list.length] : { id: ofKey('raider').id, armor: false, shield: false });
  return out;
}

// ---- Orders in the camp

// A tap in the camp: orders (see combat.orders.js). True: the tap was the raid's
export function raidTap(x, y) {
  if (!isInCamp()) return false;
  orderTap(x, y);
  return true;
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
  if (raid.scouting) { faceTowards(s, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT / 2); return true; } // (a scout looks, #279)
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
    else if (raid.scouting && (arrived() >= raid.raiders.length || raid.timer >= config().marchSeconds)) enterCamp(); // (a scout looks at once)
  } else if (raid.phase === 'fight') {
    if (!game.settlers.length) failRaid();
    else if (raid.scouting) {
      // a scout is spotted after a while, or as soon as one of them comes for it: it runs home (#279)
      const scout = game.settlers[0];
      if (raid.timer >= config().scoutSeconds || game.enemies.some(en => en.hp > 0 && dist(en, scout) < 140) || scout.hp < scout.maxHp) {
        someoneSays(game.enemies, getEnemyFaction().id, 'charge', true);
        leaveCamp(false);
      }
    }
    else if (!game.enemies.some(en => en.hp > 0) && !game.enemyTents.length) leaveCamp(true);
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
  const home = raid.home;
  for (const k of WORLD_LISTS) game[k] = home.lists[k];
  setWorldSize(home.cols, home.rows);
  townHall.x = home.hall.x; townHall.y = home.hall.y;
  Object.assign(camera, home.camera);
  clampCamera();
  raid.gather = edgeSpot(raid.side);
  survivors.forEach((s, i) => {
    Object.assign(s, lineUp(raid.gather, raid.side, i));
    s.path = null; s.pathTarget = null; clearOrders(s);
  });
  game.settlers = [...game.settlers, ...survivors];
  game.selectedSettler = null;
  raid.home = null;
  invalidateAllPaths();
}

// The camp beaten (won) or left (Retreat): the party walks home with what it took
export function leaveCamp(won) {
  if (raid.phase !== 'fight') return;
  const survivors = game.settlers.filter(s => s.hp > 0);
  restoreHome(survivors);
  raid.raiders = survivors;
  raid.won = won;
  raid.phase = 'return';
  raid.timer = 0;
  if (won) {
    const c = config(), scale = 1 + c.rewardPerDefender * raid.defenders;
    const reward = Object.fromEntries(Object.entries(c.reward).map(([k, v]) => [k, Math.round(v * scale)]));
    if (!getPlayerFaction().eats) delete reward.food; // (the undead have no food)
    addResources(reward);
    showNotification(t('raid.won', { reward: formatCost(reward) }), false);
    playSound('craftDone');
  } else showNotification(t(raid.scouting ? 'raid.scoutSpotted' : 'raid.retreated'), true);
  updateRaidBar();
}

// The whole party down: the camp goes at once, the base is back, a wave comes soon
function failRaid() {
  if (raid.scouting) { restoreHome([]); showNotification(t('raid.scoutLost'), true); resetRaidState(); return; } // (the camp stays, no wave sent)
  restoreHome([]);
  game.raidCamp = null;
  game.waveTimer = Math.min(game.waveTimer, config().failWaveSeconds);
  showNotification(t('raid.lost', { seconds: config().failWaveSeconds }), true);
  playSound('defeat');
  resetRaidState();
}

// Over: home (or never left). Won: the zone goes and the next wave waits twice as long
export function endRaid(won) {
  for (const s of raid.raiders) { delete s.raider; delete s.raidSpot; delete s.lastStep; clearOrders(s); }
  if (!raid.scouting && (raid.phase === 'return' || raid.phase === 'fight')) game.raidCamp = null; // (a scout's look leaves it there)
  if (won) game.waveTimer += game.waveInterval;
  resetRaidState();
}

function resetRaidState() {
  for (const s of game.settlers) { delete s.raider; delete s.raidSpot; clearOrders(s); }
  Object.assign(raid, { phase: null, raiders: [], home: null, auto: false, won: false, timer: 0, defenders: 0, still: 0, scouting: false });
  updateRaidBar();
}

// A new game or one loaded: no raid going on (a party half way is back home, the base as it was)
export function resetRaid() {
  if (raid.home) {
    for (const k of WORLD_LISTS) game[k] = raid.home.lists[k];
    raid.home = null;
  }
  closeRaidPicker();
  resetRaidState();
}

// ---- On screen

// The zone beyond the map's edge (in the dark past it: a square with the camp's outpost dimly in it), and
// the map's edge on that side
export function drawRaidZone() {
  if (game.gameMode !== 'endless' || isInCamp() || (!game.raidCamp && raid.phase !== 'return')) return;
  const side = game.raidCamp ? game.raidCamp.side : raid.side;
  const band = BORDER_MARGIN * TILE_SIZE, W = game.WORLD_WIDTH, H = game.WORLD_HEIGHT, Z = config().zoneTiles * TILE_SIZE;
  const edge = { left: [0, 0, band, H], right: [W - band, 0, band, H], top: [0, 0, W, band], bottom: [0, H - band, W, band] }[side];
  const zone = { left: [-Z, H / 2 - Z / 2, Z, Z], right: [W, H / 2 - Z / 2, Z, Z], top: [W / 2 - Z / 2, -Z, Z, Z], bottom: [W / 2 - Z / 2, H, Z, Z] }[side];
  const pulse = 0.22 + 0.1 * Math.sin(game.pathTick / 20);
  ctx.fillStyle = `rgba(150, 20, 20, ${pulse})`;
  ctx.fillRect(edge[0], edge[1], edge[2], edge[3]);
  ctx.fillStyle = 'rgba(60, 10, 10, 0.55)';
  ctx.fillRect(zone[0], zone[1], zone[2], zone[3]);
  ctx.strokeStyle = 'rgba(231, 76, 60, 0.85)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
  ctx.strokeRect(zone[0] + 2, zone[1] + 2, zone[2] - 4, zone[3] - 4);
  ctx.setLineDash([]);
  // the camp in it, dimly: its palisade and the outpost
  const cx = zone[0] + Z / 2, cy = zone[1] + Z / 2, r = config().wallTiles * TILE_SIZE;
  ctx.strokeStyle = 'rgba(160, 110, 60, 0.6)'; ctx.lineWidth = 6; ctx.setLineDash([22, 14]);
  ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
  ctx.setLineDash([]);
  drawIcon(ctx, 'swords', cx, cy, 64);
}

// The bar under the top of the screen: the camp's time, the party on its way, the orders in the camp
let barKey = '';
export function updateRaidBar() {
  let bar = document.getElementById('raid-bar');
  const show = game.gameMode === 'endless' && game.gameStarted && (isRaiding() || !!game.raidCamp);
  if (!show) { if (bar) bar.remove(); barKey = ''; return; }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let html = '';
  if (!isRaiding()) {
    html = `<button class="btn" data-raid-act="open">${richText(t('raid.button', { time: fmt(Math.max(0, game.raidCamp ? game.raidCamp.timeLeft : 0)) }))}</button>` +
      `<button class="btn" data-raid-act="scout">${richText(t('raid.scout'))}</button>`;
  } else if (raid.scouting) {
    html = `<span>${escapeHtml(t(raid.phase === 'march' ? 'raid.scoutGoing' : raid.phase === 'fight' ? 'raid.scoutLooking' : 'raid.returning'))}</span>` +
      (raid.phase === 'march' ? `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>` : '');
  } else if (raid.phase === 'march') {
    const ready = arrived() >= raid.raiders.length || raid.timer >= config().marchSeconds;
    html = `<span>${escapeHtml(t('raid.marching', { n: arrived(), m: raid.raiders.length }))}</span>` +
      `<button class="btn raid-go" data-raid-act="attack"${ready ? '' : ' disabled'}>${richText(t('raid.attack'))}</button>` +
      `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>`;
  } else if (raid.phase === 'fight') {
    const outpost = game.enemyTents.find(et => et.outpost);
    html = `<span>${escapeHtml(t('raid.left', { n: game.enemies.filter(en => en.hp > 0).length, hp: outpost ? Math.ceil(100 * outpost.hp / outpost.maxHp) : 0 }))}</span>` +
      `<button class="btn${raid.auto ? ' on' : ''}" data-raid-act="auto">${richText(t('raid.auto'))}</button>` +
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
  if (act === 'open') openRaidPicker();
  else if (act === 'scout') sendScout();
  else if (act === 'attack') enterCamp();
  else if (act === 'call-off' && raid.phase === 'march') endRaid(false);
  else if (act === 'auto') raid.auto = !raid.auto;
  else if (act === 'retreat') leaveCamp(false);
  barKey = '';
  updateRaidBar();
}
