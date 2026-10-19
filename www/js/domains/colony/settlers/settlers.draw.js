// How a settler looks and moves: the held weapon or tool, its swing and work animation, where it faces,
// what it carries on its back, the idle "zZ"

// ---- Animation state (drawn by getHeldItemPose, below)

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { drawIcon, getResourceIconName } from '../../../ui/index.js';
import { game } from '../../../engine/world/index.js';
import { isBowWeapon, isClubWeapon, isSpearWeapon, isSwordWeapon } from '../equipment/index.js';
import { getCarryCapacity } from '../storage/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { getEnemyColor, getPlayerFaction, getSettlerColor } from '../../factions/index.js';
import { drawStaff, getNecromancy } from '../../factions/undead/index.js';
import { drawBodyBlood, drawBurning, drawWeaponBlood } from '../../conflict/combat/index.js';
import { drawHorns } from '../../factions/demons/index.js';

// A strike: the held weapon or tool swings through once over `seconds`
export function startSwing(unit, seconds) {
  unit.swingT = seconds;
  unit.swingLen = seconds;
}

export function tickAnimation(unit, dt) {
  // walking (not striking or working): the held item turns the way it goes, not stay where it last struck
  if (unit.lastX !== undefined) {
    const dx = unit.x - unit.lastX, dy = unit.y - unit.lastY;
    if (Math.hypot(dx, dy) > 0.3 && !(unit.swingT > 0) && !(unit.working > 0)) unit.facing = Math.atan2(dy, dx);
    unit.walk = ((unit.walk || 0) + Math.hypot(dx, dy)) % 1000; // (its steps, drawFigure)
  }
  unit.lastX = unit.x; unit.lastY = unit.y;
  if (unit.swingT > 0) unit.swingT = Math.max(0, unit.swingT - dt);
  if (unit.working > 0) unit.working = Math.max(0, unit.working - dt);
  if (unit.usingCan > 0) unit.usingCan = Math.max(0, unit.usingCan - dt);
  if (unit.bloodAge !== undefined) unit.bloodAge += dt;
  if (unit.weaponBloodAge !== undefined) unit.weaponBloodAge += dt;
}

// Point the held weapon or tool at (x, y): what the unit strikes or works on (drawn by applyHeldItemPose)
export function faceTowards(unit, x, y) {
  if (x !== unit.x || y !== unit.y) unit.facing = Math.atan2(y - unit.y, x - unit.x);
}

// How the held weapon or tool is posed right now: a rotation around the body and a push forward.
// A strike (swingT): swords, clubs, fists and tools sweep an arc, spears thrust, bows recoil. Working
// (chopping, mining, planting...): a steady chop in time with the game's ticks, so replays look the same.
export function getHeldItemPose(unit) {
  const item = unit.weapon && unit.weapon !== 'fist' ? unit.weapon : (unit.tool && unit.tool !== 'none' ? unit.tool : 'fist');
  if (unit.swingT > 0) {
    const p = 1 - unit.swingT / (unit.swingLen || 0.3);
    const arc = Math.sin(Math.PI * p);
    if (isBowWeapon(item)) return { angle: 0, push: -3 * arc };
    if (isSpearWeapon(item)) return { angle: 0, push: 8 * arc };
    return { angle: -0.9 + 1.8 * p, push: 0 };
  }
  if (unit.working > 0) {
    const beat = Math.sin(game.pathTick * 0.3);
    if (item === 'rod') return { angle: 0.12 * beat, push: 0 };
    if (item === 'fist' || item === 'medbag') return { angle: 0, push: 2 * beat };
    // a blade (butchering a carcass): it cuts into what's in front, not chops at it like an axe
    if (isSwordWeapon(item) || isSpearWeapon(item)) return { angle: 0.15 * beat, push: 3 + 3 * beat };
    return { angle: 0.7 * beat - 0.2, push: 0 };
  }
  return { angle: 0, push: 0 };
}

// The held item points where the unit faces (faceTowards), posed on top of that; held in the right hand
// at the body's side, not coming out of its middle
export function applyHeldItemPose(unit) {
  const pose = getHeldItemPose(unit);
  const r = unit.visualRadius || unit.radius || 11;
  ctx.rotate((unit.facing || 0) + pose.angle);
  ctx.translate(pose.push + r * 0.25, r * 0.5);
}

// Nothing to do: a settler puts what it holds on its back (not in a battle, where it waits to fight)
// (a pastime too, but sharpening, sparring, training or on patrol it holds its weapon, #199)
export function isResting(s) {
  const pastime = s.isIdle && s.idle && !['sharpen', 'spar', 'train', 'patrolEdge'].includes(s.idle.act);
  return (s.activity === 'patrol' || pastime) && !s.isPossessed && !(s.swingT > 0) && game.gameMode !== 'battle';
}

// It carries a load in its hands (#232): not in a backpack (a backpack's loads stay in it)
export function isCarryingInHands(s) {
  return !!s.carrying && !(s.backpack && s.carrying.loads !== undefined);
}

// It's making a thing right now (equipment.crafting.js sets s.crafting each step it works)
export function isCrafting(s) {
  return !!s.crafting && s.crafting.until >= game.pathTick;
}

// The load in front of it, held in both hands (drawn around its centre, after translate)
function drawCarriedInHands(s) {
  const type = s.carrying.type;
  const f = s.facing || 0;
  const x = Math.cos(f) * (s.visualRadius + 3), y = Math.sin(f) * (s.visualRadius + 3);
  if (type === 'dung') {
    ctx.fillStyle = '#5c3d16'; ctx.beginPath(); ctx.ellipse(x, y, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (type === 'captive') {
    // an enemy caught for a cage (#250), across its arms, still in its colour
    ctx.fillStyle = getEnemyColor(); ctx.beginPath(); ctx.ellipse(x * 1.2, y * 1.2, 9, 6, f + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (type === 'corpse') {
    // a body across its arms (#199)
    ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.ellipse(x * 1.2, y * 1.2, 9, 6, f + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const known = GAME_CONFIG.resources[type] || GAME_CONFIG.foodKinds[type];
  drawIcon(ctx, type === 'bundle' ? 'bundle' : type.startsWith('armory:') ? getResourceIconName(type) : (known ? known.icon : 'wheat'), x, y, 12);
}

// Eating (#248): its food held up to its face, raised and lowered a bite at a time, a crumb now and then
function drawEating(s) {
  const f = s.facing || 0, bite = Math.abs(Math.sin(performance.now() / 220 + s.id));
  const r = s.visualRadius * (0.55 + 0.25 * bite);
  drawIcon(ctx, s.eating.icon, Math.cos(f) * r, Math.sin(f) * r, 10);
  if (bite < 0.15) { ctx.fillStyle = '#d4a373'; ctx.fillRect(Math.cos(f) * r + 3, Math.sin(f) * r + 5, 2, 2); }
}

// A smoke (white, its end glowing) or a wheat stalk (long, yellow) at its mouth, pointing out ahead (#248)
function drawInMouth(s) {
  const f = (s.facing || 0) + 0.35, r = s.visualRadius * 0.7;
  const x = Math.cos(f) * r, y = Math.sin(f) * r;
  const len = (s.straw || 0) > 0 ? 9 : 5;
  ctx.strokeStyle = (s.straw || 0) > 0 ? '#e9c46a' : '#ecf0f1'; ctx.lineWidth = (s.straw || 0) > 0 ? 1.2 : 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(f) * len, y + Math.sin(f) * len); ctx.stroke();
  if (!((s.straw || 0) > 0)) { ctx.fillStyle = '#e74c3c'; ctx.fillRect(x + Math.cos(f) * len - 1, y + Math.sin(f) * len - 1, 2, 2); }
}

// Its smoke: a few grey puffs rising off the end and fading
function drawSmokePuffs(s) {
  const f = (s.facing || 0) + 0.35, r = s.visualRadius * 0.7 + 5;
  const x0 = s.x + Math.cos(f) * r, y0 = s.y + Math.sin(f) * r;
  const t = performance.now() / 1000 + s.id;
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.6 + k / 3) % 1;
    ctx.fillStyle = `rgba(200, 200, 200, ${0.45 * (1 - p)})`;
    ctx.beginPath(); ctx.arc(x0 + Math.sin(t * 2 + k) * 2, y0 - p * 14, 1.5 + p * 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

// A torch held out in front (#257), drawn round the unit's centre (after translate), its flame flickering
export function drawHandTorch(facing, r) {
  const f = (facing || 0) - 0.5, x = Math.cos(f) * (r + 2), y = Math.sin(f) * (r + 2);
  ctx.strokeStyle = '#6d4520'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - Math.cos(f) * 4, y - Math.sin(f) * 4); ctx.lineTo(x + Math.cos(f) * 5, y + Math.sin(f) * 5); ctx.stroke();
  const fx = x + Math.cos(f) * 7, fy = y + Math.sin(f) * 7, k = 1 + Math.sin(performance.now() / 90 + r) * 0.15;
  ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.ellipse(fx, fy - 2, 3 * k, 4.5 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f9e79f'; ctx.beginPath(); ctx.ellipse(fx, fy - 1.5, 1.5 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.fill();
}

// Asleep (#257): a few z's drifting up off it
function drawSleepZs(x, y) {
  const t = performance.now() / 1000;
  ctx.fillStyle = 'rgba(236, 240, 241, 0.85)'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.5 + k / 3) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.fillText('z', x + p * 8 + k * 2, y - p * 14);
  }
  ctx.globalAlpha = 1;
}

// A hammer going up and down in its hand while it makes a thing
function drawCraftHammer(s) {
  const beat = Math.abs(Math.sin(performance.now() / 160 + s.id));
  ctx.save();
  ctx.rotate((s.facing || 0) - 0.9 + beat * 0.9);
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(4, -1.5, 14, 3);
  ctx.fillStyle = '#7f8c8d'; ctx.fillRect(15, -5, 5, 10);
  ctx.restore();
}

// The thing being made, on a little anvil in front of it, and how far along it is
function drawWorkpiece(s) {
  const f = s.facing || 0;
  const x = s.x + Math.cos(f) * (s.visualRadius + 13), y = s.y + Math.sin(f) * (s.visualRadius + 13);
  ctx.fillStyle = '#4a4f57'; ctx.fillRect(x - 6, y + 1, 12, 5);
  ctx.fillStyle = '#5d636d'; ctx.fillRect(x - 4, y + 6, 8, 3);
  if (s.crafting.icon) drawIcon(ctx, s.crafting.icon, x, y - 2, 11);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 10, y - 12, 20, 3);
  ctx.fillStyle = '#f1c40f'; ctx.fillRect(x - 10, y - 12, 20 * s.crafting.progress, 3);
}

// ---- The figure (#251): a little person, not a circle. Legs that step as it walks, a body in its colours, a
// round head (horns on a demon's), two arms: the right hand where its held item is (applyHeldItemPose), the
// left at its side or behind its shield. Its middle is where the circle's was, so nothing about where it
// stands or what hits it changes. Lying (asleep, or a corpse): turned on its side.

export const SKIN = { humans: '#f5cba7', demons: '#922b21', undead: '#9fb38a' };

// Where its right hand is now, round its middle (the held item's grip, as applyHeldItemPose puts it)
function handAt(unit, r) {
  const pose = getHeldItemPose(unit), a = (unit.facing || 0) + pose.angle;
  const fx = pose.push + r * 0.25, fy = r * 0.5;
  return { x: Math.cos(a) * fx - Math.sin(a) * fy, y: Math.sin(a) * fx + Math.cos(a) * fy };
}

/**
 * The figure round (x, y), r its old circle's radius.
 * @param {any} unit
 * @param {{ x: number, y: number, r: number, body: string, skin: string, horns?: boolean, lying?: boolean, dead?: boolean, hand?: boolean, shield?: boolean }} o
 */
export function drawFigure(unit, o) {
  const { x, y, r } = o;
  ctx.save();
  ctx.translate(x, y);
  if (o.lying) ctx.rotate(-Math.PI / 2 + 0.15);
  const outline = 'rgba(0, 0, 0, 0.45)';
  // its shadow on the ground
  if (!o.lying) { ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'; ctx.beginPath(); ctx.ellipse(0, r * 1.02, r * 0.7, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
  // legs, stepping while it walks
  const step = o.lying || o.dead ? 0 : Math.sin((unit.walk || 0) * 0.35) * r * 0.16;
  ctx.fillStyle = shade(o.body, -0.4);
  for (const [lx, dy] of [[-0.3, step], [0.3, -step]]) { ctx.beginPath(); ctx.roundRect(r * lx - r * 0.17, r * 0.25 + dy, r * 0.34, r * 0.72, r * 0.12); ctx.fill(); }
  // the body
  ctx.fillStyle = o.body; ctx.strokeStyle = outline; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-r * 0.62, -r * 0.48, r * 1.24, r * 0.98, r * 0.32); ctx.fill(); ctx.stroke();
  // arms: the right to its hand, the left down its side (or out to its shield)
  ctx.strokeStyle = shade(o.body, -0.2); ctx.lineWidth = Math.max(2, r * 0.26); ctx.lineCap = 'round';
  const hand = o.hand && !o.lying && !o.dead ? handAt(unit, r) : { x: r * 0.72, y: r * 0.2 };
  const right = hand.x >= 0 ? 1 : -1;
  ctx.beginPath(); ctx.moveTo(right * r * 0.5, -r * 0.3); ctx.lineTo(hand.x, hand.y); ctx.stroke();
  const other = o.shield ? { x: -r + 1, y: 3 } : { x: -right * r * 0.72, y: r * 0.25 };
  ctx.beginPath(); ctx.moveTo(-right * r * 0.5, -r * 0.3); ctx.lineTo(other.x, other.y); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = o.skin;
  for (const p of [hand, other]) { ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.15, 0, Math.PI * 2); ctx.fill(); }
  // the head, looking the way it faces (its eyes on the side it turns to); a dead one's eyes are crosses
  const hy = -r * 0.9, hr = r * 0.5;
  ctx.fillStyle = o.skin; ctx.strokeStyle = outline;
  ctx.beginPath(); ctx.arc(0, hy, hr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (o.horns) drawHorns(0, hy + hr * 0.35, hr * 1.35);
  const f = unit.facing || 0, ex = Math.cos(f) * hr * 0.35, ey = Math.max(-0.1, Math.sin(f)) * hr * 0.3;
  if (o.dead) {
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2;
    for (const sx of [-1, 1]) { const cx = sx * hr * 0.38, cy = hy; ctx.beginPath(); ctx.moveTo(cx - 1.6, cy - 1.6); ctx.lineTo(cx + 1.6, cy + 1.6); ctx.moveTo(cx + 1.6, cy - 1.6); ctx.lineTo(cx - 1.6, cy + 1.6); ctx.stroke(); }
  } else if (Math.sin(f) > -0.5 && !o.lying) {
    ctx.fillStyle = '#1b1b1f';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(ex + sx * hr * 0.3, hy + ey, Math.max(0.8, r * 0.07), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// A colour a little darker or lighter (amount -1..1)
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = v => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// What's on its back, turned with it (#251): behind it, on the side away from where it faces
export function drawBackItems(s) {
  const r = s.visualRadius, f = s.facing || 0;
  const bx = -Math.cos(f) * r * 0.55, by = -Math.sin(f) * r * 0.55 - r * 0.15;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(f + Math.PI / 2);
  if (s.backpack) {
    ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-6, -3.5, 12, 7);
    ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(-6, -3.5, 12, 7);
    const loads = (s.carrying && s.carrying.loads) || 0, full = Math.min(1, loads / getCarryCapacity(s));
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(-5, -2.5, 10 * full, 2);
  }
  if (s.quiver) {
    ctx.fillStyle = '#8e5a2b'; ctx.fillRect(s.backpack ? 4 : -2, -5, 4, 10);
    ctx.fillStyle = '#ecf0f1';
    for (let i = 0; i < Math.min(4, Math.ceil((s.arrows || 0) / 3)); i++) ctx.fillRect((s.backpack ? 4 : -2) + i, -8, 1, 3);
  }
  if (s.tool === 'hoe' && s.wateringCan) {
    if ((s.usingCan || 0) > 0) { ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-1, -9, 2, 15); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-3, -10, 6, 3); }
    else drawWateringCan(0, 5, 0.7);
  }
  if (s.banner) {
    ctx.fillStyle = '#6d4520'; ctx.fillRect(-1, -16, 2, 18);
    ctx.fillStyle = getSettlerColor(s); ctx.fillRect(1, -16, 9, 6);
    ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 1; ctx.strokeRect(1, -16, 9, 6);
  }
  ctx.restore();
}

// The held item across the back: turned square to where the unit faces, behind it
export function applyBackPose(unit) {
  ctx.rotate((unit.facing || 0) + Math.PI / 2);
  ctx.translate(-15, unit.visualRadius * 0.7);
}

// Weapon held in the right hand, drawn around (0, 0) = the unit's centre (translate first).
// Shared by settlers and enemies. Returns false for no weapon (fists).
// Iron armour: a breastplate over the body of a figure of that radius
export function drawArmor(radius) {
  // a breastplate over the figure's body (#251)
  const r = radius;
  ctx.fillStyle = '#95a5a6'; ctx.strokeStyle = '#5d6d7e'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-r * 0.56, -r * 0.44, r * 1.12, r * 0.8, r * 0.25); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fillRect(-r * 0.4, -r * 0.36, r * 0.25, r * 0.55);
  ctx.strokeStyle = '#7f8c8d'; ctx.beginPath(); ctx.moveTo(0, -r * 0.44); ctx.lineTo(0, r * 0.36); ctx.stroke();
}

// A round wooden shield with an iron rim and boss on the left arm of a body of that radius
export function drawShield(radius) {
  ctx.fillStyle = '#8e5a2b'; ctx.beginPath(); ctx.arc(-radius + 1, 3, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.arc(-radius + 1, 3, 1.8, 0, Math.PI * 2); ctx.fill();
}

// A medic's bag in hand: leather with a small green cross; the green inside rises with its herbs (full, 0..1)
export function drawMedbag(full) {
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(7, -5, 10, 10);
  ctx.fillStyle = '#27ae60'; ctx.fillRect(8, 4 - 8 * full, 8, 8 * full);
  ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(7, -5, 10, 10);
  ctx.fillStyle = '#2ecc71'; ctx.fillRect(11, -4, 2, 5); ctx.fillRect(9.5, -2.5, 5, 2);
}

export function drawHeldWeapon(weapon) {
  if (isSwordWeapon(weapon)) {
    ctx.fillStyle = weapon === 'iron_sword' ? '#b0bec5' : '#e0e0e0'; ctx.fillRect(8, -2, 14, 4);
    ctx.fillStyle = '#f39c12'; ctx.fillRect(6, -4, 2, 8);
  } else if (isClubWeapon(weapon)) {
    ctx.fillStyle = '#7a4b21'; ctx.fillRect(6, -2, 8, 4);
    ctx.fillRect(14, -3, 6, 6);
  } else if (isSpearWeapon(weapon)) {
    ctx.fillStyle = weapon === 'iron_spear' ? '#7f8c8d' : '#8e5a2b'; ctx.fillRect(6, -1, 22, 3);
    ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.moveTo(28, -3); ctx.lineTo(35, 0); ctx.lineTo(28, 3); ctx.fill();
  } else if (weapon === 'bow') {
    ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, 0, 10, -Math.PI / 2, Math.PI / 2); ctx.stroke();

  } else {
    return false;
  }
  return true;
}

// A watering can: a tin body, a handle on top and a long spout forward; `scale` for carrying it small
export function drawWateringCan(x, y, scale) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#7fa7c9'; ctx.fillRect(-5, -4, 10, 8);
  ctx.strokeStyle = '#4f7a9e'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -4, 3.5, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 1); ctx.lineTo(11, -4); ctx.stroke();
  ctx.fillStyle = '#4f7a9e'; ctx.fillRect(10, -6, 3, 3);
  ctx.restore();
}

// Quiver on the back (left edge x), one arrow shown for every 3 left
export function drawQuiver(x, arrows) {
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(x - 2, -6, 5, 11);
  ctx.fillStyle = '#ecf0f1';
  for (let i = 0; i < Math.min(4, Math.ceil(arrows / 3)); i++) ctx.fillRect(x - 2 + i * 1.3, -9, 1, 3);
}

// Idle settler: a small thought bubble with "zZ" above the head
export function drawIdleIcon(x, y) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - 6, y + 7, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#34495e'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('zZ', x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

// Dung: a small brown pile, fading over its last 10 s
export function drawDung() {
  game.dung.forEach(p => {
    ctx.globalAlpha = Math.max(0, Math.min(1, (GAME_CONFIG.relief.dungSeconds - p.age) / 10));
    ctx.fillStyle = '#5c3d16';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e4a1c';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x + 0.5, p.y - 3.5, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

// Settlers: body, what they hold and carry, armour, shield, quiver, rings, health
export function drawSettlers() {
  game.settlers.forEach(s => {
    // an idle undead sways where it stands (#199): drawn a little to and fro
    const sway = s.swaying ? Math.sin(performance.now() / 450 + s.id) * 2.5 : 0;
    if (sway) { ctx.save(); ctx.translate(sway, 0); }
    const r = s.visualRadius, top = s.y - r * 1.45; // (the top of its head)
    // the possessed one: a white ring on the ground round its feet
    if (s.isPossessed) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.95, r * 0.95, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
    // what's on its back, behind it when it faces this way (#251)
    const backBehind = Math.sin(s.facing || 0) > 0.2;
    if (backBehind && !s.asleep) { ctx.save(); ctx.translate(s.x, s.y); drawBackItems(s); ctx.restore(); }
    // the figure in the colony's colour (#251)
    const faction = game.gameMode === 'battle' ? 'humans' : getPlayerFaction().id;
    if (s.temporary !== undefined) ctx.globalAlpha = 0.7; // a raised zombie, for a while
    if (s.asleep) ctx.globalAlpha = 0.85;
    drawFigure(s, { x: s.x, y: s.y, r, body: getSettlerColor(s), skin: SKIN[faction] || SKIN.humans, horns: faction === 'demons' && game.gameMode !== 'battle', lying: !!s.asleep, hand: true, shield: !!s.shield });
    ctx.globalAlpha = 1;
    if ((s.burning || 0) > 0) drawBurning(s.x, s.y, r);
    drawBodyBlood(s, r);

    // what it carries is in its hands, what it held goes on its back (in a backpack it stays out of sight,
    // the bar above says how full); making a thing, a hammer in its hands (#232)
    const inHands = isCarryingInHands(s);
    const crafting = isCrafting(s);

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.save();
    if (isResting(s) || inHands || crafting || s.eating || s.torchInHand || s.asleep) applyBackPose(s);
    else applyHeldItemPose(s);
    if (getNecromancy(s) && s.weapon === 'fist') {
      drawStaff();
    } else if (!drawHeldWeapon(s.weapon)) {
    if (s.tool === 'axe' || s.tool === 'iron_axe') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 12, 3);
      ctx.fillStyle = s.tool === 'iron_axe' ? '#cfd8dc' : '#7f8c8d'; ctx.fillRect(16, -5, 5, 10);
    } else if (s.tool === 'pickaxe' || s.tool === 'iron_pickaxe') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 12, 3);
      ctx.fillStyle = s.tool === 'iron_pickaxe' ? '#cfd8dc' : '#7f8c8d'; ctx.beginPath(); ctx.arc(18, 0, 7, -Math.PI/2, Math.PI/2); ctx.fill();
    } else if (s.tool === 'rod') {
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(22, -10); ctx.stroke();
    } else if (s.tool === 'medbag') {
      drawMedbag(Math.min(1, ((s.bagHerbs || 0) + (s.bagPotions || 0)) / GAME_CONFIG.medic.bagSize));
    } else if (s.tool === 'hoe' && s.wateringCan && (s.usingCan || 0) > 0) {
      drawWateringCan(12, 0, 1); // watering: the can in hand (the hoe goes on its back, below)
    } else if (s.tool === 'hoe') {
      // a long handle with a flat blade turned down at the end
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 15, 2);
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(19, -1, 3, 7);
    }
    }
    drawWeaponBlood(s);
    ctx.restore(); // pose only moves the held item
    if (inHands) drawCarriedInHands(s);
    if (crafting) drawCraftHammer(s);
    if (s.torchInHand && !s.asleep) drawHandTorch(s.facing, s.visualRadius);
    if (s.eating) drawEating(s);
    else if ((s.smoking || 0) > 0 || (s.straw || 0) > 0) drawInMouth(s);
    if ((s.armor === 'iron' || s.hasArmor) && !s.asleep) drawArmor(r);
    if (s.shield && !s.asleep) drawShield(r);
    // a commander's whistle on a cord on its chest (#248); its banner goes on its back (drawBackItems)
    if (s.whistle && !s.asleep) { ctx.fillStyle = '#bdc3c7'; ctx.fillRect(-2, -r * 0.2, 5, 3); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(2, -r * 0.2, 2, 3); }
    // what's on its back, in front of it when it faces away (#251)
    if (!backBehind && !s.asleep) drawBackItems(s);
    ctx.restore();

    if (crafting) drawWorkpiece(s);
    if (s.asleep) drawSleepZs(s.x + r, s.y - r);
    if ((s.smoking || 0) > 0 && !s.eating) drawSmokePuffs(s);

    if (s === game.selectedSettler) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.95, r + 3, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); // (round its feet)
    }

    if (s.isIdle && !s.carrying && (!s.idle || s.idle.act === 'wander')) drawIdleIcon(s.x + r, top - 12);
    // an archer out of arrows (#232): a crossed-out arrow over it
    if (isBowWeapon(s.weapon) && s.quiver && (s.arrows || 0) <= 0 && game.gameMode !== 'battle') drawNoArrows(s.x - r - 2, top - 12);
    // an order given or taken (#248): its bubble, and the commander's line to the one it told
    const line = s.orderLine;
    if (line && line.until > game.pathTick) {
      const to = game.settlers.find(o => o.id === line.toId);
      if (to) { ctx.strokeStyle = 'rgba(241, 196, 15, 0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (s.orderBubble && s.orderBubble.until > game.pathTick) drawOrderBubble(s.x + r, top - 14, s.orderBubble.icon);
    // "talking" in a knot (#199): now and then a speech bubble
    if (s.isIdle && s.idle && s.idle.act === 'talk' && Math.sin(performance.now() / 700 + s.id * 1.7) > 0.4) drawTalkBubble(s.x + r, top - 12);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - 15, top - 6, 30, 4);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(s.x - 15, top - 6, (Math.max(0, s.hp) / s.maxHp) * 30, 4);
    if (sway) ctx.restore();
  });
}

// An arrow crossed out in red: out of arrows
export function drawNoArrows(x, y) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
  drawIcon(ctx, 'arrows', x, y, 12);
  ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 6, y - 6); ctx.stroke();
}

// A speech bubble with "..." in it
// An order (#248): a bubble with what it's about
export function drawOrderBubble(x, y, icon) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath(); ctx.ellipse(x, y, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.lineTo(x - 8, y + 11); ctx.lineTo(x - 1, y + 7); ctx.fill();
  drawIcon(ctx, icon, x, y, 11);
}

export function drawTalkBubble(x, y) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath(); ctx.ellipse(x, y, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y + 3); ctx.lineTo(x - 8, y + 9); ctx.lineTo(x - 1, y + 5); ctx.fill();
  ctx.fillStyle = '#34495e';
  for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.arc(x + dx, y, 1.2, 0, Math.PI * 2); ctx.fill(); }
}
