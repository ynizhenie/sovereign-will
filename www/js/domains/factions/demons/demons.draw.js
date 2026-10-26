// Portals and horns

import { ctx } from '../../../engine/platform/index.js';
import { shadeColor } from '../index.js';

// A demon portal in its side's colour: a dark rim, the colour, a bright heart
export function drawPortal(x, y, color) {
  ctx.fillStyle = shadeColor(color, -0.55); ctx.beginPath(); ctx.ellipse(x, y, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, 7.5, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shadeColor(color, 0.65); ctx.beginPath(); ctx.ellipse(x, y, 3, 5.5, 0, 0, Math.PI * 2); ctx.fill();
}

// A demon's horns on its head (x, y its top's middle, r the head's size). Bone-pale with a dark edge, they show on a
// dark head too (#251). (#326) One style for every demon: a horn thick at the head, curving out and up and thin at
// the tip; a big demon's (curled) a ram's, out, up and round back down
export function drawHorns(x, y, r, curled = false) {
  for (const side of [-1, 1]) drawHorn(x + side * r * 0.42, y - r * 0.72, side, r * (curled ? 1.25 : 0.8), curled);
}

// One horn from (x, y), turned to `side` (-1 left, 1 right), `size` long; also a hellhound's (one side shown)
export function drawHorn(x, y, side, size, curled = false) {
  // its middle line: a plain one out and up, bending outward; a curled one a spiral round a point beside its
  // root: up, out, and round down
  const points = [];
  if (curled) {
    const r0 = size * 0.45, cx = x + side * r0, cy = y - r0 * 0.2, a0 = side > 0 ? Math.PI : 0;
    for (let i = 0; i <= 16; i++) { const k = i / 16, rho = r0 * (1 - 0.45 * k), a = a0 + side * k * Math.PI * 1.6; points.push([cx + Math.cos(a) * rho, cy + Math.sin(a) * rho]); }
  } else {
    for (let i = 0; i <= 8; i++) { const k = i / 8; points.push([x + side * size * (0.25 * k + 0.35 * k * k), y - size * (0.9 * k - 0.15 * k * k)]); }
  }
  // a tapering shape round the line: thick at the root, a point at the tip
  const root = size * (curled ? 0.24 : 0.22), left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i], [qx, qy] = points[Math.min(points.length - 1, i + 1)], [ox, oy] = points[Math.max(0, i - 1)];
    const dx = qx - ox, dy = qy - oy, len = Math.hypot(dx, dy) || 1, w = root * (1 - i / points.length);
    left.push([px - dy / len * w, py + dx / len * w]); right.push([px + dy / len * w, py - dx / len * w]);
  }
  ctx.fillStyle = '#e8d8b0'; ctx.strokeStyle = '#2c2c34'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(left[0][0], left[0][1]);
  for (const [px, py] of left) ctx.lineTo(px, py);
  for (const [px, py] of right.reverse()) ctx.lineTo(px, py);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // rings round it, darker
  ctx.strokeStyle = 'rgba(120, 100, 70, 0.6)'; ctx.lineWidth = 0.8;
  for (const i of [2, 4, 6].filter(i => i < points.length - 2)) { ctx.beginPath(); ctx.moveTo(left[i][0], left[i][1]); ctx.lineTo(right[right.length - 1 - i][0], right[right.length - 1 - i][1]); ctx.stroke(); }
}
