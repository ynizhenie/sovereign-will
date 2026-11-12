// The field's midline while placing, and the winner

// ---- Drawing and the panel

import { canvas, ctx, getViewRect, screenPixelRatio, t } from '../../engine/platform/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { game } from '../../engine/world/index.js';
import { sides } from '../../domains/factions/index.js';
import { battle } from './battle.setup.js';

export function drawBackroomsFloor() {
  const view = getViewRect();
  const x0 = Math.max(0, Math.floor(view.x0 / 30) * 30), x1 = Math.min(game.WORLD_WIDTH, view.x1);
  const y0 = Math.max(0, Math.floor(view.y0 / 30) * 30), y1 = Math.min(game.WORLD_HEIGHT, view.y1);
  ctx.fillStyle = '#b7a45e';
  ctx.fillRect(0, 0, game.WORLD_WIDTH, game.WORLD_HEIGHT);
  for (let y = y0; y < y1; y += 30) {
    for (let x = x0; x < x1; x += 30) {
      const hash = Math.imul(x / 30 + 1, 374761393) ^ Math.imul(y / 30 + 1, 668265263);
      ctx.fillStyle = ['#c5b66e', '#c2b16a', '#c8b972', '#bead65'][hash & 3];
      ctx.fillRect(x, y, 30, 30);
      ctx.fillStyle = 'rgba(255, 242, 174, 0.14)';
      ctx.fillRect(x, y, 30, 1);
      ctx.fillStyle = 'rgba(101, 81, 37, 0.12)';
      ctx.fillRect(x, y + 29, 30, 1);
      ctx.fillStyle = 'rgba(94, 75, 35, 0.1)';
      ctx.fillRect(x + 5 + ((hash >>> 4) & 15), y + 6 + ((hash >>> 9) & 14), 2, 2);
      if ((hash & 7) === 0) ctx.fillRect(x + 18, y + 20, 3, 1);
    }
  }
}

export function drawBattleOverlay() {
  if (battle.fieldHighlight !== 'off') {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = battle.fieldHighlight === 'team' ? sides.battle.green : '#2ecc71';
    ctx.fillRect(0, 0, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT);
    ctx.fillStyle = battle.fieldHighlight === 'team' ? sides.battle.red : '#c0392b';
    ctx.fillRect(game.WORLD_WIDTH / 2, 0, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.moveTo(game.WORLD_WIDTH / 2, 0); ctx.lineTo(game.WORLD_WIDTH / 2, game.WORLD_HEIGHT); ctx.stroke();
  ctx.setLineDash([]);
}

// (#326) Who won, in words (the side's colour named): "The red won!", or a draw
export function battleWinnerText() {
  return battle.winner === 'green' || battle.winner === 'red' ? t('battle.wins', { color: t(`color.${GAME_CONFIG.factionColorNames[sides.battle[battle.winner]]}`) }) : t('battle.drawWins');
}

export function drawBattleResult() {
  if (battle.phase !== 'result') return;
  ctx.save();
  ctx.scale(screenPixelRatio, screenPixelRatio);
  const cx = canvas.width / screenPixelRatio / 2, cy = canvas.height / screenPixelRatio / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cx - 160, cy - 40, 320, 80);
  ctx.fillStyle = battle.winner === 'green' || battle.winner === 'red' ? sides.battle[battle.winner] : '#ecf0f1'; // (its colour, #326)
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(battleWinnerText(), cx, cy + 9);
  ctx.restore();
}
