// Boars, and their carcasses

// Boars (faded while hidden), and carcasses being butchered
function drawBoars() {
  boars.forEach(b => {
    ctx.save();
    if (b.isCarcass) {
      ctx.fillStyle = '#633c2b';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 3, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3e2723';
      ctx.beginPath(); ctx.arc(b.x + 11, b.y + 1, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b85c4a';
      ctx.fillRect(b.x - 4, b.y + 1, 5, 3);
      ctx.strokeStyle = '#2b1b17'; ctx.lineWidth = 2; ctx.stroke();
      drawBodyBlood(b, 9);
      if (b.butcher > 0) drawProgressBar(b.x, b.y - 14, b.butcher, 24);
      ctx.restore();
      return;
    }
    if (b.hidden) ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#a0522d'; ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.stroke();
    drawIcon(ctx, 'boar', b.x, b.y, 17);
    drawBodyBlood(b, 11);
    if (b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(b.x - 12, b.y - 16, 24, 3);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(b.x - 12, b.y - 16, (b.hp / b.maxHp) * 24, 3);
    }
    ctx.restore();
  });
}
