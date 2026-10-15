// A game's session: a new game made (resetGame), paused and resumed, left for the main menu

import { iconHtml, rebuildConfigHud, renderReserves, renderedFaction, updateSeedHud } from '../ui/index.js';
import { GAME_CONFIG } from '../content/configs/index.js';
import { onTap, t } from '../engine/platform/index.js';
import { TOWN_HALL_HP, game, resetTileIndex, setWorldSize, townHall } from '../engine/world/index.js';
import { createSettler, renderJobPriority, updateUnitCounts } from '../domains/colony/settlers/index.js';
import { addResources, mixStartFood, stock } from '../domains/colony/storage/index.js';
import { generateMap } from '../domains/world/index.js';
import { getPlayerFaction, sides } from '../domains/factions/index.js';
import { leaveMenuWorld, showMenuScreen } from '../modes/menu/index.js';
import { leaveBattleMode } from '../modes/battle/index.js';
import { leaveEditor, loadCustomMap } from '../modes/editor/index.js';

export function resetGame(map) {
  if (game.gameMode === 'menu') leaveMenuWorld(); // a real game, out of the world behind the menu
  if (map === undefined) map = game.gameMode === 'endless' ? game.customMap : null;
  // every stock starts at 0 unless GAME_CONFIG.start.resources says otherwise
  for (const id of Object.keys(GAME_CONFIG.resources)) stock[id] = 0;
  addResources(GAME_CONFIG.start.resources);
  addResources(getPlayerFaction().startResources);
  if (!getPlayerFaction().eats) stock.food = 0; // the undead have no food
  if (renderedFaction !== sides.player.faction) rebuildConfigHud(); // its own units and buildings
  game.waveTimer = game.waveInterval; game.boarRespawnTimer = 25; game.waveNum = 1;
  setWorldSize((map || game.mapSettings).cols, (map || game.mapSettings).rows);
  townHall.hp = townHall.maxHp = TOWN_HALL_HP; // battle mode makes it unbreakable
  townHall.repairRequested = false;
  game.settlers = []; game.blueprints = []; game.buildings = []; game.armorOrder = null; game.enemies = []; game.enemyTents = []; game.enemyTentBlueprints = []; game.enemyArrowStock = 0; game.jobPriority = null; game.playerGear = { armor: false, shield: false }; game.stance = 'defend'; game.reserves = {}; game.armory = {}; game.quotas = {}; game.loot = [];
  game.projectiles = []; game.foodMix = {}; game.corpses = []; game.bloodSplats = []; game.dung = []; game.farmPlots = []; game.farmZones = []; game.blightZones = []; game.boars = []; game.selectedSettler = null; game.pendingRespawns = [];
  
  if (map) loadCustomMap(map);
  else generateMap();
  mixStartFood(); // after the map, so the seeded map stays the same
  resetTileIndex();
  updateSeedHud();
  renderJobPriority(); // a new game: the default order
  renderReserves(); // a new game keeps nothing back

  game.settlers.push(
    createSettler(getPlayerFaction().startUnits, 101, townHall.x - 45, townHall.y),
    createSettler(getPlayerFaction().startUnits, 102, townHall.x + 45, townHall.y)
  );

  updateUnitCounts();
}

export function togglePause() {
  if (!game.gameStarted) return;
  setPaused(!game.isPaused);
}

// Pausing opens the pause menu (Continue / Main menu)
export function setPaused(paused) {
  game.isPaused = paused;
  const btn = document.getElementById('btn-pause-toggle');
  btn.innerHTML = iconHtml(game.isPaused ? 'play' : 'pause');
  btn.title = game.isPaused ? t('pause.resumeHint') : t('pause.pauseHint');
  btn.classList.toggle('paused', game.isPaused);
  document.getElementById('pause-menu').hidden = !game.isPaused;
}

export function exitToMainMenu() {
  setPaused(false);
  game.gameStarted = false;
  document.getElementById('main-menu').style.display = '';
  showMenuScreen('home');
}

// What this file sets up as the game starts (called by app/boot.js)
export function initSession() {
  onTap(document.getElementById('resume-button'), () => setPaused(false));
  // out of the pause menu: each mode leaves its own way
  onTap(document.getElementById('exit-to-menu-button'), () => {
    if (game.gameMode === 'battle') leaveBattleMode();
    else if (game.gameMode === 'editor') leaveEditor();
    else exitToMainMenu();
  });
}
