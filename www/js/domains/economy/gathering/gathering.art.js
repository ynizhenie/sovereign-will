// What nature looks like (#251): seen from above, a soft shadow under what stands up, each a little
// different from the next of its kind (by where it stands: tileVariantHash), so a forest isn't one tree
// stamped over and over

import { ctx } from '../../../engine/platform/index.js';
import { castShadow, tileVariantHash, windSway } from '../../world/index.js';
import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game } from '../../../engine/world/index.js';

const variant = o => tileVariantHash(Math.round(o.x), Math.round(o.y));
const blob = (x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
// (#307) cast away from the sun by the thing's height (about its size)
const groundShadow = (x, y, rx, ry) => castShadow(ctx, x, y + 4, rx, ry, rx * 0.9);

// A tree: its shadow, a bit of trunk under a crown of overlapping leafy clumps, lit from the top left.
// (#279) Felled, it falls over away from its cutter (turned about its foot), and lies there, a log with its
// crown, the crown thinning as the log's cut up
export function drawTreeArt(t) {
  if (t.fallen) { drawFallenTree(t); return; }
  drawStandingTree(t);
}

function drawFallenTree(t) {
  const fall = GAME_CONFIG.mapResources.tree.fellInTwo;
  const p = Math.min(1, (game.pathTick - (t.fallAt || 0)) / (fall.fallSeconds * 60));
  const side = Math.cos(t.fallAngle || 0) >= 0 ? 1 : -1; // (seen from above: it falls to the right or the left)
  const footX = t.x, footY = t.y + 12;
  if (p < 1) {
    // tipping over about its foot, faster as it goes
    ctx.save();
    ctx.translate(footX, footY); ctx.rotate(side * p * p * Math.PI / 2); ctx.translate(-footX, -footY);
    drawStandingTree(t, true);
    ctx.restore();
  } else drawLyingTree(t, side, footX, footY, 1 - Math.max(0, t.hp) / (GAME_CONFIG.mapResources.tree.hp * fall.logHp));
  // (the stump left at its foot is its own: game.stumps, see drawStumpArt — it outlives the log)
}

// The stump where a tree was felled: it stays till a tree grows again somewhere else (see finishHarvest)
export function drawStumpArt(st) {
  ctx.fillStyle = '#6d4c2f'; ctx.beginPath(); ctx.ellipse(st.x, st.y, 3.5, 2.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c8a46a'; ctx.beginPath(); ctx.ellipse(st.x, st.y - 0.6, 2.6, 1.4, 0, 0, Math.PI * 2); ctx.fill();
}

// On the ground: a log along the ground from its stump, its crown at the far end squashed flat; cut up (cut,
// 0..1), the crown's lopped off first and the log gets shorter, its cut end showing
function drawLyingTree(t, side, footX, footY, cut) {
  const h = variant(t), y = footY - 2;
  const len = 24 * (1 - 0.6 * cut), x0 = footX + side * 4, x1 = x0 + side * len;
  groundShadow((x0 + x1) / 2, y + 3, len / 2 + 2, 3);
  if (cut < 0.5) {
    const cx = x0 + side * 30, a = 1 - cut * 2;
    ctx.save(); ctx.globalAlpha = a;
    groundShadow(cx, y + 4, 12, 5);
    const dark = t.apple ? '#27501a' : ['#1e3d14', '#1b3912', '#21421a'][h % 3];
    const mid = t.apple ? '#3f7a2a' : ['#2e5d20', '#2a581d', '#336527'][h % 3];
    const light = t.apple ? '#5a9a3c' : ['#3e7a2c', '#3a7328', '#448434'][h % 3];
    for (let k = 0; k < 5; k++) blob(cx + side * (k - 2) * 4, y + ((h >>> k) % 3) - 1, 6, dark);
    blob(cx, y - 1, 7, mid);
    for (let k = 0; k < 3; k++) blob(cx + side * (k * 4 - 4), y - 3 + ((h >>> (k * 4)) % 3), 3, light);
    ctx.restore();
  }
  ctx.fillStyle = '#5d4037'; ctx.fillRect(Math.min(x0, x1), y - 2.5, len, 5);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(Math.min(x0, x1), y + 1, len, 1.5);
  ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.7;
  for (let k = 5; k < len - 2; k += 5) { const bx = x0 + side * k; ctx.beginPath(); ctx.moveTo(bx, y - 2); ctx.lineTo(bx + side * 2, y + 1); ctx.stroke(); }
  // its cut end (or the broken top before it's cut)
  ctx.fillStyle = cut > 0 ? '#c8a46a' : '#6d4c2f'; ctx.beginPath(); ctx.ellipse(x1, y, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  // logs cut off it, stacked by it
  for (let k = 0; k < Math.floor(cut * 3); k++) {
    const lx = footX - side * 8, ly = y + 6 - k * 3;
    ctx.fillStyle = '#5d4037'; ctx.fillRect(lx - 4, ly - 1.5, 8, 3);
    ctx.fillStyle = '#c8a46a'; ctx.beginPath(); ctx.ellipse(lx + 4, ly, 1, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function drawStandingTree(t, lying = false) {
  const h = variant(t), x = t.x, y = t.y;
  const dark = t.apple ? '#27501a' : ['#1e3d14', '#1b3912', '#21421a'][h % 3];
  const mid = t.apple ? '#3f7a2a' : ['#2e5d20', '#2a581d', '#336527'][h % 3];
  const light = t.apple ? '#5a9a3c' : ['#3e7a2c', '#3a7328', '#448434'][h % 3];
  if (!lying) groundShadow(x, y, 14, 10);
  ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 2, y + 4, 4, 9);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + (h % 7) * 0.3;
    blob(x + Math.cos(a) * 7, y - 2 + Math.sin(a) * 6, 8, dark);
  }
  blob(x, y - 2, 10, mid);
  for (let k = 0; k < 3; k++) blob(x - 4 + k * 3 + ((h >>> (k * 3)) % 3), y - 6 + ((h >>> (k * 4)) % 4), 4.5, light);
  if (t.apple && t.applesReady) {
    for (const [ax, ay] of [[-7, -5], [5, -8], [7, 3], [-4, 5], [1, -1]]) { blob(x + ax, y + ay, 2.3, '#e74c3c'); blob(x + ax - 0.7, y + ay - 0.7, 0.8, '#f5b7b1'); }
  }
}

// A sapling: a thin stem, a few leaves
export function drawSaplingArt(t) {
  const x = t.x, y = t.y;
  groundShadow(x, y + 3, 5, 3);
  ctx.strokeStyle = '#6d4c2f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 4); ctx.stroke();
  for (const [lx, ly, a] of [[-4, -4, -0.6], [4, -5, 0.6], [0, -8, 0]]) {
    ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.ellipse(x + lx, y + ly, 4, 2.2, a, 0, Math.PI * 2); ctx.fill();
  }
}

// A cactus: a ribbed column with two arms going up, rounded ends, little spines
export function drawCactusArt(c) {
  const h = variant(c), x = c.x, y = c.y, flip = h % 2 ? 1 : -1;
  groundShadow(x, y + 6, 8, 4);
  const limb = (x0, y0, w, len) => { ctx.fillStyle = '#2f8f46'; ctx.beginPath(); ctx.roundRect(x0 - w / 2, y0 - len, w, len, w / 2); ctx.fill(); ctx.strokeStyle = '#1e6b33'; ctx.lineWidth = 1; ctx.stroke(); };
  limb(x, y + 13, 8, 26);
  // the arms: out, then up
  ctx.fillStyle = '#2f8f46'; ctx.fillRect(x + flip * 3, y - 1, flip * 7, 4); ctx.fillRect(x - flip * 3, y + 4, -flip * 6, 4);
  limb(x + flip * 10, y + 3, 5, 11);
  limb(x - flip * 9, y + 8, 5, 9);
  ctx.strokeStyle = '#b7e08a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1.5, y - 10); ctx.lineTo(x - 1.5, y + 11); ctx.stroke();
  ctx.fillStyle = '#e8f6d4';
  for (let k = 0; k < 6; k++) ctx.fillRect(x + (k % 2 ? 3 : -4), y - 9 + k * 3.5, 1, 1);
}

// A boulder: a rounded, uneven stone, lighter on top, a crack, sometimes moss
export function drawBoulderArt(b) {
  const h = variant(b), x = b.x, y = b.y;
  groundShadow(x, y + 2, 12, 8);
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, rr = 10 + ((h >>> (k * 2)) % 4) - 1;
    pts.push([x + Math.cos(a) * rr * 1.1, y + Math.sin(a) * rr * 0.9]);
  }
  ctx.fillStyle = '#7f8c8d'; ctx.strokeStyle = '#4d5656'; ctx.lineWidth = 1.5;
  ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a4b0b5'; ctx.beginPath(); ctx.ellipse(x - 2, y - 4, 7, 4, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 2, y - 1); ctx.lineTo(x + 5, y + 3); ctx.lineTo(x + 4, y + 7); ctx.stroke();
  if (h % 3 === 0) { ctx.fillStyle = 'rgba(80, 140, 60, 0.7)'; ctx.beginPath(); ctx.ellipse(x - 6, y + 4, 4, 2.5, 0.4, 0, Math.PI * 2); ctx.fill(); }
}

// A tuft of tall grass: curved blades in a few greens, now and then a small flower
export function drawGrassArt(g) {
  const h = variant(g), x = g.x, y = g.y;
  const greens = ['#2ecc71', '#27ae60', '#58d68d'];
  ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const bx = x - 7 + k * 2.3, top = y - 7 - ((h >>> (k + 3)) % 6), lean = (((h >>> k) % 5) - 2) * 1.6 + windSway(bx, y, y + 7 - top); // (in the wind, #308)
    ctx.strokeStyle = greens[(h >>> (k * 2)) % 3];
    ctx.beginPath(); ctx.moveTo(bx, y + 7); ctx.quadraticCurveTo(bx + lean * 0.3, y, bx + lean, top); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  if (h % 4 === 0) { blob(x + 4, y - 9, 1.8, '#f9e79f'); blob(x + 4, y - 9, 0.8, '#e67e22'); }
}

// A berry bush: leafy clumps round a darker middle, blue berries on it
export function drawBushArt(b) {
  const h = variant(b), x = b.x, y = b.y;
  groundShadow(x, y + 2, 11, 7);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + (h % 5) * 0.2; blob(x + Math.cos(a) * 6, y + Math.sin(a) * 5, 6, '#1e824c'); }
  blob(x, y, 7, '#196f3d');
  blob(x - 3, y - 3, 3.5, '#28a060');
  for (const [bx, by] of [[-5, -3], [4, -2], [1, 4], [-2, 2], [6, 3]]) { blob(x + bx, y + by, 2.4, '#5b6ee1'); blob(x + bx - 0.7, y + by - 0.7, 0.8, '#aab6fb'); }
}

// A stick: a forked twig
export function drawStickArt(st) {
  const flip = variant(st) % 2 ? 1 : -1, x = st.x, y = st.y;
  ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 7 * flip, y - 4); ctx.lineTo(x + 7 * flip, y + 4); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 * flip, y - 5); ctx.stroke();
  ctx.lineCap = 'butt';
}

// A piece of a felled tree's log (#298): a short length of trunk, bark lines, its cut ends pale
export function drawLogArt(lg) {
  const x = lg.x, y = lg.y, w = 11;
  groundShadow(x, y + 3, 7, 2.5);
  ctx.fillStyle = '#5d4037'; ctx.fillRect(x - w / 2, y - 2.5, w, 5);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.fillRect(x - w / 2, y + 1, w, 1.5);
  ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.7;
  for (const k of [-2, 2]) { ctx.beginPath(); ctx.moveTo(x + k, y - 2); ctx.lineTo(x + k + 1.5, y + 1); ctx.stroke(); }
  for (const ex of [x - w / 2, x + w / 2]) { ctx.fillStyle = '#c8a46a'; ctx.beginPath(); ctx.ellipse(ex, y, 1.4, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
}

// Pebbles: two or three small stones, lit on top
export function drawPebblesArt(pe) {
  const h = variant(pe), x = pe.x, y = pe.y;
  for (const [px, py, r] of [[-3, 0, 3], [3, 2, 2.2], [1, -3, 1.8]].slice(0, 2 + (h % 2))) {
    blob(x + px + 1, y + py + 1, r, 'rgba(0, 0, 0, 0.25)');
    blob(x + px, y + py, r, '#95a5a6');
    blob(x + px - r * 0.3, y + py - r * 0.3, r * 0.45, '#d0d3d4');
  }
}

// A farm plot: soil in furrows (richer and darker fertilised), wheat in rows that grows from green shoots
// to golden ears
export function drawFarmPlotArt(f) {
  const x = f.x, y = f.y, g = Math.max(0, Math.min(100, f.growth || 0)) / 100;
  ctx.fillStyle = f.fertilized ? '#4a3020' : '#5c4033'; ctx.fillRect(x - 13, y - 13, 26, 26);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = 1;
  for (let k = -9; k <= 9; k += 6) { ctx.beginPath(); ctx.moveTo(x - 12, y + k); ctx.lineTo(x + 12, y + k); ctx.stroke(); }
  if (f.fertilized) { ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 2; ctx.strokeRect(x - 12, y - 12, 24, 24); }
  const ripe = g >= 1;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const sx = x - 9 + col * 6, sy = y - 8 + row * 6, tall = 2 + 7 * g, sway = windSway(sx, sy, tall); // (in the wind, #308)
      ctx.strokeStyle = ripe ? '#d4ac0d' : g > 0.6 ? '#9acd32' : '#2ecc71'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx, sy + 2); ctx.quadraticCurveTo(sx + sway * 0.3, sy + 2 - tall * 0.6, sx + sway, sy + 2 - tall); ctx.stroke();
      if (ripe || g > 0.6) { ctx.fillStyle = ripe ? '#f4d03f' : '#c5e384'; ctx.beginPath(); ctx.ellipse(sx + sway, sy + 1 - tall, 1.4, 2.6, sway * 0.08, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}
