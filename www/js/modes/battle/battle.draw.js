// The field's midline while placing, and the winner

// ---- Drawing and the panel

function drawBattleOverlay() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.moveTo(game.WORLD_WIDTH / 2, 0); ctx.lineTo(game.WORLD_WIDTH / 2, game.WORLD_HEIGHT); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(46, 204, 113, 0.06)'; ctx.fillRect(0, 0, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT);
  ctx.fillStyle = 'rgba(231, 76, 60, 0.06)'; ctx.fillRect(game.WORLD_WIDTH / 2, 0, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT);
}

function drawBattleResult() {
  if (battle.phase !== 'result') return;
  ctx.save();
  ctx.scale(screenPixelRatio, screenPixelRatio);
  const cx = canvas.width / screenPixelRatio / 2, cy = canvas.height / screenPixelRatio / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 160, cy - 40, 320, 80);
  ctx.fillStyle = battle.winner === 'green' ? '#2ecc71' : battle.winner === 'red' ? '#e74c3c' : '#ecf0f1';
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(t(`battle.${battle.winner}Wins`), cx, cy + 9);
  ctx.restore();
}
