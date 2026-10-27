// Blood, arrows, flames and the target mark

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { bloodAlpha, bodyBloodAlpha } from './combat.rules.js';
import { corpseHasWorms } from '../../economy/fishing/index.js';
import { tileVariantHash } from '../../world/index.js';
import { drawFigure } from '../../colony/settlers/index.js';
import { getEnemyColor, getSettlerColor } from '../../factions/index.js';

// Blood on the blade of the held item, fading (see bleed). A bare hand has no blade to bleed on: bleed gives
// whoever struck in melee weapon blood, and with nothing drawn at the grip it hung in the air in front of it
export function drawWeaponBlood(unit) {
  const alpha = bloodAlpha(unit.weaponBloodAge);
  const blade = !!(unit.weapon && unit.weapon !== 'fist') || !!(unit.tool && unit.tool !== 'none');
  if (alpha <= 0 || !blade) return;
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

// (#326) The fletching in its side's colour: the colony's, or the enemy's
const fletching = fromEnemy => (fromEnemy ? getEnemyColor(null) : getSettlerColor(null));

// An arrow in flight: a shaft along its way, a grey head, the fletching in its side's colour
export function drawArrow(proj) {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(Math.atan2(proj.vy, proj.vx));
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-9, -0.75, 13, 1.5);
  ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2.5); ctx.lineTo(3, 2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = fletching(proj.fromEnemy);
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

// Worms on a corpse (a fisher's bait, see corpseHasWorms): a few pink ones crawling over it, each its own way,
// its body a wave that runs from tail to head as it inches along and its head now and then lifted. Its phase
// comes of where the corpse lies, so no two of them wriggle in step
const WORM_SPOTS = [[-5, 4, 1], [3, 6, -1], [5, -3, 1]]; // (where on the body, and which way it crawls)
function drawWorms(c) {
  const t = game.pathTick / 60, seed = c.x * 0.37 + c.y * 0.61;
  ctx.save();
  ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  WORM_SPOTS.forEach(([wx, wy, way], i) => {
    const ph = t * 2.5 + seed + i * 2.1;
    const x = c.x + wx + Math.sin(t * 0.45 + i * 1.7) * 2.2, y = c.y + wy + Math.cos(t * 0.33 + i * 0.9) * 0.9;
    ctx.beginPath();
    for (let k = 0; k <= 5; k++) {
      const px = x + (k - 2.5) * 1.2 * way;
      const py = y + Math.sin(ph - k * 1.5) * (0.7 + k * 0.22) - (k === 5 ? 1.1 + Math.sin(ph) * 0.6 : 0);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
  ctx.restore();
}

// Corpses: grey, fading out over their last 10 seconds; worms on them
export function drawCorpses() {
  game.corpses.forEach(c => {
    const left = GAME_CONFIG.corpses.seconds - c.age;
    ctx.globalAlpha = Math.max(0, Math.min(1, left / 10)) * 0.9;
    // a figure lying on its side, crosses for its eyes (#251), its skin grey and its clothes its side's colour
    // gone dull (#326: all of it was grey); a pet's own body
    const grey = c.side === 'enemy' ? '#6e6e6e' : '#8a8a8a';
    const cloth = dull(c.side === 'enemy' ? getEnemyColor(null) : getSettlerColor(null));
    if (c.pet) drawPetCorpse(c, grey);
    else drawFigure(c, { x: c.x, y: c.y, r: Math.min(c.radius, 16), body: cloth, skin: '#9a9a9a', lying: true, dead: true });
    if (corpseHasWorms(c)) drawWorms(c);
    ctx.globalAlpha = 1;
  });
}

// A colour (#rrggbb) gone dull: half way to grey, a little darker
function dull(hex) {
  const n = parseInt(String(hex).slice(1, 7), 16);
  if (Number.isNaN(n)) return '#7a7a7a';
  const mix = c => Math.round((c * 0.5 + 0x7a * 0.5) * 0.85).toString(16).padStart(2, '0');
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

// A dead dog or hellhound: on its side, its legs out stiff, its head down on the ground, its tail limp
function drawPetCorpse(c, grey) {
  const k = Math.min(c.radius, 14) / 10;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(k, k);
  ctx.fillStyle = grey; ctx.strokeStyle = '#5f5f5f'; ctx.lineWidth = 1;
  // the tail
  ctx.strokeStyle = grey; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-13, 3, -14.5, 7); ctx.stroke();
  // the legs, sticking out
  ctx.strokeStyle = '#6f6f6f'; ctx.lineWidth = 2;
  for (const [lx, ly] of [[-6, 7], [-2, 8], [3, 7], [7, 8]]) { ctx.beginPath(); ctx.moveTo(lx, 2); ctx.lineTo(lx + 1, ly); ctx.stroke(); }
  // the body and the head, its snout on the ground
  ctx.fillStyle = grey; ctx.strokeStyle = '#5f5f5f'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (c.pet === 'beast') { // a hellhound's ridge of spikes
    ctx.fillStyle = '#5f5f5f';
    for (let sx = -7; sx <= 2; sx += 3) { ctx.beginPath(); ctx.moveTo(sx - 1, -4); ctx.lineTo(sx + 0.5, -7); ctx.lineTo(sx + 1.5, -4); ctx.closePath(); ctx.fill(); }
  }
  ctx.fillStyle = grey;
  ctx.beginPath(); ctx.ellipse(9, 2.5, 4.5, 3.5, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(12.5, 4, 2.5, 1.8, 0.2, 0, Math.PI * 2); ctx.fill();
  // an ear, and an eye crossed out
  ctx.fillStyle = '#6f6f6f'; ctx.beginPath(); ctx.ellipse(7, 0.5, 1.6, 3, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4f4f4f'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(8.5, 1); ctx.lineTo(10.5, 3); ctx.moveTo(10.5, 1); ctx.lineTo(8.5, 3); ctx.stroke();
  ctx.restore();
}

// (#326) An arrow that stopped: its shaft and fletching out of what it hit, a short stub; fading as it goes
function drawStuckArrow(x, y, a, fromEnemy, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-9, -0.75, 9, 1.5);
  ctx.fillStyle = fletching(fromEnemy);
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, -2.5); ctx.lineTo(-7, 0); ctx.lineTo(-12, 2.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
const fadeOf = age => Math.min(1, Math.max(0, (GAME_CONFIG.stuckArrows.seconds - age) / 4));

// Arrows and fireballs in flight, and those that stopped: on the ground, in the living, in corpses and dummies
export function drawProjectiles() {
  for (const a of game.stuckArrows) drawStuckArrow(a.x, a.y, a.a, a.fromEnemy, fadeOf(a.age));
  for (const list of [game.settlers, game.enemies]) for (const u of list) if (u.stuck) for (const a of u.stuck) drawStuckArrow(u.x + a.x, u.y + a.y, a.a, a.fromEnemy, fadeOf(a.age));
  for (const c of game.corpses) if (c.stuck) for (const a of c.stuck) drawStuckArrow(c.x + a.x, c.y + a.y, a.a, a.fromEnemy, Math.max(0, Math.min(1, (GAME_CONFIG.corpses.seconds - c.age) / 10)) * 0.9);
  for (const d of game.buildings) if (d.arrowsStuck) for (const a of d.arrowsStuck) drawStuckArrow(d.x + a.x, d.y + a.y, a.a, false, 1);
  game.projectiles.forEach(proj => {
    // fireballs bigger and orange; everything else is an arrow, pointing where it flies
    if (proj.fire) { ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f1c40f'; }
    else { drawArrow(proj); return; }
    ctx.beginPath(); ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2); ctx.fill();
  });
}
