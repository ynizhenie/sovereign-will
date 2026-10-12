// Portals and horns

import { ctx } from '../../../engine/platform/canvas.js';
import { shadeColor } from '../factions.rules.js';

// A demon portal in its side's colour (#177): a dark rim, the colour, a bright heart
export function drawPortal(x, y, color) {
  ctx.fillStyle = shadeColor(color, -0.55); ctx.beginPath(); ctx.ellipse(x, y, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, 7.5, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shadeColor(color, 0.65); ctx.beginPath(); ctx.ellipse(x, y, 3, 5.5, 0, 0, Math.PI * 2); ctx.fill();
}

// A demon's horns (#43): two dark points on top of the body
export function drawHorns(x, y, r) {
  ctx.fillStyle = '#2c2c34';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * r * 0.35, y - r * 0.8); ctx.lineTo(x + side * r * 0.75, y - r * 1.45); ctx.lineTo(x + side * r * 0.8, y - r * 0.55);
    ctx.closePath(); ctx.fill();
  }
}
