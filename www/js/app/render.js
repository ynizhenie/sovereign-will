// One frame: the ground, then everything on it, layer by layer, then the marks over it

import { game, getTileIndex } from '../engine/world/index.js';
import { camera, canvas, ctx, getViewScale } from '../engine/platform/index.js';
import { drawEnemies, drawEnemyTentSites, drawEnemyTents, drawLoot } from '../domains/conflict/waves/index.js';
import { drawDung, drawSettlers } from '../domains/colony/settlers/index.js';
import { drawPiles, drawStoreContents } from '../domains/colony/storage/index.js';
import { drawBoars } from '../domains/economy/hunting/index.js';
import { drawFarmPlots, drawFarmZones } from '../domains/economy/farming/index.js';
import { drawCactiBouldersGrassBushes, drawPriorityMarks, drawSticksPebblesOre, drawTrees } from '../domains/economy/gathering/index.js';
import { drawBlueprints, drawBuildGrid, drawBuildings, drawTownHall } from '../domains/economy/building/index.js';
import { drawBloodOnGround, drawCorpses, drawProjectiles } from '../domains/conflict/combat/index.js';
import { drawBlight, drawRaising } from '../domains/factions/undead/index.js';
import { drawGrassGround, drawMapBorder, drawRocks, drawSand, drawWater } from '../domains/world/index.js';
import { isDefeated } from '../modes/endless/index.js';
import { battle, drawBattleOverlay, drawBattleResult } from '../modes/battle/index.js';
import { drawMoraleMarks } from '../domains/conflict/morale/index.js';

export function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  const viewScale = getViewScale();
  ctx.translate(canvas.width / 2 - camera.x * viewScale, canvas.height / 2 - camera.y * viewScale);
  ctx.scale(viewScale, viewScale);

  drawGrassGround();

  const terrain = getTileIndex();
  drawMapBorder();
  if (game.gameMode === 'battle' && battle.phase === 'setup') drawBattleOverlay(); // the halves only while placing
  drawSand();
  drawBlight();
  drawFarmZones();
  drawBuildGrid();
  drawWater(terrain);
  drawRocks(terrain);
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
  drawStoreContents(); // (#248)
  drawEnemyTents();
  drawBloodOnGround();
  drawDung();
  drawCorpses();
  drawEnemyTentSites();
  drawSettlers();
  drawEnemies();
  drawMoraleMarks();
  drawRaising();
  drawProjectiles();

  ctx.restore();

  if (game.gameMode === 'battle') drawBattleResult();
  // lost: the world dims a little under the defeat screen (an HTML overlay, see updateDefeat)
  if (isDefeated()) { ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}
