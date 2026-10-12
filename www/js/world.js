
function resetGame(map) {
  if (gameMode === 'menu') leaveMenuWorld(); // a real game, out of the world behind the menu (#193)
  if (map === undefined) map = gameMode === 'endless' ? customMap : null;
  // every stock starts at 0 unless GAME_CONFIG.start.resources says otherwise
  for (const id of Object.keys(GAME_CONFIG.resources)) stock[id] = 0;
  addResources(GAME_CONFIG.start.resources);
  addResources(getPlayerFaction().startResources);
  if (!getPlayerFaction().eats) stock.food = 0; // the undead have no food (#164)
  if (renderedFaction !== sides.player.faction) rebuildConfigHud(); // its own units and buildings (#43)
  waveTimer = waveInterval; boarRespawnTimer = 25; waveNum = 1;
  setWorldSize((map || mapSettings).cols, (map || mapSettings).rows);
  townHall.hp = townHall.maxHp = TOWN_HALL_HP; // battle mode makes it unbreakable (#135)
  townHall.repairRequested = false;
  settlers = []; blueprints = []; buildings = []; armorOrder = null; enemies = []; enemyTents = []; enemyTentBlueprints = []; enemyArrowStock = 0;
  projectiles = []; foodMix = {}; corpses = []; bloodSplats = []; dung = []; farmPlots = []; farmZones = []; blightZones = []; boars = []; selectedSettler = null; pendingRespawns = [];
  
  if (map) loadCustomMap(map);
  else generateMap();
  mixStartFood(); // after the map, so the seeded map stays the same
  resetTileIndex();
  updateSeedHud();

  settlers.push(
    createSettler(getPlayerFaction().startUnits, 101, townHall.x - 45, townHall.y),
    createSettler(getPlayerFaction().startUnits, 102, townHall.x + 45, townHall.y)
  );

  updateUnitCounts();
}
