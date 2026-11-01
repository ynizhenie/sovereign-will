// A game's session: a new game made (resetGame), paused and resumed, left for the main menu

import { closeSelectedCard, closeSheet, closeWorldMap, hidePlacing, iconHtml, rebuildConfigHud, renderedFaction, updateSeedHud } from '../ui/index.js';
import { GAME_CONFIG } from '../content/configs/index.js';
import { onTap, t } from '../engine/platform/index.js';
import { game, resetTileIndex, setWorldSize, TOWN_HALL_HP, townHall } from '../engine/world/index.js';
import { createSettler, updateUnitCounts } from '../domains/colony/settlers/index.js';
import { addResources, mixStartFood, stock } from '../domains/colony/storage/index.js';
import { clearBoarWallows } from '../domains/economy/hunting/index.js';
import { generateMapSteps, resetFog } from '../domains/world/index.js';
import { getPlayerFaction, sides } from '../domains/factions/index.js';
import { leaveMenuWorld, showMenuScreen } from '../modes/menu/index.js';
import { leaveBattleMode } from '../modes/battle/index.js';
import { leaveEditor, loadCustomMap } from '../modes/editor/index.js';
import { isInCamp, resetRaid, syncCards } from '../modes/endless/index.js';

export function resetGame(map) {
  for (const _ of resetGameSteps(map)); // (all at once)
}

// A new game made in steps, each yielding how far along it is (the loading screen's bar, #326)
export function* resetGameSteps(map) {
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
  resetRaid(); // (#255: a party out on a raid: the base back first, then all of it reset)
  game.settlers = []; game.blueprints = []; game.buildings = []; game.armorOrder = null; game.enemies = []; game.enemyTents = []; game.enemyTentBlueprints = []; game.enemyArrowStock = 0; game.enemyHerbStock = 0; game.playerGear = { armor: false, shield: false }; game.armory = {}; game.loot = []; game.logs = []; game.stumps = []; game.piles = []; game.paths = {}; game.portalQueue = []; game.portalTimer = 0; game.autoBlight = false; game.autoBlightDone = false; game.dayTime = GAME_CONFIG.daytime.morning / 2; game.nightId = 0; // (dayTime: half way through the morning, it was dark as night as it began)
  townHall.store = {}; game.craftOrders = []; game.raidCamp = null; game.raidCampWave = 0; game.scouts = []; game.scoutClock = 0; game.weather = null; game.reliefZones = []; game.postZones = []; game.pathZones = []; game.unlocked = {}; game.cardsDue = 0; game.cardsWave = 0; game.cardOffer = null;
  game.projectiles = []; game.stuckArrows = []; game.soulFx = []; game.foodMix = {}; game.corpses = []; game.bloodSplats = []; game.dung = []; game.farmPlots = []; game.farmZones = []; game.blightZones = []; game.boars = []; game.selectedSettler = null; game.selectedGroup = []; game.addingToGroup = false; game.pendingRespawns = [];
  clearBoarWallows(); // (#306) the ground the last world's boars dug goes with that world
  
  yield 0.05;
  if (map) loadCustomMap(map);
  else for (const share of generateMapSteps()) yield 0.05 + share * 0.8;
  yield 0.9;
  mixStartFood(); // after the map, so the seeded map stays the same
  resetTileIndex();
  resetFog(); // (#299: nothing seen yet but the start land)
  updateSeedHud();

  game.settlers.push(
    createSettler(getPlayerFaction().startUnits, 101, townHall.x - 45, townHall.y),
    createSettler(getPlayerFaction().startUnits, 102, townHall.x + 45, townHall.y)
  );
  // the undead start with a necromancer too: one more with the staff (#253)
  if (getPlayerFaction().startNecromancer) game.settlers.push(Object.assign(createSettler(getPlayerFaction().startUnits, 103, townHall.x, townHall.y + 45), { tool: 'necro_staff' }));

  updateUnitCounts();
  syncCards(); // (#255: all locked again, or none out of Endless's cards)
}

export function togglePause() {
  if (!game.gameStarted) return;
  setPaused(!game.isPaused);
}

// Pausing opens the pause menu (Continue / Main menu)
export function setPaused(paused) {
  game.isPaused = paused;
  if (paused) closeSelectedCard();
  const btn = document.getElementById('btn-pause-toggle');
  btn.innerHTML = iconHtml(game.isPaused ? 'play' : 'pause');
  btn.setAttribute('aria-label', t(game.isPaused ? 'pause.resumeHint' : 'pause.pauseHint'));
  btn.classList.toggle('paused', game.isPaused);
  document.getElementById('pause-menu').hidden = !game.isPaused;
  // saving and loading are Endless's: not in a battle (#254)
  const endless = game.gameMode === 'endless';
  document.getElementById('save-game-button').hidden = !endless || isInCamp(); // (not in a raid's camp, #255; on the way there or back it saves, #298)
  document.getElementById('load-game-button').hidden = !endless;
  document.getElementById('pause-load').hidden = true;
}

export function exitToMainMenu() {
  setPaused(false);
  resetRaid(); // (#255)
  hidePlacing(); closeSheet(); // (#279: the editor's or a battle's pick stayed on the chip in the next game)
  // (#326) nothing of the game left over in the menu and the next one: no build mode, nobody selected or
  // possessed, the world map shut
  game.buildMode = 'interact'; game.selectedSettler = null; game.selectedGroup = []; game.addingToGroup = false;
  for (const s of game.settlers) s.isPossessed = false;
  closeWorldMap();
  game.gameStarted = false;
  document.getElementById('main-menu').style.display = '';
  showMenuScreen('home');
}

// What this file sets up as the game starts (called by app/boot.js)
export function initSession() {
  onTap(document.getElementById('resume-button'), () => setPaused(false));
  // the Settings from the pause menu (#254): the main menu's settings screen over the game; Back comes back here
  onTap(document.getElementById('pause-settings-button'), () => {
    document.getElementById('pause-menu').hidden = true;
    document.getElementById('main-menu').style.display = '';
    document.getElementById('main-menu').dataset.fromPause = 'yes';
    showMenuScreen('settings');
  });
  // out of the pause menu: each mode leaves its own way
  onTap(document.getElementById('exit-to-menu-button'), () => {
    if (game.gameMode === 'battle') leaveBattleMode();
    else if (game.gameMode === 'editor') leaveEditor();
    else exitToMainMenu();
  });
}
