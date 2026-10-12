// One frame: the ground, then everything on it, layer by layer, then the marks over it

import { getTileIndex } from '../engine/world/grid.js';
import { game } from '../engine/world/state.js';
import { canvas, ctx, getViewScale } from '../engine/platform/canvas.js';
import { drawEnemies, drawEnemyTentSites, drawEnemyTents } from '../domains/conflict/waves/waves.draw.js';
import { camera } from '../engine/platform/camera.js';
import { drawDung, drawSettlers } from '../domains/colony/settlers/settlers.draw.js';
import { drawBoars } from '../domains/economy/hunting/hunting.draw.js';
import { drawFarmPlots, drawFarmZones } from '../domains/economy/farming/farming.draw.js';
import { drawCactiBouldersGrassBushes, drawPriorityMarks, drawSticksPebblesOre, drawTrees } from '../domains/economy/gathering/gathering.draw.js';
import { drawBlueprints, drawBuildGrid, drawBuildings, drawTownHall } from '../domains/economy/building/building.draw.js';
import { drawBloodOnGround, drawCorpses, drawProjectiles } from '../domains/conflict/combat/combat.draw.js';
import { drawBlight } from '../domains/factions/undead/undead.draw.js';
import { drawGrassGround, drawMapBorder, drawRocks, drawSand, drawWater } from '../domains/world/world.draw.js';
import { isDefeated } from '../modes/endless/endless.rules.js';
import { battle } from '../modes/battle/battle.setup.js';
import { drawBattleOverlay, drawBattleResult } from '../modes/battle/battle.draw.js';

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
  drawTownHall();
  drawTrees();
  drawCactiBouldersGrassBushes();
  drawBoars();
  drawFarmPlots();
  drawPriorityMarks();
  drawBlueprints();
  drawBuildings();
  drawEnemyTents();
  drawBloodOnGround();
  drawDung();
  drawCorpses();
  drawEnemyTentSites();
  drawSettlers();
  drawEnemies();
  drawProjectiles();

  ctx.restore();

  if (game.gameMode === 'battle') drawBattleResult();
  // lost (#191): the world dims a little under the defeat screen (an HTML overlay, see updateDefeat)
  if (isDefeated()) { ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}
