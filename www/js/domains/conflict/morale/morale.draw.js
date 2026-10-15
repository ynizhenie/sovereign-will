// Morale over heads (#207): a yellow "!" over a shaken unit, a red "!!" over a panicking one

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { baseMorale } from './morale.rules.js';

export function drawMoraleMarks() {
  const c = GAME_CONFIG.morale;
  ctx.save();
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  for (const unit of [...game.settlers, ...game.enemies, ...game.boars]) {
    if (unit.morale === undefined || unit.isCarcass) continue;
    // shaken: well below where it settles, and not steady yet
    const shaken = !unit.panic && unit.morale < c.calmAbove && unit.morale < baseMorale(unit) - 10;
    if (!unit.panic && !shaken) continue;
    const mark = unit.panic ? '!!' : '!';
    const y = unit.y - (unit.visualRadius || unit.radius || 11) - 20;
    ctx.fillStyle = unit.panic ? '#ff4d4d' : '#f1c40f';
    ctx.strokeText(mark, unit.x, y); ctx.fillText(mark, unit.x, y);
  }
  ctx.restore();
}
