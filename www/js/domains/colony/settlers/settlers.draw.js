// How a settler looks and moves: the held weapon or tool, its swing and work animation, where it faces,
// what it carries on its back, the idle "zZ"

// ---- Animation state (drawn by getHeldItemPose, below)

import { GAME_CONFIG } from '../../../content/configs/index.js';
import { drawIcon } from '../../../ui/index.js';
import { game } from '../../../engine/world/index.js';
import { isBowWeapon, isClubWeapon, isSpearWeapon, isSwordWeapon } from '../equipment/index.js';
import { getCarryCapacity } from '../storage/index.js';
import { ctx } from '../../../engine/platform/index.js';
import { getPlayerFaction, getSettlerColor } from '../../factions/index.js';
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
    return { angle: 0.7 * beat - 0.2, push: 0 };
  }
  return { angle: 0, push: 0 };
}

// The held item points where the unit faces (faceTowards), posed on top of that
export function applyHeldItemPose(unit) {
  const pose = getHeldItemPose(unit);
  ctx.rotate((unit.facing || 0) + pose.angle);
  ctx.translate(pose.push, 0);
}

// Nothing to do: a settler puts what it holds on its back (not in a battle, where it waits to fight)
export function isResting(s) {
  return s.activity === 'patrol' && !s.isPossessed && !(s.swingT > 0) && game.gameMode !== 'battle';
}

// The held item across the back: turned square to where the unit faces, behind it
export function applyBackPose(unit) {
  ctx.rotate((unit.facing || 0) + Math.PI / 2);
  ctx.translate(-15, unit.visualRadius * 0.7);
}

// Weapon held in the right hand, drawn around (0, 0) = the unit's centre (translate first).
// Shared by settlers and enemies. Returns false for no weapon (fists).
// Iron armour: a grey ring round a body of that radius
export function drawArmor(radius) {
  ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, radius + 2, 0, Math.PI * 2); ctx.stroke();
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
    // the whole body in the colony's colour; the possessed one ringed in white
    ctx.fillStyle = getSettlerColor(s);
    if (s.temporary !== undefined) ctx.globalAlpha = 0.7; // a raised zombie, for a while
    ctx.beginPath(); ctx.arc(s.x, s.y, s.visualRadius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if ((s.burning || 0) > 0) drawBurning(s.x, s.y, s.visualRadius);
    if (s.isPossessed) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); }
    if (getPlayerFaction().id === 'demons' && game.gameMode !== 'battle') drawHorns(s.x, s.y, s.visualRadius);
    drawBodyBlood(s, s.visualRadius);

    // a backpack on the left side, with a bar for how full it is
    if (s.backpack) {
      const bx = s.x - s.visualRadius - 3, by = s.y - 6;
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(bx, by, 6, 12);
      ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, 6, 12);
      const loads = (s.carrying && s.carrying.loads) || 0;
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(bx + 1, by + 11 - 10 * Math.min(1, loads / getCarryCapacity(s)), 4, 10 * Math.min(1, loads / getCarryCapacity(s)));
    }

    if (s.carrying && s.carrying.type === 'dung') {
      // dung for a plot: a small brown pile over its head (#201)
      ctx.fillStyle = '#5c3d16'; ctx.beginPath(); ctx.ellipse(s.x, s.y - s.visualRadius - 7, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    } else if (s.carrying) {
      const type = s.carrying.type;
      const known = GAME_CONFIG.resources[type] || GAME_CONFIG.foodKinds[type];
      const icon = type === 'bundle' ? 'bundle' : (known ? known.icon : 'wheat');
      drawIcon(ctx, icon, s.x, s.y - s.visualRadius - 9, 13);
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.save();
    if (isResting(s)) applyBackPose(s);
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
      drawMedbag(Math.min(1, (s.bagHerbs || 0) / GAME_CONFIG.medic.bagSize));
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
    if (s.armor === 'iron' || s.hasArmor) drawArmor(s.visualRadius);
    // whichever of the farmer's hoe and watering can isn't in hand is carried on its back
    if (s.tool === 'hoe' && s.wateringCan) {
      if ((s.usingCan || 0) > 0) {
        ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-s.visualRadius - 2, -8, 2, 15);
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-s.visualRadius - 4, -9, 6, 3);
      } else {
        drawWateringCan(-s.visualRadius, 4, 0.7);
      }
    }
    if (s.shield) drawShield(s.visualRadius);
    if (s.quiver) {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-s.visualRadius - 3, -5, 4, 10);
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s.visualRadius - 2, -4); ctx.lineTo(-s.visualRadius - 2, -10); ctx.moveTo(-s.visualRadius, -4); ctx.lineTo(-s.visualRadius, -10); ctx.stroke();
    }
    ctx.restore();

    if (s === game.selectedSettler) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.visualRadius + 4, 0, Math.PI * 2); ctx.stroke();
    }

    if (s.isIdle && !s.carrying) drawIdleIcon(s.x + s.visualRadius, s.y - s.visualRadius - 16);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - 15, s.y - s.visualRadius - 10, 30, 4);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(s.x - 15, s.y - s.visualRadius - 10, (Math.max(0, s.hp) / s.maxHp) * 30, 4);
  });
}
