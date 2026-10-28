// Battle mode: an empty grass field split down the middle. The player places units of any faction:
// on the green side (left) they're theirs, on the red side (right) enemies (#326: any unit on either), buildings
// anywhere; presses Fight, and
// they battle it out; the winner is shown and, a few seconds later, the same line-up comes back to adjust.
// A fight can be called off, and the player can possess one of theirs in it. Archers' arrows don't run
// out. Green units are settlers and red ones enemies, driven by the usual AI.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, setZoom } from '../../engine/platform/index.js';
import { TILE_SIZE, game, getGridPos, isBorderZone, townHall } from '../../engine/world/index.js';
import { canUseShield, isRangedWeapon, putOnGear } from '../../domains/colony/equipment/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { createConfiguredEnemy, getEnemyDef, presetEnemyKey } from '../../domains/conflict/waves/index.js';
import { setStandingWeather, timeOfPhase } from '../../domains/world/index.js';
import { closeOverlays } from '../../ui/index.js';
import { createSettler, newLook, newPetLook } from '../../domains/colony/settlers/index.js';
import { exitToMainMenu, resetGame } from '../../app/index.js';
import { invalidateAllPaths } from '../../engine/movement/index.js';
import { bigPresetOf, getBattlePreset } from './battle.roster.js';
import { renderBattlePanel } from './battle.panel.js';

export const BATTLE_RESULT_SECONDS = 4;

/** @type {{ phase: string, category: string, preset: string, building: string, armor: boolean | string,
 *   shield: boolean, big: boolean, banner: boolean, torch: boolean, field: string, time: string, weather: string, blight: boolean,
 *   lineup: { presetId?: string, building?: string, x: number, y: number, armor?: boolean | string, shield?: boolean, banner?: boolean, torch?: boolean,
 *   look?: { female: boolean, style: number, shade: number, coat?: number }, id?: number }[],
 *   winner: string | null, resultTimer: number, nextId: number, savedMapSettings: { cols: number, rows: number } | null,
 *   difficulty: string, auto: boolean, savedDifficulty: string | null, theme: string }} */
export const battle = {
  phase: 'off',       // off / setup / fight / result
  category: 'units',  // the panel's category
  preset: 'humans:sword', // the unit preset the next tap places (BATTLE_PRESETS)
  building: 'wall_wood',
  armor: false,       // colony units placed next get armour / a shield (melee only)
  shield: false,
  big: false,         // (#326) the next unit placed is a big one (not a pet, medic, necromancer or archer)
  banner: false,      // (#279) the next unit placed gets a banner: a commander, only if the player gives one
  torch: false,       // (#326) the next unit placed gets a torch at its side: lit in its hand when it's dark
  field: 'glade',     // glade / desert: what the battle is fought on
  time: 'day',        // (#326) morning / day / evening / night: how it looks (it stands still; nobody sleeps by it)
  weather: 'clear',   // (#326) clear / rain / fog / storm, all through the fight
  blight: false,      // (#326) the field blighted, as the undead's ground in Endless
  lineup: [],         // { presetId, x, y, armor, shield, banner } or { building, x, y }: what's placed, kept between fights
  winner: null,       // green / red / draw
  resultTimer: 0,
  nextId: 1,
  savedMapSettings: null,
  difficulty: 'normal', // (#255) GAME_CONFIG.difficulty key: the red units have a quarter less hp on Normal, the same as yours on Hard
  auto: true,           // (#255) yours fight by themselves; off: they hold, and go where they're told
  savedDifficulty: null, // the Endless choice, back when the battle's left
  theme: 'arena'        // (#326) whose music: the Battles' own ('arena') or a faction's (its id); the track by the phase and the time of day
};

// (#298) the armour picked: off, 'leather' or 'iron' (true from before: iron); its gear, or null
export function battleArmor(armor) {
  return armor === 'leather' ? GAME_CONFIG.gear.leather_armor : armor ? GAME_CONFIG.gear.armor : null;
}

// An enemy kind that can carry a shield: one of normal size fighting hand to hand
/** @param {string} id */
export function enemyCanShield(id) {
  const def = GAME_CONFIG.enemies[id];
  return !!def && def.type !== 'big' && !def.ranged && !def.healer && !def.necromancer && !def.pet;
}

// (#326) It's dark: torches lit (in hands, on posts)
const isDark = () => battle.time === 'evening' || battle.time === 'night';

// (#326) The battle's time of day, weather and ground as its settings say
export function applyBattleLook() {
  game.dayTime = timeOfPhase(battle.time);
  setStandingWeather(battle.weather);
  game.battleBlight = battle.blight;
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
  const look = entry.look || (entry.look = pet ? newPetLook(pet) : newLook());
  // (#326) on the red half: an enemy, the very same unit
  const enemyKey = battleSide(entry.x) === 'red' ? presetEnemyKey(preset.faction, preset.preset) : null;
  if (enemyKey) {
    const en = createConfiguredEnemy({ x: entry.x, y: entry.y }, enemyKey);
    en.battleEntry = entry;
    en.look = look;
    // (#279) armour and a shield as yours can have (a shield: a melee one of normal size); a banner too,
    // given by the player, not picked by the game
    const def = getEnemyDef(en);
    const armour = def.pet ? null : battleArmor(entry.armor); // (a pet wears nothing, #326)
    if (armour) { en.armor = armour.armorKind; en.maxHp += armour.hpBonus; en.hp = en.maxHp; }
    if (entry.shield && enemyCanShield(enemyKey)) en.shield = true;
    if (entry.banner && en.type === 'normal' && !def.pet && !def.healer && !def.necromancer) en.captain = true;
    if (entry.torch && !def.pet && isDark()) en.torch = true; // (#326)
    en.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI; // towards the other side, until they move
    game.enemies.push(en);
    return;
  }
  const archer = isRangedWeapon(preset.weapon);
  const id = entry.id ?? (entry.id = battle.nextId++); // (kept: a tap re-makes the line-up, a pet's tail shouldn't jump)
  const s = createSettler(preset.type, id, entry.x, entry.y, { look });
  Object.assign(s, {
    weapon: preset.weapon, tool: preset.tool || 'none',
    role: s.role === 'pet' ? 'pet' : archer ? 'archer' : preset.tool ? 'worker' : 'soldier', quiver: archer, quiverCapacity: 30, arrows: archer ? 30 : 0, battleEntry: entry
  });
  s.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI;
  const armour = s.role === 'pet' ? null : battleArmor(entry.armor); // (a pet wears nothing, #314)
  if (armour) putOnGear(s, armour.id);
  if (entry.shield && canUseShield(s) && s.role !== 'pet') s.shield = true;
  if (entry.banner && (s.role === 'soldier' || s.role === 'archer')) s.banner = true; // (#279) the player gave it
  if (entry.torch && s.role !== 'pet' && isDark()) s.torchInHand = true; // (#326)
  game.settlers.push(s);
}

// A clear field: the ground picked in the settings, the town hall out of the way, no waves, no animals
export function setUpBattleField() {
  game.mapSettings = { cols: 40, rows: 26 };
  resetGame();
  for (const list of [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.ironOres, game.coalOres, game.boars,
    game.naturalRocks, game.waterTiles, game.farmPlots, game.desertTiles, game.beachTiles]) list.length = 0;
  game.desertRegion = null;
  game.forests = [];
  if (battle.field === 'desert') {
    for (let gy = 0; gy < game.ROWS; gy++) {
      for (let gx = 0; gx < game.COLS; gx++) game.desertTiles.push({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
    }
  }
  game.settlers = [];
  townHall.x = -10000; townHall.y = -10000; townHall.hp = townHall.maxHp = 1e9;
  game.waveTimer = Infinity; game.boarRespawnTimer = Infinity;
  applyBattleLook();
  invalidateAllPaths();
  camera.x = game.WORLD_WIDTH / 2; camera.y = game.WORLD_HEIGHT / 2; setZoom(0); clampCamera();
}

// The line-up as placed: units standing still until Fight
export function resetBattleUnits() {
  game.settlers = []; game.enemies = []; game.projectiles = []; game.stuckArrows = []; game.corpses = []; game.bloodSplats = []; game.dung = []; game.buildings = [];
  for (const entry of battle.lineup) {
    if (entry.building) {
      // built at once: a building, not a blueprint
      const b = /** @type {any} */ (createBuildingBlueprint(entry.building, entry.x, entry.y));
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

export function startBattleMode() {
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
  const existing = battle.lineup.find(e => e.x === cx && e.y === cy);
  if (existing) {
    battle.lineup.splice(battle.lineup.indexOf(existing), 1);
  } else if (battle.category === 'buildings') {
    battle.lineup.push({ building: battle.building, x: cx, y: cy });
  } else {
    const picked = getBattlePreset(battle.preset), big = battle.big && picked ? bigPresetOf(picked) : undefined; // (#326)
    battle.lineup.push({ presetId: big ? big.id : battle.preset, x: cx, y: cy, armor: battle.armor, shield: battle.shield, banner: battle.banner, torch: battle.torch }); // (an enemy too, #279)
  }
  resetBattleUnits();
}

// The difficulty (#255): the red side made again with it
export function setBattleDifficulty(level) {
  battle.difficulty = level;
  game.gameDifficulty = level;
  if (battle.phase === 'setup') resetBattleUnits();
}

// The ground the battle is fought on: the line-up stays, the field is made again
export function setBattleField(field) {
  if (battle.phase !== 'setup' || field === battle.field || (field !== 'glade' && field !== 'desert')) return;
  battle.field = field;
  setUpBattleField();
  resetBattleUnits();
}

// (#326) The battle's time of day, weather or ground picked: its look at once, the line-up made again (a torch
// lit or not)
export function setBattleLook(key, value) {
  if (battle.phase !== 'setup') return;
  battle[key] = value;
  applyBattleLook();
  resetBattleUnits();
}

// Take away everything placed on one side
export function clearBattleSide(side) {
  if (battle.phase !== 'setup') return;
  battle.lineup = battle.lineup.filter(e => battleSide(e.x) !== side);
  resetBattleUnits();
}
