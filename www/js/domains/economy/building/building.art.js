// What the buildings look like (#251): seen from above and a little from the front, a soft shadow under each,
// a roof with its ridge and a front wall where they have them, darker outlines. One tile is 30 px; the town
// hall stands on 2×2 and is no longer round: the humans' a timber hall, the undead's a fenced graveyard with
// a crypt, the demons' an obsidian gate with fire in it.

import { ctx } from '../../../engine/platform/index.js';
import { getPlayerFaction, getSettlerColor } from '../../factions/index.js';

const rect = (x, y, w, h, fill, stroke, lw = 1) => {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
};
const poly = (points, fill, stroke, lw = 1) => {
  ctx.beginPath(); points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
};
const line = (x0, y0, x1, y1, color, lw = 1) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };

// A soft shadow cast down and to the right
export function shadow(x, y, w, h, r = 4) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath(); ctx.roundRect(x - w / 2 + 3, y - h / 2 + 4, w, h, r); ctx.fill();
}

// A house seen from above at a slant: a pitched roof (its far half lighter), its front wall below with a door
function house(x, y, w, h, { roof, roofDark, wall, wallDark, door = '#3e2723' }) {
  shadow(x, y, w, h);
  const top = y - h / 2, wallH = Math.round(h * 0.32), roofH = h - wallH;
  // the front wall
  rect(x - w / 2, top + roofH, w, wallH, wall, wallDark);
  rect(x - 3, top + roofH + 2, 6, wallH - 2, door);
  // the roof: two slopes, the ridge across, eaves over the wall
  poly([[x - w / 2 - 1, top + roofH / 2], [x + w / 2 + 1, top + roofH / 2], [x + w / 2 + 1, top + roofH + 1], [x - w / 2 - 1, top + roofH + 1]], roofDark);
  poly([[x - w / 2 - 1, top], [x + w / 2 + 1, top], [x + w / 2 + 1, top + roofH / 2], [x - w / 2 - 1, top + roofH / 2]], roof);
  line(x - w / 2 - 1, top + roofH / 2, x + w / 2 + 1, top + roofH / 2, 'rgba(0, 0, 0, 0.35)', 1.5);
  for (let k = 1; k < 4; k++) line(x - w / 2 + (w * k) / 4, top + 1, x - w / 2 + (w * k) / 4, top + roofH, 'rgba(0, 0, 0, 0.12)', 1);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 - 0.5, top - 0.5, w + 1, roofH + 1.5);
}

// ---- Walls and doors

// A palisade: logs side by side, their sharpened tops, bands of rope across
export function drawWoodWall(x, y) {
  rect(x - 15, y - 15, 30, 30, '#5c3a17');
  for (let k = 0; k < 5; k++) {
    const lx = x - 15 + k * 6;
    rect(lx + 0.5, y - 13, 5, 28, k % 2 ? '#8e5a2b' : '#9b6633');
    poly([[lx + 0.5, y - 13], [lx + 3, y - 16], [lx + 5.5, y - 13]], '#b07a42');
    line(lx + 1.5, y - 11, lx + 1.5, y + 13, 'rgba(255, 255, 255, 0.12)');
  }
  line(x - 15, y - 4, x + 15, y - 4, '#4e3016', 2);
  line(x - 15, y + 8, x + 15, y + 8, '#4e3016', 2);
}

// Masonry: blocks in courses, each set over the joint below, a light top edge
export function drawStoneWall(x, y) {
  rect(x - 15, y - 15, 30, 30, '#5d6d7e');
  for (let row = 0; row < 4; row++) {
    const by = y - 15 + row * 7.5, shift = row % 2 ? 5 : 0;
    for (let col = -1; col < 3; col++) {
      const bx = x - 15 + col * 10 + shift;
      const x0 = Math.max(x - 15, bx + 0.5), x1 = Math.min(x + 15, bx + 9.5);
      if (x1 <= x0) continue;
      rect(x0, by + 0.5, x1 - x0, 6.5, (row + col) % 3 ? '#95a5a6' : '#8a9a9b');
      line(x0, by + 1, x1, by + 1, 'rgba(255, 255, 255, 0.25)');
    }
  }
  ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 1; ctx.strokeRect(x - 14.5, y - 14.5, 29, 29);
}

// A door in its frame: planks (iron bands and rivets on an iron one)
export function drawDoorArt(x, y, iron) {
  rect(x - 15, y - 15, 30, 30, iron ? '#4d5656' : '#6d4520');
  rect(x - 11, y - 12, 22, 26, iron ? '#7b5a3c' : '#a0522d', '#3e2723');
  for (const px of [-5, 0, 5]) line(x + px, y - 11, x + px, y + 13, 'rgba(0, 0, 0, 0.25)');
  if (iron) {
    for (const py of [-7, 1, 9]) { rect(x - 11, y + py - 1.5, 22, 3, '#7f8c8d'); for (const px of [-8, 8]) { ctx.fillStyle = '#d0d3d4'; ctx.fillRect(x + px - 0.5, y + py - 0.5, 1.5, 1.5); } }
  }
  ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(x + 6, y + 2, 1.6, 0, Math.PI * 2); ctx.fill();
}

// ---- Homes and workplaces

// A canvas tent: two sloped sides, the ridge pole, the flap open at the front, pegs and ropes
export function drawTentArt(x, y) {
  shadow(x, y + 2, 26, 22, 6);
  poly([[x - 13, y + 12], [x, y - 13], [x, y + 12]], '#e67e22', '#8e3e05');
  poly([[x, y - 13], [x + 13, y + 12], [x, y + 12]], '#ca6f1e', '#8e3e05');
  poly([[x - 4, y + 12], [x, y + 1], [x + 4, y + 12]], '#4a2511');
  line(x, y - 14, x, y + 12, '#5d4037', 1.5);
  for (const [px, py, qx, qy] of [[-13, 12, -16, 15], [13, 12, 16, 15]]) { line(x + px, y + py, x + qx, y + qy, '#d7bfa0'); ctx.fillStyle = '#5d4037'; ctx.fillRect(x + qx - 1, y + qy - 1, 2, 2); }
}

// The workshop: a timber shed open to the front, a bench with a saw and a log by it
export function drawWorkshopArt(x, y) {
  house(x, y - 3, 26, 20, { roof: '#a0522d', roofDark: '#8b4513', wall: '#c8a46a', wallDark: '#7a5230', door: '#5d4037' });
  rect(x - 12, y + 9, 13, 4, '#8e5a2b', '#5c3a17');
  line(x - 9, y + 9, x - 2, y + 6, '#bdc3c7', 2);
  ctx.fillStyle = '#9b6633'; ctx.beginPath(); ctx.ellipse(x + 8, y + 11, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d4a373'; ctx.beginPath(); ctx.ellipse(x + 12, y + 11, 1.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
}

// The smithy: dark stone, a slate roof, its chimney glowing, the anvil out in front
export function drawSmithyArt(x, y) {
  house(x, y - 3, 26, 20, { roof: '#4d5656', roofDark: '#2c3e50', wall: '#7f8c8d', wallDark: '#34495e', door: '#1b2631' });
  rect(x + 5, y - 15, 5, 6, '#5d6d7e', '#2c3e50');
  ctx.fillStyle = '#e67e22'; ctx.fillRect(x + 6, y - 15, 3, 2);
  // the anvil
  poly([[x - 12, y + 9], [x - 2, y + 9], [x - 4, y + 11], [x - 10, y + 11]], '#2c3e50');
  rect(x - 9, y + 11, 4, 3, '#2c3e50');
  line(x - 12, y + 9, x - 2, y + 9, '#95a5a6');
}

// The smelter: a round stone furnace, its mouth glowing, a chimney at the back
export function drawSmelterArt(x, y) {
  shadow(x, y, 26, 26, 13);
  ctx.fillStyle = '#6e2c00'; ctx.beginPath(); ctx.arc(x, y + 1, 13, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    ctx.fillStyle = k % 2 ? '#95a5a6' : '#7f8c8d';
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * 11, y + 1 + Math.sin(a) * 11, 3, 0, Math.PI * 2); ctx.fill();
  }
  rect(x - 4, y - 14, 8, 7, '#5d6d7e', '#2c3e50');
  const glow = 0.75 + Math.sin(performance.now() / 300 + x) * 0.15;
  ctx.fillStyle = `rgba(230, 126, 34, ${glow})`; ctx.beginPath(); ctx.arc(x, y + 2, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f9e79f'; ctx.beginPath(); ctx.arc(x, y + 3, 2.5, 0, Math.PI * 2); ctx.fill();
}

// The warehouse: a barn, wide doors, crates stacked at its side
export function drawWarehouseArt(x, y) {
  house(x - 2, y - 2, 24, 22, { roof: '#7b241c', roofDark: '#641e16', wall: '#a47148', wallDark: '#6d4520', door: '#4e3016' });
  for (const [cx, cy] of [[9, 7], [9, 12], [13, 10]]) { rect(x + cx - 2.5, y + cy - 2.5, 5, 5, '#c8a46a', '#7a5230'); line(x + cx - 2.5, y + cy, x + cx + 2.5, y + cy, '#7a5230'); }
}

// The lookout: four posts and braces under a plank platform with a railing, a little roof over a corner
export function drawWatchtowerArt(x, y) {
  shadow(x, y, 24, 24);
  ctx.fillStyle = '#5d3a1a';
  for (const [px, py] of [[-13, -13], [9, -13], [-13, 9], [9, 9]]) ctx.fillRect(x + px, y + py, 4, 4);
  line(x - 11, y - 11, x + 11, y + 11, '#6d4520', 2); line(x + 11, y - 11, x - 11, y + 11, '#6d4520', 2);
  rect(x - 11, y - 11, 22, 22, '#a47148');
  for (let i = -6; i <= 6; i += 4) line(x - 11, y + i, x + 11, y + i, 'rgba(92, 58, 23, 0.55)');
  ctx.strokeStyle = '#4e2f14'; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 11, 22, 22);
  for (const [px, py] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) { ctx.fillStyle = '#3e2723'; ctx.beginPath(); ctx.arc(x + px, y + py, 2, 0, Math.PI * 2); ctx.fill(); }
}

// The demons' den: a mound of dark stone, horned at the top, its mouth glowing
export function drawDenArt(x, y) {
  shadow(x, y + 2, 26, 20, 10);
  poly([[x - 14, y + 13], [x - 11, y - 2], [x - 4, y - 10], [x + 4, y - 10], [x + 11, y - 2], [x + 14, y + 13]], '#4a2c2a', '#1b0f0e', 1.5);
  poly([[x - 7, y - 7], [x - 10, y - 15], [x - 3, y - 9]], '#2c1a19');
  poly([[x + 7, y - 7], [x + 10, y - 15], [x + 3, y - 9]], '#2c1a19');
  poly([[x - 5, y + 13], [x - 4, y + 3], [x, y], [x + 4, y + 3], [x + 5, y + 13]], '#e8572a');
  poly([[x - 2, y + 13], [x, y + 6], [x + 2, y + 13]], '#f9e79f');
}

// ---- The town hall

// The humans': a timber hall on a stone footing, a tiled roof, its chimney, a door, windows, the colony's
// flag on a pole at the corner
function drawHumanHall(x, y) {
  const w = 58, h = 50;
  shadow(x, y, w, h, 6);
  rect(x - w / 2 - 1, y + h / 2 - 5, w + 2, 6, '#7f8c8d', '#34495e');
  house(x, y - 2, w, h - 4, { roof: '#a04000', roofDark: '#873600', wall: '#c8a46a', wallDark: '#7a5230', door: '#4e3016' });
  for (const wx of [-18, 12]) { rect(x + wx, y + 9, 7, 6, '#f7dc6f', '#5c3a17'); line(x + wx + 3.5, y + 9, x + wx + 3.5, y + 15, '#5c3a17'); }
  rect(x + 12, y - h / 2 - 2, 6, 10, '#7f8c8d', '#34495e');
  // the flag
  line(x - w / 2 + 2, y - h / 2 + 8, x - w / 2 + 2, y - h / 2 - 14, '#3e2723', 2);
  poly([[x - w / 2 + 3, y - h / 2 - 14], [x - w / 2 + 16, y - h / 2 - 10], [x - w / 2 + 3, y - h / 2 - 6]], getSettlerColor(), '#2c3e50');
}

// The undead's: a square of dark earth inside an iron fence, rows of headstones, a stone crypt at the back
function drawGraveyard(x, y) {
  const s = 58;
  shadow(x, y, s, s, 2);
  rect(x - s / 2, y - s / 2, s, s, '#2e2b2f');
  ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 2; ctx.strokeRect(x - s / 2 + 1, y - s / 2 + 1, s - 2, s - 2);
  for (let k = 0; k <= 12; k++) for (const [ax, ay] of [[x - s / 2 + (k * s) / 12, y - s / 2], [x - s / 2 + (k * s) / 12, y + s / 2], [x - s / 2, y - s / 2 + (k * s) / 12], [x + s / 2, y - s / 2 + (k * s) / 12]]) { ctx.fillStyle = '#95a5a6'; ctx.fillRect(ax - 1, ay - 1, 2, 2); }
  // the crypt
  rect(x - 12, y - 25, 24, 16, '#7f8c8d', '#2c3e50');
  poly([[x - 14, y - 25], [x, y - 29], [x + 14, y - 25]], '#5d6d7e', '#2c3e50');
  rect(x - 4, y - 19, 8, 10, '#1b1b1f');
  line(x, y - 33, x, y - 27, '#bdc3c7', 2); line(x - 2.5, y - 31, x + 2.5, y - 31, '#bdc3c7', 2);
  // headstones in rows
  for (const [gx, gy] of [[-19, 0], [-8, 0], [8, 0], [19, 0], [-19, 14], [-8, 14], [8, 14], [19, 14]]) {
    ctx.fillStyle = '#4a3b2f'; ctx.fillRect(x + gx - 4, y + gy + 3, 8, 4);
    ctx.fillStyle = '#aab7b8'; ctx.beginPath(); ctx.roundRect(x + gx - 3, y + gy - 5, 6, 9, [3, 3, 0, 0]); ctx.fill();
    ctx.strokeStyle = '#5d6d7e'; ctx.lineWidth = 0.8; ctx.stroke();
  }
}

// The demons': a ring of obsidian rocks round a gate of two horned pillars, fire inside it
function drawHellgate(x, y) {
  shadow(x, y, 56, 50, 16);
  poly([[x - 28, y + 6], [x - 24, y - 14], [x - 12, y - 24], [x + 10, y - 25], [x + 25, y - 13], [x + 28, y + 8], [x + 18, y + 22], [x - 16, y + 23]], '#2d1b1b', '#120909', 2);
  for (const [px, py] of [[-20, 10], [-14, -14], [16, -16], [21, 10], [2, 18]]) { ctx.fillStyle = '#3d2424'; ctx.beginPath(); ctx.arc(x + px, y + py, 4, 0, Math.PI * 2); ctx.fill(); }
  // the pillars and their horns
  for (const side of [-1, 1]) {
    rect(x + side * 13 - 4, y - 14, 8, 26, '#1b1010', '#000');
    poly([[x + side * 13 - 4, y - 14], [x + side * 19, y - 26], [x + side * 13 + 4, y - 14]], '#5b2c2c');
  }
  // the arch and the fire in it
  ctx.fillStyle = '#120909'; ctx.beginPath(); ctx.moveTo(x - 9, y + 12); ctx.lineTo(x - 9, y - 6); ctx.arc(x, y - 6, 9, Math.PI, 0); ctx.lineTo(x + 9, y + 12); ctx.closePath(); ctx.fill();
  const k = 1 + Math.sin(performance.now() / 140) * 0.08;
  ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.ellipse(x, y + 4, 7 * k, 10 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.ellipse(x, y + 6, 4.5 * k, 7 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f9e79f'; ctx.beginPath(); ctx.ellipse(x, y + 8, 2 * k, 3.5 * k, 0, 0, Math.PI * 2); ctx.fill();
}

export function drawHallArt(x, y) {
  const hall = getPlayerFaction().hall;
  if (hall === 'hellgate') drawHellgate(x, y);
  else if (hall === 'graveyard') drawGraveyard(x, y);
  else drawHumanHall(x, y);
}
