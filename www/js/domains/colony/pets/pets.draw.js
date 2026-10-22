// (#314) How pets look: side on, facing the way they go, in their coat (GAME_CONFIG.pets.coats), a female a
// little smaller. A dog: its body, legs stepping, head with a snout and floppy ears, a wagging tail. A
// hellhound: darker, small horns, glowing eyes, a ridge of spikes and an ember at its tail's tip. Asleep:
// lying low, eyes shut, with its Zs; hungry: a bone over it. A ghost: a pale sheet with a wavy hem, floating
// and bobbing, see-through, its eyes dark hollows; gone, nothing.

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { castShadow } from '../../world/index.js';
import { petKindOf } from '../settlers/index.js';
import { drawBodyBlood } from '../../conflict/combat/index.js';
import { isPetHungry } from './pets.behaviours.js';

const coatOf = (s, kind) => {
  const coats = GAME_CONFIG.pets.coats[kind];
  return coats[((s.look && s.look.coat) || 0) % coats.length];
};

// kind: which pet (a settler's by its type; an enemy's given); enemy: the red side, its health bar red
export function drawPet(s, kind = petKindOf(s), enemy = false) {
  if (kind === 'ghost' && s.ghostGone > 0) return;
  const scale = s.look && s.look.female ? GAME_CONFIG.pets.femaleScale : 1;
  const d = Math.cos(s.facing ?? 0) < 0 ? -1 : 1;
  const r = s.visualRadius || s.radius || 11;
  const id = s.id ?? (s.animSeed ??= s.x * 0.013 + s.y * 0.021); // (an enemy has none: one from where it first stands)
  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.isPossessed) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 1.2, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (s === game.selectedSettler) { ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 1.3, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.scale(scale, scale);
  if (kind === 'ghost') drawGhost(s, d, id);
  else drawHound(s, d, kind, id);
  ctx.restore();
  if (kind !== 'ghost') drawBodyBlood(s, r);
  const top = s.y - r * 1.45;
  if (kind !== 'ghost' && isPetHungry(s)) drawBone(s.x + r, top - 10);
  if (s.petSleep > 0) drawZs(s.x + r, s.y - r);
  // a pet's health, always, as a settler's or an enemy's; a ghost can't be hurt
  if (kind !== 'ghost') {
    const w = enemy ? 24 : 30, h = enemy ? 3 : 4, lift = enemy ? 5 : 6;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - w / 2, top - lift, w, h);
    ctx.fillStyle = enemy ? '#e74c3c' : '#2ecc71'; ctx.fillRect(s.x - w / 2, top - lift, (Math.max(0, s.hp) / s.maxHp) * w, h);
  }
}

// A dog or a hellhound
function drawHound(s, d, kind, id) {
  const [coat, dark] = coatOf(s, kind), beast = kind === 'beast';
  const lying = s.petSleep > 0, eating = (s.working || 0) > 0 && s.workKind === 'devour';
  const step = lying ? 0 : Math.sin((s.walk || 0) * 0.45) * 1.8;
  const biting = game.pathTick - (s.struckAt ?? -1e9) < 12;
  castShadow(ctx, 0, lying ? 4 : 8, 11, 3, lying ? 5 : 10);
  ctx.save();
  ctx.scale(d, 1);
  ctx.translate(0, lying ? 4 : 0);
  // legs (tucked under it lying)
  ctx.fillStyle = dark;
  if (!lying) for (const [lx, dy] of [[-7, step], [-3.5, -step], [4, step], [7.5, -step]]) ctx.fillRect(lx - 1.2, 2 + dy * 0.4, 2.4, 6.5);
  // the tail: up and wagging (a hellhound's with an ember at its tip)
  const wag = lying ? 0 : Math.sin(game.pathTick * 0.35 + id) * 0.5;
  ctx.strokeStyle = coat; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-9, -2); ctx.quadraticCurveTo(-13, -6 + wag * 4, -14 + wag * 3, lying ? -2 : -10); ctx.stroke();
  if (beast) { ctx.fillStyle = '#e8572a'; ctx.beginPath(); ctx.arc(-14 + wag * 3, lying ? -2 : -10, 1.8 + Math.sin(game.pathTick * 0.4) * 0.5, 0, Math.PI * 2); ctx.fill(); }
  // the body
  ctx.fillStyle = coat; ctx.strokeStyle = dark; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-1, 0, 10, lying ? 5 : 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (beast) { ctx.fillStyle = dark; for (let k = -7; k <= 3; k += 2.5) { ctx.beginPath(); ctx.moveTo(k - 1, -5); ctx.lineTo(k + 0.5, -8.5); ctx.lineTo(k + 1.6, -5); ctx.closePath(); ctx.fill(); } }
  // the head (down to its food eating, lunging biting)
  ctx.save();
  ctx.translate(biting ? 2 : 0, eating ? 4 : lying ? 1 : 0);
  ctx.fillStyle = coat; ctx.strokeStyle = dark;
  ctx.beginPath(); ctx.ellipse(9, -4, 5, 4.2, 0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // the snout, its nose, an open jaw biting
  ctx.beginPath(); ctx.ellipse(13.5, -2.5, 3, 2, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(16, -3, 1, 0, Math.PI * 2); ctx.fill();
  if (biting) { ctx.fillStyle = '#7b1e1e'; ctx.beginPath(); ctx.moveTo(11, -1); ctx.lineTo(16, 0); ctx.lineTo(11, 1.5); ctx.closePath(); ctx.fill(); }
  // ears: floppy (a dog's), pointed (a hellhound's), and small horns
  ctx.fillStyle = dark;
  if (beast) {
    ctx.beginPath(); ctx.moveTo(6.5, -7); ctx.lineTo(7.5, -12); ctx.lineTo(9.5, -7.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d5c4a1'; ctx.beginPath(); ctx.moveTo(9, -7.8); ctx.quadraticCurveTo(11, -11, 12.5, -10.5); ctx.lineTo(10.5, -7.5); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(7, -5, 2, 4, 0.5, 0, Math.PI * 2); ctx.fill();
  }
  // the eye: shut asleep; a hellhound's glowing
  if (lying) { ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(9.5, -5); ctx.lineTo(11.5, -4.6); ctx.stroke(); }
  else { ctx.fillStyle = beast ? '#ffb347' : '#1b1b1f'; ctx.beginPath(); ctx.arc(10.5, -5, beast ? 1.2 : 0.9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.restore();
}

// A ghost: a pale sheet, see-through, floating and bobbing, its hem waving
function drawGhost(s, d, id) {
  const [pale, edge] = coatOf(s, 'ghost');
  const bob = Math.sin(game.pathTick * 0.08 + id) * 2.5;
  ctx.save();
  ctx.globalAlpha = 0.25; castShadow(ctx, 0, 10, 7, 2, 4); ctx.globalAlpha = 1;
  ctx.translate(0, -6 + bob);
  ctx.scale(d, 1);
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = pale; ctx.strokeStyle = edge; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-7, 2);
  ctx.arc(0, -3, 7, Math.PI, 0);
  ctx.lineTo(7, 7);
  const wave = game.pathTick * 0.2 + id;
  for (let k = 0; k <= 4; k++) ctx.lineTo(7 - k * 3.5, 9 + Math.sin(wave + k * 1.7) * 1.8 + (k % 2 ? -2 : 0));
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // a wisp trailing behind it
  ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(-9, 5, 4, 2, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath(); ctx.ellipse(1.5, -4, 1.4, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, -4, 1.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3.5, 0.5, 1.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Hungry: a bone over it
function drawBone(x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.4);
  ctx.fillStyle = '#f5eee0'; ctx.strokeStyle = '#7f6a4b'; ctx.lineWidth = 0.8;
  ctx.fillRect(-4, -1, 8, 2); ctx.strokeRect(-4, -1, 8, 2);
  for (const [bx, by] of [[-4.5, -1.5], [-4.5, 1.5], [4.5, -1.5], [4.5, 1.5]]) { ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

function drawZs(x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(236, 240, 241, 0.85)'; ctx.font = 'bold 8px sans-serif';
  const t = (game.pathTick % 90) / 90;
  ctx.globalAlpha = 1 - t; ctx.fillText('z', x, y - t * 8);
  ctx.globalAlpha = Math.max(0, 1 - ((t + 0.5) % 1)); ctx.fillText('Z', x + 4, y - 4 - ((t + 0.5) % 1) * 8);
  ctx.restore();
}
