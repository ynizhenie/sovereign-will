// Plague: a possessed necromancer raises nearby corpses, commands the dead, and survives crossing enemy groups.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, loadData, onTap, saveData, setZoom, t } from '../../engine/platform/index.js';
import { TILE_SIZE, applySeedFromUI, createWorldSeed, game, getGridPos, rand, setBorderMargin, townHall } from '../../engine/world/index.js';
import { isTileBlockedForEnemyStrict } from '../../engine/movement/index.js';
import { createSettler } from '../../domains/colony/settlers/index.js';
import { createConfiguredEnemy, dressForWave, getWavePresetPool, pickWavePreset } from '../../domains/conflict/waves/index.js';
import { isTileOccupied } from '../../domains/economy/building/index.js';
import { canUseShield, isRangedWeapon } from '../../domains/colony/equipment/index.js';
import { getPlayerFaction, sides } from '../../domains/factions/index.js';
import { showNotification } from '../../ui/index.js';
import { playSound, resetGame, resetGameSteps, setPaused } from '../../app/index.js';
import { mainMenu, showMenuScreen } from '../menu/index.js';
import { runLoading } from '../../ui/index.js';

const STARTING_ENERGY = 15;
const STARTING_MAX_ENERGY = 30;
const STARTING_SQUAD = 8;
const BASE_HERO_HEALTH = 180;
const RAISE_COST = { normal: 5, big: 10 };
// (#404) the time between bands (seconds) and how many come each time: a range each, picked anew every time; the
// default one, or the player's own (kept, to switch back and forth), within the limits
const SPAWN_RANGES = {
  interval: { default: [10, 30], limits: [3, 60] },
  groups: { default: [1, 3], limits: [1, 10] }
};
const REVIVE_RANGE = 5 * TILE_SIZE;
const CEMETERY_CORPSE_INTERVAL = 60;
const CEMETERY_CORPSE_LIMIT = 3;
const ENEMY_AGGRO_RANGE = 6 * TILE_SIZE;
const ENEMY_CHASE_SECONDS = 8;
const ENEMY_AGGRO_RESET_RANGE = 9 * TILE_SIZE;
let nextPlagueUnitId = 100000;
const PLAGUE_MAP_SETTINGS = {
  lakes: { min: 1, max: 2 },
  deserts: { min: 0, max: 0 },
  savannas: { min: 0, max: 1 },
  forests: { min: 1, max: 2 },
  forestTrees: { min: 3, max: 5 },
  trees: { min: 3, max: 6 },
  boulders: { min: 8, max: 12 },
  boulderPiles: { min: 1, max: 2 },
  rockClusters: { min: 1, max: 6 },
  grass: { min: 10, max: 16 }
};

/** @typedef {{ custom: boolean, from: number, to: number }} SpawnRange */
/** @param {string} kind @param {any} saved @returns {SpawnRange} */
function spawnRange(kind, saved) {
  const { default: [from, to], limits: [low, high] } = SPAWN_RANGES[kind];
  const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Math.round(Number(value)))) : fallback;
  const a = clamp(saved?.from, from), b = clamp(saved?.to, to);
  return { custom: saved?.custom === true, from: Math.min(a, b), to: Math.max(a, b) };
}
// the range in play: the player's own, or the default
const rangeOf = (kind, range) => range?.custom ? [range.from, range.to] : SPAWN_RANGES[kind].default;
// a whole number from..to, each as likely
const rollRange = ([from, to]) => from + Math.floor(rand() * (to - from + 1));

function readPlagueSettings() {
  const saved = loadData('plagueChoices', null);
  return {
    difficulty: saved?.difficulty === 'hard' ? 'hard' : 'normal',
    interval: spawnRange('interval', saved?.interval),
    groups: spawnRange('groups', saved?.groups)
  };
}

// The menu's settings as they're set now: saved, and shown back (a range put the right way round, within its limits)
function savePlagueSettings() {
  /** @param {string} kind */
  const rangeFromMenu = kind => {
    const box = /** @type {HTMLElement} */ (document.querySelector(`[data-plague-range="${kind}"]`));
    const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input'));
    const custom = !!box.querySelector('[data-plague-range-mode="custom"].active');
    return spawnRange(kind, { custom, from: inputs[0].value, to: inputs[1].value });
  };
  const settings = {
    difficulty: document.querySelector('#plague-difficulty-options [data-plague-difficulty].active')?.getAttribute('data-plague-difficulty') === 'hard' ? 'hard' : 'normal',
    interval: rangeFromMenu('interval'),
    groups: rangeFromMenu('groups')
  };
  showSpawnRanges(settings);
  game.plagueSettings = settings;
  game.gameDifficulty = settings.difficulty;
  saveData('plagueChoices', settings);
}

/** @param {{ interval: SpawnRange, groups: SpawnRange }} settings */
function showSpawnRanges(settings) {
  for (const kind of Object.keys(SPAWN_RANGES)) {
    const range = settings[kind], box = /** @type {HTMLElement} */ (document.querySelector(`[data-plague-range="${kind}"]`));
    const inputs = /** @type {NodeListOf<HTMLInputElement>} */ (box.querySelectorAll('input'));
    inputs[0].value = String(range.from); inputs[1].value = String(range.to);
    box.querySelectorAll('[data-plague-range-mode]').forEach(button =>
      button.classList.toggle('active', (button.getAttribute('data-plague-range-mode') === 'custom') === range.custom));
    const [from, to] = SPAWN_RANGES[kind].default;
    const label = box.querySelector('[data-plague-range-mode="default"]');
    if (label) label.textContent = t('plague.rangeDefault', { from, to });
    /** @type {HTMLElement} */ (box.querySelector('.plague-range-fields')).hidden = !range.custom;
  }
}

// (#404) The upgrades, as Lima listed them: each card offered as likely as any other
const CARD_DEFS = {
  // one speed for the Necromancer and its dead alike
  speed: { name: 'plague.card.speed', desc: 'plague.card.speedDesc', apply: p => {
    const before = p.speedFactor;
    p.speedFactor += 0.1;
    for (const unit of game.settlers) if (unit.plagueUnit) unit.speed *= p.speedFactor / before;
  } },
  heal_targets: { name: 'plague.card.healTargets', desc: 'plague.card.healTargetsDesc', apply: p => { p.healTargets++; } },
  heal_strength: { name: 'plague.card.healStrength', desc: 'plague.card.healStrengthDesc', apply: p => { p.healStrength += 1.5; } },
  heal_range: { name: 'plague.card.healRange', desc: 'plague.card.healRangeDesc', apply: p => { p.healRange += TILE_SIZE; } },
  energy_capacity: { name: 'plague.card.energyCapacity', desc: 'plague.card.energyCapacityDesc', apply: p => { p.maxEnergy += 10; p.energy = Math.min(p.maxEnergy, p.energy + 10); } },
  energy_regen: { name: 'plague.card.energyRegen', desc: 'plague.card.energyRegenDesc', apply: p => { p.energyRegen += 0.1; } },
  squad_size: { name: 'plague.card.squadSize', desc: 'plague.card.squadSizeDesc', apply: p => { p.maxSquad += 3; } },
  command_range: { name: 'plague.card.commandRange', desc: 'plague.card.commandRangeDesc', apply: p => { p.commandRange += TILE_SIZE * 2; } },
  revive_range: { name: 'plague.card.reviveRange', desc: 'plague.card.reviveRangeDesc', apply: p => { p.reviveRange += TILE_SIZE * 2; } },
  multi_raise: { name: 'plague.card.multiRaise', desc: 'plague.card.multiRaiseDesc', apply: p => { p.raisesPerCast++; } },
  revive_cooldown: { name: 'plague.card.reviveCooldown', desc: 'plague.card.reviveCooldownDesc', apply: p => { p.reviveCooldown = Math.max(0.3, p.reviveCooldown - 0.25); } },
  // the Necromancer's health and its dead's, one card for both
  health: { name: 'plague.card.health', desc: 'plague.card.healthDesc', apply: p => {
    p.heroMaxHp += 20;
    p.minionHp += 15;
    for (const unit of game.settlers) {
      if (unit.plagueHero) { unit.maxHp += 20; unit.hp += 20; }
      else if (unit.plagueUnit) { unit.maxHp += 15; unit.hp += 15; }
    }
  } }
};

const newPlagueState = () => ({
  bandInterval: rangeOf('interval', game.plagueSettings?.interval),
  bandCount: rangeOf('groups', game.plagueSettings?.groups),
  energy: STARTING_MAX_ENERGY, maxEnergy: STARTING_MAX_ENERGY, energyRegen: 0.2,
  maxSquad: STARTING_SQUAD, raisesPerCast: 1, raiseCostFactor: 1, reviveRange: REVIVE_RANGE,
  reviveCooldown: 1.5, reviveTimer: 0, groupTimer: rollRange(rangeOf('interval', game.plagueSettings?.interval)),
  groupId: 0, groups: [], groupsCleared: 0, elapsedTime: 0,
  enemiesKilled: 0, killsTowardUpgrade: 0, nextUpgradeKills: 5,
  offer: null, upgrades: {}, commandRange: TILE_SIZE * 10, heroMaxHp: BASE_HERO_HEALTH,
  speedFactor: 1, minionHp: 0,
  healStrength: 2, healTargets: 1, healRange: 5 * TILE_SIZE
});

function placeCemeteries() {
  const points = [];
  const minDistance = Math.min(game.COLS, game.ROWS) * TILE_SIZE * 0.32;
  for (let attempt = 0; points.length === 0 && attempt < 160; attempt++) {
    const angle = rand() * Math.PI * 2;
    const distance = TILE_SIZE * (5 + rand() * 2);
    const gx = Math.max(1, Math.min(game.COLS - 2, Math.floor((townHall.x + Math.cos(angle) * distance) / TILE_SIZE)));
    const gy = Math.max(1, Math.min(game.ROWS - 2, Math.floor((townHall.y + Math.sin(angle) * distance) / TILE_SIZE)));
    const point = { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
    if (!isTileOccupied(point.x, point.y)) points.push(point);
  }
  for (let attempt = 0; points.length < 3 && attempt < 400; attempt++) {
    const gx = 2 + Math.floor(rand() * Math.max(1, game.COLS - 4));
    const gy = 2 + Math.floor(rand() * Math.max(1, game.ROWS - 4));
    const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
    if (isTileOccupied(x, y) || Math.hypot(x - townHall.x, y - townHall.y) < TILE_SIZE * 5 ||
      points.some(p => Math.hypot(x - p.x, y - p.y) < minDistance)) continue;
    points.push({ x, y });
  }
  for (const [index, point] of points.entries()) {
    const cemeteryId = index + 1;
    game.buildings.push({
      type: 'grave', x: point.x, y: point.y, hp: 100, maxHp: 100, progress: 70, maxProgress: 70,
      built: true, plagueCemetery: true, plagueCemeteryId: cemeteryId, plagueCorpseTimer: CEMETERY_CORPSE_INTERVAL
    });
    const corpseCount = index === 1 ? 3 : 2;
    for (let i = 0; i < corpseCount; i++) {
      const weapon = i % 2 ? 'sword' : 'club';
      game.corpses.push({
        x: point.x + (i % 2 ? 18 : -18), y: point.y + (i === 2 ? 18 : -18),
        radius: 11, side: 'settler', kind: 'zombie', age: 0, big: false, wormsTaken: false,
        type: 'zombie', weapon, tool: 'none', look: null, plagueCemeteryCorpse: true, plagueCemeteryId: cemeteryId
      });
    }
  }
  if (points.length !== 3) throw new Error(`Could only place ${points.length} of 3 plague cemeteries`);
}

function setupPlagueGame() {
  game.plague = newPlagueState();
  game.plagueMode = true;
  game.cardMode = true;
  game.mapSettings = { cols: 40, rows: 40 };
  game.waveInterval = Infinity;
  game.waveTimer = Infinity;
  game.waveNum = 1;
  game.enemyCampCount = 0;
  game.fogEnabled = false;
  game.settlers = [];
  const hero = createSettler('zombie', nextPlagueUnitId++, townHall.x, townHall.y, {
    plagueHero: true, isPossessed: false, tool: 'necro_staff', weapon: 'fist', role: 'soldier',
    maxHp: game.plague.heroMaxHp, hp: game.plague.heroMaxHp
  });
  hero.tool = 'necro_staff';
  hero.weapon = 'fist';
  hero.maxHp = game.plague.heroMaxHp;
  hero.hp = hero.maxHp;
  game.settlers.push(hero);
  setZoom(1.2);
  game.selectedSettler = null;
  placeCemeteries();
  document.body.dataset.plague = 'yes';
  document.body.classList.remove('defeated');
  document.getElementById('defeat-overlay').hidden = true;
  updatePlagueHud();
}

// (#404) The Plague's own sides whatever Endless was set to: the player the undead, the enemy humans; Endless's
// back when the Plague is left
/** @type {{ player: string, enemy: string } | null} */
let endlessFactions = null;
function takePlagueSides() {
  if (!endlessFactions) endlessFactions = { player: sides.player.faction, enemy: sides.enemy.faction };
  sides.player.faction = 'undead';
  sides.enemy.faction = 'humans';
}

export async function startPlagueGame() {
  if (game.loading) return;
  savePlagueSettings();
  applySeedFromUI();
  takePlagueSides();
  game.plagueMode = true;
  game.mapSettings = { cols: 40, rows: 40 };
  game.customMap = null;
  game.cardMode = true;
  setBorderMargin(0);
  const restoreMapSettings = applyPlagueMapSettings();
  try {
    await runLoading('loading.world', resetGameSteps(), () => {
      setupPlagueGame();
      game.gameStarted = true;
      mainMenu.style.display = 'none';
    });
  } finally {
    restoreMapSettings();
    if (!game.gameStarted || !game.plagueMode) setBorderMargin(2);
  }
}

export function restartPlagueGame() {
  const seed = game.worldSeed?.value;
  if (!seed) throw new Error('Cannot restart Plague without the current world seed');
  game.worldSeed = createWorldSeed(seed);
  takePlagueSides();
  game.plagueMode = true;
  game.gameMode = 'endless';
  game.mapSettings = { cols: 40, rows: 40 };
  game.customMap = null;
  game.cardMode = true;
  setBorderMargin(0);
  const restoreMapSettings = applyPlagueMapSettings();
  try {
    resetGame();
    setupPlagueGame();
  } finally { restoreMapSettings(); }
}

function applyPlagueMapSettings() {
  const previous = {};
  for (const [key, value] of Object.entries(PLAGUE_MAP_SETTINGS)) {
    previous[key] = GAME_CONFIG.map[key];
    GAME_CONFIG.map[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) GAME_CONFIG.map[key] = value;
  };
}

function livingHero() {
  return game.settlers.find(s => s.plagueHero && s.hp > 0) || null;
}

function livingPlagueUnits() {
  return game.settlers.filter(s => s.plagueUnit && s.hp > 0);
}

function updateReviveHighlights() {
  const p = game.plague, hero = livingHero();
  for (const corpse of game.corpses) {
    corpse.plagueInReviveRange = false;
    corpse.plagueWillRaise = false;
  }
  if (!game.plagueMode || !p || !hero) return;
  const corpses = game.corpses
    .filter(c => !c.pet && Math.hypot(c.x - hero.x, c.y - hero.y) <= p.reviveRange)
    .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y));
  for (const corpse of corpses) corpse.plagueInReviveRange = true;
  if (p.reviveTimer > 0) return;
  let room = p.maxSquad - livingPlagueUnits().length, selected = 0;
  for (const corpse of corpses) {
    if (room <= 0 || selected >= p.raisesPerCast) break;
    const cost = Math.ceil((corpse.big ? RAISE_COST.big : RAISE_COST.normal) * p.raiseCostFactor);
    if (p.energy < cost) continue;
    corpse.plagueWillRaise = true;
    room--;
    selected++;
  }
}

function reviveNearby() {
  const p = game.plague;
  const hero = livingHero();
  if (!p || !hero) return;
  if (p.reviveTimer > 0) { showNotification(t('plague.cooldown', { seconds: p.reviveTimer.toFixed(1) }), true); return; }
  const room = p.maxSquad - livingPlagueUnits().length;
  if (room <= 0) { showNotification(t('plague.squadFull'), true); return; }
  const corpses = game.corpses.filter(c => !c.pet && Math.hypot(c.x - hero.x, c.y - hero.y) <= p.reviveRange)
    .sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y));
  let raised = 0;
  for (const corpse of corpses) {
    if (raised >= Math.min(p.raisesPerCast, room)) break;
    const cost = Math.ceil((corpse.big ? RAISE_COST.big : RAISE_COST.normal) * p.raiseCostFactor);
    if (p.energy < cost) continue;
    const kind = corpse.big ? 'big_zombie' : 'zombie';
    const unit = createSettler(kind, nextPlagueUnitId++, corpse.x, corpse.y, {
      plagueUnit: true, masterId: hero.id, weapon: corpse.weapon || 'fist', tool: 'none',
      armor: corpse.armor || null, shield: !!corpse.shield, helmet: !!corpse.helmet,
      look: corpse.look || undefined
    });
    unit.weapon = corpse.weapon || 'fist';
    if (unit.armor) {
      const armor = Object.values(GAME_CONFIG.gear).find(g => g.armorKind === unit.armor);
      if (armor) { unit.maxHp += armor.hpBonus; unit.hp += armor.hpBonus; }
    }
    if (isRangedWeapon(unit.weapon)) {
      unit.role = 'archer'; unit.quiver = true; unit.arrows = 12; unit.quiverCapacity = 12;
    } else unit.role = unit.weapon === 'fist' ? 'worker' : 'soldier';
    if (unit.shield && !canUseShield(unit)) unit.shield = false;
    unit.maxHp += p.minionHp;
    unit.hp += p.minionHp;
    unit.speed = GAME_CONFIG.settlerTypes.zombie.speed * p.speedFactor; // (#404: a big one as fast: the squad keeps with the hero)
    game.settlers.push(unit);
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
    playSound('raise', corpse); // (#404)
    p.energy -= cost;
    raised++;
  }
  p.reviveTimer = p.reviveCooldown;
  showNotification(raised ? t('plague.raised', { count: raised }) : t('plague.noCorpseOrEnergy'), !raised);
  updatePlagueHud();
}

function drawOffer() {
  const panel = document.getElementById('plague-card-offer');
  const p = game.plague;
  if (!p) return;
  panel.hidden = false;
  panel.innerHTML = `<h2>${t('plague.cardsTitle')}</h2><div class="plague-card-grid"></div>`;
  const grid = panel.querySelector('.plague-card-grid');
  if (!grid) throw new Error('The plague upgrade card grid is missing');
  for (const id of p.offer || []) {
    const def = CARD_DEFS[id], button = document.createElement('button');
    button.className = 'plague-upgrade-card';
    button.innerHTML = `<b>${t(def.name)}</b><span>${t(def.desc)}</span>`;
    onTap(button, () => pickUpgrade(id));
    grid.appendChild(button);
  }
}

function pickUpgrade(id) {
  const p = game.plague, def = CARD_DEFS[id];
  if (!p?.offer?.includes(id) || !def) return;
  def.apply(p);
  p.upgrades[id] = (p.upgrades[id] || 0) + 1;
  p.killsTowardUpgrade = 0;
  p.nextUpgradeKills += 1;
  p.offer = null;
  document.getElementById('plague-card-offer').hidden = true;
  updatePlagueHud();
  drawUpgradeList();
}

function drawUpgradeList() {
  const list = document.getElementById('plague-upgrades-list');
  const plague = game.plague;
  const upgrades = plague?.upgrades;
  if (!list || !plague || !upgrades) return;
  drawCharacterStats(plague);
  list.replaceChildren();
  for (const [id, def] of Object.entries(CARD_DEFS)) {
    const count = upgrades[id] || 0;
    const item = document.createElement('article');
    item.className = `plague-upgrade-entry${count ? ' acquired' : ''}`;
    const name = document.createElement('b');
    name.textContent = t(def.name);
    const level = document.createElement('span');
    level.textContent = count
      ? t('plague.upgradeLevel', { count })
      : t('plague.upgradeNotUnlocked');
    const description = document.createElement('p');
    description.textContent = t(def.desc);
    item.append(name, level, description);
    list.appendChild(item);
  }
}

// (#404) Each of the Necromancer's numbers as it began and as it is now
function drawCharacterStats(plague) {
  const panel = document.getElementById('plague-character-stats');
  if (!panel) return;
  const base = newPlagueState(), zombie = GAME_CONFIG.settlerTypes.zombie, big = GAME_CONFIG.settlerTypes.big_zombie;
  const tiles = n => `${n / TILE_SIZE} ${t('plague.stats.tiles')}`, perSecond = n => `${+n.toFixed(2)} ${t('plague.stats.perSecond')}`;
  const cost = factor => `${Math.ceil(RAISE_COST.normal * factor)} / ${Math.ceil(RAISE_COST.big * factor)}`;
  /** @type {[string, string, string][]} */
  const stats = [
    ['plague.stats.health', String(base.heroMaxHp), String(plague.heroMaxHp)],
    ['plague.stats.speed', zombie.speed.toFixed(2), (zombie.speed * plague.speedFactor).toFixed(2)],
    ['plague.stats.energy', String(base.maxEnergy), String(plague.maxEnergy)],
    ['plague.stats.energyRegen', perSecond(base.energyRegen), perSecond(plague.energyRegen)],
    ['plague.stats.raiseCost', cost(base.raiseCostFactor), cost(plague.raiseCostFactor)],
    ['plague.stats.raiseCooldown', `${base.reviveCooldown} ${t('plague.stats.seconds')}`, `${+plague.reviveCooldown.toFixed(2)} ${t('plague.stats.seconds')}`],
    ['plague.stats.raisesPerCast', String(base.raisesPerCast), String(plague.raisesPerCast)],
    ['plague.stats.reviveRange', tiles(base.reviveRange), tiles(plague.reviveRange)],
    ['plague.stats.squadCapacity', String(base.maxSquad), String(plague.maxSquad)],
    ['plague.stats.minionHealth', `${zombie.hp} / ${big.hp}`, `${zombie.hp + plague.minionHp} / ${big.hp + plague.minionHp}`],
    ['plague.stats.commandRange', tiles(base.commandRange), tiles(plague.commandRange)],
    ['plague.stats.healRate', perSecond(base.healStrength), perSecond(plague.healStrength)],
    ['plague.stats.healTargets', String(base.healTargets), String(plague.healTargets)],
    ['plague.stats.healRange', tiles(base.healRange), tiles(plague.healRange)]
  ];
  panel.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = t('plague.stats.title');
  panel.appendChild(heading);
  for (const [label, from, now] of stats) {
    const row = document.createElement('div');
    row.className = 'plague-character-stat';
    const name = document.createElement('span');
    name.textContent = t(label);
    const amount = document.createElement('b');
    amount.textContent = `${from} → ${now}`;
    if (now !== from) amount.classList.add('raised');
    row.append(name, amount);
    panel.appendChild(row);
  }
}

function offerUpgrades() {
  const ids = Object.keys(CARD_DEFS);
  const offer = [];
  while (offer.length < 3) {
    const id = ids[Math.floor(rand() * ids.length)];
    if (!offer.includes(id)) offer.push(id);
  }
  game.plague.offer = offer;
  drawOffer();
}

// (#404) Where a band comes in, side by side along an edge, and the spot on the far edge it heads for: on ground
// it can stand on (not water, rock or a tree) and no nearer the hero than SPAWN_CLEAR. The sides take turns;
// another side, then another spot, when one has no room. Null when none has
const SPAWN_CLEAR = 10 * TILE_SIZE;
const BAND_ROUTES = [
  { horizontal: true, forward: true },
  { horizontal: false, forward: true },
  { horizontal: true, forward: false },
  { horizontal: false, forward: false }
];
const standable = point => {
  const g = getGridPos(point.x, point.y);
  return g.gx >= 0 && g.gy >= 0 && g.gx < game.COLS && g.gy < game.ROWS && !isTileBlockedForEnemyStrict(g.gx, g.gy);
};
function bandRoute(groupId, count) {
  const hero = livingHero(), edge = TILE_SIZE / 2;
  for (let attempt = 0; attempt < 40; attempt++) {
    const { horizontal, forward } = BAND_ROUTES[(groupId - 1 + Math.floor(attempt / 10)) % BAND_ROUTES.length];
    const side = Math.floor(rand() * (horizontal ? game.ROWS : game.COLS));
    const start = horizontal
      ? { x: forward ? edge : game.WORLD_WIDTH - edge, y: side * TILE_SIZE + TILE_SIZE / 2 }
      : { x: side * TILE_SIZE + TILE_SIZE / 2, y: forward ? edge : game.WORLD_HEIGHT - edge };
    const goal = horizontal
      ? { x: forward ? game.WORLD_WIDTH - edge : edge, y: start.y }
      : { x: start.x, y: forward ? game.WORLD_HEIGHT - edge : edge };
    const spots = Array.from({ length: count }, (_, i) =>
      ({ x: start.x + (horizontal ? 0 : (i - 1) * 20), y: start.y + (horizontal ? (i - 1) * 20 : 0) }));
    if (!standable(goal) || !spots.every(standable)) continue;
    if (hero && spots.some(spot => Math.hypot(spot.x - hero.x, spot.y - hero.y) < SPAWN_CLEAR)) continue;
    return { spots, goal };
  }
  return null;
}

// (#404) The player's level: one, and one more for each card taken
const playerLevel = p => 1 + Object.values(p.upgrades).reduce((total, count) => total + count, 0);
// (the music's, #404)
export const plagueLevel = () => game.plague ? playerLevel(game.plague) : 1;
// A band's level: the player's, give or take up to 3, most often the same (as Endless's wave of that number)
const LEVEL_SPREAD = [[-3, 1], [-2, 2], [-1, 4], [0, 6], [1, 4], [2, 2], [3, 1]];
function bandLevel(level) {
  let roll = rand() * LEVEL_SPREAD.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [offset, weight] of LEVEL_SPREAD) {
    roll -= weight;
    if (roll < 0) return Math.max(1, level + offset);
  }
  return level;
}

// A band of humans crossing the map: 3 to 5 of them to begin with, the most of them one more for every 3 levels
// (10 at most); each picked and armed as Endless's wave of the band's level is (its kinds and gear by their
// chances then), no crossbowmen
function spawnGroup() {
  const p = game.plague, groupId = ++p.groupId, level = playerLevel(p);
  const count = Math.min(10, 3 + Math.floor(rand() * (3 + Math.floor((level - 1) / 3))));
  const route = bandRoute(groupId, count);
  if (!route) return; // (no edge with room for it, away from the hero: the next time)
  const { spots, goal } = route;
  const band = bandLevel(level);
  const pool = getWavePresetPool('humans', band).filter(option => option.preset.weapon !== 'crossbow');
  const group = { id: groupId, size: 0, killed: 0, escaped: 0, resolved: false };
  p.groups.push(group);
  for (const spot of spots) {
    const picked = pickWavePreset(pool);
    const def = picked && GAME_CONFIG.enemies[picked.enemyKey];
    if (!def) continue;
    const enemy = createConfiguredEnemy(spot, def.id);
    if (!enemy) continue;
    dressForWave(enemy, def, band);
    enemy.plagueGroupId = groupId;
    enemy.plagueGoal = { ...goal };
    group.size++;
    game.enemies.push(enemy);
  }
  if (!group.size) p.groups.splice(p.groups.indexOf(group), 1);
}

function updateGroups() {
  const p = game.plague;
  for (const group of p.groups) {
    if (group.resolved || group.killed + group.escaped < group.size) continue;
    group.resolved = true;
    if (group.killed === group.size) {
      p.groupsCleared++;
    }
  }
  p.groups = p.groups.filter(group => !group.resolved);
}

function tickCemeteryCorpses(dt) {
  for (const cemetery of game.buildings) {
    if (!cemetery.plagueCemetery || cemetery.hp <= 0) continue;
    cemetery.plagueCorpseTimer = (cemetery.plagueCorpseTimer ?? CEMETERY_CORPSE_INTERVAL) - dt;
    if (cemetery.plagueCorpseTimer > 0) continue;
    cemetery.plagueCorpseTimer = CEMETERY_CORPSE_INTERVAL;
    const corpseCount = game.corpses.filter(corpse => corpse.plagueCemeteryId === cemetery.plagueCemeteryId).length;
    if (corpseCount >= CEMETERY_CORPSE_LIMIT) continue;
    const angle = rand() * Math.PI * 2;
    const distance = 20 + rand() * 8;
    game.corpses.push({
      x: cemetery.x + Math.cos(angle) * distance,
      y: cemetery.y + Math.sin(angle) * distance,
      radius: 11, side: 'settler', kind: 'zombie', age: 0, big: false, wormsTaken: false,
      type: 'zombie', weapon: rand() < 0.5 ? 'club' : 'sword', tool: 'none', look: null,
      plagueCemeteryCorpse: true, plagueCemeteryId: cemetery.plagueCemeteryId
    });
  }
}

export function tickPlague(dt) {
  const p = game.plague;
  if (!game.plagueMode || !p) return;
  const hero = livingHero();
  if (hero) {
    const follow = 1 - Math.exp(-dt / 0.2);
    camera.x += (hero.x - camera.x) * follow;
    camera.y += (hero.y - camera.y) * follow;
    clampCamera();
  }
  p.energy = Math.min(p.maxEnergy, p.energy + p.energyRegen * dt);
  p.reviveTimer = Math.max(0, p.reviveTimer - dt);
  p.elapsedTime += dt;
  updatePlagueHud();
  if (p.offer) return;
  tickCemeteryCorpses(dt);
  p.groupTimer -= dt;
  if (p.groupTimer <= 0) {
    for (let i = rollRange(p.bandCount); i > 0; i--) spawnGroup();
    p.groupTimer = rollRange(p.bandInterval);
  }
  updateGroups();
}

export function plagueEnemyTarget(enemy) {
  const p = game.plague;
  if (!p) return null;
  const group = p.groups.find(candidate => candidate.id === enemy.plagueGroupId);
  const targets = game.settlers.filter(unit => unit.hp > 0 && (unit.plagueHero || unit.plagueUnit));
  if (group?.aggroTarget && !targets.includes(group.aggroTarget)) {
    group.aggroTarget = null;
    group.aggroUntil = 0;
  }
  if (group?.aggroTarget && p.elapsedTime < group.aggroUntil) return group.aggroTarget;
  if (group?.aggroTarget) {
    group.aggroTarget = null;
    group.aggroSuppressed = true;
  }
  if (group?.aggroSuppressed) {
    const members = game.enemies.filter(member => member.plagueGroupId === group.id);
    const allTargetsFar = members.every(member => targets.every(target =>
      Math.hypot(target.x - member.x, target.y - member.y) >= ENEMY_AGGRO_RESET_RANGE));
    if (allTargetsFar) group.aggroSuppressed = false;
    else return null;
  }
  let nearest = null, best = ENEMY_AGGRO_RANGE;
  for (const unit of targets) {
    const distance = Math.hypot(unit.x - enemy.x, unit.y - enemy.y);
    if (distance < best) { best = distance; nearest = unit; }
  }
  if (nearest && group) {
    group.aggroTarget = nearest;
    group.aggroUntil = p.elapsedTime + ENEMY_CHASE_SECONDS;
  }
  return nearest;
}

export function updatePlagueHud() {
  if (!game.plagueMode || !game.plague) return;
  const p = game.plague;
  updateReviveHighlights();
  const energy = document.getElementById('plague-energy'), squad = document.getElementById('plague-squad');
  const experience = document.getElementById('plague-experience');
  const energyText = `${Math.floor(p.energy)}/${p.maxEnergy}`, squadText = `${livingPlagueUnits().length}/${p.maxSquad}`;
  const experienceText = `${p.killsTowardUpgrade}/${p.nextUpgradeKills}`;
  if (energy.textContent !== energyText) energy.textContent = energyText;
  if (squad.textContent !== squadText) squad.textContent = squadText;
  if (experience.textContent !== experienceText) experience.textContent = experienceText;
  // (#404) the level next to what's left to the next card (three icons of their own: energy, the squad, the level)
  const level = document.getElementById('plague-level'), levelText = t('plague.level', { n: playerLevel(p) });
  if (level && level.textContent !== levelText) level.textContent = levelText;
  const revive = document.getElementById('plague-revive');
  const label = document.getElementById('plague-revive-label');
  const progress = document.getElementById('plague-revive-progress');
  const cooling = p.reviveTimer > 0;
  revive.disabled = cooling;
  label.textContent = cooling
    ? t('plague.cooldown', { seconds: Math.max(0.1, p.reviveTimer).toFixed(1) })
    : t('plague.revive');
  progress.style.width = `${cooling ? (1 - p.reviveTimer / p.reviveCooldown) * 100 : 0}%`;
}

export function initPlagueRules() {
  onTap(document.getElementById('mode-plague'), () => showMenuScreen('plague'));
  onTap(document.getElementById('plague-play'), startPlagueGame);
  const plagueSettings = readPlagueSettings();
  showSpawnRanges(plagueSettings);
  game.plagueSettings = plagueSettings;
  document.querySelectorAll('[data-plague-range]').forEach(box => {
    box.querySelectorAll('[data-plague-range-mode]').forEach(button => onTap(/** @type {HTMLElement} */ (button), () => {
      box.querySelectorAll('[data-plague-range-mode]').forEach(option => option.classList.toggle('active', option === button));
      savePlagueSettings();
    }));
    box.querySelectorAll('input').forEach(input => input.addEventListener('change', savePlagueSettings));
  });
  document.querySelectorAll('#plague-difficulty-options [data-plague-difficulty]').forEach(button => {
    button.classList.toggle('active', button.getAttribute('data-plague-difficulty') === plagueSettings.difficulty);
    onTap(button, () => {
      document.querySelectorAll('#plague-difficulty-options [data-plague-difficulty]').forEach(option =>
        option.classList.toggle('active', option === button));
      savePlagueSettings();
    });
  });
  onTap(document.getElementById('plague-revive'), reviveNearby);
  onTap(document.getElementById('plague-upgrades-toggle'), () => {
    drawUpgradeList();
    setPaused(true);
    document.getElementById('pause-menu').hidden = true;
    document.getElementById('plague-upgrades-panel').hidden = false;
  });
  onTap(document.getElementById('plague-upgrades-close'), () => {
    document.getElementById('plague-upgrades-panel').hidden = true;
    setPaused(false);
  });
}

export function plagueIsDefeated() {
  const hero = livingHero();
  return game.plagueMode && (!hero || hero.hp <= 0);
}

export function plagueCardPending() {
  return !!(game.plagueMode && game.plague?.offer);
}

export function applyPlagueCardOffer() {
  if (game.plagueMode && game.plague?.offer) drawOffer();
}

export function exitPlagueMode() {
  if (endlessFactions) { sides.player.faction = endlessFactions.player; sides.enemy.faction = endlessFactions.enemy; endlessFactions = null; }
  game.plagueMode = false;
  game.plague = null;
  setBorderMargin(2);
  delete document.body.dataset.plague;
  document.getElementById('plague-card-offer').hidden = true;
}

export function getPlaguePlayerFaction() {
  return game.plagueMode ? GAME_CONFIG.factions.undead : getPlayerFaction();
}

export function markEnemyKillForPlague(enemy) {
  const p = game.plague;
  if (!game.plagueMode || !p) return;
  const group = p.groups.find(candidate => candidate.id === enemy.plagueGroupId);
  if (group) group.killed++;
  p.enemiesKilled++;
  p.killsTowardUpgrade++;
  if (!p.offer && p.killsTowardUpgrade >= p.nextUpgradeKills) offerUpgrades();
}

export function markPlagueEnemyEscaped(enemy) {
  const group = game.plague?.groups.find(candidate => candidate.id === enemy.plagueGroupId);
  if (group) group.escaped++;
}
