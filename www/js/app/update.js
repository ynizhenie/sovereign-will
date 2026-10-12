// One step of the game: every mechanic's turn, in order

function update(dt) {
  if ((!gameStarted && gameMode !== 'menu') || isPaused || gameMode === 'editor') return; // the menu's world runs too (#193)
  // battle mode: units stand still while being placed, and the result shows for a moment
  if (gameMode === 'battle') {
    updateBattle(dt);
    if (battle.phase !== 'fight') return;
  }
  resetTileIndex();
  pathTick++;

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
  for (const unit of settlers) tickAnimation(unit, dt);
  ageBloodAndDung(dt);
  trackAllFootprints();
  for (const unit of enemies) tickAnimation(unit, dt);
  applySpikeTraps();

  removeDeadSettlers();
  removeDeadEnemies();
  updateCorpses(dt);

  updateUnitCounts();
  updateUI();
  refreshAffordability();
}
