// One step of the game: every mechanic's turn, in order

import { game, resetTileIndex } from '../engine/world/index.js';
import { removeDeadSettlers, tickAnimation, tickMeals, tickNight, tickSettlers, tickVoices, updatePossessionView, updateUnitCounts } from '../domains/colony/settlers/index.js';
import { tickSmelters } from '../domains/economy/building/index.js';
import { refreshAffordability, updateUI } from '../ui/index.js';
import { removeDeadEnemies, tickEnemies, tickEnemyTents, tickPortalWave, tickScouts, tickWaveTimer } from '../domains/conflict/waves/index.js';
import { updatePendingRespawns } from '../domains/economy/gathering/index.js';
import { tickDaytime, tickFog, tickPaths, tickWeather } from '../domains/world/index.js';
import { tickMenuScene } from '../modes/menu/index.js';
import { growCrops } from '../domains/economy/farming/index.js';
import { fadeClearedBlight, makeBonesAndRot, raiseOnBlight, tickLanterns, updateTemporaryZombies } from '../domains/factions/undead/index.js';
import { separateAllies, separateSettlersFromEnemies } from '../engine/movement/index.js';
import { tickBoarRespawn, tickBoars, tickIronTraps } from '../domains/economy/hunting/index.js';
import { keepStoresInStep } from '../domains/colony/storage/index.js';
import { tickDemonCamp } from '../domains/factions/demons/index.js';
import { ageBloodAndDung, ageStuckArrows, applySpikeTraps, tickProjectiles, trackAllFootprints, updateBurning, updateCorpses } from '../domains/conflict/combat/index.js';
import { tickCampfires } from '../domains/economy/cooking/index.js';
import { tickFishPopulation, tickFishTraps } from '../domains/economy/fishing/index.js';
import { mark, startMarks } from './perf.js';
import { battle, updateBattle } from '../modes/battle/index.js';
import { isInCamp, isRaidPicking, isRaiding, tickCards, tickRaid, tickRaidCamp } from '../modes/endless/index.js';
import { boarsPanic, tickMorale } from '../domains/conflict/morale/index.js';

export function update(dt) {
  if (game.loading) return; // (#326)
  if ((!game.gameStarted && game.gameMode !== 'menu') || game.isPaused || game.gameMode === 'editor') return; // the menu's world runs too
  if (game.gameMode === 'endless' && (game.cardOffer || isRaidPicking())) return; // (the game waits for a card or a raid party to be picked, #255)
  if (game.gameMode === 'endless' && isInCamp()) { updateCamp(dt); return; } // (a raid's camp: the base waits, #255)
  // battle mode: units stand still while being placed, and the result shows for a moment
  if (game.gameMode === 'battle') {
    updateBattle(dt);
    if (battle.phase !== 'fight') return;
  }
  startMarks();
  resetTileIndex();
  mark('resetTileIndex');
  game.pathTick++;

  updatePossessionView();
  mark('updatePossessionView');
  tickMorale(dt);
  mark('tickMorale');
  boarsPanic();
  mark('boarsPanic');
  if (!isRaiding()) tickWaveTimer(dt); // (a party out on a raid: the wave clock stops, #255)
  mark('isRaiding');
  updatePendingRespawns(dt);
  mark('updatePendingRespawns');
  makeBonesAndRot(dt);
  mark('makeBonesAndRot');
  updateTemporaryZombies(dt);
  mark('updateTemporaryZombies');
  fadeClearedBlight(dt);
  mark('fadeClearedBlight');
  updateBurning(dt);
  mark('updateBurning');
  raiseOnBlight(dt);
  mark('raiseOnBlight');
  tickMeals(dt);
  mark('tickMeals');
  tickBoarRespawn(dt);
  mark('tickBoarRespawn');
  growCrops(dt);
  mark('growCrops');
  tickBoars(dt);
  mark('tickBoars');
  tickCampfires(dt);
  mark('tickCampfires');
  tickFishPopulation(dt);
  mark('tickFishPopulation');
  tickFishTraps(dt);
  mark('tickFishTraps');
  tickSmelters(dt);
  mark('tickSmelters');
  tickSettlers(dt);
  mark('tickSettlers');
  tickEnemyTents(dt);
  mark('tickEnemyTents');
  tickPortalWave(dt); // (the demons' wave, a few at a time, #250)
  mark('tickPortalWave');
  tickScouts(dt); // (scouts between waves, #279)
  mark('tickScouts');
  tickDemonCamp(dt); // (their corpse pits and cages)
  mark('tickDemonCamp');
  tickProjectiles();
  mark('tickProjectiles');
  tickEnemies(dt);
  mark('tickEnemies');

  separateSettlersFromEnemies();
  mark('separateSettlersFromEnemies');
  separateAllies(game.settlers, true); separateAllies(game.enemies, true); // (#326)
  mark('separateAllies');
  for (const unit of game.settlers) tickAnimation(unit, dt);
  ageBloodAndDung(dt);
  mark('ageBloodAndDung');
  trackAllFootprints();
  mark('trackAllFootprints');
  for (const unit of game.enemies) tickAnimation(unit, dt);
  applySpikeTraps(dt);
  mark('applySpikeTraps');
  tickIronTraps(dt); // (#248)
  mark('tickIronTraps');

  removeDeadSettlers();
  mark('removeDeadSettlers');
  removeDeadEnemies();
  mark('removeDeadEnemies');
  updateCorpses(dt);
  mark('updateCorpses');
  ageStuckArrows(dt);
  mark('ageStuckArrows');
  tickLanterns(dt); // (souls out of a necromancer's lantern by a grave or the hall, #326)
  mark('tickLanterns');

  keepStoresInStep(); // what lies where, in step with the stock (#248)
  mark('keepStoresInStep');
  tickPaths(); // ground walked a lot wears into paths (#248)
  mark('tickPaths');
  tickDaytime(dt); // day and night (#257)
  mark('tickDaytime');
  tickWeather(dt); // (#308)
  mark('tickWeather');
  tickFog(dt); // (what the colony sees, #299)
  mark('tickFog');
  tickMenuScene(dt); // (the main menu's scene, #256)
  mark('tickMenuScene');
  tickNight();
  mark('tickNight');
  tickVoices(dt); // (#252)
  mark('tickVoices');
  if (!isRaiding()) tickCards(); // (#255)
  mark('isRaiding');
  tickRaidCamp(dt); // (#255)
  mark('tickRaidCamp');
  tickRaid(dt);
  mark('tickRaid');
  updateUnitCounts();
  mark('updateUnitCounts');
  updateUI();
  mark('updateUI');
  refreshAffordability();
  mark('refreshAffordability');
}

// A raid's camp (#255): only the fight goes on, the party against the camp; the base is put away
function updateCamp(dt) {
  resetTileIndex();
  game.pathTick++;
  updatePossessionView();
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
  ageStuckArrows(dt);
  tickVoices(dt);
  tickRaid(dt);
  updateUI();
  refreshAffordability();
}
