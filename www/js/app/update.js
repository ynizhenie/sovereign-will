// One step of the game: every mechanic's turn, in order

import { resetTileIndex } from '../engine/world/grid.js';
import { game } from '../engine/world/state.js';
import { updatePossessionView, updateUnitCounts } from '../domains/colony/settlers/settlers.panel.js';
import { tickSmelters } from '../domains/economy/building/building.rules.js';
import { updateUI } from '../ui/hud.js';
import { removeDeadEnemies, tickEnemyTents, tickWaveTimer } from '../domains/conflict/waves/waves.rules.js';
import { tickEnemies } from '../domains/conflict/waves/waves.behaviours.js';
import { removeDeadSettlers, tickMeals } from '../domains/colony/settlers/settlers.rules.js';
import { updatePendingRespawns } from '../domains/economy/gathering/gathering.rules.js';
import { growCrops } from '../domains/economy/farming/farming.rules.js';
import { fadeClearedBlight, makeBonesAndRot, raiseOnBlight, updateTemporaryZombies } from '../domains/factions/undead/undead.rules.js';
import { separateSettlersFromEnemies } from '../engine/movement/collision.js';
import { tickBoarRespawn, tickBoars } from '../domains/economy/hunting/hunting.rules.js';
import { ageBloodAndDung, applySpikeTraps, tickProjectiles, trackAllFootprints, updateBurning, updateCorpses } from '../domains/conflict/combat/combat.rules.js';
import { tickAnimation } from '../domains/colony/settlers/settlers.draw.js';
import { refreshAffordability } from '../ui/widgets.js';
import { tickCampfires } from '../domains/economy/cooking/cooking.rules.js';
import { tickSettlers } from '../domains/colony/settlers/settlers.behaviours.js';
import { movePossessed } from '../domains/colony/settlers/settlers.orders.js';
import { battle } from '../modes/battle/battle.setup.js';
import { updateBattle } from '../modes/battle/battle.rules.js';

export function update(dt) {
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
