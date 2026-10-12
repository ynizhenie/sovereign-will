// A game's session: a new game made (resetGame), paused and resumed, left for the main menu

function resetGame(map) {
  if (game.gameMode === 'menu') leaveMenuWorld(); // a real game, out of the world behind the menu (#193)
  if (map === undefined) map = game.gameMode === 'endless' ? game.customMap : null;
  // every stock starts at 0 unless GAME_CONFIG.start.resources says otherwise
  for (const id of Object.keys(GAME_CONFIG.resources)) stock[id] = 0;
  addResources(GAME_CONFIG.start.resources);
  addResources(getPlayerFaction().startResources);
  if (!getPlayerFaction().eats) stock.food = 0; // the undead have no food (#164)
  if (renderedFaction !== sides.player.faction) rebuildConfigHud(); // its own units and buildings (#43)
  game.waveTimer = game.waveInterval; game.boarRespawnTimer = 25; game.waveNum = 1;
  setWorldSize((map || game.mapSettings).cols, (map || game.mapSettings).rows);
  townHall.hp = townHall.maxHp = TOWN_HALL_HP; // battle mode makes it unbreakable (#135)
  townHall.repairRequested = false;
  game.settlers = []; game.blueprints = []; game.buildings = []; game.armorOrder = null; game.enemies = []; game.enemyTents = []; game.enemyTentBlueprints = []; game.enemyArrowStock = 0;
  game.projectiles = []; game.foodMix = {}; game.corpses = []; game.bloodSplats = []; game.dung = []; game.farmPlots = []; game.farmZones = []; game.blightZones = []; game.boars = []; game.selectedSettler = null; game.pendingRespawns = [];
  
  if (map) loadCustomMap(map);
  else generateMap();
  mixStartFood(); // after the map, so the seeded map stays the same
  resetTileIndex();
  updateSeedHud();

  game.settlers.push(
    createSettler(getPlayerFaction().startUnits, 101, townHall.x - 45, townHall.y),
    createSettler(getPlayerFaction().startUnits, 102, townHall.x + 45, townHall.y)
  );

  updateUnitCounts();
}

function togglePause() {
  if (!game.gameStarted) return;
  setPaused(!game.isPaused);
}

// Pausing opens the pause menu (Continue / Main menu)
function setPaused(paused) {
  game.isPaused = paused;
  const btn = document.getElementById('btn-pause-toggle');
  btn.innerHTML = iconHtml(game.isPaused ? 'play' : 'pause');
  btn.title = game.isPaused ? t('pause.resumeHint') : t('pause.pauseHint');
  btn.classList.toggle('paused', game.isPaused);
  document.getElementById('pause-menu').hidden = !game.isPaused;
}

function exitToMainMenu() {
  setPaused(false);
  game.gameStarted = false;
  document.getElementById('main-menu').style.display = '';
  showMenuScreen('home');
}

// What this file sets up as the game starts (called by app/boot.js)
function initSession() {
  onTap(document.getElementById('resume-button'), () => setPaused(false));
  // out of the pause menu: each mode leaves its own way (#145)
  onTap(document.getElementById('exit-to-menu-button'), () => {
    if (game.gameMode === 'battle') leaveBattleMode();
    else if (game.gameMode === 'editor') leaveEditor();
    else exitToMainMenu();
  });
}
