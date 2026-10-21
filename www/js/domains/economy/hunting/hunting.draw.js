// Boars, and their carcasses

import { game } from '../../../engine/world/index.js';
import { ctx, drawProgressBar } from '../../../engine/platform/index.js';
import { drawBodyBlood } from '../../conflict/combat/index.js';
import { GAME_CONFIG } from '../../../content/configs/index.js';
import { boarWallows } from './hunting.rules.js';
import { castShadow } from '../../world/index.js';

// A boar (#251), its side to us, facing the way it last went: a bristly body, legs stepping, its head with
// snout, tusks and an ear, a curly tail. A carcass: on its back, legs up, a cross for its eye
function drawBoarBody(b, dead) {
  if (b.lastX !== undefined && Math.abs(b.x - b.lastX) > 0.05) b.faceX = b.x > b.lastX ? 1 : -1;
  if (!dead) { b.step = ((b.step || 0) + Math.hypot(b.x - (b.lastX ?? b.x), b.y - (b.lastY ?? b.y))) % 1000; b.lastX = b.x; b.lastY = b.y; }
  const d = b.faceX || 1;
  // (#306) digging: its head down and up in the earth, a bit flying; lying: low, its legs under it, eyes shut
  const digging = !dead && b.rest && b.rest.stage === 'dig', lying = !dead && b.rest && b.rest.stage === 'lie';
  ctx.save();
  ctx.translate(b.x, b.y + (lying ? 4 : 0));
  ctx.scale(d, dead ? -1 : 1);
  if (!dead) { ctx.save(); ctx.scale(d, 1); castShadow(ctx, 0, lying ? 5 : 9, 12, 3.5, lying ? 6 : 12); ctx.restore(); } // (#307)
  // legs (folded under it lying)
  const step = dead || lying ? 0 : Math.sin((b.step || 0) * 0.5) * 1.6;
  ctx.fillStyle = '#4e2f1f';
  if (!lying) for (const [lx, dy] of [[-8, step], [-4, -step], [4, step], [8, -step]]) ctx.fillRect(lx - 1.3, 3 + dy * 0.5, 2.6, 6);
  const nod = digging ? Math.abs(Math.sin(game.pathTick * 0.25)) * 4 : 0;
  if (digging && Math.sin(game.pathTick * 0.25) > 0.6) {
    ctx.fillStyle = '#5d4037';
    for (const [px, py] of [[18, 2], [20, -2], [16, -4]]) ctx.fillRect(px + (game.pathTick % 3), py - (game.pathTick % 5), 1.6, 1.6);
  }
  // the body, darker bristles along its back
  ctx.fillStyle = '#8e5a3b'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(-1, 0, 12, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#5d3a24'; ctx.lineWidth = 1;
  for (let k = -9; k <= 5; k += 2.5) { ctx.beginPath(); ctx.moveTo(k, -6.5); ctx.lineTo(k + 1, -9); ctx.stroke(); }
  // the tail
  ctx.strokeStyle = '#5d3a24'; ctx.beginPath(); ctx.arc(-14, -2, 2, 0, Math.PI * 1.6); ctx.stroke();
  // the head, snout, tusk, ear, eye (down in the earth, nodding, digging)
  ctx.save(); ctx.translate(0, nod);
  ctx.fillStyle = '#7a4b30'; ctx.strokeStyle = '#3e2723';
  ctx.beginPath(); ctx.ellipse(11, -1, 6, 5, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c08a6e'; ctx.beginPath(); ctx.ellipse(16.5, 0.5, 2.6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e2723'; ctx.fillRect(16.8, -0.2, 1, 1); ctx.fillRect(16.8, 1.2, 1, 1);
  ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.moveTo(14, 2.5); ctx.lineTo(15.5, -0.5); ctx.lineTo(15.5, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5d3a24'; ctx.beginPath(); ctx.moveTo(9, -4.5); ctx.lineTo(10.5, -9); ctx.lineTo(12.5, -4.5); ctx.closePath(); ctx.fill();
  if (dead) {
    ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(11, -3); ctx.lineTo(14, 0); ctx.moveTo(14, -3); ctx.lineTo(11, 0); ctx.stroke();
  } else if (lying) {
    ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(11.6, -2); ctx.lineTo(13.4, -1.6); ctx.stroke();
  } else {
    ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(12.5, -2, 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

// (#306) the ground dug: darker under one lying in it, fading once it's gone
function drawWallows() {
  const fade = GAME_CONFIG.mapResources.boar.wallowFade;
  for (const w of boarWallows) {
    const a = w.boar ? 0.42 : 0.42 * Math.max(0, 1 - w.age / fade);
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(55, 38, 22, ${a})`; ctx.beginPath(); ctx.ellipse(w.x, w.y + 4, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(80, 55, 30, ${a * 0.8})`; ctx.beginPath(); ctx.ellipse(w.x + 12, w.y + 5, 6, 3, 0.3, 0, Math.PI * 2); ctx.fill();
  }
}

// Boars (faded while hidden), and carcasses being butchered
export function drawBoars() {
  drawWallows();
  game.boars.forEach(b => {
    ctx.save();
    if (b.isCarcass) {
      drawBoarBody(b, true);
      drawBodyBlood(b, 9);
      if (b.butcher > 0) drawProgressBar(b.x, b.y - 14, b.butcher, 24);
      ctx.restore();
      return;
    }
    if (b.hidden) ctx.globalAlpha = 0.4;
    drawBoarBody(b, false);
    drawBodyBlood(b, 11);
    if (b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(b.x - 12, b.y - 16, 24, 3);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(b.x - 12, b.y - 16, (b.hp / b.maxHp) * 24, 3);
    }
    ctx.restore();
  });
}
