// How a settler looks and moves: the held weapon or tool, its swing and work animation, where it faces,
// what it carries on its back, the idle "zZ"

// ---- Animation state (drawn by getHeldItemPose in render.js)

// A strike: the held weapon or tool swings through once over `seconds`
function startSwing(unit, seconds) {
  unit.swingT = seconds;
  unit.swingLen = seconds;
}

function tickAnimation(unit, dt) {
  // walking (not striking or working): the held item turns the way it goes, not stay where it last struck
  // (a playtest saw weapons "stuck in one pose" on walking settlers)
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
function faceTowards(unit, x, y) {
  if (x !== unit.x || y !== unit.y) unit.facing = Math.atan2(y - unit.y, x - unit.x);
}

// How the held weapon or tool is posed right now: a rotation around the body and a push forward.
// A strike (swingT): swords, clubs, fists and tools sweep an arc, spears thrust, bows recoil. Working
// (chopping, mining, planting...): a steady chop in time with the game's ticks, so replays look the same.
function getHeldItemPose(unit) {
  const item = unit.weapon && unit.weapon !== 'fist' ? unit.weapon : (unit.tool && unit.tool !== 'none' ? unit.tool : 'fist');
  if (unit.swingT > 0) {
    const p = 1 - unit.swingT / (unit.swingLen || 0.3);
    const arc = Math.sin(Math.PI * p);
    if (isBowWeapon(item)) return { angle: 0, push: -3 * arc };
    if (isSpearWeapon(item)) return { angle: 0, push: 8 * arc };
    return { angle: -0.9 + 1.8 * p, push: 0 };
  }
  if (unit.working > 0) {
    const beat = Math.sin(pathTick * 0.3);
    if (item === 'rod') return { angle: 0.12 * beat, push: 0 };
    if (item === 'fist' || item === 'medbag') return { angle: 0, push: 2 * beat };
    return { angle: 0.7 * beat - 0.2, push: 0 };
  }
  return { angle: 0, push: 0 };
}

// The held item points where the unit faces (faceTowards), posed on top of that
function applyHeldItemPose(unit) {
  const pose = getHeldItemPose(unit);
  ctx.rotate((unit.facing || 0) + pose.angle);
  ctx.translate(pose.push, 0);
}

// Nothing to do (#171): a settler puts what it holds on its back (not in a battle, where it waits to fight)
function isResting(s) {
  return s.activity === 'patrol' && !s.isPossessed && !(s.swingT > 0) && gameMode !== 'battle';
}

// The held item across the back: turned square to where the unit faces, behind it
function applyBackPose(unit) {
  ctx.rotate((unit.facing || 0) + Math.PI / 2);
  ctx.translate(-15, unit.visualRadius * 0.7);
}

// Weapon held in the right hand, drawn around (0, 0) = the unit's centre (translate first).
// Shared by settlers and enemies. Returns false for no weapon (fists).
function drawHeldWeapon(weapon) {
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
function drawWateringCan(x, y, scale) {
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
function drawQuiver(x, arrows) {
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(x - 2, -6, 5, 11);
  ctx.fillStyle = '#ecf0f1';
  for (let i = 0; i < Math.min(4, Math.ceil(arrows / 3)); i++) ctx.fillRect(x - 2 + i * 1.3, -9, 1, 3);
}

// Idle settler: a small thought bubble with "zZ" above the head
function drawIdleIcon(x, y) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - 6, y + 7, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#34495e'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('zZ', x, y + 1);
  ctx.textBaseline = 'alphabetic';
}
