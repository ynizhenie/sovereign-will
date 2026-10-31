// Farm zones and wheat plots

import { drawIcon, isTabShown } from '../../../ui/index.js';
import { TILE_SIZE, forEachInRect, game } from '../../../engine/world/index.js';
import { ctx, getViewRect } from '../../../engine/platform/index.js';
import { drawFarmPlotArt } from '../gathering/index.js';

// Farm zones, while the Farming tab is open: a tint and a frame in the crop's colour
export function drawFarmZones() {
  const ZONE_COLORS = { wheat: '241, 196, 15', sapling: '46, 204, 113', apple: '231, 76, 60' };
  if (!isTabShown('tab-farming')) return;
  const v = getViewRect(30), visible = list => {
    const found = [];
    forEachInRect(list || [], v.x0, v.y0, v.x1, v.y1, z => found.push(z));
    return found;
  };
  // (#279) relief zones brown, soldiers' posts blue, with a mark of what they are
  /** @type {[{ x: number, y: number }[], string, string][]} */
  const kinds = [[game.reliefZones, '160, 110, 60', 'dung_heap'], [game.postZones, '52, 152, 219', 'shield'], [game.pathZones, '196, 170, 110', '']]; // (#326: a path's tint, no mark)
  for (const [list, rgb, icon] of kinds) {
    for (const z of visible(list)) {
      ctx.fillStyle = `rgba(${rgb}, 0.18)`; ctx.fillRect(z.x - 15, z.y - 15, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = `rgba(${rgb}, 0.7)`; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3); ctx.setLineDash([]);
      if (icon) { ctx.globalAlpha = 0.55; drawIcon(ctx, icon, z.x, z.y, 12); ctx.globalAlpha = 1; }
    }
  }
  visible(game.farmZones).forEach(z => {
    const rgb = ZONE_COLORS[z.crop] || ZONE_COLORS.sapling;
    ctx.fillStyle = `rgba(${rgb}, 0.14)`;
    ctx.fillRect(z.x - 15, z.y - 15, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = `rgba(${rgb}, 0.55)`;
    ctx.lineWidth = 1; ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3);
  });
}

// Wheat plots: growing, ripe, being harvested
export function drawFarmPlots() {
  const v = getViewRect(30), plots = [];
  forEachInRect(game.farmPlots, v.x0, v.y0, v.x1, v.y1, f => plots.push(f));
  plots.forEach(f => {
    // furrowed soil, wheat in rows from shoots to golden ears (fertilised: richer, darker soil, #201, #251)
    drawFarmPlotArt(f);
    if (f.growth >= 100) {
      if (f.harvestProgress > 0) {
        ctx.fillStyle = '#e67e22'; ctx.fillRect(f.x - 10, f.y + 11, (f.harvestProgress / 2.5) * 20, 3);
      }
    }
  });
}
