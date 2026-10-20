// Battle mode: an empty grass field split down the middle. The player places units of any faction:
// theirs on the green side (left), enemies on the red side (right), buildings anywhere; presses Fight, and
// they battle it out; the winner is shown and, a few seconds later, the same line-up comes back to adjust.
// A fight can be called off, and the player can possess one of theirs in it. Archers' arrows don't run
// out. Green units are settlers and red ones enemies, driven by the usual AI.

import { GAME_CONFIG } from '../../content/configs/index.js';
import { camera, clampCamera, setZoom, t } from '../../engine/platform/index.js';
import { TILE_SIZE, game, getGridPos, isBorderZone, townHall } from '../../engine/world/index.js';
import { canUseShield, isBowWeapon, putOnGear } from '../../domains/colony/equipment/index.js';
import { createBuildingBlueprint } from '../../domains/economy/building/index.js';
import { createConfiguredEnemy } from '../../domains/conflict/waves/index.js';
import { closeOverlays, showNotification } from '../../ui/index.js';
import { createSettler } from '../../domains/colony/settlers/index.js';
import { exitToMainMenu, resetGame } from '../../app/index.js';
import { invalidateAllPaths } from '../../engine/movement/index.js';
import { getBattlePreset } from './battle.roster.js';
import { renderBattlePanel } from './battle.panel.js';

export const BATTLE_RESULT_SECONDS = 4;

/** @type {{ phase: string, category: string, faction: string, preset: string, building: string, armor: boolean,
 *   shield: boolean, lineup: { presetId?: string, building?: string, x: number, y: number, armor?: boolean, shield?: boolean }[],
 *   winner: string | null, resultTimer: number, nextId: number, savedMapSettings: { cols: number, rows: number } | null,
 *   difficulty: string, auto: boolean, savedDifficulty: string | null }} */
export const battle = {
  phase: 'off',       // off / setup / fight / result
  category: 'own',    // the panel's category
  faction: 'humans',  // the faction its units and buildings are shown for
  preset: 'sword',    // the unit preset the next tap places
  building: 'wall_wood',
  armor: false,       // colony units placed next get armour / a shield (melee only)
  shield: false,
  lineup: [],         // { presetId, x, y, armor, shield } or { building, x, y }: what's placed, kept between fights
  winner: null,       // green / red / draw
  resultTimer: 0,
  nextId: 1,
  savedMapSettings: null,
  difficulty: 'normal', // (#255) GAME_CONFIG.difficulty key: on Hard the red units are as strong as yours
  auto: true,           // (#255) yours fight by themselves; off: they hold, and go where they're told
  savedDifficulty: null // the Endless choice, back when the battle's left
};

// An enemy kind that can carry a shield: one of normal size fighting hand to hand
export function enemyCanShield(id) {
  const def = GAME_CONFIG.enemies[id];
  return !!def && def.type !== 'big' && !def.ranged && !def.healer && !def.necromancer;
}

// The midline: left of it is green, right of it red
export function battleSide(x) {
  return x < game.WORLD_WIDTH / 2 ? 'green' : 'red';
}

export function makeBattleUnit(entry) {
  const preset = getBattlePreset(entry.presetId);
  if (preset.enemy) {
    const en = createConfiguredEnemy({ x: entry.x, y: entry.y }, preset.enemy);
    en.battleEntry = entry;
    // (#279) armour and a shield as yours can have (a shield: a melee one of normal size)
    if (entry.armor) { en.armor = 'iron'; en.maxHp += GAME_CONFIG.gear.armor.hpBonus; en.hp = en.maxHp; }
    if (entry.shield && enemyCanShield(preset.enemy)) en.shield = true;
    en.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI; // towards the other side, until they move
    game.enemies.push(en);
    return;
  }
  const archer = isBowWeapon(preset.weapon);
  const s = createSettler(preset.type, battle.nextId++, entry.x, entry.y);
  Object.assign(s, {
    weapon: preset.weapon, tool: preset.tool || 'none',
    role: archer ? 'archer' : preset.tool ? 'worker' : 'soldier', quiver: archer, quiverCapacity: 30, arrows: archer ? 30 : 0, battleEntry: entry
  });
  s.facing = battleSide(entry.x) === 'green' ? 0 : Math.PI;
  if (entry.armor) putOnGear(s, 'armor');
  if (entry.shield && canUseShield(s)) s.shield = true;
  game.settlers.push(s);
}

// An empty field: grass only, the town hall out of the way, no waves, no animals
export function setUpBattleField() {
  battle.savedMapSettings = game.mapSettings;
  game.mapSettings = { cols: 40, rows: 26 };
  resetGame();
  for (const list of [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.ironOres, game.coalOres, game.boars,
    game.naturalRocks, game.waterTiles, game.farmPlots, game.desertTiles, game.beachTiles]) list.length = 0;
  game.desertRegion = null;
  game.forests = [];
  game.settlers = [];
  townHall.x = -10000; townHall.y = -10000; townHall.hp = townHall.maxHp = 1e9;
  game.waveTimer = Infinity; game.boarRespawnTimer = Infinity;
  invalidateAllPaths();
  camera.x = game.WORLD_WIDTH / 2; camera.y = game.WORLD_HEIGHT / 2; setZoom(0); clampCamera();
}

// The line-up as placed: units standing still until Fight
export function resetBattleUnits() {
  game.settlers = []; game.enemies = []; game.projectiles = []; game.corpses = []; game.bloodSplats = []; game.dung = []; game.buildings = [];
  for (const entry of battle.lineup) {
    if (entry.building) {
      // built at once: a building, not a blueprint
      const b = /** @type {any} */ (createBuildingBlueprint(entry.building, entry.x, entry.y));
      delete b.progress;
      delete b.maxProgress;
      game.buildings.push(b);
    } else {
      makeBattleUnit(entry);
    }
  }
  invalidateAllPaths();
}

export function startBattleMode() {
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
  if (battle.savedMapSettings) game.mapSettings = battle.savedMapSettings; // the Endless choice comes back
  if (battle.savedDifficulty) game.gameDifficulty = battle.savedDifficulty;
  exitToMainMenu();
}

// A tap during setup: place what's chosen on an empty tile (colony units on the green side, enemies on
// the red one, buildings anywhere), or take away what stands there
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
    const preset = getBattlePreset(battle.preset);
    const side = preset.enemy ? 'red' : 'green';
    if (battleSide(cx) !== side) { showNotification(t(`battle.only.${side}`), true); return; }
    battle.lineup.push({ presetId: preset.id, x: cx, y: cy, armor: battle.armor, shield: battle.shield }); // (an enemy too, #279)
  }
  resetBattleUnits();
}

// The difficulty (#255): the red side made again with it
export function setBattleDifficulty(level) {
  battle.difficulty = level;
  game.gameDifficulty = level;
  if (battle.phase === 'setup') resetBattleUnits();
}

// Take away everything placed on one side
export function clearBattleSide(side) {
  if (battle.phase !== 'setup') return;
  battle.lineup = battle.lineup.filter(e => battleSide(e.x) !== side);
  resetBattleUnits();
}
