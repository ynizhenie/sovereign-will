// Farm zones and wheat plots

import { isTabShown } from '../../../ui/index.js';
import { TILE_SIZE, game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { drawFarmPlotArt } from '../gathering/index.js';

// Farm zones, while the Farming tab is open: a tint and a frame in the crop's colour
export function drawFarmZones() {
  const ZONE_COLORS = { wheat: '241, 196, 15', sapling: '46, 204, 113', apple: '231, 76, 60' };
  if (isTabShown('tab-farming')) game.farmZones.forEach(z => {
    const rgb = ZONE_COLORS[z.crop] || ZONE_COLORS.sapling;
    ctx.fillStyle = `rgba(${rgb}, 0.14)`;
    ctx.fillRect(z.x - 15, z.y - 15, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = `rgba(${rgb}, 0.55)`;
    ctx.lineWidth = 1; ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3);
  });
}

// Wheat plots: growing, ripe, being harvested
export function drawFarmPlots() {
  game.farmPlots.forEach(f => {
    // furrowed soil, wheat in rows from shoots to golden ears (fertilised: richer, darker soil, #201, #251)
    drawFarmPlotArt(f);
    if (f.growth >= 100) {
      if (f.harvestProgress > 0) {
        ctx.fillStyle = '#e67e22'; ctx.fillRect(f.x - 10, f.y + 11, (f.harvestProgress / 2.5) * 20, 3);
      }
    }
  });
}
