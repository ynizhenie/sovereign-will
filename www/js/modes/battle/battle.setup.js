// Battle mode: an empty field split down the middle. The player places units of any faction:
// on the green side (left) they're theirs, on the red side (right) enemies (#326: any unit on either), buildings
// anywhere; presses Fight, and
// they battle it out; the winner is shown and, a few seconds later, the same line-up comes back to adjust.
// A fight can be called off, and the player can possess one of theirs in it. Archers' arrows don't run
// out. Green units are settlers and red ones enemies, driven by the usual AI.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, loadData, saveData, setZoom } from '../../engine/platform/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, getGridPos, isBorderZone, newWorldEpoch, rand, resetTileIndex, townHall } from '../../engine/world/index.js';
import { canUseShield, isRangedWeapon, putOnGear } from '../../domains/colony/equipment/index.js';
import { createBuildingBlueprint, pickDummyVariant } from '../../domains/economy/building/index.js';
import { createConfiguredEnemy, getEnemyDef, presetEnemyKey } from '../../domains/conflict/waves/index.js';
import { setStandingWeather, timeOfPhase } from '../../domains/world/index.js';
import { closeOverlays } from '../../ui/index.js';
import { createSettler, getUnitProgressionTrack, newLook, newPetLook } from '../../domains/colony/settlers/index.js';
import { exitToMainMenu, resetGame } from '../../app/index.js';
import { invalidateAllPaths } from '../../engine/movement/index.js';
import { bigPresetOf, getBattlePreset } from './battle.roster.js';
import { renderBattlePanel, resetBattleSecretTapCount } from './battle.panel.js';
import { getUnitExperienceForLevel, setUnitExperience } from '../../domains/colony/settlers/index.js';

export const BATTLE_RESULT_SECONDS = 4;

const BATTLE_SIZE_PRESETS = {
  small: { cols: 20, rows: 13 },
  medium: { cols: 40, rows: 26 },
  large: { cols: 80, rows: 52 }
};
const BATTLE_SIZE_MIN = { cols: 20, rows: 13 };
const BATTLE_SIZE_MAX = 128;

/** @type {{ phase: string, category: string, preset: string, building: string, armor: boolean | string,
 *   shield: boolean, helmet: boolean | string, big: boolean, banner: boolean, torch: boolean, field: string, fieldSize: string,
 *   fieldCols: number, fieldRows: number, time: string, weather: string, level: number,
 *   lineup: { presetId?: string, building?: string, variant?: string, x: number, y: number, level?: number, experience?: number, progression?: Object<string, number>, armor?: boolean | string, shield?: boolean, helmet?: boolean | string, banner?: boolean, torch?: boolean,
 *   look?: { female: boolean, style: number, shade: number, coat?: number }, id?: number }[],
 *   winner: string | null, resultTimer: number, nextId: number, rifleUnlocked: boolean, savedMapSettings: { cols: number, rows: number } | null,
 *   difficulty: string, savedDifficulty: string | null, fieldHighlight: string }} */
export const battle = {
  phase: 'off',       // off / setup / fight / result
  category: 'units',  // the panel's category
  preset: 'humans:sword', // the unit preset the next tap places (BATTLE_PRESETS)
  building: 'wall_wood',
  armor: false,       // colony units placed next get armour / a shield (melee only)
  shield: false,
  big: false,         // (#326) the next unit placed is a big one (not a pet)
  level: 1,
  banner: false,      // (#279) the next unit placed gets a banner: a commander, only if the player gives one
  torch: false,       // (#326) the next unit placed gets a torch at its side: lit in its hand when it's dark
  helmet: false,      // (#326, 27.10, 27) the next unit placed gets a helmet (not a pet)
  field: 'glade',     // glade / desert / savanna / backrooms: what the battle is fought on
  fieldSize: 'medium',
  fieldCols: 40,
  fieldRows: 26,
  time: 'day',        // (#326) morning / day / evening / night: how it looks (it stands still; nobody sleeps by it)
  weather: 'clear',   // (#326) clear / rain / fog / storm, all through the fight
  lineup: [],         // { presetId, x, y, armor, shield, banner } or { building, x, y }: what's placed, kept between fights
  winner: null,       // green / red / draw
  resultTimer: 0,
  nextId: 1,
  rifleUnlocked: false,
  savedMapSettings: null,
  difficulty: 'normal', // (#255) GAME_CONFIG.difficulty key: the red units have a quarter less hp on Normal, the same as yours on Hard
  savedDifficulty: null, // the Endless choice, back when the battle's left
  fieldHighlight: 'classic' // classic green/red, chosen side colours, or none
};

const BATTLE_DEFAULTS = {
  category: 'units', preset: 'humans:sword', building: 'wall_wood',
  armor: false, shield: false, helmet: false, big: false, banner: false, torch: false, level: 1,
  field: 'glade', fieldSize: 'medium', fieldCols: 40, fieldRows: 26,
  time: 'day', weather: 'clear', difficulty: 'normal', fieldHighlight: 'classic'
};

let lastNonSecretBattleField = 'glade';
let backroomsMazeLayout = /** @type {string[]} */ ([]);

function normalizeBattleSize(size, cols, rows) {
  if (Object.hasOwn(BATTLE_SIZE_PRESETS, size)) return { size, ...BATTLE_SIZE_PRESETS[size] };
  if (size !== 'custom') return { size: 'small', ...BATTLE_SIZE_PRESETS.small };
  const width = Number(cols), height = Number(rows);
  return {
    size,
    cols: Number.isFinite(width) ? Math.max(BATTLE_SIZE_MIN.cols, Math.min(BATTLE_SIZE_MAX, Math.round(width))) : BATTLE_SIZE_PRESETS.medium.cols,
    rows: Number.isFinite(height) ? Math.max(BATTLE_SIZE_MIN.rows, Math.min(BATTLE_SIZE_MAX, Math.round(height))) : BATTLE_SIZE_PRESETS.medium.rows
  };
}

export function saveBattleChoices() {
  const { category, preset, building, armor, shield, helmet, big, banner, torch, level, field, fieldSize, fieldCols, fieldRows, time, weather, difficulty, fieldHighlight } = battle;
  return saveData('battle-choices', { category, preset, building, armor, shield, helmet, big, banner, torch,
    level, field: field === 'backrooms' ? lastNonSecretBattleField : field, fieldSize, fieldCols, fieldRows, time, weather, difficulty, fieldHighlight });
}

export function restoreBattleChoices() {
  const saved = loadData('battle-choices', null);
  if (!saved || typeof saved !== 'object') return;
  if (saved.category === 'units' || saved.category === 'buildings') battle.category = saved.category;
  if (typeof saved.preset === 'string' && getBattlePreset(saved.preset)) battle.preset = saved.preset;
  if (typeof saved.building === 'string' && GAME_CONFIG.buildings[saved.building]) battle.building = saved.building;
  if (saved.armor === true) battle.armor = 'iron';
  else if ([false, 'leather', 'bone', 'iron'].includes(saved.armor)) battle.armor = saved.armor;
  for (const key of ['shield', 'big', 'banner', 'torch']) if (typeof saved[key] === 'boolean') battle[key] = saved[key];
  if ([1, 2, 3].includes(saved.level)) battle.level = saved.level;
  if (saved.helmet === true) battle.helmet = 'helmet';
  else if (saved.helmet === false || saved.helmet === 'helmet' || saved.helmet === 'horned_helmet') battle.helmet = saved.helmet;
  if (saved.field === 'glade' || saved.field === 'desert' || saved.field === 'savanna') {
    battle.field = saved.field;
    lastNonSecretBattleField = saved.field;
  } else if (saved.field === 'backrooms') {
    battle.field = 'glade';
    lastNonSecretBattleField = 'glade';
  }
  if (['morning', 'day', 'evening', 'night'].includes(saved.time)) battle.time = saved.time;
  if (['clear', 'rain', 'fog', 'storm'].includes(saved.weather)) battle.weather = saved.weather;
  if (saved.difficulty === 'normal' || saved.difficulty === 'hard') battle.difficulty = saved.difficulty;
  if (['classic', 'team', 'off'].includes(saved.fieldHighlight)) battle.fieldHighlight = saved.fieldHighlight;
  const size = normalizeBattleSize(saved.fieldSize, saved.fieldCols, saved.fieldRows);
  battle.fieldSize = size.size;
  battle.fieldCols = size.cols;
  battle.fieldRows = size.rows;
  if (saved.field === 'backrooms') saveBattleChoices();
}

// (#298) the armour picked: off, leather, bone, or iron (true from before: iron)
export function battleArmor(armor) {
  if (armor === 'leather') return GAME_CONFIG.gear.leather_armor;
  if (armor === 'bone') return GAME_CONFIG.gear.bone_armor;
  return armor ? GAME_CONFIG.gear.armor : null;
}

// An enemy kind that can carry a shield: one fighting hand to hand, a big one too (27.10, 32)
/** @param {string} id */
export function enemyCanShield(id) {
  const def = GAME_CONFIG.enemies[id];
  return !!def && !def.ranged && !def.healer && !def.necromancer && !def.pet;
}

// (#326) It's dark: torches lit (in hands, on posts)
const isDark = () => battle.time === 'evening' || battle.time === 'night';

// (#326) The battle's time of day and weather as its settings say
export function applyBattleLook() {
  game.dayTime = timeOfPhase(battle.time);
  setStandingWeather(battle.weather);
  game.battleBlight = false;
}

// The midline: left of it is green, right of it red
export function battleSide(x) {
  return x < game.WORLD_WIDTH / 2 ? 'green' : 'red';
}

export function makeBattleUnit(entry) {
  const preset = getBattlePreset(entry.presetId);
  if (!preset) return;
  // (#306) the look it was placed with, kept on its line-up entry: a tap makes the whole line-up again,
  // and a new look every time would give every unit another face — and another man or a woman
  // (#314) a pet's its own look: a coat of its kind, not a man's
  const pet = GAME_CONFIG.settlerTypes[preset.type].pet;
  const look = entry.look || (entry.look = pet ? newPetLook(pet) : newLook(preset.faction, !!GAME_CONFIG.settlerTypes[preset.type].big));
  // (#326) on the red half: an enemy, the very same unit
  const enemyKey = battleSide(entry.x) === 'red'
    ? preset.preset === 'rifle' ? battleRifleEnemyKey(preset.faction) : presetEnemyKey(preset.faction, preset.preset)
    : null;
  if (enemyKey) {
    const en = createConfiguredEnemy({ x: entry.x, y: entry.y }, enemyKey, undefined, undefined, look);
    en.battleEntry = entry;
    if (preset.preset === 'rifle') Object.assign(en, { camouflage: true, rifleAmmo: GAME_CONFIG.weapons.rifle.combat.magazine });
    en.look = look;
    // (#279) armour and a shield as yours can have (a shield: a melee one); a banner too,
    // given by the player, not picked by the game
    const def = getEnemyDef(en);
    const armour = def.pet ? null : battleArmor(entry.armor); // (a pet wears nothing, #326)
    if (armour) putOnGear(en, armour.id);
    if (entry.shield && enemyCanShield(enemyKey)) en.shield = true;
    if (entry.helmet && !def.pet) putOnGear(en, typeof entry.helmet === 'string' ? entry.helmet : 'helmet'); // (#326, 27.10, 27)
    if (entry.banner && !def.pet && !def.healer && !def.necromancer) en.captain = true;
    if (entry.torch && !def.pet && isDark()) en.torch = true; // (#326)
    const track = getUnitProgressionTrack(en);
    setUnitExperience(en, track ? entry.progression?.[track] ?? entry.experience ?? getUnitExperienceForLevel(entry.level || 1, track) : 0, track);
    en.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI; // towards the other side, until they move
    game.enemies.push(en);
    return;
  }
  const archer = isRangedWeapon(preset.weapon);
  const quiver = preset.weapon === 'bow' || preset.weapon === 'crossbow';
  const id = entry.id ?? (entry.id = battle.nextId++); // (kept: a tap re-makes the line-up, a pet's tail shouldn't jump)
  const s = createSettler(preset.type, id, entry.x, entry.y, { look });
  Object.assign(s, {
    weapon: preset.weapon, tool: preset.tool || 'none',
    role: s.role === 'pet' ? 'pet' : archer ? 'archer' : preset.tool ? 'worker' : 'soldier', quiver, quiverCapacity: 30, arrows: quiver ? 30 : 0,
    ...(preset.preset === 'rifle' ? { camouflage: true, rifleAmmo: GAME_CONFIG.weapons.rifle.combat.magazine } : {}),
    battleEntry: entry
  });
  s.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI;
  const armour = s.role === 'pet' ? null : battleArmor(entry.armor); // (a pet wears nothing, #314)
  if (armour) putOnGear(s, armour.id);
  if (entry.shield && canUseShield(s) && s.role !== 'pet') s.shield = true;
  if (entry.helmet && s.role !== 'pet') putOnGear(s, typeof entry.helmet === 'string' ? entry.helmet : 'helmet'); // (#326, 27.10, 27)
  if (entry.banner && (s.role === 'soldier' || s.role === 'archer')) s.banner = true; // (#279) the player gave it
  if (entry.torch && s.role !== 'pet' && isDark()) s.torchInHand = true; // (#326)
  if (s.tool === 'medbag') s.bagHerbs = GAME_CONFIG.medic.bagSize; // (#326: a medic starts with its bag full)
  const track = getUnitProgressionTrack(s);
  setUnitExperience(s, track ? entry.progression?.[track] ?? entry.experience ?? getUnitExperienceForLevel(entry.level || 1, track) : 0, track);
  game.settlers.push(s);
}

function battleRifleEnemyKey(factionId) {
  const faction = GAME_CONFIG.factions[factionId];
  const factionEnemies = faction.enemies || [];
  const baseId = factionEnemies.find(id => GAME_CONFIG.enemies[id]?.weapon === 'sword') || factionEnemies[0] || 'raider';
  const base = GAME_CONFIG.enemies[baseId] || GAME_CONFIG.enemies.raider;
  const id = `${factionId}_battle_rifle`;
  GAME_CONFIG.enemies[id] ||= {
    ...base,
    id,
    faction: factionId,
    type: 'archer',
    weapon: 'rifle',
    ranged: { range: 310, keepAway: 264, cooldown: GAME_CONFIG.weapons.rifle.combat.cooldown, arrowSpeed: GAME_CONFIG.weapons.rifle.combat.projectileSpeed, arrowLife: GAME_CONFIG.weapons.rifle.combat.projectileLife },
    dagger: { damage: 15, cooldown: 0.5 },
    waveKey: undefined,
    buildsTents: false,
    quiver: undefined
  };
  return id;
}

// A clear field: the ground picked in the settings, the town hall out of the way, no waves, no animals
export function setUpBattleField() {
  game.mapSettings = { cols: battle.fieldCols, rows: battle.fieldRows };
  resetGame();
  for (const list of [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.ironOres, game.coalOres, game.boars,
    game.naturalRocks, game.waterTiles, game.farmPlots, game.desertTiles, game.savannaTiles, game.beachTiles]) list.length = 0;
  resetTileIndex();
  game.desertRegion = null;
  game.forests = [];
  if (battle.field === 'desert') {
    for (let gy = 0; gy < game.ROWS; gy++) {
      for (let gx = 0; gx < game.COLS; gx++) game.desertTiles.push({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    }
  } else if (battle.field === 'savanna') {
    for (let gy = 0; gy < game.ROWS; gy++) {
      for (let gx = 0; gx < game.COLS; gx++) game.savannaTiles.push({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    }
  }
  newWorldEpoch();
  game.settlers = [];
  townHall.x = -10000; townHall.y = -10000; townHall.hp = townHall.maxHp = 1e9;
  game.waveTimer = Infinity; game.boarRespawnTimer = Infinity;
  applyBattleLook();
  invalidateAllPaths();
  camera.x = game.WORLD_WIDTH / 2; camera.y = game.WORLD_HEIGHT / 2; setZoom(0); clampCamera();
}

// The line-up as placed: units standing still until Fight
export function resetBattleUnits() {
  game.settlers = []; game.enemies = []; game.projectiles = []; game.stuckArrows = []; game.corpses = []; game.bloodSplats = []; game.dung = [];
  game.buildings = battle.field === 'backrooms' ? makeBattleMazeWalls() : [];
  for (const entry of battle.lineup) {
    if (entry.building) {
      // built at once: a building, not a blueprint
      const b = /** @type {any} */ (createBuildingBlueprint(entry.building, entry.x, entry.y));
      if (entry.variant) b.variant = entry.variant;
      delete b.progress;
      delete b.maxProgress;
      if (battleSide(entry.x) === 'red') b.side = 'red'; // (#326) the red side's: it keeps off its spikes, the green breaks it
      if (b.type === 'torch' && isDark()) b.lit = true;
      game.buildings.push(b);
    } else {
      makeBattleUnit(entry);
    }
  }
  invalidateAllPaths();
}

function makeBattleMazeWalls() {
  const occupied = new Set(battle.lineup.map(entry => `${Math.floor(entry.x / TILE_SIZE)},${Math.floor(entry.y / TILE_SIZE)}`));
  return backroomsMazeLayout
    .filter(key => !occupied.has(key))
    .map(key => {
      const [gx, gy] = key.split(',').map(Number);
      const wall = /** @type {any} */ (createBuildingBlueprint('wall_stone', gx * TILE_SIZE + 15, gy * TILE_SIZE + 15));
      wall.battleMazeWall = true;
      return wall;
    });
}

// (at least two ways from one half to the other: a layout with fewer is made again)
function generateBattleMazeLayout() {
  let layout = makeBattleMazeLayout();
  for (let tries = 0; layout.crossings < 2 && tries < 20; tries++) layout = makeBattleMazeLayout();
  return layout.walls;
}

function makeBattleMazeLayout() {
  const walls = new Set();
  for (let gy = 0; gy < game.ROWS; gy++) {
    for (let gx = 0; gx < game.COLS; gx++) walls.add(`${gx},${gy}`);
  }
  const columns = Math.floor((game.COLS - 6) / 3) + 1;
  const rows = Math.floor((game.ROWS - 6) / 3) + 1;
  const open = (gx, gy) => walls.delete(`${gx},${gy}`);
  const room = (cx, cy) => ({ x: 2 + cx * 3, y: 2 + cy * 3 });
  const roomKey = point => `${point.x},${point.y}`;
  const passageKey = (from, to) => [roomKey(from), roomKey(to)].sort().join('|');
  const random = max => Math.floor(rand() * max);
  const connectedPassages = new Set();
  const passageTiles = (from, to) => {
    const tiles = [];
    const includeRoom = ({ x, y }) => {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) tiles.push([x + dx, y + dy]);
      }
    };
    includeRoom(from);
    includeRoom(to);
    if (from.x !== to.x) {
      for (let offset = 0; offset < 2; offset++) tiles.push([Math.min(from.x, to.x) + 2, from.y + offset]);
    } else {
      for (let offset = 0; offset < 2; offset++) tiles.push([from.x + offset, Math.min(from.y, to.y) + 2]);
    }
    return tiles;
  };
  const wouldLeaveIsolatedWall = tiles => {
    const opened = new Set(tiles.map(([gx, gy]) => `${gx},${gy}`));
    const candidates = new Set();
    for (const [gx, gy] of tiles) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) candidates.add(`${gx + dx},${gy + dy}`);
      }
    }
    const isOpen = (gx, gy) => !walls.has(`${gx},${gy}`) || opened.has(`${gx},${gy}`);
    for (const key of candidates) {
      if (!walls.has(key) || opened.has(key)) continue;
      const [gx, gy] = key.split(',').map(Number);
      if ([[0, -1], [1, 0], [0, 1], [-1, 0]].every(([dx, dy]) => isOpen(gx + dx, gy + dy))) return true;
    }
    return false;
  };
  const openRoom = ({ x, y }) => {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) open(x + dx, y + dy);
    }
  };
  const connectRooms = (from, to, avoidIsolatedWall = false) => {
    const tiles = passageTiles(from, to);
    if (avoidIsolatedWall && wouldLeaveIsolatedWall(tiles)) return false;
    connectedPassages.add(passageKey(from, to));
    openRoom(from);
    openRoom(to);
    if (from.x !== to.x) {
      for (let offset = 0; offset < 2; offset++) {
        open(Math.min(from.x, to.x) + 2, from.y + offset);
      }
    } else {
      for (let offset = 0; offset < 2; offset++) {
        open(from.x + offset, Math.min(from.y, to.y) + 2);
      }
    }
    return true;
  };
  const carveHalf = (firstColumn, lastColumn) => {
    const visited = new Set([`${firstColumn},0`]);
    const stack = [{ x: firstColumn, y: 0 }];
    while (stack.length) {
      const current = stack[stack.length - 1];
      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 }
      ].filter(n => n.x >= firstColumn && n.x <= lastColumn && n.y >= 0 && n.y < rows && !visited.has(`${n.x},${n.y}`));
      if (!neighbors.length) { stack.pop(); continue; }
      const next = neighbors[random(neighbors.length)];
      visited.add(`${next.x},${next.y}`);
      connectRooms(room(current.x, current.y), room(next.x, next.y));
      stack.push(next);
    }
  };
  const addOptionalPassage = (firstColumn, lastColumn) => {
    const candidates = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = firstColumn; cx <= lastColumn; cx++) {
        const from = room(cx, cy);
        for (const [nextX, nextY] of [[cx + 1, cy], [cx, cy + 1]]) {
          if (nextX > lastColumn || nextY >= rows) continue;
          const to = room(nextX, nextY);
          if (!connectedPassages.has(passageKey(from, to))) candidates.push([from, to]);
        }
      }
    }
    const count = random(4);
    let connected = 0;
    while (connected < count && candidates.length) {
      const [from, to] = candidates.splice(random(candidates.length), 1)[0];
      if (connectRooms(from, to, true)) connected++;
    }
  };
  const middleRoom = Math.ceil(columns / 2);
  carveHalf(0, middleRoom - 1);
  carveHalf(middleRoom, columns - 1);
  addOptionalPassage(0, middleRoom - 1);
  addOptionalPassage(middleRoom, columns - 1);

  const crossingRows = Array.from({ length: rows }, (_, row) => row);
  for (let i = crossingRows.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [crossingRows[i], crossingRows[j]] = [crossingRows[j], crossingRows[i]];
  }
  const crossingCount = 2 + random(3);
  let crossings = 0;
  for (const row of crossingRows) {
    if (crossings >= crossingCount) break;
    if (connectRooms(room(middleRoom - 1, row), room(middleRoom, row), true)) crossings++;
  }

  return { walls: [...walls], crossings };
}

export function startBattleMode() {
  resetBattleSecretTapCount();
  battle.rifleUnlocked = false;
  if (battle.preset.endsWith(':rifle')) battle.preset = 'humans:sword';
  if (battle.field === 'backrooms') {
    battle.field = lastNonSecretBattleField;
    backroomsMazeLayout = [];
  }
  if (game.gameMode !== 'battle') battle.savedMapSettings = game.mapSettings; // (the Endless choice comes back)
  game.gameMode = 'battle';
  battle.savedDifficulty = game.gameDifficulty;
  game.gameDifficulty = battle.difficulty;
  battle.phase = 'setup';
  battle.lineup = [];
  battle.winner = null;
  setUpBattleField();
  resetBattleUnits();
  game.gameStarted = true;
  document.getElementById('main-menu').style.display = 'none';
  document.body.classList.add('battle-mode');
  closeOverlays();
  renderBattlePanel();
}

export function leaveBattleMode() {
  resetBattleSecretTapCount();
  battle.rifleUnlocked = false;
  if (battle.preset.endsWith(':rifle')) battle.preset = 'humans:sword';
  if (battle.field === 'backrooms') {
    battle.field = lastNonSecretBattleField;
    backroomsMazeLayout = [];
  }
  game.gameMode = 'endless';
  battle.phase = 'off';
  document.body.classList.remove('battle-mode');
  if (battle.savedMapSettings) { game.mapSettings = battle.savedMapSettings; battle.savedMapSettings = null; } // the Endless choice comes back
  if (battle.savedDifficulty) game.gameDifficulty = battle.savedDifficulty;
  exitToMainMenu();
}

// A tap during setup: place what's chosen on an empty tile (a unit is yours on the green side, an enemy on
// the red one; buildings anywhere), or take away what stands there
export function battleTap(x, y) {
  if (battle.phase !== 'setup') return;
  const g = getGridPos(x, y);
  if (isBorderZone(g.gx, g.gy)) return;
  const cx = g.gx * TILE_SIZE + 15, cy = g.gy * TILE_SIZE + 15;
  if (game.buildings.some(b => b.battleMazeWall && b.x === cx && b.y === cy)) return;
  const existing = battle.lineup.find(e => e.x === cx && e.y === cy);
  if (existing) {
    battle.lineup.splice(battle.lineup.indexOf(existing), 1);
  } else if (battle.category === 'buildings') {
    const entry = { building: battle.building, x: cx, y: cy };
    if (entry.building === 'dummy') entry.variant = pickDummyVariant();
    battle.lineup.push(entry);
  } else {
    const picked = getBattlePreset(battle.preset), big = battle.big && picked ? bigPresetOf(picked) : undefined; // (#326)
    const track = getUnitProgressionTrack(picked);
    const experience = getUnitExperienceForLevel(battle.level, track);
    battle.lineup.push({ presetId: big ? big.id : battle.preset, x: cx, y: cy,
      ...(track ? { level: battle.level, experience, progression: { [track]: experience } } : {}),
      armor: battle.armor, shield: battle.shield, helmet: battle.helmet, banner: battle.banner, torch: battle.torch }); // (an enemy too, #279)
  }
  resetBattleUnits();
}

export function setBattleLevel(level) {
  if (![1, 2, 3].includes(level) || (battle.phase !== 'off' && battle.phase !== 'setup')) return;
  battle.level = level;
  saveBattleChoices();
}

// The difficulty (#255): the red side made again with it
export function setBattleDifficulty(level) {
  if (level !== 'normal' && level !== 'hard') return;
  battle.difficulty = level;
  if (battle.phase !== 'off') game.gameDifficulty = level;
  if (battle.phase === 'setup') resetBattleUnits();
  saveBattleChoices();
}

// The ground the battle is fought on: the line-up stays, the field is made again
export function setBattleField(field) {
  if ((battle.phase !== 'setup' && battle.phase !== 'off') || field === battle.field || !['glade', 'desert', 'savanna'].includes(field)) return;
  battle.field = field;
  backroomsMazeLayout = [];
  lastNonSecretBattleField = field;
  if (battle.phase === 'setup') {
    setUpBattleField();
    resetBattleUnits();
  }
  saveBattleChoices();
}

function resizeBattleLineup(oldCols, oldRows, newCols, newRows) {
  const occupied = new Set();
  const minX = BORDER_MARGIN, maxX = newCols - BORDER_MARGIN - 1;
  const minY = BORDER_MARGIN, maxY = newRows - BORDER_MARGIN - 1;
  const redStart = Math.floor(newCols / 2);
  for (const entry of battle.lineup) {
    const oldX = Math.floor(entry.x / TILE_SIZE), oldY = Math.floor(entry.y / TILE_SIZE);
    const green = entry.x < oldCols * TILE_SIZE / 2;
    const oldMid = oldCols / 2, newMid = newCols / 2;
    const oldCenterX = oldX + 0.5;
    const centerX = green
      ? oldCenterX / oldMid * newMid
      : newMid + (oldCenterX - oldMid) / (oldCols - oldMid) * (newCols - newMid);
    const centerY = (oldY + 0.5) / oldRows * newRows;
    const sideMinX = green ? minX : Math.max(minX, redStart);
    const sideMaxX = green ? Math.min(maxX, redStart - 1) : maxX;
    const targetX = Math.max(sideMinX, Math.min(sideMaxX, Math.round(centerX - 0.5)));
    const targetY = Math.max(minY, Math.min(maxY, Math.round(centerY - 0.5)));
    let placed = null;
    for (let distance = 0; distance <= Math.max(newCols, newRows) && !placed; distance++) {
      for (let dy = -distance; dy <= distance && !placed; dy++) {
        const dx = distance - Math.abs(dy);
        for (const offsetX of dx ? [-dx, dx] : [0]) {
          const gx = targetX + offsetX, gy = targetY + dy, key = `${gx},${gy}`;
          if (gx >= sideMinX && gx <= sideMaxX && gy >= minY && gy <= maxY && !occupied.has(key)) {
            placed = { gx, gy, key };
            break;
          }
        }
      }
    }
    if (placed) {
      occupied.add(placed.key);
      entry.x = placed.gx * TILE_SIZE + 15;
      entry.y = placed.gy * TILE_SIZE + 15;
    }
  }
}

export function setBattleFieldSize(size, cols = battle.fieldCols, rows = battle.fieldRows) {
  if (battle.phase !== 'off' && battle.phase !== 'setup') return;
  const next = normalizeBattleSize(size, cols, rows);
  const dimensionsChanged = next.cols !== battle.fieldCols || next.rows !== battle.fieldRows;
  if (dimensionsChanged && battle.phase === 'setup') {
    resizeBattleLineup(battle.fieldCols, battle.fieldRows, next.cols, next.rows);
  }
  battle.fieldSize = next.size;
  battle.fieldCols = next.cols;
  battle.fieldRows = next.rows;
  if (dimensionsChanged && battle.phase === 'setup') {
    setUpBattleField();
    backroomsMazeLayout = battle.field === 'backrooms' ? generateBattleMazeLayout() : [];
    resetBattleUnits();
  }
  saveBattleChoices();
}

export function activateBattleBackrooms() {
  if (battle.phase !== 'setup' || battle.field === 'backrooms') return;
  battle.field = 'backrooms';
  battle.lineup = [];
  setUpBattleField();
  backroomsMazeLayout = generateBattleMazeLayout();
  resetBattleUnits();
}

// (#326) The battle's time of day or weather picked: its look at once, the line-up made again (a torch lit or not)
export function setBattleLook(key, value) {
  if (battle.phase !== 'setup' || (key !== 'time' && key !== 'weather')) return;
  battle[key] = value;
  applyBattleLook();
  resetBattleUnits();
  saveBattleChoices();
}

export function setBattleFieldHighlight(mode) {
  if (mode !== 'classic' && mode !== 'team' && mode !== 'off') return;
  battle.fieldHighlight = mode;
  saveBattleChoices();
}

// Take away everything placed on one side
export function clearBattleSide(side) {
  if (battle.phase !== 'setup') return;
  battle.lineup = battle.lineup.filter(e => battleSide(e.x) !== side);
  resetBattleUnits();
}
