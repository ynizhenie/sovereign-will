// One step of the game: every mechanic's turn, in order

import { game, resetTileIndex } from '../engine/world/index.js';
import { movePossessed, removeDeadSettlers, tickAnimation, tickMeals, tickNight, tickSettlers, tickVoices, updatePossessionView, updateUnitCounts } from '../domains/colony/settlers/index.js';
import { tickSmelters } from '../domains/economy/building/index.js';
import { refreshAffordability, updateUI } from '../ui/index.js';
import { removeDeadEnemies, tickEnemies, tickEnemyTents, tickPortalWave, tickScouts, tickWaveTimer } from '../domains/conflict/waves/index.js';
import { updatePendingRespawns } from '../domains/economy/gathering/index.js';
import { tickDaytime, tickFog, tickPaths, tickWeather } from '../domains/world/index.js';
import { tickMenuScene } from '../modes/menu/index.js';
import { growCrops } from '../domains/economy/farming/index.js';
import { fadeClearedBlight, makeBonesAndRot, raiseOnBlight, updateTemporaryZombies } from '../domains/factions/undead/index.js';
import { separateAllies, separateSettlersFromEnemies } from '../engine/movement/index.js';
import { tickBoarRespawn, tickBoars, tickIronTraps } from '../domains/economy/hunting/index.js';
import { keepStoresInStep } from '../domains/colony/storage/index.js';
import { tickDemonCamp } from '../domains/factions/demons/index.js';
import { ageBloodAndDung, applySpikeTraps, tickProjectiles, trackAllFootprints, updateBurning, updateCorpses } from '../domains/conflict/combat/index.js';
import { tickCampfires } from '../domains/economy/cooking/index.js';
import { tickFishPopulation, tickFishTraps } from '../domains/economy/fishing/index.js';
import { battle, updateBattle } from '../modes/battle/index.js';
import { isInCamp, isRaidPicking, isRaiding, tickCards, tickRaid, tickRaidCamp } from '../modes/endless/index.js';
import { boarsPanic, tickMorale } from '../domains/conflict/morale/index.js';

export function update(dt) {
  if ((!game.gameStarted && game.gameMode !== 'menu') || game.isPaused || game.gameMode === 'editor') return; // the menu's world runs too
  if (game.gameMode === 'endless' && (game.cardOffer || isRaidPicking())) return; // (the game waits for a card or a raid party to be picked, #255)
  if (game.gameMode === 'endless' && isInCamp()) { updateCamp(dt); return; } // (a raid's camp: the base waits, #255)
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
  if (!isRaiding()) tickWaveTimer(dt); // (a party out on a raid: the wave clock stops, #255)
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
  tickFishPopulation(dt);
  tickFishTraps(dt);
  tickSmelters(dt);
  movePossessed(dt);
  tickSettlers(dt);
  tickEnemyTents(dt);
  tickPortalWave(dt); // (the demons' wave, a few at a time, #250)
  tickScouts(dt); // (scouts between waves, #279)
  tickDemonCamp(dt); // (their corpse pits and cages)
  tickProjectiles();
  tickEnemies(dt);

  separateSettlersFromEnemies();
  separateAllies(game.settlers, true); separateAllies(game.enemies, true); // (#326)
  for (const unit of game.settlers) tickAnimation(unit, dt);
  ageBloodAndDung(dt);
  trackAllFootprints();
  for (const unit of game.enemies) tickAnimation(unit, dt);
  applySpikeTraps(dt);
  tickIronTraps(dt); // (#248)

  removeDeadSettlers();
  removeDeadEnemies();
  updateCorpses(dt);

  keepStoresInStep(); // what lies where, in step with the stock (#248)
  tickPaths(); // ground walked a lot wears into paths (#248)
  tickDaytime(dt); // day and night (#257)
  tickWeather(dt); // (#308)
  tickFog(dt); // (what the colony sees, #299)
  tickMenuScene(dt); // (the main menu's scene, #256)
  tickNight();
  tickVoices(dt); // (#252)
  if (!isRaiding()) tickCards(); // (#255)
  tickRaidCamp(dt); // (#255)
  tickRaid(dt);
  updateUnitCounts();
  updateUI();
  refreshAffordability();
}

// A raid's camp (#255): only the fight goes on, the party against the camp; the base is put away
function updateCamp(dt) {
  resetTileIndex();
  game.pathTick++;
  updatePossessionView();
  movePossessed(dt);
  tickSettlers(dt);
  tickEnemyTents(dt);
  tickProjectiles();
  tickEnemies(dt);
  separateSettlersFromEnemies();
  separateAllies(game.settlers, true); separateAllies(game.enemies, true); // (#326)
  for (const unit of game.settlers) tickAnimation(unit, dt);
  for (const unit of game.enemies) tickAnimation(unit, dt);
  ageBloodAndDung(dt);
  trackAllFootprints();
  updateBurning(dt);
  removeDeadSettlers();
  removeDeadEnemies();
  updateCorpses(dt);
  tickVoices(dt);
  tickRaid(dt);
  updateUI();
  refreshAffordability();
}
