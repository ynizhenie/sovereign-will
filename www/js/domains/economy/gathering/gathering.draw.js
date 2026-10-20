// How far a resource is worked through

import { TILE_SIZE, game } from '../../../engine/world/index.js';
import { drawBoulderArt, drawBushArt, drawCactusArt, drawGrassArt, drawLogArt, drawPebblesArt, drawSaplingArt, drawStickArt, drawTreeArt } from './gathering.art.js';
import { ctx, drawProgressBar } from '../../../engine/platform/index.js';
import { getHarvestableResources, getMapResourceDef, getMapResourceKind } from './gathering.rules.js';
import { drawOreVeins } from '../../world/index.js';

export function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

export function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  drawProgressBar(resource.x, resource.y, (maxHp - Math.max(0, resource.hp)) / maxHp, width);
}

// Sticks and pebbles, and minable ore
export function drawSticksPebblesOre() {
  // (the look: gathering.art.js, #251)
  game.sticks.forEach(drawStickArt);
  game.pebbles.forEach(drawPebblesArt);
  game.logs.forEach(drawLogArt); // (#298)

  // minable ore: the spawner's veined rock on a full tile, like natural rock (the spawner adds a frame and crystal)
  game.ironOres.forEach(ore => {
    drawOreVeins(ore.x, ore.y, 'iron', 14);
    drawHarvestProgress(ore);
  });

  game.coalOres.forEach(ore => {
    drawOreVeins(ore.x, ore.y, 'coal', 14);
    drawHarvestProgress(ore);
  });
}

// Trees: saplings growing, grown trees, apple trees with their apples
export function drawTrees() {
  game.trees.forEach(t => {
    if (t.isGrowing) {
      drawSaplingArt(t);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(t.x - 10, t.y + 8, 20, 3);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(t.x - 10, t.y + 8, ((t.growProgress || 0) / 20) * 20, 3);
    } else {
      // apple trees: a lighter crown; red apples on it when ripe
      drawTreeArt(t);
      drawHarvestProgress(t);
      // apples being picked: pickShare is kept up only while someone is at it
      if (t.apple && t.pickShare > 0 && game.pathTick - t.pickTick < 3) drawProgressBar(t.x, t.y, t.pickShare);
    }
  });
}

// Cacti, boulders, grass and berry bushes
export function drawCactiBouldersGrassBushes() {
  game.cacti.forEach(c => {
    drawCactusArt(c);
    drawHarvestProgress(c);
  });

  game.boulders.forEach(b => {
    drawBoulderArt(b); // (a loose, rounded stone, not the square rock that joins up)
    drawHarvestProgress(b);
  });

  game.grassList.forEach(g => {
    drawGrassArt(g);
    drawHarvestProgress(g, 20);
  });

  game.berryBushes.forEach(b => {
    drawBushArt(b); // (blue berries, as the Berries icon)
    drawHarvestProgress(b, 22);
  });
}

// The player's marks on resources: a square around it and a pointer over it, "here" (#232)
export function drawPriorityMarks() {
  getHarvestableResources().forEach(r => {
    if (r.priority > 0) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 15, r.y - 15, TILE_SIZE, TILE_SIZE);
      // a small arrow pointing down at it, above the tile (clear of the progress bar)
      ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(r.x - 6, r.y - 27); ctx.lineTo(r.x + 6, r.y - 27); ctx.lineTo(r.x, r.y - 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  });
}
