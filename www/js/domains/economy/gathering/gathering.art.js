// What nature looks like (#251): seen from above, a soft shadow under what stands up, each a little
// different from the next of its kind (by where it stands: tileVariantHash), so a forest isn't one tree
// stamped over and over

import { ctx } from '../../../engine/platform/index.js';
import { castShadow, drawShadowPath, tileVariantHash, windSway } from '../../world/index.js';
import { GAME_CONFIG } from '../../../content/configs/index.js';
import { game, thingAt } from '../../../engine/world/index.js';

// Where it's drawn: the screen, or (#322) a picture of a piece of the ground (paintOn)
/** @type {CanvasRenderingContext2D | null} */
let target = null;
const pen = () => target || ctx;
export function paintOn(g) { target = g; }
// (a picture of tufts is painted with the wind still: they're too small to be seen swaying that far out)
let still = false;
export function paintStill(on) { still = on; }

// (#322) A picture of one of a kind (gathering.sprites.js) is painted as a variant given here, without its shadow (the shadows of
// all on the screen are laid down together), and a tuft of grass leaning a given way
/** @type {number | null} */
let forced = null;
let shadows = true;
/** @type {number | null} */
let fixedSway = null;
/** @param {number | null} h @param {boolean} [withShadow] @param {number | null} [sway] */
export function paintVariant(h, withShadow = true, sway = null) { forced = h; shadows = withShadow; fixedSway = sway; }

const variant = o => (forced !== null ? forced : tileVariantHash(Math.round(o.x), Math.round(o.y)));
const isSavanna = o => o.savanna === true || thingAt(game.savannaTiles, o.x, o.y);
const blob = (x, y, r, fill) => { pen().fillStyle = fill; pen().beginPath(); pen().arc(x, y, r, 0, Math.PI * 2); pen().fill(); };
// (#307) cast away from the sun by the thing's height (about its size)
const groundShadow = (x, y, rx, ry) => { if (shadows) castShadow(pen(), x, y + 4, rx, ry, rx * 0.9); };
// each kind's shadow as its art casts it: [dx, dy, rx, ry] from where the thing stands (for the shadows laid down together)
export const SHADOWS = { stump: [0, -2, 4, 2], tree: [0, 0, 14, 10], cactus: [0, 6, 8, 4], boulder: [0, 2, 12, 8], grass: [0, -2, 8, 2.8], bush: [0, 2, 11, 7], stick: [0, -3, 7, 2], pebbles: [0, -3, 5, 2] };

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
    pen().save();
    pen().translate(footX, footY); pen().rotate(side * p * p * Math.PI / 2); pen().translate(-footX, -footY);
    drawStandingTree(t, true);
    pen().restore();
  } else drawLyingTree(t, side, footX, footY, 1 - Math.max(0, t.hp) / (GAME_CONFIG.mapResources.tree.hp * fall.logHp));
  // (the stump left at its foot is its own: game.stumps, see drawStumpArt — it outlives the log)
}

// The stump where a tree was felled: it stays till a tree grows again somewhere else (see finishHarvest)
export function drawStumpArt(st) {
  groundShadow(st.x, st.y - 2, 4, 2); // (#326: everything casts one)
  pen().fillStyle = '#6d4c2f'; pen().beginPath(); pen().ellipse(st.x, st.y, 3.5, 2.2, 0, 0, Math.PI * 2); pen().fill();
  pen().fillStyle = '#c8a46a'; pen().beginPath(); pen().ellipse(st.x, st.y - 0.6, 2.6, 1.4, 0, 0, Math.PI * 2); pen().fill();
}

// On the ground: a log along the ground from its stump, its crown at the far end squashed flat; cut up (cut,
// 0..1), the crown's lopped off first and the log gets shorter, its cut end showing
function drawLyingTree(t, side, footX, footY, cut) {
  const h = variant(t), y = footY - 2;
  const len = 24 * (1 - 0.6 * cut), x0 = footX + side * 4, x1 = x0 + side * len;
  groundShadow((x0 + x1) / 2, y + 3, len / 2 + 2, 3);
  if (cut < 0.5) {
    const cx = x0 + side * 30, a = 1 - cut * 2;
    pen().save(); pen().globalAlpha = a;
    groundShadow(cx, y + 4, 12, 5);
    const dark = t.apple ? '#27501a' : isSavanna(t) ? '#596a2b' : ['#1e3d14', '#1b3912', '#21421a'][h % 3];
    const mid = t.apple ? '#3f7a2a' : isSavanna(t) ? '#63732e' : ['#2e5d20', '#2a581d', '#336527'][h % 3];
    const light = t.apple ? '#5a9a3c' : isSavanna(t) ? '#81913a' : ['#3e7a2c', '#3a7328', '#448434'][h % 3];
    for (let k = 0; k < 5; k++) blob(cx + side * (k - 2) * 4, y + ((h >>> k) % 3) - 1, 6, dark);
    blob(cx, y - 1, 7, mid);
    for (let k = 0; k < 3; k++) blob(cx + side * (k * 4 - 4), y - 3 + ((h >>> (k * 4)) % 3), 3, light);
    pen().restore();
  }
  pen().fillStyle = '#5d4037'; pen().fillRect(Math.min(x0, x1), y - 2.5, len, 5);
  pen().fillStyle = 'rgba(0, 0, 0, 0.25)'; pen().fillRect(Math.min(x0, x1), y + 1, len, 1.5);
  pen().strokeStyle = '#3e2723'; pen().lineWidth = 0.7;
  for (let k = 5; k < len - 2; k += 5) { const bx = x0 + side * k; pen().beginPath(); pen().moveTo(bx, y - 2); pen().lineTo(bx + side * 2, y + 1); pen().stroke(); }
  // its cut end (or the broken top before it's cut)
  pen().fillStyle = cut > 0 ? '#c8a46a' : '#6d4c2f'; pen().beginPath(); pen().ellipse(x1, y, 1.6, 2.6, 0, 0, Math.PI * 2); pen().fill();
  // logs cut off it, stacked by it
  for (let k = 0; k < Math.floor(cut * 3); k++) {
    const lx = footX - side * 8, ly = y + 6 - k * 3;
    pen().fillStyle = '#5d4037'; pen().fillRect(lx - 4, ly - 1.5, 8, 3);
    pen().fillStyle = '#c8a46a'; pen().beginPath(); pen().ellipse(lx + 4, ly, 1, 1.5, 0, 0, Math.PI * 2); pen().fill();
  }
}

function drawStandingTree(t, lying = false) {
  const h = variant(t), x = t.x, y = t.y;
  if (isSavanna(t) && !t.apple) {
    const shape = h & 1;
    const width = 18 + (h >>> 4) % 5, lean = (h >>> 9) % 7 - 3;
    const greens = [
      ['#596936', '#7b8b43', '#a2ad55'],
      ['#5d6d38', '#829148', '#b0b45d'],
      ['#536332', '#73843f', '#99a64d']
    ][(h >>> 1) % 3];
    if (!lying) groundShadow(x, y, 20, 6);
    const g = pen();
    g.fillStyle = '#67482e';
    g.beginPath();
    g.moveTo(x - 2.7, y + 14); g.lineTo(x - 1.4, y - 8);
    g.lineTo(x - width * 0.92, y - 16); g.lineTo(x - width * 0.84, y - 18);
    g.lineTo(x - 0.3, y - 11); g.lineTo(x + width * 0.86, y - 19);
    g.lineTo(x + width * 0.96, y - 17); g.lineTo(x + 1.4, y - 7);
    g.lineTo(x + 2.4, y + 14); g.closePath(); g.fill();
    g.strokeStyle = '#a27a4d'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 0.6, y + 10); g.lineTo(x + 0.1, y - 8);
    g.moveTo(x - 0.4, y - 8); g.lineTo(x - width * 0.83, y - 16);
    g.moveTo(x + 0.3, y - 7); g.lineTo(x + width * 0.84, y - 17);
    g.stroke();

    if (shape) {
      g.fillStyle = greens[0];
      g.beginPath();
      g.moveTo(x - width, y - 12);
      g.quadraticCurveTo(x - width * 0.94, y - 21, x - width * 0.48, y - 22);
      g.quadraticCurveTo(x - width * 0.28, y - 29, x + lean * 0.3, y - 26);
      g.quadraticCurveTo(x + width * 0.42, y - 29, x + width * 0.56, y - 22);
      g.quadraticCurveTo(x + width * 1.02, y - 21, x + width, y - 12);
      g.quadraticCurveTo(x + width * 0.55, y - 9, x, y - 14);
      g.quadraticCurveTo(x - width * 0.58, y - 9, x - width, y - 12);
      g.closePath(); g.fill();
      blob(x - width * 0.55, y - 17, 5.5, greens[0]);
      blob(x + width * 0.52, y - 17, 5.5, greens[0]);
      g.fillStyle = greens[1];
      g.beginPath();
      g.moveTo(x - width * 0.68, y - 15);
      g.quadraticCurveTo(x - width * 0.5, y - 23, x - width * 0.18 + lean * 0.3, y - 21);
      g.quadraticCurveTo(x + width * 0.2, y - 25, x + width * 0.68, y - 15);
      g.quadraticCurveTo(x + lean, y - 12, x - width * 0.68, y - 15);
      g.closePath(); g.fill();
      for (let k = 0; k < 5; k++) {
        blob(x + lean + (k - 2) * width * 0.28, y - 19 - ((h >>> (k + 5)) % 3), 2.8, greens[2]);
      }
      return;
    }

    // A flat, spreading crown with irregular lobes and sunlit leaf clusters.
    g.fillStyle = greens[0];
    g.beginPath();
    g.moveTo(x - width, y - 15);
    g.quadraticCurveTo(x - width * 1.08, y - 20, x - width * 0.78, y - 21);
    g.quadraticCurveTo(x - width * 0.65, y - 26, x - width * 0.28 + lean, y - 22);
    g.quadraticCurveTo(x + lean, y - 27, x + width * 0.32, y - 22);
    g.quadraticCurveTo(x + width * 0.78, y - 26, x + width, y - 19);
    g.quadraticCurveTo(x + width * 1.08, y - 15, x + width * 0.76, y - 12);
    g.quadraticCurveTo(x + width * 0.3, y - 10, x - width * 0.2 + lean, y - 12);
    g.quadraticCurveTo(x - width * 0.74, y - 10, x - width, y - 15);
    g.closePath(); g.fill();
    for (let k = 0; k < 5; k++) {
      const offset = (k - 2) * width * 0.34;
      const radius = 4.5 + ((h >>> (k + 3)) % 3) * 0.6;
      blob(x + lean + offset, y - 18 - ((h >>> (k + 8)) % 2), radius, greens[0]);
    }
    g.fillStyle = greens[1];
    g.beginPath();
    g.moveTo(x - width * 0.78, y - 17);
    g.quadraticCurveTo(x - width * 0.58, y - 22, x - width * 0.25 + lean, y - 19);
    g.quadraticCurveTo(x + lean, y - 24, x + width * 0.3, y - 19);
    g.quadraticCurveTo(x + width * 0.7, y - 22, x + width * 0.8, y - 17);
    g.quadraticCurveTo(x + lean, y - 14, x - width * 0.78, y - 17);
    g.closePath(); g.fill();
    g.fillStyle = greens[2];
    for (let k = 0; k < 4; k++) {
      blob(x + lean - width * 0.48 + k * width * 0.31 + ((h >>> (k * 4)) % 3), y - 20 + (k % 2), 2.8, greens[2]);
    }
    return;
  }
  const shape = h & 1;
  const palette = (t.apple
    ? [['#27501a', '#3f7a2a', '#5a9a3c'], ['#315a22', '#4b8731', '#70aa49']]
    : [['#1e3d14', '#2e5d20', '#3e7a2c'], ['#254519', '#376b27', '#57903a']])[shape];
  const [dark, mid, light] = palette;
  if (!lying) groundShadow(x, y, shape ? 18 : 17, 8);
  const g = pen();
  g.fillStyle = '#5d4037';
  g.beginPath();
  if (shape) {
    g.moveTo(x - 2.7, y + 13); g.lineTo(x - 1.8, y - 12);
    g.lineTo(x - 13, y - 18); g.lineTo(x - 11.5, y - 20);
    g.lineTo(x - 0.5, y - 15); g.lineTo(x + 9, y - 24);
    g.lineTo(x + 10.5, y - 22); g.lineTo(x + 1.5, y - 13);
  } else {
    g.moveTo(x - 2.5, y + 13); g.lineTo(x - 1.5, y - 4);
    g.lineTo(x - 12, y - 12); g.lineTo(x - 10.5, y - 14);
    g.lineTo(x - 0.4, y - 7); g.lineTo(x + 9.5, y - 15);
    g.lineTo(x + 11, y - 13); g.lineTo(x + 1.5, y - 5);
  }
  g.lineTo(x + 2.5, y + 13); g.closePath(); g.fill();
  g.strokeStyle = '#98714a'; g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(x - 0.5, y + 9); g.lineTo(x, y - (shape ? 17 : 6));
  g.moveTo(x - 0.3, y - (shape ? 14 : 6)); g.lineTo(x - (shape ? 11 : 9), y - (shape ? 19 : 12));
  g.moveTo(x + 0.4, y - (shape ? 13 : 5)); g.lineTo(x + (shape ? 8 : 9), y - (shape ? 22 : 13));
  g.stroke();
  if (t.apple) {
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x - 15, y - 5);
    g.quadraticCurveTo(x - 20, y - 10, x - 16, y - 17);
    g.quadraticCurveTo(x - 14, y - 24, x - 7, y - 23);
    g.quadraticCurveTo(x - 3, y - 29, x + 3, y - 25);
    g.quadraticCurveTo(x + 11, y - 27, x + 14, y - 19);
    g.quadraticCurveTo(x + 21, y - 15, x + 16, y - 7);
    g.quadraticCurveTo(x + 10, y - 2, x + 2, y - 6);
    g.quadraticCurveTo(x - 7, y - 2, x - 15, y - 5);
    g.closePath(); g.fill();
    blob(x - 11, y - 15, 6, dark);
    blob(x + 10, y - 15, 6.5, dark);
    blob(x - 7, y - 11, 6.5, mid);
    blob(x + 5, y - 12, 7, mid);
    blob(x - 1, y - 19 + (shape ? -1 : 0), 7.5, mid);
    blob(x - 8, y - 19, 3.8, light);
    blob(x + 3 + shape * 2, y - 22, 3.6, light);
    blob(x + 11, y - 10, 3.2, light);
  } else if (shape) {
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(x - 18, y - 6);
    g.quadraticCurveTo(x - 22, y - 15, x - 14, y - 21);
    g.quadraticCurveTo(x - 8, y - 27, x, y - 25);
    g.quadraticCurveTo(x + 8, y - 29, x + 12, y - 21);
    g.quadraticCurveTo(x + 20, y - 17, x + 16, y - 7);
    g.quadraticCurveTo(x + 9, y - 3, x, y - 8);
    g.quadraticCurveTo(x - 9, y - 3, x - 18, y - 6);
    g.closePath(); g.fill();
    blob(x - 10, y - 13, 6, dark);
    blob(x + 10, y - 13, 6, dark);
    blob(x - 7, y - 10, 7, mid);
    blob(x + 7, y - 10, 7, mid);
    blob(x, y - 17, 8, mid);
    blob(x - 5, y - 18, 3.8, light);
    blob(x + 4, y - 21, 3.6, light);
    blob(x + 10, y - 10, 3.4, light);
  } else {
    // Layered, irregular leaf clumps and small highlights match the savanna trees' painted canopy style.
    blob(x - 8, y - 8, 7.5, dark);
    blob(x + 8, y - 8, 7.5, dark);
    blob(x - 7, y - 1, 7.5, dark);
    blob(x + 7, y - 1, 7.5, dark);
    blob(x, y - 5, 10, mid);
    blob(x - 5, y - 8, 4.5, light);
    blob(x + 2 + ((h >>> 4) % 3), y - 10 + ((h >>> 6) % 2), 4.2, light);
    blob(x + 6, y - 3, 3.8, light);
  }
  if (t.apple && t.applesReady) {
    const fruit = shape ? [[-10, -15], [2, -23], [12, -16], [-5, -8], [7, -8]] : [[-11, -13], [1, -20], [11, -15], [-5, -7], [7, -7]];
    for (const [ax, ay] of fruit) { blob(x + ax, y + ay, 2.3, '#e74c3c'); blob(x + ax - 0.7, y + ay - 0.7, 0.8, '#f5b7b1'); }
  }
}

// A sapling: a thin stem, a few leaves
export function drawSaplingArt(t) {
  const x = t.x, y = t.y;
  groundShadow(x, y + 3, 5, 3);
  pen().strokeStyle = '#6d4c2f'; pen().lineWidth = 2; pen().beginPath(); pen().moveTo(x, y + 8); pen().lineTo(x, y - 4); pen().stroke();
  for (const [lx, ly, a] of [[-4, -4, -0.6], [4, -5, 0.6], [0, -8, 0]]) {
    pen().fillStyle = '#2ecc71'; pen().beginPath(); pen().ellipse(x + lx, y + ly, 4, 2.2, a, 0, Math.PI * 2); pen().fill();
  }
}

// A cactus: a ribbed column with two arms going up, rounded ends, little spines
export function drawCactusArt(c) {
  const h = variant(c), x = c.x, y = c.y, flip = h % 2 ? 1 : -1;
  groundShadow(x, y + 6, 8, 4);
  const limb = (x0, y0, w, len) => { pen().fillStyle = '#2f8f46'; pen().beginPath(); pen().roundRect(x0 - w / 2, y0 - len, w, len, w / 2); pen().fill(); pen().strokeStyle = '#1e6b33'; pen().lineWidth = 1; pen().stroke(); };
  limb(x, y + 13, 8, 26);
  // the arms: out, then up
  pen().fillStyle = '#2f8f46'; pen().fillRect(x + flip * 3, y - 1, flip * 7, 4); pen().fillRect(x - flip * 3, y + 4, -flip * 6, 4);
  limb(x + flip * 10, y + 3, 5, 11);
  limb(x - flip * 9, y + 8, 5, 9);
  pen().strokeStyle = '#b7e08a'; pen().lineWidth = 1; pen().beginPath(); pen().moveTo(x - 1.5, y - 10); pen().lineTo(x - 1.5, y + 11); pen().stroke();
  pen().fillStyle = '#e8f6d4';
  for (let k = 0; k < 6; k++) pen().fillRect(x + (k % 2 ? 3 : -4), y - 9 + k * 3.5, 1, 1);
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
  pen().fillStyle = '#7f8c8d'; pen().strokeStyle = '#4d5656'; pen().lineWidth = 1.5;
  pen().beginPath(); pts.forEach(([px, py], i) => (i ? pen().lineTo(px, py) : pen().moveTo(px, py))); pen().closePath(); pen().fill(); pen().stroke();
  pen().fillStyle = '#a4b0b5'; pen().beginPath(); pen().ellipse(x - 2, y - 4, 7, 4, -0.3, 0, Math.PI * 2); pen().fill();
  pen().strokeStyle = 'rgba(0, 0, 0, 0.3)'; pen().lineWidth = 1;
  pen().beginPath(); pen().moveTo(x + 2, y - 1); pen().lineTo(x + 5, y + 3); pen().lineTo(x + 4, y + 7); pen().stroke();
  if (h % 3 === 0) { pen().fillStyle = 'rgba(80, 140, 60, 0.7)'; pen().beginPath(); pen().ellipse(x - 6, y + 4, 4, 2.5, 0.4, 0, Math.PI * 2); pen().fill(); }
}

// A tuft of tall grass: curved blades in a few greens, now and then a small flower
export function drawGrassArt(g) {
  const h = variant(g), x = g.x, y = g.y;
  groundShadow(x, y - 2, 8, 2.8); // (#326)
  const greens = isSavanna(g)
    ? ['#9a934f', '#817e45', '#b5ad69']
    : ['#66814a', '#4f6c3c', '#879c5c'];
  pen().lineWidth = 1.6; pen().lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const bx = x - 7 + k * 2.3, top = y - 7 - ((h >>> (k + 3)) % 6), lean = (((h >>> k) % 5) - 2) * 1.6 + (still ? 0 : fixedSway !== null ? fixedSway * (y + 7 - top) / 10 : windSway(bx, y, y + 7 - top)); // (in the wind, #308)
    pen().strokeStyle = greens[(h >>> (k * 2)) % 3];
    pen().beginPath(); pen().moveTo(bx, y + 7); pen().quadraticCurveTo(bx + lean * 0.3, y, bx + lean, top); pen().stroke();
  }
  pen().lineCap = 'butt';
  if (h % 4 === 0) { blob(x + 4, y - 9, 1.8, '#f9e79f'); blob(x + 4, y - 9, 0.8, '#e67e22'); }
}

// A berry bush: leafy clumps round a darker middle, blue berries on it
export function drawBushArt(b) {
  const h = variant(b), x = b.x, y = b.y;
  groundShadow(x, y + 2, 11, 7);
  const savanna = isSavanna(b);
  const dark = savanna ? '#6d7930' : '#1e824c', mid = savanna ? '#596c28' : '#196f3d', light = savanna ? '#91a13c' : '#28a060';
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + (h % 5) * 0.2; blob(x + Math.cos(a) * 6, y + Math.sin(a) * 5, 6, dark); }
  blob(x, y, 7, mid);
  blob(x - 3, y - 3, 3.5, light);
  for (const [bx, by] of [[-5, -3], [4, -2], [1, 4], [-2, 2], [6, 3]]) { blob(x + bx, y + by, 2.4, '#5b6ee1'); blob(x + bx - 0.7, y + by - 0.7, 0.8, '#aab6fb'); }
}

// A fallen twig: its length, angle, bark and forks vary by the tile it lies on
export function drawStickArt(st) {
  const h = variant(st), x = st.x, y = st.y, g = pen();
  const length = 9 + (h >>> 3) % 6, angle = ((h >>> 7) % 9 - 4) * 0.13;
  const bark = ['#8e5a2b', '#79502e', '#a16a38', '#704522'][(h >>> 12) % 4];
  groundShadow(x, y - 3, 7, 2); // (#326)
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.lineCap = 'round';
  g.strokeStyle = bark;
  g.lineWidth = 1.5 + (h >>> 15) % 3 * 0.35;
  g.beginPath();
  g.moveTo(-length / 2, 1 + (h >>> 18) % 3);
  g.lineTo(length / 2, -1 - (h >>> 20) % 3);
  g.stroke();
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(-length * 0.12, 0);
  g.lineTo(-length * 0.26, -3 - (h >>> 22) % 3);
  if (h & 1) {
    g.moveTo(length * 0.2, -1);
    g.lineTo(length * 0.34, -4 - (h >>> 24) % 3);
  }
  g.stroke();
  g.strokeStyle = 'rgba(220, 170, 105, 0.55)';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(-length / 2 + 2, 1 + (h >>> 18) % 3 - 0.6);
  g.lineTo(length / 2 - 2, -1 - (h >>> 20) % 3 - 0.6);
  g.stroke();
  g.restore();
}

// A piece of a felled tree's log (#298): a short length of trunk, bark lines, its cut ends pale
export function drawLogArt(lg) {
  const x = lg.x, y = lg.y, w = 11;
  groundShadow(x, y + 3, 7, 2.5);
  pen().fillStyle = '#5d4037'; pen().fillRect(x - w / 2, y - 2.5, w, 5);
  pen().fillStyle = 'rgba(0, 0, 0, 0.25)'; pen().fillRect(x - w / 2, y + 1, w, 1.5);
  pen().strokeStyle = '#3e2723'; pen().lineWidth = 0.7;
  for (const k of [-2, 2]) { pen().beginPath(); pen().moveTo(x + k, y - 2); pen().lineTo(x + k + 1.5, y + 1); pen().stroke(); }
  for (const ex of [x - w / 2, x + w / 2]) { pen().fillStyle = '#c8a46a'; pen().beginPath(); pen().ellipse(ex, y, 1.4, 2.5, 0, 0, Math.PI * 2); pen().fill(); }
}

// Pebbles: a small cluster of varied stones, lit from above
export function drawPebblesArt(pe) {
  const h = variant(pe), x = pe.x, y = pe.y, g = pen();
  const layouts = [
    [[-3, 0, 2.8, 2], [3, 2, 2, 1.5], [1, -3, 1.8, 1.4]],
    [[-4, 2, 2.3, 1.8], [0, -2, 3, 2], [4, 1, 1.6, 1.4]],
    [[-3, -2, 2, 1.6], [1, 2, 3, 2], [4, -3, 1.7, 1.3], [-4, 4, 1.4, 1.2]],
    [[-4, 0, 2.5, 1.7], [1, -3, 2, 1.4], [3, 3, 2.7, 1.8]],
    [[-2, 3, 2.8, 1.8], [2, -2, 2.4, 2], [-5, -2, 1.6, 1.3], [5, 2, 1.3, 1]],
    [[-4, -3, 1.8, 1.4], [0, 0, 3, 2], [4, 3, 2, 1.5]],
    [[-3, 3, 2.3, 1.7], [3, -2, 2.8, 1.9], [0, -4, 1.5, 1.2], [4, 4, 1.3, 1]],
    [[-4, 1, 2, 1.5], [0, -3, 2.5, 1.8], [4, 1, 2.5, 1.8]]
  ];
  const stones = layouts[h % layouts.length];
  const colors = [['#95a5a6', '#d0d3d4'], ['#858f91', '#c4ccce'], ['#a1a7a5', '#e0dfd7'], ['#777f82', '#b9c1c2']];
  const [stoneColor, lightColor] = colors[(h >>> 4) % colors.length];
  groundShadow(x, y - 3, 5, 2); // (#326: by the sun, as the rest)
  const shadows = new Path2D();
  for (let i = 0; i < stones.length; i++) {
    const [px, py, rx, ry] = stones[i], rotation = ((h >>> (i * 3 + 8)) % 5 - 2) * 0.12;
    shadows.ellipse(x + px + 1, y + py + 1, rx, ry, rotation, 0, Math.PI * 2);
  }
  drawShadowPath(g, shadows, 0.25);
  for (let i = 0; i < stones.length; i++) {
    const [px, py, rx, ry] = stones[i], rotation = ((h >>> (i * 3 + 8)) % 5 - 2) * 0.12;
    g.fillStyle = stoneColor;
    g.beginPath(); g.ellipse(x + px, y + py, rx, ry, rotation, 0, Math.PI * 2); g.fill();
    g.fillStyle = lightColor;
    g.beginPath(); g.ellipse(x + px - rx * 0.2, y + py - ry * 0.3, rx * 0.45, ry * 0.35, rotation, 0, Math.PI * 2); g.fill();
  }
}

// A farm plot: soil in furrows (richer and darker fertilised), wheat in rows that grows from green shoots
// to golden ears
export function drawFarmPlotArt(f) {
  const x = f.x, y = f.y, g = Math.max(0, Math.min(100, f.growth || 0)) / 100;
  pen().fillStyle = f.fertilized ? '#4a3020' : '#5c4033'; pen().fillRect(x - 13, y - 13, 26, 26);
  pen().strokeStyle = 'rgba(0, 0, 0, 0.3)'; pen().lineWidth = 1;
  for (let k = -9; k <= 9; k += 6) { pen().beginPath(); pen().moveTo(x - 12, y + k); pen().lineTo(x + 12, y + k); pen().stroke(); }
  if (f.fertilized) { pen().strokeStyle = '#3b2412'; pen().lineWidth = 2; pen().strokeRect(x - 12, y - 12, 24, 24); }
  const ripe = g >= 1;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const sx = x - 9 + col * 6, sy = y - 8 + row * 6, tall = 2 + 7 * g, sway = windSway(sx, sy, tall); // (in the wind, #308)
      pen().strokeStyle = ripe ? '#d4ac0d' : g > 0.6 ? '#9acd32' : '#2ecc71'; pen().lineWidth = 1.2;
      pen().beginPath(); pen().moveTo(sx, sy + 2); pen().quadraticCurveTo(sx + sway * 0.3, sy + 2 - tall * 0.6, sx + sway, sy + 2 - tall); pen().stroke();
      if (ripe || g > 0.6) { pen().fillStyle = ripe ? '#f4d03f' : '#c5e384'; pen().beginPath(); pen().ellipse(sx + sway, sy + 1 - tall, 1.4, 2.6, sway * 0.08, 0, Math.PI * 2); pen().fill(); }
    }
  }
}
