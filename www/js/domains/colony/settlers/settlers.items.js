// What's held (#279): every weapon and tool drawn with its grip where the hand is (the origin, after
// applyHeldItemPose), along +x, as big as the hand holding it (scale k). A sword with a guard, a wrapped grip
// and a tapering blade; a club thickening to a knotted head; a spear held at the middle of its shaft, a leaf
// of a head; a bow bent forward with its string; a crossbow with steel limbs and a bolt in its groove; an axe, a
// pickaxe and a hoe with heads that look the part; a rod with its line; a medic's bag hanging from the hand; and
// for work, a hammer and a knife.

import { ctx } from '../../../engine/platform/index.js';
import { isClubWeapon, isSpearWeapon, isSwordWeapon } from '../equipment/index.js';

const poly = (pts, fill, stroke) => {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
};
const rect = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };

// A weapon; false if it's none of them (the fist). pull (0..1): a bow's string drawn back, an arrow on it (#306)
export function drawHeldWeapon(weapon, k = 1, pull = 0) {
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
    // (#326) smaller, in the others' style: a wrapped grip, the wood swelling to a knotted head, its grain and a shine
    rect(-2.5, -1.3, 6.5, 2.6, '#6d4520');
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 0.6;
    for (const gx of [-1.6, 0.2, 2]) { ctx.beginPath(); ctx.moveTo(gx, -1.3); ctx.lineTo(gx + 0.8, 1.3); ctx.stroke(); }
    poly([[4, -1.5], [8, -2.4], [12, -3], [14.5, -2.2], [15, 0], [14.5, 2.2], [12, 3], [8, 2.4], [4, 1.5]], '#8b5a2b', 'rgba(0, 0, 0, 0.45)');
    ctx.strokeStyle = 'rgba(70, 40, 15, 0.6)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(5, 0.4); ctx.quadraticCurveTo(10, 1.4, 14, 0.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 230, 190, 0.35)'; ctx.beginPath(); ctx.moveTo(6, -1.2); ctx.quadraticCurveTo(10, -2.3, 13.5, -1.8); ctx.stroke();
    ctx.fillStyle = '#5c3a17'; for (const [kx, ky] of [[10, -1.2], [12.6, 1.4]]) { ctx.beginPath(); ctx.arc(kx, ky, 0.7, 0, Math.PI * 2); ctx.fill(); }
  } else if (weapon === 'dagger') {
    // (#326) an archer's dagger (out of arrows): a short blade
    rect(-2, -1.1, 4.5, 2.2, '#3e2716');
    rect(2.4, -2.4, 1.2, 4.8, '#7f8c8d');
    poly([[3.6, -1.3], [10, -0.3], [11, 0.2], [3.6, 1.3]], '#dfe6e9', 'rgba(0, 0, 0, 0.4)');
  } else if (isSpearWeapon(weapon)) {
    const iron = weapon === 'iron_spear';
    rect(-12, -1.2, 34, 2.4, iron ? '#5d4037' : '#8e5a2b'); // held at the middle of the shaft
    rect(21, -1.8, 2, 3.6, '#4e3016'); // the binding
    poly([[22.5, -3], [iron ? 33 : 30, 0], [22.5, 3], [24, 0]], iron ? '#9aa7b1' : '#ecf0f1', 'rgba(0, 0, 0, 0.4)');
  } else if (weapon === 'bow') {
    // drawn, the limbs bend a little more
    const bend = 10 + pull * 2, sx = -1 - pull * 9;
    ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, -13); ctx.quadraticCurveTo(bend, 0, -1, 13); ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 240, 241, 0.85)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-1, -13); ctx.lineTo(sx, 0); ctx.lineTo(-1, 13); ctx.stroke();
    if (pull > 0) {
      // the arrow on the string, its head past the bow
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(13, 0); ctx.stroke();
      poly([[13, -1.6], [16, 0], [13, 1.6]], '#bdc3c7');
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(sx, -1.4, 2.5, 1); ctx.fillRect(sx, 0.4, 2.5, 1); // (its fletching)
    }
    rect(2.2, -2, 2.4, 4, '#5c3a17'); // the grip
    ctx.lineCap = 'butt';
  } else if (weapon === 'crossbow') {
    // (#326) a crossbow: a short, thick stock with a raised butt, steel limbs across its nose bent forward, and
    // its string hauled back along the stock to cock it. pull (0..1): how far the string is drawn back; loaded,
    // a bolt lies in the groove, its head past the nose
    const tipY = 10.5, sx = 15 - pull * 17, limb = 15 - pull * 1.5;
    rect(-7, -1.7, 27, 3.4, '#6d4520'); // the stock
    poly([[-9.5, -3.4], [-4, -2.1], [-4, 2.1], [-9.5, 3.4]], '#5c3a17', 'rgba(0, 0, 0, 0.4)'); // its butt
    ctx.strokeStyle = 'rgba(255, 230, 190, 0.28)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(-5, -0.6); ctx.lineTo(18, -0.6); ctx.stroke(); // (the grain)
    // the limbs, across the nose
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(15, -tipY); ctx.quadraticCurveTo(limb + 5, 0, 15, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(236, 240, 241, 0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(15, -tipY); ctx.quadraticCurveTo(limb + 5, 0, 15, tipY); ctx.stroke();
    // the string, from tip to tip, drawn back to the nut
    ctx.strokeStyle = 'rgba(236, 240, 241, 0.85)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(15, -tipY); ctx.lineTo(sx, 0); ctx.lineTo(15, tipY); ctx.stroke();
    if (pull > 0.35) {
      // the bolt in the groove
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(22, 0); ctx.stroke();
      poly([[22, -1.8], [26, 0], [22, 1.8]], '#bdc3c7', 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(sx + 0.5, -1.5, 3, 1); ctx.fillRect(sx + 0.5, 0.5, 3, 1); // (its fletching)
    }
    rect(0, -2.3, 3, 4.6, '#5c3a17'); // the grip
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
    // (#326) a satchel hanging from the hand by its strap: rounded leather, a flap with a buckle and a green cross,
    // herbs sticking out at its top, more the fuller it is (full, 0..1)
    ctx.strokeStyle = '#4e3016'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-1, 2, 0, 3.5); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, 1.5, 7.5, 3.5); ctx.stroke();
    ctx.fillStyle = '#27ae60';
    for (let i = 0; i < Math.round(4 * full); i++) { ctx.beginPath(); ctx.ellipse(1 + i * 2, 3.2 - (i % 2), 0.9, 2, -0.3 + i * 0.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#8e5a2b'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.roundRect(-1.5, 3.5, 10, 8, [1, 1, 3, 3]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6d4520'; ctx.beginPath(); ctx.roundRect(-1.5, 3.5, 10, 3.6, [1, 1, 2.2, 2.2]); ctx.fill(); ctx.stroke(); // the flap
    rect(3, 6.5, 1.6, 1.6, '#d4ac0d'); // its buckle
    ctx.fillStyle = '#eaf7ee'; ctx.beginPath(); ctx.arc(3.8, 9.4, 1.9, 0, Math.PI * 2); ctx.fill();
    rect(3.3, 8, 1, 2.8, '#27ae60'); rect(2.4, 8.9, 2.8, 1, '#27ae60');
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
  } else if (kind === 'dagger') {
    ctx.restore(); drawHeldWeapon('dagger', k); return; // (#326: an archer's, out of arrows)
  } else if (kind === 'herbs') {
    // (#326) a medic's handful of herbs pressed onto a wound: a little bundle of leaves, bound
    for (const [a, len] of [[-0.5, 6], [0, 7.5], [0.5, 6]]) {
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = '#27ae60'; ctx.beginPath(); ctx.ellipse(3 + len / 2, 0, len / 2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e8449'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(3 + len, 0); ctx.stroke();
      ctx.restore();
    }
    rect(1.5, -1.2, 2, 2.4, '#d4b483');
  } else {
    rect(-2, -1, 12, 2, '#8e5a2b');
    rect(9, -4.5, 4, 9, '#7f8c8d');
    rect(9, -4.5, 4, 2, '#95a5a6');
  }
  ctx.restore();
}
