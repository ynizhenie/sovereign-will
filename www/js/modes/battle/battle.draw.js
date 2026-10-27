// The field's midline while placing, and the winner

// ---- Drawing and the panel

import { canvas, ctx, screenPixelRatio, t } from '../../engine/platform/index.js';
import { GAME_CONFIG } from '../../content/configs/index.js';
import { game } from '../../engine/world/index.js';
import { sides } from '../../domains/factions/index.js';
import { battle } from './battle.setup.js';

export function drawBattleOverlay() {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.moveTo(game.WORLD_WIDTH / 2, 0); ctx.lineTo(game.WORLD_WIDTH / 2, game.WORLD_HEIGHT); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(46, 204, 113, 0.06)'; ctx.fillRect(0, 0, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT);
  ctx.fillStyle = 'rgba(231, 76, 60, 0.06)'; ctx.fillRect(game.WORLD_WIDTH / 2, 0, game.WORLD_WIDTH / 2, game.WORLD_HEIGHT);
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
