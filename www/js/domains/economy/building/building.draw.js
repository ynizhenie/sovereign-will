// A damaged building looks it

// A damaged building looks it (#157): cracks spread over it as it loses hp, soot darkens it, and below a
// third of its hp some of it has fallen out. The cracks are fixed per building (by where it stands).
function drawDamage(x, y, half, share) {
  if (!(share < 0.9)) return;
  const harm = 1 - Math.max(0, share);
  const h = tileVariantHash(Math.round(x), Math.round(y));
  ctx.fillStyle = `rgba(20, 12, 8, ${0.45 * harm})`;
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  ctx.strokeStyle = 'rgba(15, 10, 6, 0.85)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const cracks = Math.min(4, 1 + Math.floor(harm * 4));
  for (let i = 0; i < cracks; i++) {
    const seed = (h >>> (i * 7)) & 127;
    // from an edge towards the middle, with a bend and a short branch
    const side = (seed + i) % 4;
    const along = ((seed % 13) / 12 - 0.5) * half * 1.6;
    const sx = x + (side === 0 ? -half : side === 1 ? half : along);
    const sy = y + (side === 2 ? -half : side === 3 ? half : along);
    const mx = sx + (x - sx) * 0.5 + ((seed % 5) - 2) * 2, my = sy + (y - sy) * 0.5 + ((seed % 7) - 3) * 1.5;
    const ex = sx + (x - sx) * (0.6 + harm * 0.5), ey = sy + (y - sy) * (0.6 + harm * 0.5);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.lineTo(ex, ey);
    ctx.moveTo(mx, my); ctx.lineTo(mx + ((seed % 3) - 1) * 5, my + 4);
    ctx.stroke();
  }
  if (share < 0.34) {
    // chunks broken off at two corners
    ctx.fillStyle = 'rgba(10, 8, 6, 0.75)';
    for (const [cx, cy] of [[1, -1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x + cx * half, y + cy * half); ctx.lineTo(x + cx * half * 0.45, y + cy * half); ctx.lineTo(x + cx * half, y + cy * half * 0.45);
      ctx.closePath(); ctx.fill();
    }
  }
}
