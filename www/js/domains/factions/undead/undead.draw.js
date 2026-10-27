// The necromancer's staff

import { isTabShown } from '../../../ui/index.js';
import { GAME_CONFIG } from '../../../content/configs/index.js';
import { TILE_SIZE, game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { updateBlightCache } from './undead.rules.js';

// A necromancer's staff, a pale purple orb at its top
// (#326) in the other items' style: a gnarled shaft, bound in two places, a bone claw at its top holding a stone in
// its side's colour; in the dark the stone glows that colour (`color`; dark: how dark it is, 0..1)
export function drawStaff(color = '#bb8fce', dark = 0) {
  // held a third of the way up (#279: from the hand, not floating past it)
  ctx.fillStyle = '#5d3a1d'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(6, -1.3); ctx.lineTo(9, -0.8); ctx.lineTo(17, -1.2); ctx.lineTo(17, 1.2); ctx.lineTo(9, 1); ctx.lineTo(6, 1.3); ctx.lineTo(-7, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c8b28a'; ctx.fillRect(2, -1.6, 1.4, 3.2); ctx.fillRect(14, -1.6, 1.4, 3.2); // (its bindings)
  // the claw: three bone prongs round the stone
  ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  for (const side of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(17, side * 0.8); ctx.quadraticCurveTo(19, side * 4.2, 22.5, side * 3.4); ctx.stroke(); }
  ctx.lineCap = 'butt';
  if (dark > 0) {
    const glow = ctx.createRadialGradient(21, 0, 1, 21, 0, 14);
    glow.addColorStop(0, color); glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save(); ctx.globalAlpha = Math.min(1, dark * 1.2) * (0.55 + 0.15 * Math.sin(game.pathTick * 0.08)); ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(21, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(21, 0, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.beginPath(); ctx.arc(20, -1, 1.1, 0, Math.PI * 2); ctx.fill();
}

// A necromancer raising a corpse from afar: a wavering dark purple thread from it to the corpse (#203)
export function drawRaising() {
  for (const unit of [...game.settlers, ...game.enemies]) {
    const r = unit.raising;
    if (!r || r.until < game.pathTick) continue;
    const wave = Math.sin(game.pathTick * 0.3) * 4;
    ctx.save();
    ctx.strokeStyle = 'rgba(142, 68, 173, 0.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -game.pathTick;
    ctx.beginPath(); ctx.moveTo(unit.x, unit.y);
    ctx.quadraticCurveTo((unit.x + r.x) / 2 + wave, (unit.y + r.y) / 2 - wave, r.x, r.y); ctx.stroke();
    ctx.restore();
  }
}

// (#326) Souls in flight: a pale glowing dot with a short tail, from a raised corpse into the lantern at its necromancer's
// side, or from the lantern into a grave or the hall (only drawn; the count is kept at once, see tickLanterns)
export function drawSouls() {
  for (const fx of game.soulFx) {
    const k = Math.min(1, fx.t / fx.dur), e = k * k * (3 - 2 * k);
    const to = fx.kind === 'in' ? { x: fx.who.x, y: fx.who.y - 2 } : fx.to;
    const back = Math.max(0, e - 0.12);
    const x = fx.x + (to.x - fx.x) * e, y = fx.y + (to.y - fx.y) * e - Math.sin(e * Math.PI) * 14;
    const px = fx.x + (to.x - fx.x) * back, py = fx.y + (to.y - fx.y) * back - Math.sin(back * Math.PI) * 14;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - Math.max(0, k - 0.8) * 5);
    ctx.strokeStyle = 'rgba(170, 220, 255, 0.6)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 7);
    glow.addColorStop(0, 'rgba(235, 248, 255, 0.95)'); glow.addColorStop(1, 'rgba(120, 190, 255, 0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// The undead's blighted ground, and ground marked for it (while the Blight tab is open)
export function drawBlight() {
  const fading = new Map(game.blightZones.filter(z => z.clearing !== undefined).map(z => [`${z.x},${z.y}`, z.clearing / GAME_CONFIG.blight.clearSeconds]));
  const blight = updateBlightCache();
  for (const key of blight.keys) {
    const [bx, by] = key.split(',').map(Number);
    const share = blight.base.has(key) ? 1 : (fading.get(key) ?? 1);
    ctx.fillStyle = `rgba(74, 35, 90, ${0.28 * Math.max(0, share)})`;
    ctx.fillRect(bx - 15, by - 15, TILE_SIZE, TILE_SIZE);
  }
  if (isTabShown('tab-farming')) game.blightZones.forEach(z => {
    if (z.done) return;
    ctx.strokeStyle = 'rgba(187, 143, 206, 0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3);
  });
}
