// One frame: the ground, then everything on it, layer by layer, then the marks over it

import { game, getTileIndex } from '../engine/world/index.js';
import { camera, canvas, ctx, getViewRect, getViewScale } from '../engine/platform/index.js';
import { drawEnemies, drawEnemyRafts, drawEnemyShadows, drawEnemyTentSites, drawEnemyTents, drawLoot } from '../domains/conflict/waves/index.js';
import { drawAllSpeech, drawDung, drawSelectedPaths, drawSettlerShadows, drawSettlers } from '../domains/colony/settlers/index.js';
import { drawPiles, drawStoreContents } from '../domains/colony/storage/index.js';
import { drawBoars, drawWallows } from '../domains/economy/hunting/index.js';
import { drawFarmPlots, drawFarmZones } from '../domains/economy/farming/index.js';
import { depthSortedTrees, drawCactiBouldersGrassBushes, drawDepthTree, drawPriorityMarks, drawStillShadows, drawSticksPebblesOre, drawTrees } from '../domains/economy/gathering/index.js';
import { drawBlueprints, drawBuildGrid, drawBuildings, drawTownHall, drawUpgrades } from '../domains/economy/building/index.js';
import { drawBloodOnGround, drawCorpses, drawProjectiles } from '../domains/conflict/combat/index.js';
import { drawBlight, drawRaising, drawSouls } from '../domains/factions/undead/index.js';
import { beginShadowFrame, drawDarkness, drawFog, drawGrassGround, drawMapBorder, drawPaths, drawShadowLayer, endShadowFrame, drawRocks, drawSand, drawTerritory, drawWater, drawWeatherScreen, drawWeatherWorld, isContinentMap } from '../domains/world/index.js';
import { isDefeated } from '../modes/endless/index.js';
import { battle, drawBattleOverlay, drawBattleResult } from '../modes/battle/index.js';
import { drawMoraleMarks } from '../domains/conflict/morale/index.js';

export function render() {
  if (game.loading) return; // (#326) the loading screen's: the last frame stays under it
  // (#326) past the map's edge: the fog's own dark
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  const viewScale = getViewScale();
  ctx.translate(canvas.width / 2 - camera.x * viewScale, canvas.height / 2 - camera.y * viewScale);
  ctx.scale(viewScale, viewScale);
  if (isContinentMap()) {
    const transform = ctx.getTransform();
    // Keep the clip edge on screen pixels; fractional edges leave a resampling fringe outside the map.
    const left = Math.ceil(transform.e), top = Math.ceil(transform.f);
    const right = Math.floor(transform.a * game.WORLD_WIDTH + transform.e);
    const bottom = Math.floor(transform.d * game.WORLD_HEIGHT + transform.f);
    ctx.beginPath();
    ctx.rect((left - transform.e) / transform.a, (top - transform.f) / transform.d,
      (right - left) / transform.a, (bottom - top) / transform.d);
    ctx.clip();
    ctx.beginPath();
  }
  beginShadowFrame(ctx); // (the shadows drawn in the world from here are kept for the next frame's, see drawShadowLayer)

  drawGrassGround();
  drawPaths(); // (#248)

  const terrain = getTileIndex();
  drawSand(); // (the desert's tiles, over the ground they cover)
  drawMapBorder(); // (over the sand: the field's edge is the same on a desert as on a glade)
  if (game.gameMode === 'battle' && battle.phase === 'setup') drawBattleOverlay(); // the halves only while placing, over the sand too
  drawBlight();
  drawFarmZones();
  drawBuildGrid();
  drawWater(terrain);
  drawRocks(terrain);
  drawTerritory(); // (the base's land, #299)
  drawEditorOutposts();
  // all the shadows at once, on the ground under everything that stands on it (world.daytime.js)
  drawShadowLayer(drawStillShadows, () => { drawSettlerShadows(); drawEnemyShadows(); });
  drawWallows(); // (the ground boars dug, on the ground, #326)
  drawSelectedPaths(); // (where the picked ones are going, #326)
  drawSticksPebblesOre();
  drawLoot();
  drawPiles(); // (#248)
  drawTownHall();
  drawTrees();
  drawCactiBouldersGrassBushes();
  drawFarmPlots();
  drawPriorityMarks();
  drawBlueprints();
  drawBuildings();
  drawUpgrades(); // (over what they replace, #261)
  drawStoreContents(); // (#248)
  drawEnemyTents();
  drawEnemyRafts();
  drawBloodOnGround();
  drawDung();
  drawCorpses();
  drawEnemyTentSites();
  drawDepthSortedScene();
  drawMoraleMarks();
  drawAllSpeech(ctx); // what they say, over them all and their panic marks (#252, #279)
  drawRaising();
  drawSouls(); // (flying into a necromancer's lantern, out of it into a grave, #326)
  drawProjectiles();
  drawWeatherWorld(); // (the water moving, the desert's shimmer, fog, #308)
  drawFog(); // (what the colony hasn't seen dark, what it doesn't see now dimmed, #299)
  endShadowFrame();

  ctx.restore();
  drawDarkness(); // (night, with its lights, #257)
  drawWeatherScreen(); // (rain, lightning, #308)

  if (game.gameMode === 'battle') drawBattleResult();
  // lost: the world dims a little under the defeat screen (an HTML overlay, see updateDefeat)
  if (isDefeated()) { ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}

export function drawDepthSorted(items) {
  items.sort((a, b) => a.depth - b.depth || a.order - b.order);
  for (const item of items) item.draw();
}

function drawDepthSortedScene() {
  const trees = depthSortedTrees();
  if (!trees.length) {
    drawBoars();
    drawSettlers();
    drawEnemies();
    return;
  }
  const view = getViewRect(60);
  const items = trees.map(tree => ({ depth: tree.y + 13, order: 0, draw: () => drawDepthTree(tree) }));
  const addActors = (list, offset, order, draw) => {
    for (const actor of list) {
      if (actor.x < view.x0 || actor.x > view.x1 || actor.y < view.y0 || actor.y > view.y1) continue;
      items.push({ depth: actor.y + offset(actor), order, draw: () => draw(actor) });
    }
  };
  addActors(game.boars, () => 9, 1, boar => drawBoars(boar));
  addActors(game.settlers, settler => (settler.visualRadius || settler.radius || 11) * 0.95, 2, settler => drawSettlers(settler));
  addActors(game.enemies, enemy => (enemy.visualRadius || enemy.radius || 11) * 0.95, 3, enemy => drawEnemies(enemy));
  addActors(game.scouts, enemy => (enemy.visualRadius || enemy.radius || 11) * 0.95, 3, enemy => drawEnemies(enemy));
  drawDepthSorted(items);
}

function drawEditorOutposts() {
  if (game.gameMode !== 'editor') return;
  game.editorOutposts.forEach((outpost, i) => {
    ctx.save();
    ctx.fillStyle = '#641e16';
    ctx.strokeStyle = '#f5b041';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(outpost.x, outpost.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f5b041';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), outpost.x, outpost.y);
    ctx.restore();
  });
}
