// One frame: the ground, then everything on it, layer by layer, then the marks over it

function render() {
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
