// One step of the game: every mechanic's turn, in order

function update(dt) {
  if ((!game.gameStarted && game.gameMode !== 'menu') || game.isPaused || game.gameMode === 'editor') return; // the menu's world runs too (#193)
  // battle mode: units stand still while being placed, and the result shows for a moment
  if (game.gameMode === 'battle') {
    updateBattle(dt);
    if (battle.phase !== 'fight') return;
  }
  resetTileIndex();
  game.pathTick++;

  updatePossessionView();
  tickWaveTimer(dt);
  updatePendingRespawns(dt);
  makeBonesAndRot(dt);
  updateTemporaryZombies(dt);
  fadeClearedBlight(dt);
  updateBurning(dt);
  raiseOnBlight(dt);
  tickMeals(dt);
  tickBoarRespawn(dt);
  growCrops(dt);
  tickBoars(dt);
  tickCampfires(dt);
  tickSmelters(dt);
  movePossessed(dt);
  tickSettlers(dt);
  tickEnemyTents(dt);
  tickProjectiles();
  tickEnemies(dt);

  separateSettlersFromEnemies();
  for (const unit of game.settlers) tickAnimation(unit, dt);
  ageBloodAndDung(dt);
  trackAllFootprints();
  for (const unit of game.enemies) tickAnimation(unit, dt);
  applySpikeTraps();

  removeDeadSettlers();
  removeDeadEnemies();
  updateCorpses(dt);

  updateUnitCounts();
  updateUI();
  refreshAffordability();
}
