// How far a resource is worked through

import { TILE_SIZE, forEachInRect, game } from '../../../engine/world/index.js';
import { drawBoulderArt, drawBushArt, drawCactusArt, drawGrassArt, drawLogArt, drawPebblesArt, drawSaplingArt, drawStickArt, drawStumpArt, drawTreeArt } from './gathering.art.js';
import { ctx, drawProgressBar, getViewRect } from '../../../engine/platform/index.js';
import { getMapResourceDef, getMapResourceKind } from './gathering.rules.js';
import { drawOreVeins, isGroundCached } from '../../world/index.js';

export function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

export function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  drawProgressBar(resource.x, resource.y, (maxHp - Math.max(0, resource.hp)) / maxHp, width);
}

// (#299) only what's on the screen (with room for a tree's crown over the edge): a big map has thousands
const onScreen = (list, fn) => { const v = getViewRect(2 * TILE_SIZE); forEachInRect(list, v.x0, v.y0, v.x1, v.y1, fn); };

// Sticks and pebbles, and minable ore
export function drawSticksPebblesOre() {
  // (the look: gathering.art.js, #251)
  onScreen(game.sticks, drawStickArt);
  onScreen(game.pebbles, drawPebblesArt);
  onScreen(game.logs, drawLogArt); // (#298)

  // minable ore: the spawner's veined rock on a full tile, like natural rock (the spawner adds a frame and crystal)
  // (zoomed out: in the ground's pictures, #299)
  const pictured = isGroundCached();
  onScreen(game.ironOres, ore => {
    if (!pictured) drawOreVeins(ore.x, ore.y, 'iron', 14);
    drawHarvestProgress(ore);
  });

  onScreen(game.coalOres, ore => {
    if (!pictured) drawOreVeins(ore.x, ore.y, 'coal', 14);
    drawHarvestProgress(ore);
  });
}

// Trees: saplings growing, grown trees, apple trees with their apples (and the stumps of those felled)
export function drawTrees() {
  // (before the trees: a tree grown there covers its own stump, a felled one's log covers it)
  onScreen(game.stumps, drawStumpArt);
  onScreen(game.trees, t => {
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
  onScreen(game.cacti, c => {
    drawCactusArt(c);
    drawHarvestProgress(c);
  });

  onScreen(game.boulders, b => {
    drawBoulderArt(b); // (a loose, rounded stone, not the square rock that joins up)
    drawHarvestProgress(b);
  });

  onScreen(game.grassList, g => {
    drawGrassArt(g);
    drawHarvestProgress(g, 20);
  });

  onScreen(game.berryBushes, b => {
    drawBushArt(b); // (blue berries, as the Berries icon)
    drawHarvestProgress(b, 22);
  });
}

// The player's marks on resources: a square around it and a pointer over it, "here" (#232)
export function drawPriorityMarks() {
  // (#299: those on the screen, list by list; one list of everything made every frame was slow on a big map)
  const lists = [game.trees, game.cacti, game.boulders, game.grassList, game.berryBushes, game.sticks, game.pebbles, game.logs, game.loot,
    game.ironOres, game.coalOres, game.naturalRocks, game.farmPlots];
  const marked = [];
  for (const list of lists) onScreen(list, r => { if (r.priority > 0 && !r.isGrowing && (list !== game.farmPlots || r.growth >= 100)) marked.push(r); });
  marked.push(...game.boars.filter(b => b.priority > 0));
  marked.forEach(r => {
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
    ctx.strokeRect(r.x - 15, r.y - 15, TILE_SIZE, TILE_SIZE);
    // a small arrow pointing down at it, above the tile (clear of the progress bar)
    ctx.fillStyle = '#f1c40f'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(r.x - 6, r.y - 27); ctx.lineTo(r.x + 6, r.y - 27); ctx.lineTo(r.x, r.y - 18); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}
