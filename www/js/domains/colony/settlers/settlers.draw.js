// How a settler looks and moves: the held weapon or tool, its swing and work animation, where it faces,
// what it carries on its back, the idle "zZ"

// ---- Animation state (drawn by getHeldItemPose, below)

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { drawIcon, getResourceIconName } from '../../../ui/index.js';
import { game } from '../../../engine/world/index.js';
import { armorOf, isCrossbowWeapon, isRangedWeapon, isSpearWeapon, isSwordWeapon, usesDagger } from '../equipment/index.js';
import { drawHeadTexture, lookOf } from './settlers.looks.js';
import { castShadow, getDarkness } from '../../world/index.js';
import { drawHeldTool, drawHeldWeapon, drawWorkTool } from './settlers.items.js';
import { getCarryCapacity } from '../storage/index.js';
import { ctx, getViewRect, getViewScale, setFont } from '../../../engine/platform/index.js';
import { getEnemyColor, getPlayerFaction, getSettlerColor } from '../../factions/index.js';
import { drawStaff, getNecromancy } from '../../factions/undead/index.js';
import { drawBodyBlood, drawBurning, drawWeaponBlood } from '../../conflict/combat/index.js';
import { drawHorns } from '../../factions/demons/index.js';
import { drawPet } from '../pets/index.js';
import { isBigBody, isPet } from './settlers.rules.js';

// (#306) Below this many screen px per world px a figure is a handful of pixels: its body, head and colours
// are all that shows. Drawing its hands, gear, hair strands and idle signs on so little was most of what a
// big colony cost to draw (and read as clutter)
const SIMPLE_UNIT = 0.72;
// (#306) Below this, a figure is one or two pixels: a dab of its colour is all there is to see
const TINY_UNIT = 0.26;

// Whether figures are drawn at that size now
export const simpleUnit = () => getViewScale() < SIMPLE_UNIT;
export const tinyUnit = () => getViewScale() < TINY_UNIT;

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
  if (unit.working > 0) { unit.working = Math.max(0, unit.working - dt); if (!unit.working) unit.workKind = null; }
  if (unit.usingCan > 0) unit.usingCan = Math.max(0, unit.usingCan - dt);
  if (unit.bloodAge !== undefined) unit.bloodAge += dt;
  if (unit.weaponBloodAge !== undefined) unit.weaponBloodAge += dt;
}

// Point the held weapon or tool at (x, y): what the unit strikes or works on (drawn by applyHeldItemPose)
export function faceTowards(unit, x, y) {
  if (x !== unit.x || y !== unit.y) unit.facing = Math.atan2(y - unit.y, x - unit.x);
}

// How the held weapon or tool is posed right now: a rotation around the body and a push forward.
// A strike (swingT), by the weapon (#279): a sword slashes across, a club or a tool comes down from overhead
// gathering speed, a spear thrusts, a bow recoils; bare hands: a human punches, a demon rakes with its claws, an
// undead swipes slow and wide. A big one's blows are wider and longer. Working: a steady beat in time with the
// game's ticks, by the work: a hammer's (building, making), a knife's sawing (butchering), a hand reaching into
// a bush (berries), an axe's or a pickaxe's chop, a hoe's dig, a rod's bob.
export function getHeldItemPose(unit) {
  const item = unit.weapon && unit.weapon !== 'fist' ? unit.weapon : (unit.tool && unit.tool !== 'none' ? unit.tool : 'fist');
  const big = (unit.visualRadius || unit.radius || 11) > 14 ? 1.3 : 1;
  if (unit.swingT > 0) {
    const p = 1 - unit.swingT / (unit.swingLen || 0.3);
    const arc = Math.sin(Math.PI * p);
    // a crossbow kicks back hard; a bow only a little
    if (isCrossbowWeapon(item)) return { angle: -0.22 * arc * big, push: -8 * arc * big };
    if (isRangedWeapon(item)) return { angle: 0.05 * arc, push: -4 * arc };
    if (isSpearWeapon(item)) return { angle: 0.08 * arc * big, push: 10 * arc * big };
    if (isSwordWeapon(item)) return { angle: (-1.1 + 2.2 * p) * big, push: 2 * arc };
    if (item === 'fist') {
      const kin = unitKin(unit);
      if (kin === 'demons') return { angle: (-1.3 + 2.6 * p) * big, push: 3 * arc }; // (claws)
      if (kin === 'undead') return { angle: (-0.7 + 1.4 * p) * big, push: 4 * arc }; // (a slow swipe)
      return { angle: 0.15 * arc, push: 7 * arc * big }; // (a punch)
    }
    // a club, or a tool for a weapon: overhead, faster as it comes down
    return { angle: (-1.6 + 2.3 * p * p) * big, push: 3 * arc };
  }
  if (unit.working > 0) {
    const beat = Math.sin(game.pathTick * 0.3);
    if (unit.workKind === 'build' || isCrafting(unit)) return { angle: -0.9 + 0.9 * Math.abs(beat), push: 1 };
    if (unit.workKind === 'butcher') return { angle: 0.35, push: 4 + 3 * beat };
    if (unit.workKind === 'pick') return { angle: 0.2 * beat, push: 6 + 4 * Math.abs(beat) };
    if (unit.workKind === 'heal') return { angle: 0.3, push: 6 + 3 * beat }; // (#326: herbs pressed onto the wound)
    if (item === 'rod') return { angle: 0.12 * beat, push: 0 };
    if (item === 'fist' || item === 'medbag') return { angle: 0, push: 2 * beat };
    // (#326) a hoe: thrust forward into the ground and drawn back, the same whichever way it faces (it was
    // turned off to one side: over its head facing left, behind its leg facing down-right)
    if (item === 'hoe') return { angle: 0.1 * beat, push: 1 + 4 * beat };
    // a blade (butchering a carcass): it cuts into what's in front, not chops at it like an axe
    if (isSwordWeapon(item) || isSpearWeapon(item)) return { angle: 0.15 * beat, push: 3 + 3 * beat };
    return { angle: 0.8 * beat - 0.3, push: 0 };
  }
  return { angle: 0, push: 0 };
}

// (#306) an archer's shot, drawn: after one's loosed, its other hand goes back to its quiver for an arrow,
// brings it to the bow (nock) and draws the string; ready, in a fight it holds it drawn. A crossbowman cocks
// its crossbow: the off hand hauls the string back along the stock and leaves a bolt in the groove, loaded
// until the next shot. { pull, other } (other: where its other hand is, round its middle), or null (no ranged
// weapon, or not shooting)
export function bowDraw(unit) {
  const crossbow = unit.weapon === 'crossbow';
  const bow = unit.weapon === 'bow' || (unit.enemyKey && (getDefinition('enemies', unit.enemyKey) || {}).ranged);
  if ((!bow && !crossbow) || unit.asleep) return null;
  const len = unit.shotLen || 0.8, since = (game.pathTick - (unit.shotAt ?? -1e9)) / 60;
  const r = unit.visualRadius || unit.radius || 11, f = unit.facing || 0;
  const quiver = { x: -Math.cos(f) * r * 0.55, y: -Math.sin(f) * r * 0.55 - r * 0.15 };
  const pose = getHeldItemPose(unit), a = f + pose.angle, grip = gripAt(r);
  const at = local => { const fx = pose.push + grip.x + local * itemScale(unit), fy = grip.y; return { x: Math.cos(a) * fx - Math.sin(a) * fy, y: Math.sin(a) * fx + Math.cos(a) * fy }; };
  if (crossbow) {
    // loaded at rest: the string back and a bolt in the groove; after a shot, the hand cocks it again
    if (since > len + 3) return { pull: 1, other: at(-2) };
    const p = Math.min(1, since / len);
    if (p < 0.08) return { pull: 0, other: quiver }; // (the bolt just gone, the hand off the stock)
    const pull = Math.min(1, (p - 0.08) / 0.5);
    return { pull, other: at(16 - pull * 18) };
  }
  if (since > len + 3) return null; // (not shooting: the bow at rest)
  const p = Math.min(1, since / len);
  if (p < 0.4) return { pull: 0, other: quiver };
  if (p < 0.6) { const q = (p - 0.4) / 0.2, g = at(-1); return { pull: 0, other: { x: quiver.x + (g.x - quiver.x) * q, y: quiver.y + (g.y - quiver.y) * q } }; }
  const pull = Math.min(1, (p - 0.6) / 0.4);
  return { pull, other: at(-1 - pull * 9) };
}

// (#306) a zombie with no weapon: its arms out in front of it, reaching; striking, a lunge, its hands further
// out, clawing. Where its two hands reach to (round its middle), and how far it lunges, or null
export function zombieReach(unit) {
  if (unitKin(unit) !== 'undead' || (unit.weapon && unit.weapon !== 'fist') || getDefinition('tools', unit.tool || 'none') || unit.asleep) return null;
  const def = unit.enemyKey ? getDefinition('enemies', unit.enemyKey) || {} : null;
  if (def && (def.ranged || def.necromancer)) return null; // (an archer's bow, a necromancer's staff)
  const r = unit.visualRadius || unit.radius || 11, f = unit.facing || 0;
  const sw = unit.swingT > 0 ? Math.sin(Math.PI * (1 - unit.swingT / (unit.swingLen || 0.3))) : 0;
  const reach = r * (0.75 + 0.5 * sw);
  // both arms out straight in front of it, a hand's width apart across its reach (a load's width when we see
  // it front or back, where that's two arms reaching at us), near its shoulders' height: spread a load's
  // width side-on, the lower hand ended up at its hip and that arm hung down its front
  // (#326) each hand off its own shoulder: facing us (or away) a shoulder's width apart; on a diagonal the far
  // hand shorter, so that arm no longer crosses the body; side-on both out alike, one over the other
  const c = Math.cos(f), sn = Math.abs(Math.sin(f)), y = Math.sin(f) * reach * 0.7 - r * 0.25, apart = r * 0.18 * Math.abs(c);
  const at = side => ({ x: c * reach * (side * c >= 0 ? 1 : 1 - 0.6 * sn) + side * r * 0.4 * sn, y: y + side * apart });
  return { hand: at(1), other: at(-1), lunge: sw * 3, sw };
}

// A human with bare hands in a fight: a boxer's guard, its other fist up by its chin, and a straight punch as
// it strikes, the body stepping into the blow. Where its two fists are (round its middle) and how far it steps
// with the punch, or null (not a human, not bare-handed, asleep, not in a fight, or with a shield: its other
// arm is the shield's)
export function humanPunch(unit) {
  if (unitKin(unit) !== 'humans' || (unit.weapon && unit.weapon !== 'fist') || getDefinition('tools', unit.tool || 'none') || unit.asleep || unit.shield) return null;
  const since = t => game.pathTick - (t ?? -1e9);
  // in a fight: striking now, or having struck or been struck not long ago
  if (!(unit.swingT > 0) && since(unit.struckAt) > 150 && since(unit.lastAttackedTick) > 150) return null;
  const r = unit.visualRadius || unit.radius || 11, f = unit.facing || 0;
  const sw = unit.swingT > 0 ? Math.sin(Math.PI * (1 - unit.swingT / (unit.swingLen || 0.3))) : 0;
  const bob = Math.sin(game.pathTick * 0.15) * r * 0.05; // (a light bounce up on its toes)
  const reach = r * (0.5 + 0.9 * sw); // (the blow: out at its middle, furthest at its peak)
  return {
    hand: { x: Math.cos(f) * reach, y: Math.sin(f) * reach * 0.7 - r * 0.25 },
    guard: { x: Math.cos(f) * r * 0.3, y: -r * 0.42 + Math.sin(f) * r * 0.15 + bob },
    lean: sw * 2.2, sw
  };
}

// Whose kind of body: an enemy's by its kind, a settler's by its type's faction (#306: in Battles the undead's
// and demons' were drawn as humans; a zombie raised is a zombie), else the colony's
export function unitKin(unit) {
  if (unit.enemyKey) return unit.enemyKey.startsWith('demon_') ? 'demons' : unit.enemyKey.startsWith('undead_') ? 'undead' : 'humans';
  const own = Object.values(GAME_CONFIG.factions).find(f => (f.units || []).includes(unit.type));
  return own ? own.id : game.gameMode === 'battle' ? 'humans' : getPlayerFaction().id;
}

// How big what it holds is drawn: as the hand holding it (a big one's bigger)
export const itemScale = unit => Math.max(1, Math.min(1.45, (unit.visualRadius || unit.radius || 11) / 11));

// Where its right hand holds what it holds (#298): down at the body's side, by its hip — as far out as an empty
// hand rests (restingHand), so an arm carrying something isn't laid across its belly
export const gripAt = r => ({ x: r * 0.72, y: r * 0.5 });

// How far along a spear's own shaft, from the grip, its other hand goes (the item's own units, as its art is
// drawn): long, it's carried in both hands, so its other hand is on the shaft too — back near its middle, the
// arm to it hanging at its side rather than stretched across its body
const spearGripBack = -10;

// The held item points where the unit faces (faceTowards), posed on top of that; held in the right hand
// at the body's side (gripAt), not coming out of its middle
export function applyHeldItemPose(unit) {
  const pose = getHeldItemPose(unit);
  const r = unit.visualRadius || unit.radius || 11, grip = gripAt(r);
  ctx.rotate((unit.facing || 0) + pose.angle);
  ctx.translate(pose.push + grip.x, grip.y);
}

// Nothing to do: a settler puts what it holds on its back (not in a battle, where it waits to fight)
// (a pastime too, but sparring, training or on patrol it holds its weapon, #199)
export function isResting(s) {
  const pastime = s.isIdle && s.idle && !['spar', 'train', 'patrolEdge'].includes(s.idle.act);
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
// where a load in its hands is: held at its chest, a little out in front (#298: it hung in the air out past
// its body, at its feet facing us; both its hands on it, drawFigure's carryPoint)
const carryAt = s => ({ x: Math.cos(s.facing || 0) * s.visualRadius * 0.5, y: Math.sin(s.facing || 0) * s.visualRadius * 0.3 + s.visualRadius * 0.05 });
function drawCarriedInHands(s) {
  const type = s.carrying.type;
  const f = s.facing || 0;
  const { x, y } = carryAt(s);
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


// A torch held up in its hand (#257), drawn round the unit's centre (after translate), its flame flickering.
// (#298) From its hand (where drawFigure puts it at rest), its stick up and a little out: it hung in the air
// out in front of it
export function drawHandTorch(facing, r) {
  const f = facing || 0, grip = gripAt(r);
  const hx = Math.cos(f) * grip.x - Math.sin(f) * grip.y, hy = Math.sin(f) * grip.x + Math.cos(f) * grip.y;
  const tx = hx + Math.cos(f) * 3, ty = hy - 9;
  ctx.strokeStyle = '#6d4520'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(hx, hy + 2); ctx.lineTo(tx, ty); ctx.stroke();
  const fx = tx, fy = ty - 3, k = 1 + Math.sin(performance.now() / 90 + r) * 0.15;
  ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.ellipse(fx, fy - 2, 3 * k, 4.5 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f9e79f'; ctx.beginPath(); ctx.ellipse(fx, fy - 1.5, 1.5 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.fill();
}

// A torch put to its side for a fight (#279): hung at its belt on the other side, angled down, still lit
function drawSideTorch(facing, r) {
  const f = (facing || 0) + 1.9, x = Math.cos(f) * (r - 2), y = Math.sin(f) * (r - 2);
  ctx.strokeStyle = '#6d4520'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y + 7); ctx.stroke();
  const k = 1 + Math.sin(performance.now() / 90 + r) * 0.15;
  ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.ellipse(x - 0.5, y - 2, 2.2 * k, 3.4 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f9e79f'; ctx.beginPath(); ctx.ellipse(x - 0.5, y - 1.6, 1.1 * k, 1.8 * k, 0, 0, Math.PI * 2); ctx.fill();
}

// Asleep (#257): a few z's drifting up off it
function drawSleepZs(x, y) {
  const t = performance.now() / 1000;
  ctx.fillStyle = 'rgba(236, 240, 241, 0.85)'; setFont('bold 8px sans-serif'); ctx.textAlign = 'center';
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.5 + k / 3) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.fillText('z', x + p * 8 + k * 2, y - p * 14);
  }
  ctx.globalAlpha = 1;
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
// round head (horns on a demon's), two arms: the right hand where its held item is (applyHeldItemPose), or, with
// nothing in it, resting at its side like the left one (which is at its side, or behind its shield). Its middle
// is where the circle's was, so nothing about where it stands or what hits it changes. Lying (asleep, or a
// corpse): turned on its side.

export const SKIN = { humans: '#f5cba7', demons: '#922b21', undead: '#9fb38a' };

// (#298) what's further up the screen is further from us, so behind the body. Facing away from us: its face
// unseen (no whistle on its chest)
export const facesAway = unit => Math.sin(unit.facing || 0) < -0.25;
const radiusOf = unit => unit.visualRadius || unit.radius || 11;
// its hand (and what's in it) up behind its body: facing away, or to the left (the hand's on its right)
// (eating, its food's at its mouth: in front of it, so behind its body only when its face is turned away)
export const heldBehind = unit => unit.eating ? facesAway(unit) : (unit.carrying && isCarryingInHands(unit)
  ? Math.sin(unit.facing || 0) * (radiusOf(unit) + 3) < -radiusOf(unit) * 0.1
  : handAt(unit, radiusOf(unit)).y < -radiusOf(unit) * 0.1);
// what's on its back behind its body: facing us, or to a side
export const backBehind = unit => Math.sin(unit.facing || 0) > -0.1;
// which side its hand (and held item) is on, -1 left or 1 right: its shield on the other
export const handSide = unit => (handAt(unit, radiusOf(unit)).x >= 0 ? 1 : -1);

// Where its right hand is now, round its middle (the held item's grip, as applyHeldItemPose puts it); `local`:
// how far along the item's own axis from the grip (in units of its art), where a second hand on it goes
function handAt(unit, r, local = 0) {
  const pose = getHeldItemPose(unit), a = (unit.facing || 0) + pose.angle, grip = gripAt(r);
  const fx = pose.push + grip.x + local * itemScale(unit), fy = grip.y;
  return { x: Math.cos(a) * fx - Math.sin(a) * fy, y: Math.sin(a) * fx + Math.cos(a) * fy };
}

// Whether its right hand holds anything: its weapon or tool (for an enemy, its kind's: a medic's bag, a
// necromancer's staff), a torch, what it works with. Striking or working the pose carries the hand along, so
// then it's at the grip too, whatever's in it. Resting, it has put its weapon and tool on its back
function handHolds(unit) {
  if (unit.swingT > 0 || (unit.working || 0) > 0 || isCrafting(unit)) return true;
  if (unit.torchInHand || unit.torch) return true;
  if (isResting(unit)) return false;
  const def = unit.enemyKey ? getDefinition('enemies', unit.enemyKey) || {} : null;
  if (def && (def.necromancer || (def.tool && def.tool !== 'none'))) return true;
  return !!(unit.weapon && unit.weapon !== 'fist') || !!(unit.tool && unit.tool !== 'none');
}

// Where an empty hand rests: down at its side, on the side a held thing's grip is on (so which arm is its
// shield's doesn't change). It used to rest at the grip's place (then on its belly) — an arm reaching there
// with nothing in it looked like an arm laid across its body
function restingHand(unit, r) {
  return { x: (handAt(unit, r).x >= 0 ? 1 : -1) * gripAt(r).x, y: r * 0.2 };
}

/**
 * The figure round (x, y), r its old circle's radius.
 * @param {any} unit
 * @param {{ x: number, y: number, r: number, body: string, skin: string, horns?: boolean, lying?: boolean, dead?: boolean, hand?: boolean, shield?: boolean, handPoint?: { x: number, y: number }, carryPoint?: { x: number, y: number }, armor?: string | null, otherPoint?: { x: number, y: number } | null, simple?: boolean }} o
 * (carryPoint: a load in both hands, both arms out to it, #298)
 * (handPoint: what its hand's at — the food it eats, a zombie's reaching hands, #298)
 * (#298) facing away from us, its arms (and what's in its hands, drawn by the caller) are behind its body
 */
export function drawFigure(unit, o) {
  const { x, y, r } = o;
  ctx.save();
  ctx.translate(x, y);
  // (#306) zoomed out a figure is a handful of pixels: a shadow, its legs, its body and its head — the
  // arms, hands, eyes, gear and idle signs would be sub-pixel clutter, and were most of a big colony's work
  if (o.simple) {
    if (o.lying) ctx.rotate(-Math.PI / 2 + 0.15);
    if (!o.lying) { ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(0, r * 1.02, r * 0.72, r * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = shade(o.body, -0.4);
    ctx.beginPath(); ctx.roundRect(-r * 0.3, r * 0.25, r * 0.6, r * 0.72, r * 0.12); ctx.fill();
    ctx.fillStyle = o.body;
    ctx.beginPath(); ctx.roundRect(-r * 0.6, -r * 0.48, r * 1.2, r * 0.98, r * 0.32); ctx.fill();
    drawHeadTexture(ctx, lookOf(unit), unitKin(unit), o.skin, 0, -r * 0.9, r * 0.5, unit.facing || 0, false, 0);
    ctx.restore();
    return;
  }
  // (#306) a zombie lunges as it strikes
  const z = !o.lying && !o.dead && !o.carryPoint ? zombieReach(unit) : null;
  if (z && z.lunge) ctx.translate(Math.cos(unit.facing || 0) * z.lunge, Math.sin(unit.facing || 0) * z.lunge * 0.7);
  // (#326) each reaching hand on its own shoulder's side: the one more to the right on the right, or a diagonal
  // facing crossed its arms over
  if (z) o = { ...o, handPoint: z.hand.x >= z.other.x ? z.hand : z.other, otherPoint: z.hand.x >= z.other.x ? z.other : z.hand };
  // a human fighting bare-handed: a boxer's guard, stepping into its punch
  const box = !z && !o.lying && !o.dead && !o.carryPoint && !o.handPoint ? humanPunch(unit) : null;
  if (box && box.lean) ctx.translate(Math.cos(unit.facing || 0) * box.lean, Math.sin(unit.facing || 0) * box.lean * 0.7);
  if (o.lying) ctx.rotate(-Math.PI / 2 + 0.15);
  const outline = 'rgba(0, 0, 0, 0.45)';
  // its shadow on the ground
  if (!o.lying) castShadow(ctx, 0, r * 1.02, r * 0.7, r * 0.22, r * 1.6); // (cast away from the sun, #307)
  // legs, stepping while it walks (#306: a woman a little shorter)
  const look = lookOf(unit);
  const big = isBigBody(unit); // (#326: drawn a strongman)
  const step = o.lying || o.dead ? 0 : Math.sin((unit.walk || 0) * 0.35) * r * (look.female ? 0.12 : 0.16);
  ctx.fillStyle = shade(o.body, -0.4);
  for (const [lx, dy] of [[-0.3, step], [0.3, -step]]) { ctx.beginPath(); ctx.roundRect(r * lx - r * 0.17, r * 0.25 + dy, r * 0.34, r * 0.72, r * 0.12); ctx.fill(); }
  // arms: the right to its hand, the left down its side (or out to its shield, on the side away from the hand)
  const carry = !o.lying && !o.dead ? o.carryPoint : null;
  // (a load: a hand on each side of it, across the way it faces)
  const f0 = unit.facing || 0, across = { x: -Math.sin(f0) * r * 0.42, y: Math.cos(f0) * r * 0.42 };
  // its hand: on a load, at its punch, at the food it eats, at what it holds — or, holding nothing, at its side
  const hand = carry ? { x: carry.x + across.x, y: carry.y + across.y } : box ? box.hand
    : o.handPoint || (o.hand && !o.lying && !o.dead ? (handHolds(unit) ? handAt(unit, r) : restingHand(unit, r)) : { x: r * 0.72, y: r * 0.2 });
  // a spear it holds (in hand, as its first hand is): its other hand further back along the shaft, on it — unless
  // that arm's taken by a shield or by the caller's own second hand (an archer's, at the string)
  const shaft = !o.otherPoint && !o.shield && !carry && !box && !o.handPoint && o.hand && !o.lying && !o.dead
    && isSpearWeapon(unit.weapon) && handHolds(unit) ? handAt(unit, r, spearGripBack) : null;
  const right = z ? 1 : hand.x >= 0 ? 1 : -1;
  const other = carry ? { x: carry.x - across.x, y: carry.y - across.y } : box ? box.guard : o.otherPoint && !o.lying && !o.dead ? o.otherPoint : o.shield ? { x: -right * (r - 1), y: 3 } : shaft ? shaft : { x: -right * r * 0.72, y: r * 0.25 };
  // (both hands out: a load, a boxer, a zombie reaching, a spearman — its other arm's drawn even when behind)
  const both = !!(carry || box || z || shaft);
  const arm = (from, to) => {
    ctx.strokeStyle = shade(o.body, -0.2); ctx.lineWidth = Math.max(2, r * (big ? 0.34 : 0.26)); ctx.lineCap = 'round'; // (#326: a strongman's thick)
    ctx.beginPath(); ctx.moveTo(from, -r * 0.3); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = o.skin; ctx.beginPath(); ctx.arc(to.x, to.y, r * 0.15, 0, Math.PI * 2); ctx.fill();
  };
  // (#298) its hand's arm behind its body when the hand is up behind it (heldBehind); the other in front
  // (a boxer's fists are in front of it, up behind its back when it faces away from us)
  const behind = box ? Math.sin(f0) < -0.1 : !o.lying && !o.dead && (carry ? carry.y < -r * 0.1 : o.handPoint ? facesAway(unit) : hand.y < -r * 0.1);
  const shoulder = r * (big && !o.lying ? 0.66 : 0.5); // (#326: a strongman's wide)
  if (behind) { arm(right * shoulder, hand); if (both) arm(-right * shoulder, other); }
  // the body (#306: a woman's narrower at the shoulders, a skirt's hem flaring over its legs)
  ctx.fillStyle = o.body; ctx.strokeStyle = outline; ctx.lineWidth = 1;
  if (look.female) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.48, -r * 0.48); ctx.lineTo(r * 0.48, -r * 0.48);
    ctx.lineTo(r * 0.38, -r * 0.06); ctx.lineTo(r * 0.5, r * 0.36);
    ctx.lineTo(-r * 0.5, r * 0.36); ctx.lineTo(-r * 0.38, -r * 0.06);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(o.body, -0.3);
    ctx.beginPath(); ctx.moveTo(-r * 0.38, r * 0.1); ctx.lineTo(r * 0.38, r * 0.1); ctx.stroke();
  } else if (big && !o.lying) {
    // (#326) a strongman: broad shoulders, the body narrowing to its waist, the chest's line (facing us)
    ctx.beginPath();
    ctx.moveTo(-r * 0.78, -r * 0.4); ctx.quadraticCurveTo(-r * 0.8, -r * 0.56, -r * 0.55, -r * 0.56); ctx.lineTo(r * 0.55, -r * 0.56);
    ctx.quadraticCurveTo(r * 0.8, -r * 0.56, r * 0.78, -r * 0.4); ctx.lineTo(r * 0.5, r * 0.5); ctx.lineTo(-r * 0.5, r * 0.5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!facesAway(unit) && !o.armor) {
      ctx.strokeStyle = shade(o.body, -0.28); ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.moveTo(-r * 0.42, -r * 0.12); ctx.quadraticCurveTo(-r * 0.2, -r * 0.02, 0, -r * 0.14); ctx.quadraticCurveTo(r * 0.2, -r * 0.02, r * 0.42, -r * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.14); ctx.lineTo(0, r * 0.32); ctx.stroke();
    }
  } else {
    ctx.beginPath(); ctx.roundRect(-r * 0.62, -r * 0.48, r * 1.24, r * 0.98, r * 0.32); ctx.fill(); ctx.stroke();
  }
  // its armour over it, under its arms (#298: it was over everything, arms too, and didn't fit the body)
  if (o.armor && !o.dead) drawArmor(r, o.armor, facesAway(unit) && !o.lying);
  if (!behind) arm(right * shoulder, hand);
  if (!(both && behind)) arm(-right * shoulder, other);
  // (#326: no strokes off the hands as they strike any more: the lunge and the arms' reach show the blow)
  // the head, looking the way it faces (its eyes on the side it turns to); a dead one's eyes are crosses
  const hy = -r * 0.9, hr = r * 0.5;
  const f = unit.facing || 0, ex = Math.cos(f) * hr * 0.35, ey = Math.max(-0.1, Math.sin(f)) * hr * 0.3;
  drawHeadTexture(ctx, look, unitKin(unit), o.skin, 0, hy, hr, f, !o.lying && !o.dead && Math.sin(f) < -0.5, o.lying || o.dead ? 0 : unit.walk || 0);
  // (#326, 27.10, 27) a helmet: an iron cap over the top of the head, a rim round it
  if (unit.helmet) {
    ctx.fillStyle = '#8e9aa6'; ctx.strokeStyle = '#4d5660'; ctx.lineWidth = Math.max(0.8, hr * 0.14);
    ctx.beginPath(); ctx.arc(0, hy - hr * 0.08, hr * 1.06, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.beginPath(); ctx.ellipse(-hr * 0.35, hy - hr * 0.62, hr * 0.28, hr * 0.14, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  // a demon's horns through its hair (and its helmet)
  // (#326: a big demon's curled, a ram's)
  if (o.horns) drawHorns(0, hy + hr * 0.35, hr * (look.female ? 1.15 : 1.35), big);
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
  // watering: the hoe on its back while the can's in its hand (the can's own place is its side, #279)
  if (s.tool === 'hoe' && s.wateringCan && (s.usingCan || 0) > 0) { ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-1, -9, 2, 15); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-3, -10, 6, 3); }
  ctx.restore();
}

// Its side slot (#279): what hangs at its belt on the side away from its hand, turned with it: a watering
// can, a captain's banner (its pole held up beside it). (#298) Drawn before the body when that side is the far
// one (up the screen), after it otherwise: `front` says which pass this is
const isHealing = s => (s.working || 0) > 0 && s.workKind === 'heal';

// (#326) Being treated: green crosses rising off it, a moment after each touch of the medic's herbs
export function drawHealSparks(u) {
  const since = game.pathTick - (u.treatedAt ?? -1e9);
  if (since > 40) return;
  const r = u.visualRadius || u.radius || 11;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const t = ((game.pathTick + i * 17) % 50) / 50, px = u.x + (i - 1) * r * 0.6, py = u.y - r * 0.6 - t * r * 1.6;
    ctx.globalAlpha = (1 - t) * Math.min(1, (40 - since) / 15);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(px - 0.9, py - 3, 1.8, 6); ctx.fillRect(px - 3, py - 0.9, 6, 1.8);
  }
  ctx.restore();
}

export function drawSideItems(s, front = true) {
  const r = s.visualRadius, f = s.facing || 0;
  const can = s.wateringCan && !((s.usingCan || 0) > 0), banner = !!s.banner;
  // (#326) at its hip on the side away from its hand; side-on, that's its far side, a little behind it
  const sideOn = Math.abs(Math.cos(f)) > 0.85, handX = handAt(s, r).x >= 0 ? 1 : -1;
  const x = sideOn ? -Math.cos(f) * r * 0.3 : -handX * r * 0.72, y = r * 0.18;
  const farSlot = sideOn || facesAway(s);
  if (can && farSlot !== front) drawWateringCan(x + Math.cos(f) * 2, y + 3, 0.55);
  // (#326) a necromancer's soul lantern at its hip: a cord, an iron cap and foot, glass that glows pale blue with the souls in it
  if (s.soul_lantern && farSlot !== front) {
    const souls = s.lanternSouls || 0, lx = x + Math.cos(f) * 2, ly = y + 2;
    ctx.save(); ctx.translate(lx, ly);
    ctx.strokeStyle = '#6d4520'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -3.2); ctx.stroke();
    ctx.fillStyle = '#34495e'; ctx.fillRect(-2.6, -3.6, 5.2, 1.3); ctx.fillRect(-2.6, 3.4, 5.2, 1.2);
    ctx.fillStyle = souls > 0 ? 'rgba(150, 210, 255, 0.95)' : 'rgba(190, 205, 215, 0.55)'; ctx.fillRect(-2.2, -2.3, 4.4, 5.7);
    ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 0.7; ctx.strokeRect(-2.2, -2.3, 4.4, 5.7);
    if (souls > 0) {
      const glow = ctx.createRadialGradient(0, 0.5, 0.5, 0, 0.5, 9);
      glow.addColorStop(0, `rgba(190, 230, 255, ${Math.min(0.7, 0.3 + souls * 0.04)})`); glow.addColorStop(1, 'rgba(120, 190, 255, 0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0.5, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // (#326) a medic at work: its bag at its hip (its hand's on the wound)
  if (isHealing(s) && farSlot !== front) {
    ctx.save(); ctx.translate(x - 3, y - 4);
    drawHeldTool('medbag', 0.8, Math.min(1, (s.bagHerbs || 0) / GAME_CONFIG.medic.bagSize));
    ctx.restore();
  }
  // (#326) the banner on its back (still its side slot): behind it facing us or side-on, over its back facing
  // away; the pole up past its head, the flag at the top
  if (banner && facesAway(s) === front) {
    const bx = -Math.cos(f) * r * 0.35, by = -r * 0.1;
    ctx.fillStyle = '#6d4520'; ctx.fillRect(bx - 1, by - r * 2.1, 2, r * 2.1 + 4);
    ctx.fillStyle = getSettlerColor(s); ctx.fillRect(bx + 1, by - r * 2.1, 10, 7);
    ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 1; ctx.strokeRect(bx + 1, by - r * 2.1, 10, 7);
  }
}

// The held item across the back: turned square to where the unit faces, behind it
export function applyBackPose(unit) {
  ctx.rotate((unit.facing || 0) + Math.PI / 2);
  ctx.translate(-10, unit.visualRadius * 0.7); // (its grip a little off the middle of its back, #279)
}

// Armour on a figure of that radius, over its body and fitted to it (#298), seen from the front or (back) from
// behind. Iron: a breastplate with a ridge down its middle, a shine, rounded plates on its shoulders and a row
// of plates hanging below its belt. Leather: a jerkin laced up the front, stitched at its edges, a belt with a
// buckle, studs on its shoulders
export function drawArmor(radius, kind = 'iron', back = false) {
  const r = radius, x0 = -r * 0.6, y0 = -r * 0.46, w = r * 1.2, h = r * 0.8;
  const torso = () => { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, [r * 0.3, r * 0.3, r * 0.14, r * 0.14]); };
  const shoulders = (fill, edge) => {
    for (const sx of [-1, 1]) { ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(sx * r * 0.48, -r * 0.38, r * 0.2, r * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  };
  if (kind === 'leather') {
    ctx.fillStyle = '#8d5a35'; ctx.strokeStyle = '#4e3016'; ctx.lineWidth = 1;
    torso(); ctx.fill(); ctx.stroke();
    // stitching round its edge
    ctx.setLineDash([1.2, 1.4]); ctx.strokeStyle = '#d4a373'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.roundRect(x0 + 1.2, y0 + 1.2, w - 2.4, h - 2.4, r * 0.24); ctx.stroke(); ctx.setLineDash([]);
    if (!back) {
      // laced up the front
      ctx.strokeStyle = '#3e2716'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(0, y0 + 1); ctx.lineTo(0, y0 + h * 0.75); ctx.stroke();
      ctx.strokeStyle = '#e8d3b0';
      for (let k = 0; k < 3; k++) { const ly = y0 + 2 + k * h * 0.2; ctx.beginPath(); ctx.moveTo(-r * 0.12, ly); ctx.lineTo(r * 0.12, ly + h * 0.1); ctx.moveTo(r * 0.12, ly); ctx.lineTo(-r * 0.12, ly + h * 0.1); ctx.stroke(); }
    }
    // a belt and its buckle
    ctx.fillStyle = '#3e2716'; ctx.fillRect(x0, y0 + h - r * 0.18, w, r * 0.14);
    if (!back) { ctx.strokeStyle = '#d4ac0d'; ctx.lineWidth = 0.8; ctx.strokeRect(-r * 0.1, y0 + h - r * 0.2, r * 0.2, r * 0.18); }
    shoulders('#7a4b29', '#4e3016');
    ctx.fillStyle = '#d5dbdb';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * r * 0.48, -r * 0.38, 0.8, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  // iron
  ctx.fillStyle = '#9aa7b1'; ctx.strokeStyle = '#4d5b66'; ctx.lineWidth = 1;
  torso(); ctx.fill(); ctx.stroke();
  // plates hanging below its belt
  ctx.fillStyle = '#7f8c8d';
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.roundRect(x0 + 1 + k * (w - 2) / 4, y0 + h - r * 0.06, (w - 2) / 4 - 0.6, r * 0.2, 1); ctx.fill(); }
  if (!back) {
    // a ridge down its middle and a shine on one side
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(0, y0 + 1.5); ctx.lineTo(0, y0 + h - 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'; ctx.beginPath(); ctx.roundRect(x0 + r * 0.14, y0 + r * 0.12, r * 0.22, h * 0.55, r * 0.1); ctx.fill();
  } else {
    // its back plate: two straps across
    ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 + 2, y0 + 2); ctx.lineTo(x0 + w - 2, y0 + h - 3); ctx.moveTo(x0 + w - 2, y0 + 2); ctx.lineTo(x0 + 2, y0 + h - 3); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; ctx.fillRect(x0 + 1, y0 + h - r * 0.12, w - 2, r * 0.06);
  shoulders('#b0bec5', '#4d5b66');
}

// A round wooden shield with an iron rim and boss on the other arm of a body of that radius (#298: side, the
// hand's side; the shield on the other)
export function drawShield(radius, side = 1) {
  const x = -side * (radius - 1);
  ctx.fillStyle = '#8e5a2b'; ctx.beginPath(); ctx.arc(x, 3, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.arc(x, 3, 1.8, 0, Math.PI * 2); ctx.fill();
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
  ctx.fillStyle = '#34495e'; setFont('bold 8px sans-serif'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
// Eating (#248; #279): its food in its hand, brought up to its mouth and down again a bite at a time
function eatingAt(s) {
  const f = s.facing || 0, r = s.visualRadius, bite = Math.abs(Math.sin(performance.now() / 380 + s.id));
  const rest = { x: Math.cos(f) * r * 0.6, y: Math.sin(f) * r * 0.5 + r * 0.25 }, mouth = { x: Math.cos(f) * r * 0.3, y: -r * 0.72 };
  return { x: rest.x + (mouth.x - rest.x) * bite, y: rest.y + (mouth.y - rest.y) * bite, bite };
}

// (#326) Where the picked ones are going: their way as a dashed line, moving along it, to where it ends (an order's
// spot without a way worked out yet: straight to it). On the ground, under everyone
export function drawSelectedPaths() {
  const picked = /** @type {import('../../../engine/world/types.js').Settler[]} */ ([game.selectedSettler, ...game.selectedGroup].filter(s => s && game.settlers.includes(s)));
  if (!picked.length) return;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -(performance.now() / 40) % 11;
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (const s of picked) {
    const way = s.path && s.path.length ? s.path : s.orderSpot && Math.hypot(s.orderSpot.x - s.x, s.orderSpot.y - s.y) > 8 ? [s.orderSpot] : null;
    if (!way) continue;
    ctx.strokeStyle = s === game.selectedSettler ? 'rgba(241, 196, 15, 0.85)' : 'rgba(241, 196, 15, 0.5)';
    ctx.beginPath(); ctx.moveTo(s.x, s.y);
    for (const p of way) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    const end = way[way.length - 1];
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(end.x, end.y, 3, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    ctx.setLineDash([6, 5]);
  }
  ctx.restore();
}

export function drawSettlers() {
  // (#306) zoomed out: figures at their simplest, and what's off the screen not drawn at all
  const simple = simpleUnit(), view = getViewRect(60), scale = getViewScale(), tiny = tinyUnit();
  const dab = 1.6 / scale; // (a couple of screen px, in world units)
  game.settlers.forEach(s => {
    if (s.x < view.x0 || s.x > view.x1 || s.y < view.y0 || s.y > view.y1) return;
    if (isPet(s)) { drawPet(s); return; } // (#314)
    // (#306) one or two pixels on the screen: a dab of its colour, and the ring of the one picked
    if (tiny) {
      ctx.fillStyle = getSettlerColor(s);
      ctx.fillRect(s.x - dab / 2, s.y - dab, dab, dab * 2);
      if (s === game.selectedSettler) { ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = dab; ctx.beginPath(); ctx.ellipse(s.x, s.y + dab, dab * 1.4, dab * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); }
      return;
    }
    // an idle undead sways where it stands (#199): drawn a little to and fro
    const sway = s.swaying ? Math.sin(performance.now() / 450 + s.id) * 2.5 : 0;
    if (sway) { ctx.save(); ctx.translate(sway, 0); }
    const r = s.visualRadius, top = s.y - r * 1.45; // (the top of its head)
    // the possessed one: a white ring on the ground round its feet
    if (s.isPossessed) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.95, r * 0.95, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
    // what it carries is in its hands, what it held goes on its back (in a backpack it stays out of sight,
    // the bar above says how full); making a thing, a hammer in its hands (#232)
    const inHands = isCarryingInHands(s);
    const crafting = isCrafting(s);
    // (#279) fighting with a torch in hand and a weapon or tool: the torch goes to its side, it fights with that
    // (#326) at work too (gathering, building, cooking...): the hands are on the job, the torch at its side
    const torchAside = s.torchInHand && ((game.pathTick - (s.struckAt ?? -1e9) < 150 && (s.weapon !== 'fist' || s.tool !== 'none')) || (s.working || 0) > 0);
    const torchHeld = s.torchInHand && !torchAside;
    // (#279) at work with a hammer (building, making) or a knife (butchering, with no blade of its own), or
    // reaching into a bush: what it holds goes on its back, the hand's for the work
    const k = itemScale(s);
    const blade = isSwordWeapon(s.weapon) || isSpearWeapon(s.weapon);
    // (#326) a medic at work: herbs in its hand; an archer out of arrows in a fight: its dagger (the bow on its back)
    const daggerOut = usesDagger(s) && game.pathTick - (s.struckAt ?? -1e9) < 180;
    const workTool = s.asleep ? null : crafting || ((s.working || 0) > 0 && s.workKind === 'build') ? 'hammer' : (s.working || 0) > 0 && s.workKind === 'butcher' && !blade ? 'knife'
      : isHealing(s) ? 'herbs' : daggerOut ? 'dagger' : null;
    const picking = (s.working || 0) > 0 && s.workKind === 'pick';
    const onBack = isResting(s) || inHands || s.eating || torchHeld || s.asleep || workTool || picking;
    const food = s.eating && !s.asleep ? eatingAt(s) : null;

    // (#298) in layers, by how far from us each thing is (up the screen is further): its hand up behind it
    // (facing away, or to the left), what's in it (and that arm, drawFigure) behind its body; what's on its
    // back behind it when it faces us or a side, in front when it faces away. Its side slot as that side is
    // near or far
    const away = facesAway(s) && !s.asleep, side = handSide(s);
    const handBack = heldBehind(s) && !s.asleep, backBack = backBehind(s);
    // its weapon or tool, in its hand or across its back
    const heldItem = () => {
      if (isHealing(s)) return; // (#326: its bag's at its hip)
      ctx.save();
      if (onBack) applyBackPose(s); else applyHeldItemPose(s);
      if (getNecromancy(s) && s.weapon === 'fist') {
        drawStaff(getSettlerColor(null), getDarkness()); // (#326: its side's colour, glowing in the dark)
      } else if (!drawHeldWeapon(s.weapon, k, onBack ? 0 : (bowDraw(s) || { pull: 0 }).pull)) {
        if (s.tool === 'hoe' && s.wateringCan && (s.usingCan || 0) > 0) drawWateringCan(5, 1, 1); // watering: the can in hand (the hoe on its back, drawBackItems)
        else drawHeldTool(s.tool || 'none', k, Math.min(1, (s.bagHerbs || 0) / GAME_CONFIG.medic.bagSize));
      }
      drawWeaponBlood(s);
      ctx.restore(); // pose only moves the held item
    };
    // what's in its hands: its weapon or tool (unless on its back), a load, a hammer or knife, a berry, a torch,
    // its food, its shield
    const inHand = () => {
      if (!onBack) heldItem();
      if (inHands) drawCarriedInHands(s);
      if (workTool) { ctx.save(); applyHeldItemPose(s); drawWorkTool(workTool, k); ctx.restore(); }
      // a berry in its hand as it draws it back from the bush (#279)
      if (picking && Math.sin(game.pathTick * 0.3) < -0.3) { ctx.save(); applyHeldItemPose(s); ctx.fillStyle = '#5b6ee1'; ctx.beginPath(); ctx.arc(1, 0, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      if (torchHeld && !s.asleep) drawHandTorch(s.facing, s.visualRadius);
      else if (torchAside && !s.asleep) drawSideTorch(s.facing, s.visualRadius);
      if (food && s.eating) { drawIcon(ctx, s.eating.icon, food.x, food.y - 2, 9); if (food.bite > 0.95) { ctx.fillStyle = '#d4a373'; ctx.fillRect(food.x + 3, food.y + 3, 2, 2); } }
    };
    // what's on its back: a backpack, a quiver, its weapon or tool when its hands are busy
    const onItsBack = () => {
      if (s.asleep) return;
      if (onBack) heldItem();
      drawBackItems(s);
    };
    const at = fn => { ctx.save(); ctx.translate(s.x, s.y); fn(); ctx.restore(); };

    if (simple) {
      // (#306) at this size only the figure (drawFigure), its health bar and what's on fire or marked
    } else {
      if (s.asleep) at(heldItem); // (asleep: lying with it beside it)
      if (backBack) at(onItsBack);
      if (handBack) at(inHand);
      if (!s.asleep) at(() => drawSideItems(s, false));
    }
    // the figure in the colony's colour (#251)
    const faction = unitKin(s);
    if (s.temporary !== undefined) ctx.globalAlpha = 0.7; // a raised zombie, for a while
    if (s.asleep) ctx.globalAlpha = 0.85;
    drawFigure(s, { x: s.x, y: s.y, r, body: getSettlerColor(s), skin: SKIN[faction] || SKIN.humans, horns: faction === 'demons', lying: !!s.asleep, hand: true, shield: !!s.shield, handPoint: food || undefined, carryPoint: inHands && !s.asleep ? carryAt(s) : undefined, otherPoint: onBack ? null : (bowDraw(s) || {}).other || null, armor: !s.asleep && armorOf(s) ? String(s.armor) : null, simple });
    ctx.globalAlpha = 1;
    if ((s.burning || 0) > 0) drawBurning(s.x, s.y, r);
    drawBodyBlood(s, r);
    drawHealSparks(s); // (#326)
    if (!simple) at(() => {
      // a commander's whistle on a cord on its chest (#248), seen from the front
      if (s.whistle && !s.asleep && !away) { ctx.fillStyle = '#bdc3c7'; ctx.fillRect(-2, -r * 0.2, 5, 3); ctx.fillStyle = '#7f8c8d'; ctx.fillRect(2, -r * 0.2, 2, 3); }
      if (s.shield && !s.asleep) drawShield(r, side); // (on its other arm, in front)
    });
    if (!simple) {
      if (!backBack) at(onItsBack);
      if (!handBack && !s.asleep) at(inHand);
      if (!s.asleep) at(() => drawSideItems(s, true));
    }

    if (crafting) drawWorkpiece(s);
    if (s.asleep) drawSleepZs(s.x + r, s.y - r);

    // selected: a ring round its feet (#326: one picked with it, a fainter one)
    if (s === game.selectedSettler || game.selectedGroup.includes(s)) {
      ctx.strokeStyle = s === game.selectedSettler ? '#f1c40f' : 'rgba(241, 196, 15, 0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.95, r + 3, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); // (round its feet)
    }

    if (!simple && s.isIdle && !s.carrying && (!s.idle || s.idle.act === 'wander')) drawIdleIcon(s.x + r, top - 12);
    // an archer out of arrows (#232): a crossed-out arrow over it
    if (isRangedWeapon(s.weapon) && s.quiver && (s.arrows || 0) <= 0 && game.gameMode !== 'battle') drawNoArrows(s.x - r - 2, top - 12);
    // an order given or taken (#248): its bubble, and the commander's line to the one it told
    const line = s.orderLine;
    if (line && line.until > game.pathTick) {
      const to = game.settlers.find(o => o.id === line.toId);
      if (to) { ctx.strokeStyle = 'rgba(241, 196, 15, 0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]); }
    }
    if (s.orderBubble && s.orderBubble.until > game.pathTick) drawOrderBubble(s.x + r, top - 14, s.orderBubble.icon);
    // (talking in a knot: what they say, not dots, #279: settlers.voices.js talkInKnots)

    if (!simple && isCensored(s)) drawCensor(s, r, SKIN[faction] || SKIN.humans); // (#298)

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

// An order (#248): a bubble with what it's about
export function drawOrderBubble(x, y, icon) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath(); ctx.ellipse(x, y, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.lineTo(x - 8, y + 11); ctx.lineTo(x - 1, y + 7); ctx.fill();
  drawIcon(ctx, icon, x, y, 11);
}

// (#298) censored only while it's at it this very moment: called away half way (a wave, the night), it went
// about with the mosaic still on it
export const isCensored = s => !!s.needsRelief && game.pathTick - (s.relievingAt ?? -1e9) <= 2 && !s.asleep;

// (#298) relieving itself: a censor's mosaic over its back half, squares of its skin and clothes in a jumble
// that shifts a few times a second
function drawCensor(s, r, skin) {
  const f = s.facing || 0, cell = Math.max(2.5, r * 0.28), n = 4;
  const cx = s.x - Math.cos(f) * r * 0.35, cy = s.y - Math.sin(f) * r * 0.35 + r * 0.15;
  const colours = [skin, getSettlerColor(s), '#5d4037', '#d7ccc8', skin];
  const beat = Math.floor(game.pathTick / 12);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const h = Math.abs(Math.sin((i * 7 + j * 13 + s.id * 3 + beat) * 12.9898)) * 43758.5453;
      ctx.fillStyle = colours[Math.floor(h) % colours.length];
      ctx.fillRect(cx - (n / 2) * cell + i * cell, cy - (n / 2) * cell + j * cell, cell, cell);
    }
  }
}
