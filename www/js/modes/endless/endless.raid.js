// Enemy camps and raids take place on the main map. While a party is away, the wave clock and its prepared
// march pause; the camp and its defenders remain in the world.

import { GAME_CONFIG, getDefinition } from '../../content/configs/index.js';
import { camera, clampCamera, onTap, t } from '../../engine/platform/index.js';
import { OUTPOST_COLLISION_HALF_HEIGHT, OUTPOST_COLLISION_HALF_WIDTH, OUTPOST_COLLISION_OFFSET_Y, TILE_SIZE, game, getGridPos, rand, resetTileIndex, townHall } from '../../engine/world/index.js';
import { getEnemyReach, invalidateAllPaths, isTileBlockedForSettler, moveEntityTowards } from '../../engine/movement/index.js';
import { addResources, canAfford, formatCost, moveSettlerToTownHall, payCost, showCostError, stock, takeStock } from '../../domains/colony/storage/index.js';
import { faceTowards, someoneSays } from '../../domains/colony/settlers/index.js';
import { armorOf, isBowWeapon } from '../../domains/colony/equipment/index.js';
import { clearOrders, fightByOrders, orderTap } from '../../domains/conflict/combat/index.js';
import { createConfiguredEnemy, isEnemyKindUnlocked } from '../../domains/conflict/waves/index.js';
import { getEnemyFaction, getPlayerFaction } from '../../domains/factions/index.js';
import { getTerritoryBox } from '../../domains/world/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { escapeHtml, iconHtml, richText, showNotification } from '../../ui/index.js';
import { playSound } from '../../app/index.js';

const config = () => GAME_CONFIG.raid;
const SIDES = ['left', 'right', 'top', 'bottom'];
const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

// The raid under way (not saved: a game can't be saved during one). The world remains active around the party.
export const raid = {
  /** @type {null | 'march' | 'fight' | 'return'} */
  phase: null,
  side: 'right',
  /** @type {any[]} */
  raiders: [],
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
  campId: '',
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
const waveOn = () => game.enemies.some(en => en.fromWave && !en.wavePrepared && en.hp > 0) ||
  (!game.wavePrepared && (game.portalQueue || []).length > 0);

// Spots for a party side by side, round `at`
function lineUp(at, side, i) {
  const step = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 18;
  return side === 'left' || side === 'right' ? { x: at.x, y: at.y + step } : { x: at.x + step, y: at.y };
}

// ---- The camp on the main map

// The armed, as the camp's defenders mirror them (#279: taken when the camp appears, so it's the same camp
// however the army changes after)
const armyOf = settlers => settlers.filter(s => s.weapon !== 'fist' || s.role === 'soldier' || s.role === 'archer')
  .map(s => ({ weapon: s.weapon, type: s.type, armor: s.armor || null, shield: !!s.shield }));

// Find dry, connected ground outside the territory. Small maps can have no such ground, so use the safest
// reachable site: the one farthest from the territory (or town hall when it fills the map).
function findRaidCampSite(wallTiles) {
  const margin = wallTiles + 3;
  const areaWidth = game.COLS + 1;
  const water = new Uint8Array(game.COLS * game.ROWS);
  const blocked = new Uint8Array(game.COLS * game.ROWS); // what a body or a wall can't stand on
  const spawners = new Uint8Array(game.COLS * game.ROWS); // ore spawners: never built over or cleared
  const mark = (list, into) => {
    for (const o of list) {
      const gx = Math.floor(o.x / TILE_SIZE), gy = Math.floor(o.y / TILE_SIZE);
      if (gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS) into[gy * game.COLS + gx] = 1;
    }
  };
  for (const tile of game.waterTiles) {
    const gx = Math.floor(tile.x / TILE_SIZE), gy = Math.floor(tile.y / TILE_SIZE);
    if (gx >= 0 && gy >= 0 && gx < game.COLS && gy < game.ROWS) water[gy * game.COLS + gx] = 1;
  }
  // (a camp is pitched on open ground: no rock, boulder, tree or ore about it to clear, and never over an
  // ore spawner. Only when a map has no such ground does it take a site with things to clear)
  mark(game.boulders, blocked);
  mark(game.naturalRocks, blocked);
  mark(game.trees, blocked);
  mark(game.cacti, blocked);
  mark(game.ironOres, blocked);
  mark(game.coalOres, blocked);
  mark(game.naturalRocks.filter(r => r.oreSpawner), spawners);
  const prefixOf = source => {
    const p = new Uint32Array(areaWidth * (game.ROWS + 1));
    for (let gy = 0; gy < game.ROWS; gy++) {
      let row = 0;
      for (let gx = 0; gx < game.COLS; gx++) {
        row += source[gy * game.COLS + gx];
        p[(gy + 1) * areaWidth + gx + 1] = p[gy * areaWidth + gx + 1] + row;
      }
    }
    return p;
  };
  const waterPrefix = prefixOf(water), blockedPrefix = prefixOf(blocked), spawnerPrefix = prefixOf(spawners);
  const inCamp = (p, gx, gy) => {
    const x0 = gx - margin, y0 = gy - margin, x1 = gx + margin + 1, y1 = gy + margin + 1;
    return p[y1 * areaWidth + x1] - p[y0 * areaWidth + x1] -
      p[y1 * areaWidth + x0] + p[y0 * areaWidth + x0];
  };
  const reach = getEnemyReach(), box = getTerritoryBox();
  const separation = (wallTiles + 3) * TILE_SIZE;
  /** @type {number[][]} */
  const clean = [], safe = [];
  let fallback = null;
  for (let gy = margin; gy < game.ROWS - margin; gy++) {
    for (let gx = margin; gx < game.COLS - margin; gx++) {
      if (inCamp(waterPrefix, gx, gy) !== 0) continue;
      if (isTileBlockedForSettler(gx, gy)) continue; // (the outpost isn't raised on a rock)
      const towardHallX = townHall.x - (gx * TILE_SIZE + TILE_SIZE / 2);
      const towardHallY = townHall.y - (gy * TILE_SIZE + TILE_SIZE / 2);
      const horizontal = Math.abs(towardHallX) >= Math.abs(towardHallY);
      const entryX = gx + (horizontal ? Math.sign(towardHallX) * (wallTiles + 1) : 0);
      const entryY = gy + (horizontal ? 0 : Math.sign(towardHallY) * (wallTiles + 1));
      if (!reach[entryY * game.COLS + entryX]) continue;

      const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
      const dx = Math.max(box.x0 - x, 0, x - box.x1);
      const dy = Math.max(box.y0 - y, 0, y - box.y1);
      const distanceFromTerritory = Math.hypot(dx, dy);
      if (distanceFromTerritory >= separation) {
        if (inCamp(blockedPrefix, gx, gy) === 0) clean.push([gx, gy]);
        else if (inCamp(spawnerPrefix, gx, gy) === 0) safe.push([gx, gy]);
      }

      const hallDistance = Math.hypot(towardHallX, towardHallY);
      const score = distanceFromTerritory * (distanceFromTerritory > 0 ? 1 : 0) + hallDistance / game.WORLD_WIDTH;
      if (!fallback || score > fallback.score) fallback = { gx, gy, score };
    }
  }
  const candidates = clean.length ? clean : safe;
  if (candidates.length) return candidates[Math.floor(rand() * candidates.length)];
  return fallback ? [fallback.gx, fallback.gy] : null;
}

// Generate the enemy outpost in the main world.
export function createRaidCamp() {
  if (game.gameMode !== 'endless' || game.enemyTents.some(et => et.outpost && et.hp > 0)) return;
  const c = config(), site = findRaidCampSite(c.wallTiles);
  if (!site) return;
  const [gx, gy] = site;
  const seed = Math.floor(rand() * 1e9), layout = c.layouts[Math.floor(rand() * c.layouts.length)];
  const hall = getGridPos(townHall.x, townHall.y);
  const side = Math.abs(gx - hall.gx) >= Math.abs(gy - hall.gy)
    ? (gx < hall.gx ? 'left' : 'right')
    : (gy < hall.gy ? 'top' : 'bottom');
  const camp = { id: `camp-${seed}`, side, seed, layout, wave: game.waveNum, x: tileCenter(gx, gy).x, y: tileCenter(gx, gy).y };
  layCamp(armyOf(game.settlers), camp);
  resetTileIndex();
  invalidateAllPaths();
}

// Each tick (Endless): a camp opens after a wave beaten, and goes when its time is up
export function tickRaidCamp(dt) {
  if (game.gameMode !== 'endless' || !game.gameStarted || isRaiding()) return;
  syncCampUnlockedDefenders();
  const c = config(), beaten = game.waveNum - 1;
  if (!game.raidCamp && beaten >= c.fromWave && beaten - (game.raidCampWave || 0) >= c.everyWaves && !waveOn()) {
    let site = game.enemyTents.find(et => et.outpost && et.hp > 0);
    if (!site) {
      createRaidCamp();
      site = game.enemyTents.find(et => et.outpost && et.hp > 0);
      if (!site) { game.raidCampWave = beaten; return; }
    }
    game.raidCamp = {
      side: site.side, timeLeft: c.seconds, seed: site.seed, layout: site.layout,
      army: armyOf(game.settlers), wave: game.waveNum, x: site.x, y: site.y, id: site.campId
    };
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

function syncCampUnlockedDefenders() {
  const camp = game.enemyTents.find(et => et.outpost && et.hp > 0);
  if (!camp) return;
  const unlockedKinds = Object.values(GAME_CONFIG.enemies).filter(def =>
    def.waveKey && def.unlock && getEnemyFaction().enemies.includes(def.id) && isEnemyKindUnlocked(def));
  if (camp.unlockDefenderBaseCount === undefined) {
    camp.unlockDefenderBaseCount = game.enemies.filter(en => en.campDefender && en.campId === camp.campId &&
      !en.campUnlockDefender && !GAME_CONFIG.enemies[en.enemyKey]?.pet).length;
  }
  if (!camp.unlockDefenderCounts) camp.unlockDefenderCounts = {};
  for (const def of unlockedKinds) {
    const desired = Math.max(1, Math.round(camp.unlockDefenderBaseCount * (def.waveScale || 0.25)));
    if (camp.unlockDefenderCounts[def.id] === undefined) {
      camp.unlockDefenderCounts[def.id] = game.enemies.filter(en =>
        en.campDefender && en.campId === camp.campId && en.enemyKey === def.id).length;
    }
    while (camp.unlockDefenderCounts[def.id] < desired) {
      const center = getGridPos(camp.x, camp.y), radius = Math.max(1, config().wallTiles - 1);
      let at = null;
      for (let ring = 1; ring <= radius && !at; ring++) {
        for (let gy = center.gy - ring; gy <= center.gy + ring && !at; gy++) {
          for (let gx = center.gx - ring; gx <= center.gx + ring; gx++) {
            if (Math.max(Math.abs(gx - center.gx), Math.abs(gy - center.gy)) !== ring) continue;
            if (isTileBlockedForSettler(gx, gy)) continue;
            const point = tileCenter(gx, gy);
            if (game.enemies.some(en => en.hp > 0 && dist(en, point) < en.radius + 12)) continue;
            at = point;
            break;
          }
        }
      }
      if (!at) break;
      const enemy = createConfiguredEnemy(at, def.id);
      if (!enemy) continue;
      enemy.guard = { ...at };
      enemy.campId = camp.campId;
      enemy.campDefender = true;
      enemy.campUnlockDefender = true;
      game.enemies.push(enemy);
      camp.unlockDefenderCounts[def.id]++;
    }
  }
}

// ---- Setting out

// Who can go: anyone (the armed are picked to start with); (#298) asleep too: it's woken
const canGo = s => s.temporary === undefined;

// The picker: who goes on the raid (any number, and how many arrows they take, #279), or (scout) which one
// goes to look, one only
export function openRaidPicker(scout = false) {
  if (!game.raidCamp || isRaiding()) return;
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
    b.innerHTML = `${iconHtml(type.icon)}${iconHtml(tool ? tool.icon : weapon.icon)}${armorOf(s) ? iconHtml(armorOf(s).icon) : ''}${s.shield ? iconHtml('shield') : ''}<span class="raid-hp">${Math.ceil(s.hp)}</span>`;
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
  const offerArrows = () => { if (!touched) arrows = Math.min(stock.arrows || 0, picked().filter(s => isBowWeapon(s.weapon)).length * config().arrowsPerArcher); showArrows(); };
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

// The party sets out across the main map; the rest of the base rests
export function startRaid(party, scouting = false, arrows = 0) {
  const raidCampState = game.raidCamp;
  if (!raidCampState || isRaiding() || !party.length) return false;
  const camp = game.enemyTents.find(et => et.outpost && et.campId === raidCampState.id);
  if (!camp) return false;
  Object.assign(raid, { phase: 'march', side: camp.side, campId: camp.campId, raiders: party, auto: false, won: false, timer: 0, scouting, arrows, retreating: false, escaped: [], placing: false });
  raid.defenders = game.enemies.filter(en => en.campDefender && en.campId === camp.campId && en.hp > 0).length;
  raid.gather = campEntry(camp, raid.side);
  game.waveMarchPaused = true;
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
  if (!game.raidCamp || isRaiding()) return false;
  if (waveOn()) { showNotification(t('raid.waveOn'), true); return false; }
  const scout = scoutChoice();
  if (!scout) { showNotification(t('raid.none'), true); return false; }
  startRaid([scout], true);
  showNotification(t('raid.scoutOff'), false);
  return true;
}

const arrived = () => raid.raiders.filter(s => game.settlers.includes(s) && dist(s, raid.gather) < 50 + 9 * raid.raiders.length).length;
function campEntry(camp, side) {
  const distance = (config().wallTiles + 2) * TILE_SIZE;
  const offset = { left: [-distance, 0], right: [distance, 0], top: [0, -distance], bottom: [0, distance] }[OPPOSITE[side]];
  return { x: camp.x + offset[0], y: camp.y + offset[1] };
}

// ---- The camp: a physical outpost on the main map

export function enterCamp() {
  if (raid.phase !== 'march') return;
  const party = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0);
  if (!party.length) { endRaid(false); return; }
  game.selectedSettler = null;
  const camp = game.enemyTents.find(et => et.outpost && et.campId === raid.campId);
  if (!camp) { endRaid(false); return; }
  const entry = raid.gather;
  raid.entry = entry;
  party.forEach(s => { s.orderSpot = { x: s.x, y: s.y }; s.orderTarget = null; });
  raid.phase = 'fight';
  raid.timer = 0;
  game.enemyTents.forEach(tent => {
    if (tent.campId !== camp.campId || tent.outpost) return;
    tent.summonTimer = 0;
    tent.summonsLeft = GAME_CONFIG.raid.tentSummons;
  });
  Object.assign(camera, entry);
  clampCamera();
  if (!raid.scouting) playSound('horn');
  updateRaidBar();
}

// Tiles of a ring round the middle: a square one (the Chebyshev distance r) or a round one
function ringTiles(midX, midY, r, round) {
  const out = [];
  for (let gy = midY - r - 1; gy <= midY + r + 1; gy++) {
    for (let gx = midX - r - 1; gx <= midX + r + 1; gx++) {
      const d = round ? Math.hypot(gx - midX, gy - midY) : Math.max(Math.abs(gx - midX), Math.abs(gy - midY));
      if (round ? Math.abs(d - r) < 0.55 : d === r) out.push([gx, gy]);
    }
  }
  return out;
}

function layCamp(army, camp) {
  const c = config();
  const mid = getGridPos(camp.x, camp.y), midX = mid.gx, midY = mid.gy, R = c.wallTiles, centre = { x: camp.x, y: camp.y };
  const round = camp.layout === 'round', open = camp.layout === 'scattered', fort = camp.layout === 'fort';
  const span = open ? R + 1 : R;
  // nothing natural inside the camp or on its walls (a site with no such ground is preferred, see
  // findRaidCampSite; on a cramped map what's there goes)
  const clear = span + 2;
  const inside = o => Math.abs(getGridPos(o.x, o.y).gx - midX) <= clear && Math.abs(getGridPos(o.x, o.y).gy - midY) <= clear;
  for (const list of ['trees', 'cacti', 'boulders', 'naturalRocks', 'waterTiles', 'grassList', 'berryBushes', 'sticks', 'pebbles', 'ironOres', 'coalOres', 'beachTiles']) {
    game[list] = game[list].filter(o => !inside(o));
  }
  const entryAngle = { left: Math.PI, right: 0, top: -Math.PI / 2, bottom: Math.PI / 2 }[OPPOSITE[camp.side]];
  // a ring of wall with ways in: one towards where the party comes from, `gaps` more at random
  const wallRing = (r, type, gapCount, torches = true) => {
    const ring = ringTiles(midX, midY, r, round);
    const angles = [entryAngle];
    for (let i = 0; i < gapCount; i++) angles.push(rand() * Math.PI * 2);
    const toward = a => p => Math.hypot(p[0] - (midX + Math.cos(a) * r), p[1] - (midY + Math.sin(a) * r));
    /** @type {number[][]} */
    const gapAt = angles.map(a => [...ring].sort((p, q) => toward(a)(p) - toward(a)(q))[0]);
    const isGap = p => { const [gx, gy] = p; return gapAt.some(([x, y]) => Math.hypot(gx - x, gy - y) < 1.5); };
    for (const p of ring) if (!isGap(p)) game.buildings.push(standing(type, tileCenter(p[0], p[1]), { campId: camp.id }));
    // torches by each way in
    if (torches) for (const [gx, gy] of gapAt) {
      for (const p of ring.filter(q => Math.abs(Math.hypot(q[0] - gx, q[1] - gy) - 2) < 0.6).slice(0, 2)) {
        const at = tileCenter(p[0], p[1]), k = game.buildings.findIndex(b => b.x === at.x && b.y === at.y);
        if (k >= 0) game.buildings[k] = standing('torch', at, { lit: true, campId: camp.id });
      }
    }
  };
  const stone = camp.wave >= c.stoneFromWave;
  if (fort) { wallRing(R, 'wall_stone', c.gaps); wallRing(R - 2, 'wall_wood', 0, false); } // (the inner ring: one way in, the party's side)
  else if (!open) wallRing(R, stone ? 'wall_stone' : 'wall_wood', c.gaps);
  // what's free inside: not the outpost's tile, not a wall
  const taken = new Set(game.buildings.map(b => `${getGridPos(b.x, b.y).gx},${getGridPos(b.x, b.y).gy}`));
  const free = [];
  for (let gy = midY - span + 1; gy <= midY + span - 1; gy++) {
    for (let gx = midX - span + 1; gx <= midX + span - 1; gx++) {
      if ((gx === midX && gy === midY) || taken.has(`${gx},${gy}`)) continue;
      if (round && Math.hypot(gx - midX, gy - midY) > R - 0.6) continue;
      const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
      if (Math.abs(x - centre.x) <= OUTPOST_COLLISION_HALF_WIDTH + 13 &&
          Math.abs(y - (centre.y + OUTPOST_COLLISION_OFFSET_Y)) <= OUTPOST_COLLISION_HALF_HEIGHT + 13) continue;
      free.push([gx, gy]);
    }
  }
  const takeFree = (near = Infinity, far = 0) => {
    const ok = free.filter(([gx, gy]) => { const d = Math.max(Math.abs(gx - midX), Math.abs(gy - midY)); return d <= near && d >= far; });
    const from = ok.length ? ok : free;
    // (a camp laid on rock: no free tile at all: the fire/tent keeps to the outpost's own ground)
    if (!from.length) return { x: centre.x, y: centre.y + TILE_SIZE };
    const pick = from[Math.floor(rand() * from.length)];
    free.splice(free.indexOf(pick), 1);
    return tileCenter(pick[0], pick[1]);
  };
  // one fire in every camp (one cook at it at a time), spikes round an open one, and its faction's own buildings
  game.buildings.push(standing('campfire', takeFree(span - 2), { fuelLeft: 0, campId: camp.id }));
  if (open) for (let i = 0; i < 8; i++) game.buildings.push(standing('spikes', takeFree(span, span - 1), { campId: camp.id }));
  // the outpost, and the tents
  game.enemyTents.push({ x: centre.x, y: centre.y, hp: c.outpostHp, maxHp: c.outpostHp, outpost: true,
    summonTimer: 0, summonsLeft: 0, side: camp.side, seed: camp.seed, layout: camp.layout, campId: camp.id,
    campMeals: 0 });
  const tents = c.tents.min + Math.floor(rand() * (c.tents.max - c.tents.min + 1)) + (open ? 1 : 0);
  for (let i = 0; i < tents; i++) {
    const at = takeFree(fort ? R - 3 : span - 2);
    game.enemyTents.push({ x: at.x, y: at.y, hp: GAME_CONFIG.enemyTents.hp, maxHp: GAME_CONFIG.enemyTents.hp, summonTimer: 0, summonsLeft: 0, campId: camp.id });
  }
  // the defenders, mirroring the player's army
  const defenders = campDefenders(army, camp.wave);
  raid.defenders = defenders.length;
  for (const kind of defenders) {
    const at = takeFree();
    const en = createConfiguredEnemy(at, kind.id);
    if (!en) continue;
    const armour = armorOf({ armor: kind.armor === true ? 'iron' : kind.armor }); // (#298: its kind; an old save's true: iron)
    if (armour) { en.armor = armour.armorKind; en.maxHp += armour.hpBonus; en.hp = en.maxHp; }
    if (kind.shield) en.shield = true;
    en.guard = { x: at.x, y: at.y };
    en.campId = camp.id;
    en.campDefender = true;
    game.enemies.push(en);
  }
}

// The camp's defenders: one for each of the player's armed (its kind by the weapon and the body, its
// armour and shield as theirs), more with the waves
export function campDefenders(army, wave = game.waveNum) {
  const c = config().defenders;
  const factionKinds = Object.values(GAME_CONFIG.enemies).filter(def => def.waveKey && getEnemyFaction().enemies.includes(def.id));
  const availableKinds = factionKinds.filter(def => isEnemyKindUnlocked(def));
  const kinds = availableKinds.filter(def => !def.pet);
  const pets = availableKinds.filter(def => def.pet);
  const ofKey = key => kinds.find(def => /** @type {string[]} */ ([]).concat(def.waveKey).includes(key) && !def.healer && !def.necromancer) || kinds[0];
  const list = army.map(s => {
    const key = isBowWeapon(s.weapon) ? 'archer' : (GAME_CONFIG.settlerTypes[s.type] || {}).big ? 'brute' : s.weapon === 'fist' || s.weapon === 'club' ? 'club' : 'raider';
    const def = ofKey(key);
    return { id: def.id, armor: s.armor || null, shield: !!s.shield && def.type === 'normal' && !def.ranged };
  });
  const count = Math.max(c.min, Math.round(army.length * c.perSoldier) + Math.floor((wave - 1) / c.extraEveryWaves));
  const out = [];
  for (let i = 0; i < count; i++) out.push(list.length ? list[i % list.length] : { id: ofKey('raider').id, armor: false, shield: false });
  for (const pet of pets) {
    const petCount = Math.max(1, Math.round(count * (pet.waveScale || 0.25)));
    for (let i = 0; i < petCount; i++) out.push({ id: pet.id, armor: null, shield: false });
  }
  return out;
}

// ---- Orders in the camp

// A tap in the camp: orders (see combat.orders.js). True: the tap was the raid's
export function raidTap(x, y) {
  if (!isInCamp()) return false;
  if (raid.placing) { pitchShelter(x, y); return true; }
  if (raid.retreating) return true;
  // a scout: where it creeps to (#279)
  if (raid.scouting) { const s = raid.raiders[0]; if (s) s.orderSpot = { x, y }; return true; }
  orderTap(x, y, raid.raiders.filter(s => game.settlers.includes(s)));
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
  bp.campId = raid.campId;
  const builder = [...raid.raiders].sort((a, b) => (a.orderTarget ? 1 : 0) - (b.orderTarget ? 1 : 0) || dist(a, at) - dist(b, at))[0];
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
    for (const s of raid.raiders) {
      if (dist(s, b) > c.reach) continue;
      if (s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + c.healPerSecond * dt);
      const room = (/** @type {any} */ (s).quiverCapacity || 12) - (s.arrows || 0);
      if (isBowWeapon(s.weapon) && s.quiver && room > 0 && raid.arrows > 0) { const n = Math.min(room, raid.arrows); s.arrows = (s.arrows || 0) + n; raid.arrows -= n; }
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
    else { if (!raid.escaped.includes(s)) raid.escaped.push(s); delete s.raider; }
    return true;
  }
  // a scout creeps where it's told (from the edge, to start with), looking at the camp (#279)
  if (raid.scouting) {
    if (s.orderSpot && dist(s, s.orderSpot) > 6) moveEntityTowards(s, s.orderSpot.x, s.orderSpot.y, s.speed * 0.7, false, dt);
    else faceTowards(s, townHall.x, townHall.y);
    return true;
  }
  // the shelter: its builder builds it; in the auto battle the badly hurt go to it, and an archer out of
  // arrows when there are some there (#279)
  const site = game.blueprints.find(bp => bp.raidShelter && bp.builderId === s.id);
  if (site && !s.orderTarget) { buildShelter(s, site, dt); return true; }
  const shelter = shelters().sort((a, b) => dist(a, s) - dist(b, s))[0];
  const empty = isBowWeapon(s.weapon) && s.quiver && (s.arrows || 0) <= 0 && raid.arrows > 0;
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
    else if (raid.scouting && (arrived() >= raid.raiders.length || raid.timer >= config().marchSeconds)) enterCamp(); // (a scout looks at once)
  } else if (raid.phase === 'fight') {
    tickShelters(dt);
    const partyAlive = raid.raiders.some(s => game.settlers.includes(s) && s.hp > 0);
    if (!partyAlive) { if (raid.escaped.length) leaveCamp(false); else failRaid(); }
    else if (raid.retreating) {
      const stillRetreating = raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0 && !raid.escaped.includes(s));
      if (!stillRetreating.length) leaveCamp(false);
    }
    else if (raid.scouting) {
      // a scout is spotted after a while, or as soon as one of them comes near it, or it's hit: it runs back
      // the way it came, and they come after it (#279)
      const scout = raid.raiders[0];
      if (!scout || raid.timer >= config().scoutSeconds || game.enemies.some(en => en.hp > 0 && en.campId === raid.campId && dist(en, scout) < config().scoutSeenTiles * TILE_SIZE) || scout.hp < scout.maxHp) {
        someoneSays(game.enemies, getEnemyFaction().id, 'charge', true);
        for (const en of game.enemies) if (en.guard && en.campId === raid.campId && scout && dist(en, scout) < 8 * TILE_SIZE) en.guardOff = true;
        startRetreat();
        showNotification(t('raid.scoutSpotted'), true);
      }
    }
    else if (!game.enemies.some(en => en.hp > 0 && en.campId === raid.campId) && !game.enemyTents.some(et => et.campId === raid.campId)) leaveCamp(true);
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

// The camp beaten (won) or left (Retreat): the party walks home with what it took
// Retreat (#279): not at once; each runs back to its spot on the edge it came in by (the enemy after it), and
// once all who are left are out, the party's out of the camp
function startRetreat() {
  if (raid.phase !== 'fight' || raid.retreating) return;
  raid.retreating = true;
  raid.placing = false;
  raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0).forEach((s, i) => { s.exitSpot = lineUp(raid.entry, raid.side, i); clearOrders(s); });
  if (!raid.scouting) showNotification(t('raid.retreated'), true);
  updateRaidBar();
}

export function leaveCamp(won) {
  if (raid.phase !== 'fight') return;
  const survivors = [...new Set([...raid.escaped, ...raid.raiders.filter(s => game.settlers.includes(s) && s.hp > 0)])];
  survivors.forEach(s => { delete s.exitSpot; delete s.healing; });
  survivors.forEach(s => { s.raider = true; });
  if (raid.scouting) {
    for (const enemy of game.enemies) {
      if (!enemy.campDefender || enemy.campId !== raid.campId || !enemy.guard) continue;
      enemy.x = enemy.guard.x; enemy.y = enemy.guard.y; enemy.path = null; enemy.pathTarget = null; enemy.guardOff = false;
    }
  }
  raid.escaped = [];
  raid.retreating = false;
  // the arrows not used, back in the stock
  if (raid.arrows > 0 && survivors.length) { stock.arrows = (stock.arrows || 0) + raid.arrows; raid.arrows = 0; }
  raid.raiders = survivors;
  raid.won = won;
  raid.phase = 'return';
  raid.timer = 0;
  if (won) {
    game.buildings = game.buildings.filter(b => b.campId !== raid.campId);
    game.blueprints = game.blueprints.filter(bp => bp.campId !== raid.campId);
    game.enemies = game.enemies.filter(en => !en.campDefender || en.campId !== raid.campId);
    resetTileIndex();
    invalidateAllPaths();
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
  if (raid.scouting) { showNotification(t('raid.scoutLost'), true); resetRaidState(); return; } // (the camp stays, no wave sent)
  game.raidCamp = null;
  game.waveTimer = Math.min(game.waveTimer, config().failWaveSeconds);
  showNotification(t('raid.lost', { seconds: config().failWaveSeconds }), true);
  playSound('defeat');
  resetRaidState();
}

// Over: home (or never left). Won: the next camp is built and the next wave waits twice as long
export function endRaid(won) {
  for (const s of raid.raiders) { delete s.raider; delete s.raidSpot; delete s.lastStep; clearOrders(s); }
  if (!raid.scouting && (raid.phase === 'return' || raid.phase === 'fight')) game.raidCamp = null;
  if (won) createRaidCamp();
  if (won) game.waveTimer += game.waveInterval;
  resetRaidState();
}

function resetRaidState() {
  game.waveMarchPaused = false;
  for (const s of raid.raiders) { delete s.raider; delete s.raidSpot; clearOrders(s); }
  Object.assign(raid, { phase: null, raiders: [], auto: false, won: false, timer: 0, defenders: 0, still: 0, scouting: false, retreating: false, escaped: [], arrows: 0, placing: false, campId: '' });
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
  const show = game.gameMode === 'endless' && game.gameStarted && (isRaiding() || !!game.raidCamp);
  if (!show) { if (bar) bar.remove(); barKey = ''; return; }
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let html = '';
  if (!isRaiding()) {
    html = `<button class="btn" data-raid-act="open">${richText(t('raid.button', { time: fmt(Math.max(0, game.raidCamp ? game.raidCamp.timeLeft : 0)) }))}</button>` +
      `<button class="btn" data-raid-act="scout">${richText(t('raid.scout'))}</button>`;
  } else if (raid.retreating) {
    html = `<span>${escapeHtml(t(raid.scouting ? 'raid.scoutRunning' : 'raid.retreating'))}</span>`;
  } else if (raid.scouting) {
    html = `<span>${escapeHtml(t(raid.phase === 'march' ? 'raid.scoutGoing' : raid.phase === 'fight' ? 'raid.scoutLooking' : 'raid.returning'))}</span>` +
      (raid.phase === 'march' ? `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>` : '');
  } else if (raid.phase === 'march') {
    const ready = arrived() >= raid.raiders.length || raid.timer >= config().marchSeconds;
    html = `<span>${escapeHtml(t('raid.marching', { n: arrived(), m: raid.raiders.length }))}</span>` +
      `<button class="btn raid-go" data-raid-act="attack"${ready ? '' : ' disabled'}>${richText(t('raid.attack'))}</button>` +
      `<button class="btn" data-raid-act="call-off">${escapeHtml(t('raid.cancel'))}</button>`;
  } else if (raid.phase === 'fight') {
    const outpost = game.enemyTents.find(et => et.outpost && et.campId === raid.campId);
    const def = GAME_CONFIG.buildings[shelterType()], pitched = game.blueprints.some(bp => bp.raidShelter) || shelters().length > 0;
    html = `<span>${escapeHtml(t('raid.left', { n: game.enemies.filter(en => en.hp > 0 && en.campId === raid.campId).length, hp: outpost ? Math.ceil(100 * outpost.hp / outpost.maxHp) : 0 }))}` +
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
  if (act === 'open') openRaidPicker();
  else if (act === 'scout') openRaidPicker(true); // (which one goes, #279)
  else if (act === 'attack') enterCamp();
  else if (act === 'call-off' && raid.phase === 'march') endRaid(false);
  else if (act === 'auto') raid.auto = !raid.auto;
  else if (act === 'retreat') startRetreat();
  else if (act === 'shelter' && isInCamp()) { raid.placing = !raid.placing; if (raid.placing) showNotification(t('raid.shelterTap'), false); }
  barKey = '';
  updateRaidBar();
}
