// What's held (#279): every weapon and tool drawn with its grip where the hand is (the origin, after
// applyHeldItemPose), along +x, as big as the hand holding it (scale k). A sword with a guard, a wrapped grip
// and a tapering blade; a club thickening to a knotted head; a spear held at the middle of its shaft, a leaf
// of a head; a bow bent forward with its string; an axe, a pickaxe and a hoe with heads that look the part; a
// rod with its line; a medic's bag hanging from the hand; and for work, a hammer and a knife.

import { ctx } from '../../../engine/platform/index.js';
import { isClubWeapon, isSpearWeapon, isSwordWeapon } from '../equipment/index.js';

const poly = (pts, fill, stroke) => {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
};
const rect = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };

// A weapon; false if it's none of them (the fist)
export function drawHeldWeapon(weapon, k = 1) {
  ctx.save();
  ctx.scale(k, k);
  let drawn = true;
  if (isSwordWeapon(weapon)) {
    const iron = weapon === 'iron_sword', len = iron ? 23 : 20, steel = iron ? '#aab7c4' : '#e5e8e8';
    rect(-2, -1.5, 5, 3, '#6d4520'); // the grip, wrapped
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 0.6;
    for (const gx of [-1, 0.6, 2.2]) { ctx.beginPath(); ctx.moveTo(gx, -1.5); ctx.lineTo(gx + 0.8, 1.5); ctx.stroke(); }
    ctx.fillStyle = '#d4ac0d'; ctx.beginPath(); ctx.arc(-2.8, 0, 1.6, 0, Math.PI * 2); ctx.fill(); // the pommel
    rect(3, -4.5, 1.8, 9, '#d4ac0d'); // the guard
    poly([[4.8, -2], [len - 3, -1.6], [len, 0], [len - 3, 1.6], [4.8, 2]], steel, 'rgba(0, 0, 0, 0.4)');
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(6, -0.6); ctx.lineTo(len - 4, -0.4); ctx.stroke();
  } else if (isClubWeapon(weapon)) {
    rect(-3, -1.4, 9, 2.8, '#7a4b21');
    poly([[6, -1.8], [11, -3.5], [16, -4], [18, -2], [18, 2], [16, 4], [11, 3.5], [6, 1.8]], '#8b5a2b', 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = '#5c3a17'; for (const [kx, ky] of [[11, -1.5], [14, 1.8], [16, -1]]) { ctx.beginPath(); ctx.arc(kx, ky, 0.9, 0, Math.PI * 2); ctx.fill(); }
  } else if (isSpearWeapon(weapon)) {
    const iron = weapon === 'iron_spear';
    rect(-12, -1.2, 34, 2.4, iron ? '#5d4037' : '#8e5a2b'); // held at the middle of the shaft
    rect(21, -1.8, 2, 3.6, '#4e3016'); // the binding
    poly([[22.5, -3], [iron ? 33 : 30, 0], [22.5, 3], [24, 0]], iron ? '#9aa7b1' : '#ecf0f1', 'rgba(0, 0, 0, 0.4)');
  } else if (weapon === 'bow') {
    ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, -13); ctx.quadraticCurveTo(10, 0, -1, 13); ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 240, 241, 0.85)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-1, -13); ctx.lineTo(-1, 13); ctx.stroke();
    rect(2.2, -2, 2.4, 4, '#5c3a17'); // the grip
    ctx.lineCap = 'butt';
  } else drawn = false;
  ctx.restore();
  return drawn;
}

// A tool; false if it's none of them
export function drawHeldTool(tool, k = 1, full = 0) {
  ctx.save();
  ctx.scale(k, k);
  let drawn = true;
  const iron = tool.startsWith('iron_'), head = iron ? '#cfd8dc' : '#7f8c8d', edge = iron ? '#eceff1' : '#aab7b8';
  if (tool === 'axe' || tool === 'iron_axe') {
    rect(-3, -1.3, 20, 2.6, '#8e5a2b');
    poly([[14, -1.6], [17.5, -6.5], [21, -5.5], [21.5, 3.5], [17.5, 4.5], [14, 1.6]], head, 'rgba(0, 0, 0, 0.45)');
    ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(21, -5); ctx.lineTo(21.3, 3.2); ctx.stroke();
  } else if (tool === 'pickaxe' || tool === 'iron_pickaxe') {
    rect(-3, -1.3, 18, 2.6, '#8e5a2b');
    // a head of two points, bent back a little, across the end of the handle
    poly([[15, -1.6], [13, -6], [10.5, -10], [12.5, -9.6], [17.5, -3], [18.2, 0], [17.5, 3], [12.5, 9.6], [10.5, 10], [13, 6], [15, 1.6]], head, 'rgba(0, 0, 0, 0.45)');
    ctx.strokeStyle = edge; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(16.8, -3); ctx.lineTo(12, -9.4); ctx.stroke();
  } else if (tool === 'hoe') {
    rect(-3, -1, 22, 2, '#8e5a2b');
    rect(18, -1, 1.2, 2, '#4e3016');
    poly([[19, -1.5], [22, -1.5], [23, 6.5], [19.5, 6.5]], head, 'rgba(0, 0, 0, 0.45)');
  } else if (tool === 'rod') {
    ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-2, 1); ctx.lineTo(24, -9); ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 240, 241, 0.7)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(24, -9); ctx.quadraticCurveTo(28, -4, 27, 4); ctx.stroke();
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(27, 2, 1.2, 0, Math.PI * 2); ctx.fill(); // the float
    ctx.lineCap = 'butt';
  } else if (tool === 'medbag') {
    // hanging from the hand: leather with a green cross, its herbs rising inside (full, 0..1)
    ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1, 2); ctx.moveTo(0, 0); ctx.lineTo(6, 2); ctx.stroke();
    rect(-1, 2, 9, 8, '#8e5a2b');
    rect(0, 10 - 7 * full, 7, 7 * full, '#27ae60');
    ctx.strokeStyle = '#5c3a17'; ctx.strokeRect(-1, 2, 9, 8);
    rect(2.6, 3, 1.8, 4.5, '#2ecc71'); rect(1.3, 4.3, 4.4, 1.8, '#2ecc71');
  } else drawn = false;
  ctx.restore();
  return drawn;
}

// Work's own: a hammer (building, making) and a knife (butchering)
export function drawWorkTool(kind, k = 1) {
  ctx.save();
  ctx.scale(k, k);
  if (kind === 'knife') {
    rect(-2, -1.2, 5, 2.4, '#3e2716');
    poly([[3, -1.4], [10, -0.2], [10.5, 0.4], [3, 1.6]], '#dfe6e9', 'rgba(0, 0, 0, 0.4)');
  } else {
    rect(-2, -1, 12, 2, '#8e5a2b');
    rect(9, -4.5, 4, 9, '#7f8c8d');
    rect(9, -4.5, 4, 2, '#95a5a6');
  }
  ctx.restore();
}
