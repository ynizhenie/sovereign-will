// One step of the game: every mechanic's turn, in order

import { game, resetTileIndex } from '../engine/world/index.js';
import { removeDeadSettlers, tickAnimation, tickMeals, tickNight, tickSettlers, tickVoices, updatePossessionView } from '../domains/colony/settlers/index.js';
import { tickSmelters } from '../domains/economy/building/index.js';
import { refreshAffordability, updateUI } from '../ui/index.js';
import { removeDeadEnemies, tickEnemies, tickEnemyRafts, tickEnemyTents, tickPortalWave, tickScouts, tickWaveTimer } from '../domains/conflict/waves/index.js';
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
import { battle, updateBattle } from '../modes/battle/index.js';
import { isRaidPicking, isRaiding, raid, tickCards, tickRaid, tickRaidCamp } from '../modes/endless/index.js';
import { boarsPanic, tickMorale } from '../domains/conflict/morale/index.js';
import { plagueCardPending, tickPlague } from '../modes/plague/index.js';

// hud: the panels brought up to date at the end of it (the loop does that itself, a few times a second: see gameLoop)
export function update(dt, hud = true) {
  if (game.loading) return; // (#326)
  if ((!game.gameStarted && game.gameMode !== 'menu') || game.isPaused || game.gameMode === 'editor') return; // the menu's world runs too
  if ((game.gameMode === 'endless' && game.cardOffer) || plagueCardPending() || (game.gameMode === 'endless' && isRaidPicking())) return; // (the game waits for a card or a raid party to be picked, #255)
  tickPlague(dt);
  // battle mode: units stand still while being placed, and the result shows for a moment
  if (game.gameMode === 'battle') {
    updateBattle(dt);
    if (battle.phase !== 'fight') return;
  }
  resetTileIndex();
  game.pathTick++;

  if (game.gameMode === 'menu') {
    updateMenuScene(dt);
    return;
  }

  updatePossessionView();
  tickMorale(dt);
  boarsPanic();
  if (!isRaiding() || raid.scouting) tickWaveTimer(dt); // (scouting doesn't pause the world)
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
  tickSettlers(dt);
  tickEnemyRafts(dt);
  tickEnemyTents(dt);
  tickPortalWave(dt); // (the demons' wave, a few at a time, #250)
  tickScouts(dt); // (scouts between waves, #279)
  tickDemonCamp(dt); // (their corpse pits and cages)
  tickProjectiles(dt);
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
  ageStuckArrows(dt);
  tickLanterns(dt); // (souls out of a necromancer's lantern by a grave or the hall, #326)

  keepStoresInStep(); // what lies where, in step with the stock (#248)
  tickPaths(); // ground walked a lot wears into paths (#248)
  tickDaytime(dt); // day and night (#257)
  tickWeather(dt); // (#308)
  tickFog(dt); // (what the colony sees, #299)
  tickMenuScene(dt); // (the main menu's scene, #256)
  tickNight();
  tickVoices(dt); // (#252)
  if (!isRaiding() || raid.scouting) tickCards(); // (#255; scouting doesn't pause the world)
  tickRaidCamp(dt); // (#255)
  tickRaid(dt);
  if (hud) { updateUI(); refreshAffordability(); }
  return true; // (a whole step of the game made: the panels have something new to show)
}

function updateMenuScene(dt) {
  boarsPanic();
  tickBoarRespawn(dt);
  growCrops(dt);
  tickBoars(dt);
  tickCampfires(dt);
  tickFishPopulation(dt);
  tickSettlers(dt);
  tickProjectiles(dt);
  tickEnemies(dt);

  separateSettlersFromEnemies();
  separateAllies(game.settlers, true);
  separateAllies(game.enemies, true);
  for (const unit of game.settlers) tickAnimation(unit, dt);
  for (const unit of game.enemies) tickAnimation(unit, dt);

  removeDeadSettlers();
  removeDeadEnemies();
  updateCorpses(dt);
  keepStoresInStep();
  tickDaytime(dt);
  tickMenuScene(dt);
  tickVoices(dt);
  tickNight();
}
