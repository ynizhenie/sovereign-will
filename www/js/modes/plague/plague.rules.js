// Plague: a possessed necromancer raises nearby corpses, commands the dead, and survives crossing enemy groups.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, loadData, onTap, saveData, setZoom, t } from '../../engine/platform/index.js';
import { TILE_SIZE, applySeedFromUI, createWorldSeed, game, rand, setBorderMargin, townHall } from '../../engine/world/index.js';
import { createSettler } from '../../domains/colony/settlers/index.js';
import { createConfiguredEnemy } from '../../domains/conflict/waves/index.js';
import { isTileOccupied } from '../../domains/economy/building/index.js';
import { canUseShield, isRangedWeapon } from '../../domains/colony/equipment/index.js';
import { getPlayerFaction } from '../../domains/factions/index.js';
import { showNotification } from '../../ui/index.js';
import { resetGame, resetGameSteps, setPaused } from '../../app/index.js';
import { mainMenu, showMenuScreen } from '../menu/index.js';
import { runLoading } from '../../ui/index.js';

const STARTING_ENERGY = 15;
const STARTING_MAX_ENERGY = 30;
const STARTING_SQUAD = 8;
const BASE_HERO_HEALTH = 180;
const RAISE_COST = { normal: 5, big: 10 };
const DEFAULT_GROUP_INTERVAL = 10;
const MIN_GROUP_INTERVAL = 3;
const MAX_GROUP_INTERVAL = 60;
const DEFAULT_GROUPS_PER_SPAWN = 1;
const MIN_GROUPS_PER_SPAWN = 1;
const MAX_GROUPS_PER_SPAWN = 10;
const CROSSBOW_UNLOCK_UPGRADES = 3;
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

function readPlagueSettings() {
  const saved = loadData('plagueChoices', null);
  return {
    difficulty: saved?.difficulty === 'hard' ? 'hard' : 'normal',
    joystickEnabled: saved?.joystickEnabled === true,
    groupInterval: Number.isFinite(Number(saved?.groupInterval))
      ? Math.max(MIN_GROUP_INTERVAL, Math.min(MAX_GROUP_INTERVAL, Math.round(Number(saved.groupInterval))))
      : DEFAULT_GROUP_INTERVAL,
    groupsPerSpawn: Number.isFinite(Number(saved?.groupsPerSpawn))
      ? Math.max(MIN_GROUPS_PER_SPAWN, Math.min(MAX_GROUPS_PER_SPAWN, Math.round(Number(saved.groupsPerSpawn))))
      : DEFAULT_GROUPS_PER_SPAWN
  };
}

function savePlagueSettings() {
  const intervalInput = /** @type {HTMLInputElement} */ (document.getElementById('plague-group-interval'));
  const groupsInput = /** @type {HTMLInputElement} */ (document.getElementById('plague-groups-per-spawn'));
  const joystickInput = /** @type {HTMLInputElement} */ (document.getElementById('plague-joystick-enabled'));
  const groupsValue = Math.round(Number(groupsInput.value));
  const settings = {
    difficulty: document.querySelector('#plague-difficulty-options [data-plague-difficulty].active')?.getAttribute('data-plague-difficulty') === 'hard' ? 'hard' : 'normal',
    joystickEnabled: joystickInput.checked,
    groupInterval: Math.max(MIN_GROUP_INTERVAL, Math.min(MAX_GROUP_INTERVAL, Math.round(Number(intervalInput.value) || DEFAULT_GROUP_INTERVAL))),
    groupsPerSpawn: Number.isFinite(groupsValue)
      ? Math.max(MIN_GROUPS_PER_SPAWN, Math.min(MAX_GROUPS_PER_SPAWN, groupsValue))
      : DEFAULT_GROUPS_PER_SPAWN
  };
  intervalInput.value = String(settings.groupInterval);
  groupsInput.value = String(settings.groupsPerSpawn);
  applyPlagueJoystickSetting(settings.joystickEnabled);
  game.plagueSettings = settings;
  game.gameDifficulty = settings.difficulty;
  saveData('plagueChoices', settings);
}

const CARD_DEFS = {
  energy_capacity: { name: 'plague.card.energyCapacity', desc: 'plague.card.energyCapacityDesc', apply: p => { p.maxEnergy += 10; p.energy = Math.min(p.maxEnergy, p.energy + 10); } },
  energy_regen: { name: 'plague.card.energyRegen', desc: 'plague.card.energyRegenDesc', apply: p => { p.energyRegen += 0.1; } },
  raise_cost: { name: 'plague.card.raiseCost', desc: 'plague.card.raiseCostDesc', apply: p => { p.raiseCostFactor = Math.max(0.5, p.raiseCostFactor - 0.1); } },
  revive_cooldown: { name: 'plague.card.reviveCooldown', desc: 'plague.card.reviveCooldownDesc', apply: p => { p.reviveCooldown = Math.max(0.3, p.reviveCooldown - 0.25); } },
  multi_raise: { name: 'plague.card.multiRaise', desc: 'plague.card.multiRaiseDesc', apply: p => { p.raisesPerCast++; } },
  squad_size: { name: 'plague.card.squadSize', desc: 'plague.card.squadSizeDesc', apply: p => { p.maxSquad += 3; } },
  revive_range: { name: 'plague.card.reviveRange', desc: 'plague.card.reviveRangeDesc', apply: p => { p.reviveRange += TILE_SIZE * 2; } },
  hero_health: { name: 'plague.card.heroHealth', desc: 'plague.card.heroHealthDesc', apply: p => { p.heroMaxHp += 20; const hero = game.settlers.find(s => s.plagueHero); if (hero) { hero.maxHp += 20; hero.hp += 20; } } },
  hero_damage: { name: 'plague.card.heroDamage', desc: 'plague.card.heroDamageDesc', apply: p => { p.heroDamageMultiplier += 0.25; const hero = game.settlers.find(s => s.plagueHero); if (hero) hero.damageMultiplier = p.heroDamageMultiplier; } },
  hero_speed: { name: 'plague.card.heroSpeed', desc: 'plague.card.heroSpeedDesc', apply: p => { p.heroSpeedMultiplier += 0.1; } },
  command_range: { name: 'plague.card.commandRange', desc: 'plague.card.commandRangeDesc', apply: p => { p.commandRange += TILE_SIZE * 2; } },
  minion_health: { name: 'plague.card.minionHealth', desc: 'plague.card.minionHealthDesc', apply: p => { p.minionHp += 15; for (const s of game.settlers) if (s.plagueUnit) { s.maxHp += 15; s.hp += 15; } } },
  minion_damage: { name: 'plague.card.minionDamage', desc: 'plague.card.minionDamageDesc', apply: p => { p.minionDamage += 0.15; } },
  minion_speed: { name: 'plague.card.minionSpeed', desc: 'plague.card.minionSpeedDesc', apply: p => {
    const previousFactor = p.minionSpeedFactor;
    p.minionSpeedFactor += 0.1;
    for (const unit of game.settlers) if (unit.plagueUnit) unit.speed *= p.minionSpeedFactor / previousFactor;
  } },
  heal_strength: { name: 'plague.card.healStrength', desc: 'plague.card.healStrengthDesc', apply: p => { p.healStrength += 1.5; } },
  heal_targets: { name: 'plague.card.healTargets', desc: 'plague.card.healTargetsDesc', apply: p => { p.healTargets++; } },
  heal_range: { name: 'plague.card.healRange', desc: 'plague.card.healRangeDesc', apply: p => { p.healRange += TILE_SIZE; } }
};

const newPlagueState = () => ({
  groupInterval: game.plagueSettings?.groupInterval || DEFAULT_GROUP_INTERVAL,
  groupsPerSpawn: game.plagueSettings?.groupsPerSpawn || DEFAULT_GROUPS_PER_SPAWN,
  energy: STARTING_MAX_ENERGY, maxEnergy: STARTING_MAX_ENERGY, energyRegen: 0.2,
  maxSquad: STARTING_SQUAD, raisesPerCast: 1, raiseCostFactor: 1, reviveRange: REVIVE_RANGE,
  reviveCooldown: 1.5, reviveTimer: 0, groupTimer: game.plagueSettings?.groupInterval || DEFAULT_GROUP_INTERVAL,
  groupId: 0, groups: [], groupsCleared: 0, elapsedTime: 0,
  enemiesKilled: 0, killsTowardUpgrade: 0, nextUpgradeKills: 5,
  offer: null, upgrades: {}, commandRange: TILE_SIZE * 10, heroMaxHp: BASE_HERO_HEALTH, heroDamageMultiplier: 2,
  heroSpeedMultiplier: 1, minionHp: 0, minionDamage: 0, minionSpeedFactor: 1,
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
    maxHp: game.plague.heroMaxHp, hp: game.plague.heroMaxHp, damageMultiplier: game.plague.heroDamageMultiplier
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

export async function startPlagueGame() {
  if (game.loading) return;
  savePlagueSettings();
  applySeedFromUI();
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
    unit.speed *= p.minionSpeedFactor;
    game.settlers.push(unit);
    game.corpses.splice(game.corpses.indexOf(corpse), 1);
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

function drawCharacterStats(plague) {
  const panel = document.getElementById('plague-character-stats');
  if (!panel) return;
  const hero = game.settlers.find(unit => unit.plagueHero);
  const baseDamage = GAME_CONFIG.tools.necro_staff.combatDamage;
  const heroDamage = Math.round(baseDamage * (hero?.damageMultiplier ?? plague.heroDamageMultiplier));
  const minionDamageBonus = Math.round(plague.minionDamage * 100);
  const stats = [
    ['plague.stats.health', `${BASE_HERO_HEALTH} → ${hero?.maxHp ?? plague.heroMaxHp}; ${Math.ceil(hero?.hp ?? plague.heroMaxHp)} ${t('plague.stats.current')}`],
    ['plague.stats.damage', `${heroDamage} (${t('plague.stats.damageMultiplier')})`],
    ['plague.stats.speed', `${GAME_CONFIG.settlerTypes.zombie.speed.toFixed(2)} × ${plague.heroSpeedMultiplier.toFixed(1)}`],
    ['plague.stats.energy', `${plague.maxEnergy}; +${plague.energyRegen.toFixed(1)} ${t('plague.stats.perSecond')}`],
    ['plague.stats.raiseCost', `${Math.ceil(RAISE_COST.normal * plague.raiseCostFactor)} / ${Math.ceil(RAISE_COST.big * plague.raiseCostFactor)}`],
    ['plague.stats.raiseCooldown', `${plague.reviveCooldown.toFixed(2)} ${t('plague.stats.seconds')}`],
    ['plague.stats.raisesPerCast', String(plague.raisesPerCast)],
    ['plague.stats.reviveRange', `${plague.reviveRange / TILE_SIZE} ${t('plague.stats.tiles')}`],
    ['plague.stats.squadCapacity', String(plague.maxSquad)],
    ['plague.stats.minionHealth', `${GAME_CONFIG.settlerTypes.zombie.hp + plague.minionHp} / ${GAME_CONFIG.settlerTypes.big_zombie.hp + plague.minionHp}`],
    ['plague.stats.minionDamage', `+${minionDamageBonus}%`],
    ['plague.stats.minionSpeed', `×${plague.minionSpeedFactor.toFixed(1)}`],
    ['plague.stats.commandRange', `${plague.commandRange / TILE_SIZE} ${t('plague.stats.tiles')}`],
    ['plague.stats.healRate', `${plague.healStrength} ${t('plague.stats.perSecond')}`],
    ['plague.stats.healTargets', String(plague.healTargets)],
    ['plague.stats.healRange', `${plague.healRange / TILE_SIZE} ${t('plague.stats.tiles')}`]
  ];
  panel.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = t('plague.stats.title');
  panel.appendChild(heading);
  for (const [label, value] of stats) {
    const row = document.createElement('div');
    row.className = 'plague-character-stat';
    const name = document.createElement('span');
    name.textContent = t(label);
    const amount = document.createElement('b');
    amount.textContent = value;
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

function spawnGroup() {
  const p = game.plague, groupId = ++p.groupId;
  const upgrades = Object.values(p.upgrades).reduce((total, count) => total + count, 0);
  const count = Math.min(10, 3 + Math.floor(rand() * 3) + Math.floor(upgrades / 3));
  const routes = [
    { horizontal: true, forward: true },
    { horizontal: false, forward: true },
    { horizontal: true, forward: false },
    { horizontal: false, forward: false }
  ];
  const { horizontal, forward } = routes[(groupId - 1) % routes.length];
  const side = Math.floor(rand() * (horizontal ? game.ROWS : game.COLS));
  const edge = TILE_SIZE / 2;
  const start = horizontal
    ? { x: forward ? edge : game.WORLD_WIDTH - edge, y: side * TILE_SIZE + TILE_SIZE / 2 }
    : { x: side * TILE_SIZE + TILE_SIZE / 2, y: forward ? edge : game.WORLD_HEIGHT - edge };
  const goal = horizontal
    ? { x: forward ? game.WORLD_WIDTH - edge : edge, y: start.y }
    : { x: start.x, y: forward ? game.WORLD_HEIGHT - edge : edge };
  const group = { id: groupId, size: count, killed: 0, escaped: 0, resolved: false };
  p.groups.push(group);
  const types = ['raider_club', 'raider', 'raider_archer', 'brute', 'raider_medic'];
  const tier = Math.floor(upgrades / 2);
  for (let i = 0; i < count; i++) {
    const enemy = createConfiguredEnemy({ x: start.x + (horizontal ? 0 : (i - 1) * 20), y: start.y + (horizontal ? (i - 1) * 20 : 0) }, types[Math.floor(rand() * types.length)]);
    if (enemy.enemyKey === 'raider' && rand() < 0.5) enemy.plagueWeapon = 'iron_sword';
    if (enemy.enemyKey === 'brute' && rand() < 0.5) enemy.plagueWeapon = 'iron_spear';
    if (upgrades >= CROSSBOW_UNLOCK_UPGRADES && enemy.enemyKey === 'raider_archer' && rand() < 0.5) {
      enemy.plagueWeapon = 'crossbow';
    }
    enemy.plagueGroupId = groupId;
    enemy.plagueGoal = { ...goal };
    enemy.plagueTier = tier;
    enemy.hp = Math.round(enemy.hp * (1 + tier * 0.1));
    enemy.maxHp = enemy.hp;
    enemy.damage = Math.round(enemy.damage * (1 + tier * 0.08));
    game.enemies.push(enemy);
  }
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
    for (let i = 0; i < p.groupsPerSpawn; i++) spawnGroup();
    p.groupTimer = p.groupInterval;
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
  initPlagueJoystick();
  const plagueSettings = readPlagueSettings();
  const intervalInput = /** @type {HTMLInputElement} */ (document.getElementById('plague-group-interval'));
  const groupsInput = /** @type {HTMLInputElement} */ (document.getElementById('plague-groups-per-spawn'));
  const joystickInput = /** @type {HTMLInputElement} */ (document.getElementById('plague-joystick-enabled'));
  intervalInput.value = String(plagueSettings.groupInterval);
  groupsInput.value = String(plagueSettings.groupsPerSpawn);
  joystickInput.checked = plagueSettings.joystickEnabled;
  game.plagueSettings = plagueSettings;
  applyPlagueJoystickSetting(plagueSettings.joystickEnabled);
  document.querySelectorAll('#plague-difficulty-options [data-plague-difficulty]').forEach(button => {
    button.classList.toggle('active', button.getAttribute('data-plague-difficulty') === plagueSettings.difficulty);
    onTap(button, () => {
      document.querySelectorAll('#plague-difficulty-options [data-plague-difficulty]').forEach(option =>
        option.classList.toggle('active', option === button));
      savePlagueSettings();
    });
  });
  intervalInput.addEventListener('change', savePlagueSettings);
  groupsInput.addEventListener('change', savePlagueSettings);
  joystickInput.addEventListener('change', savePlagueSettings);
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

function initPlagueJoystick() {
  const joystick = /** @type {HTMLElement} */ (document.getElementById('plague-joystick'));
  const knob = /** @type {HTMLElement} */ (document.getElementById('plague-joystick-knob'));
  let pointerId = null;

  const release = () => {
    pointerId = null;
    game.plagueJoystick = null;
    knob.style.transform = '';
  };
  const update = (clientX, clientY) => {
    const rect = joystick.getBoundingClientRect();
    const radius = Math.max(1, (rect.width - knob.offsetWidth) / 2);
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.min(radius, Math.hypot(dx, dy));
    const x = Math.hypot(dx, dy) ? dx / Math.hypot(dx, dy) * distance : 0;
    const y = Math.hypot(dx, dy) ? dy / Math.hypot(dx, dy) * distance : 0;
    knob.style.transform = `translate(${x}px, ${y}px)`;
    game.plagueJoystick = { x: x / radius, y: y / radius };
  };

  joystick.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    joystick.setPointerCapture(pointerId);
    update(event.clientX, event.clientY);
  });
  joystick.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    update(event.clientX, event.clientY);
  });
  joystick.addEventListener('pointerup', event => {
    if (event.pointerId === pointerId) release();
  });
  joystick.addEventListener('pointercancel', release);
  joystick.addEventListener('lostpointercapture', release);
}

function applyPlagueJoystickSetting(enabled) {
  const joystick = /** @type {HTMLElement} */ (document.getElementById('plague-joystick'));
  joystick.hidden = !enabled;
  document.body.dataset.plagueJoystick = enabled ? 'yes' : 'no';
  if (!enabled) {
    game.plagueJoystick = null;
    document.getElementById('plague-joystick-knob').style.transform = '';
  }
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
  game.plagueMode = false;
  game.plague = null;
  game.plagueJoystick = null;
  setBorderMargin(2);
  delete document.body.dataset.plague;
  delete document.body.dataset.plagueJoystick;
  document.getElementById('plague-joystick').hidden = true;
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
