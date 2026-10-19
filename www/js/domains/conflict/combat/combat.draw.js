// Blood, arrows, flames and the target mark

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { bloodAlpha, bodyBloodAlpha } from './combat.rules.js';
import { corpseHasWorms } from '../../economy/fishing/index.js';
import { tileVariantHash } from '../../world/index.js';
import { drawFigure } from '../../colony/settlers/index.js';

// Blood on the blade of the held item, fading (see bleed)
export function drawWeaponBlood(unit) {
  const alpha = bloodAlpha(unit.weaponBloodAge);
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(120, 0, 0, ${0.85 * alpha})`;
  ctx.fillRect(14, -2, 7, 4);
}

// Blood on a hurt unit's body: a few blotches at spots fixed per unit; stays while badly wounded
export function drawBodyBlood(unit, radius) {
  const alpha = bodyBloodAlpha(unit);
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(110, 0, 0, ${0.8 * alpha})`;
  const h = tileVariantHash(Math.round(unit.id || unit.maxHp || 1), 7);
  for (let i = 0; i < 3; i++) {
    const a = ((h >>> (i * 5)) % 360) * Math.PI / 180, d = radius * 0.45;
    ctx.beginPath(); ctx.arc(unit.x + Math.cos(a) * d, unit.y + Math.sin(a) * d, 2.2 + i * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// An arrow in flight: a shaft along its way, a grey head, pale fletching (enemies' red)
export function drawArrow(proj) {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(Math.atan2(proj.vy, proj.vx));
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-9, -0.75, 13, 1.5);
  ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2.5); ctx.lineTo(3, 2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = proj.fromEnemy ? '#e74c3c' : '#ecf0f1';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, -2.5); ctx.lineTo(-7, 0); ctx.lineTo(-12, 2.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Flames licking up a burning unit
export function drawBurning(x, y, r) {
  const flicker = Math.sin(game.pathTick * 0.5) * 2;
  ctx.fillStyle = 'rgba(230, 126, 34, 0.85)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.quadraticCurveTo(x, y - r * 1.6 - flicker, x + r * 0.6, y); ctx.fill();
  ctx.fillStyle = 'rgba(241, 196, 15, 0.9)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.3, y); ctx.quadraticCurveTo(x, y - r - flicker, x + r * 0.3, y); ctx.fill();
}

// Enemy the player marked as a priority target: a red reticle
export function drawTargetMark(en) {
  const r = en.radius + 6;
  ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(en.x, en.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(en.x - r - 4, en.y); ctx.lineTo(en.x - r + 3, en.y);
  ctx.moveTo(en.x + r - 3, en.y); ctx.lineTo(en.x + r + 4, en.y);
  ctx.moveTo(en.x, en.y - r - 4); ctx.lineTo(en.x, en.y - r + 3);
  ctx.moveTo(en.x, en.y + r - 3); ctx.lineTo(en.x, en.y + r + 4);
  ctx.stroke();
}

// Blood on the ground, and footprints out of blood or dung
export function drawBloodOnGround() {
  game.bloodSplats.forEach(b => {
    const rgb = b.color === 'dung' ? '92, 64, 26' : '100, 0, 0';
    ctx.fillStyle = `rgba(${rgb}, ${0.55 * bloodAlpha(b.age)})`;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 1.3, b.r, 0, 0, Math.PI * 2); ctx.fill();
  });
}

// Corpses: grey, fading out over their last 10 seconds; worms on them
export function drawCorpses() {
  game.corpses.forEach(c => {
    const left = GAME_CONFIG.corpses.seconds - c.age;
    ctx.globalAlpha = Math.max(0, Math.min(1, left / 10)) * 0.9;
    // a grey figure lying on its side, crosses for its eyes (#251)
    const grey = c.side === 'enemy' ? '#6e6e6e' : '#8a8a8a';
    drawFigure(c, { x: c.x, y: c.y, r: Math.min(c.radius, 16), body: grey, skin: '#9a9a9a', lying: true, dead: true });
    if (corpseHasWorms(c)) {
      // worms: a few pink squiggles on it
      ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 1.5;
      for (const [wx, wy] of [[-5, 4], [3, 6], [5, -3]]) {
        ctx.beginPath(); ctx.moveTo(c.x + wx - 3, c.y + wy); ctx.quadraticCurveTo(c.x + wx, c.y + wy - 3, c.x + wx + 3, c.y + wy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  });
}

// Arrows and fireballs in flight
export function drawProjectiles() {
  game.projectiles.forEach(proj => {
    // fireballs bigger and orange; everything else is an arrow, pointing where it flies
    if (proj.fire) { ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f1c40f'; }
    else { drawArrow(proj); return; }
    ctx.beginPath(); ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2); ctx.fill();
  });
}
