// One frame: the ground, then everything on it, layer by layer, then the marks over it

import { game, getTileIndex } from '../engine/world/index.js';
import { camera, canvas, ctx, getViewScale } from '../engine/platform/index.js';
import { drawEnemies, drawEnemyTentSites, drawEnemyTents, drawLoot } from '../domains/conflict/waves/index.js';
import { drawAllSpeech, drawDung, drawSelectedPaths, drawSettlers } from '../domains/colony/settlers/index.js';
import { drawPiles, drawStoreContents } from '../domains/colony/storage/index.js';
import { drawBoars, drawWallows } from '../domains/economy/hunting/index.js';
import { drawFarmPlots, drawFarmZones } from '../domains/economy/farming/index.js';
import { drawCactiBouldersGrassBushes, drawPriorityMarks, drawSticksPebblesOre, drawTrees } from '../domains/economy/gathering/index.js';
import { drawBlueprints, drawBuildGrid, drawBuildings, drawTownHall, drawUpgrades } from '../domains/economy/building/index.js';
import { drawBloodOnGround, drawCorpses, drawProjectiles } from '../domains/conflict/combat/index.js';
import { drawBlight, drawRaising, drawSouls } from '../domains/factions/undead/index.js';
import { drawDarkness, drawFog, drawGrassGround, drawMapBorder, drawPaths, drawRocks, drawSand, drawTerritory, drawWater, drawWeatherScreen, drawWeatherWorld } from '../domains/world/index.js';
import { isDefeated } from '../modes/endless/index.js';
import { battle, drawBattleOverlay, drawBattleResult } from '../modes/battle/index.js';
import { drawMoraleMarks } from '../domains/conflict/morale/index.js';
import { drawRaidZone } from '../modes/endless/index.js';

export function render() {
  if (game.loading) return; // (#326) the loading screen's: the last frame stays under it
  // (#326) past the map's edge: the fog's own dark
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  const viewScale = getViewScale();
  ctx.translate(canvas.width / 2 - camera.x * viewScale, canvas.height / 2 - camera.y * viewScale);
  ctx.scale(viewScale, viewScale);

  drawGrassGround();
  drawPaths(); // (#248)

  const terrain = getTileIndex();
  drawSand(); // (the desert's tiles, over the ground they cover)
  drawMapBorder(); // (over the sand: the field's edge is the same on a desert as on a glade)
  drawRaidZone(); // (an enemy camp's zone beyond the edge, #255)
  if (game.gameMode === 'battle' && battle.phase === 'setup') drawBattleOverlay(); // the halves only while placing, over the sand too
  drawBlight();
  drawFarmZones();
  drawBuildGrid();
  drawWater(terrain);
  drawRocks(terrain);
  drawTerritory(); // (the base's land, #299)
  drawWallows(); // (the ground boars dug, on the ground, #326)
  drawSelectedPaths(); // (where the picked ones are going, #326)
  drawSticksPebblesOre();
  drawLoot();
  drawPiles(); // (#248)
  drawTownHall();
  drawTrees();
  drawCactiBouldersGrassBushes();
  drawBoars();
  drawFarmPlots();
  drawPriorityMarks();
  drawBlueprints();
  drawBuildings();
  drawUpgrades(); // (over what they replace, #261)
  drawStoreContents(); // (#248)
  drawEnemyTents();
  drawBloodOnGround();
  drawDung();
  drawCorpses();
  drawEnemyTentSites();
  drawSettlers();
  drawEnemies();
  drawMoraleMarks();
  drawAllSpeech(ctx); // what they say, over them all and their panic marks (#252, #279)
  drawRaising();
  drawSouls(); // (flying into a necromancer's lantern, out of it into a grave, #326)
  drawProjectiles();
  drawWeatherWorld(); // (the water moving, the desert's shimmer, fog, #308)
  drawFog(); // (what the colony hasn't seen dark, what it doesn't see now dimmed, #299)

  ctx.restore();
  drawDarkness(); // (night, with its lights, #257)
  drawWeatherScreen(); // (rain, lightning, #308)

  if (game.gameMode === 'battle') drawBattleResult();
  // lost: the world dims a little under the defeat screen (an HTML overlay, see updateDefeat)
  if (isDefeated()) { ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}
