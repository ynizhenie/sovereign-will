// One step of the game: every mechanic's turn, in order

import { game, resetTileIndex } from '../engine/world/index.js';
import { movePossessed, removeDeadSettlers, tickAnimation, tickMeals, tickSettlers, updatePossessionView, updateUnitCounts } from '../domains/colony/settlers/index.js';
import { tickSmelters } from '../domains/economy/building/index.js';
import { refreshAffordability, updateUI } from '../ui/index.js';
import { removeDeadEnemies, tickEnemies, tickEnemyTents, tickWaveTimer } from '../domains/conflict/waves/index.js';
import { updatePendingRespawns } from '../domains/economy/gathering/index.js';
import { growCrops } from '../domains/economy/farming/index.js';
import { fadeClearedBlight, makeBonesAndRot, raiseOnBlight, updateTemporaryZombies } from '../domains/factions/undead/index.js';
import { separateSettlersFromEnemies } from '../engine/movement/index.js';
import { tickBoarRespawn, tickBoars } from '../domains/economy/hunting/index.js';
import { ageBloodAndDung, applySpikeTraps, tickProjectiles, trackAllFootprints, updateBurning, updateCorpses } from '../domains/conflict/combat/index.js';
import { tickCampfires } from '../domains/economy/cooking/index.js';
import { battle, updateBattle } from '../modes/battle/index.js';
import { boarsPanic, tickMorale } from '../domains/conflict/morale/index.js';

export function update(dt) {
  if ((!game.gameStarted && game.gameMode !== 'menu') || game.isPaused || game.gameMode === 'editor') return; // the menu's world runs too
  // battle mode: units stand still while being placed, and the result shows for a moment
  if (game.gameMode === 'battle') {
    updateBattle(dt);
    if (battle.phase !== 'fight') return;
  }
  resetTileIndex();
  game.pathTick++;

  updatePossessionView();
  tickMorale(dt);
  boarsPanic();
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
