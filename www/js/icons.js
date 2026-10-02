// Drawn icons (#7): every icon in the game is painted here, in the flat style of the map tiles, instead
// of an emoji (emoji look different on every phone, and some don't have them at all).
//
// - ICONS: name -> painter (c) drawing on a 32×32 grid. Config items name theirs in `icon`.
// - Texts mark an icon with [[name]] (i18n.js, formatCost...). richText() turns those into HTML
//   (<i class="ic ic-name">, the pictures come from a stylesheet made at start-up), fillRichText() draws
//   them on the canvas, and plainText() drops them where only text fits (tooltips).
// - drawIcon(ctx, name, x, y, size) draws one centred at (x, y) on the canvas.

const ICON_PIXELS = 64; // each icon is painted once at this size and scaled from there

// ---- Painting helpers (c: a context scaled to the 32×32 grid)

function icPath(c, points, close = true) {
  c.beginPath();
  c.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
  if (close) c.closePath();
}
function icFill(c, color, points) { c.fillStyle = color; icPath(c, points); c.fill(); }
function icLine(c, color, width, points) {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
  icPath(c, points, false); c.stroke();
}
function icCircle(c, color, x, y, r) { c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function icRing(c, color, width, x, y, r, from = 0, to = Math.PI * 2) {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, r, from, to); c.stroke();
}
function icRect(c, color, x, y, w, h) { c.fillStyle = color; c.fillRect(x, y, w, h); }
function icRound(c, color, x, y, w, h, r) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
}
function icEllipse(c, color, x, y, rx, ry, rot = 0) {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
}

// shared shapes
const icSword = (c, blade, edge) => {
  icFill(c, blade, [[22, 4], [27, 5], [12, 20], [10, 18]]);
  icLine(c, edge, 1.2, [[25, 5], [11, 19]]);
  icLine(c, '#f39c12', 3, [[7, 15], [15, 23]]);
  icLine(c, '#8e5a2b', 3, [[10, 20], [5, 25]]);
  icCircle(c, '#f39c12', 4.5, 25.5, 2);
};
const icSpear = (c, shaft) => {
  icLine(c, shaft, 2.6, [[5, 27], [22, 10]]);
  icFill(c, '#dfe6e9', [[28, 4], [25, 13], [19, 7]]);
};
const icAxe = (c, head, edge) => {
  icLine(c, '#8e5a2b', 3, [[8, 28], [20, 6]]);
  icFill(c, head, [[16, 6], [26, 3], [28, 13], [19, 13]]);
  icLine(c, edge, 1.5, [[26, 4], [28, 12]]);
};
const icPickaxe = (c, head) => {
  icLine(c, '#8e5a2b', 3, [[7, 28], [20, 9]]);
  c.strokeStyle = head; c.lineWidth = 3.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(6, 9); c.quadraticCurveTo(17, 1, 29, 12); c.stroke();
};
const icRockLump = (c, x, y, s, color, shade) => {
  icFill(c, color, [[x - 7 * s, y + 5 * s], [x - 8 * s, y - 1 * s], [x - 3 * s, y - 6 * s], [x + 4 * s, y - 6 * s], [x + 8 * s, y], [x + 6 * s, y + 5 * s]]);
  icFill(c, shade, [[x - 7 * s, y + 5 * s], [x + 6 * s, y + 5 * s], [x + 8 * s, y], [x + 2 * s, y + 2 * s]]);
};
const icTile = (c, color, edge) => { icRound(c, color, 3, 3, 26, 26, 4); c.strokeStyle = edge; c.lineWidth = 2; c.beginPath(); c.roundRect(3, 3, 26, 26, 4); c.stroke(); };
const icCrown = (c, color, shade) => {
  icRect(c, '#6d4c2f', 14, 18, 4, 11);
  icCircle(c, shade, 16, 14, 11);
  icCircle(c, color, 14.5, 12.5, 9);
};
const icSprout = c => {
  icLine(c, '#27ae60', 2.5, [[16, 28], [16, 14]]);
  icEllipse(c, '#2ecc71', 10.5, 13, 6, 3.5, -0.5);
  icEllipse(c, '#58d68d', 21.5, 11, 6, 3.5, 0.5);
  icEllipse(c, '#6d4c2f', 16, 28, 8, 2.5);
};
const icFish = (c, body, fin) => {
  icEllipse(c, body, 15, 16, 10, 6.5);
  icFill(c, fin, [[24, 16], [30, 9], [30, 23]]);
  icCircle(c, '#fff', 9.5, 14.5, 2); icCircle(c, '#2c3e50', 9.5, 14.5, 1);
};
const icFlame = (c, x, y, s) => {
  c.fillStyle = '#e67e22'; c.beginPath(); c.moveTo(x - 8 * s, y);
  c.quadraticCurveTo(x - 9 * s, y - 10 * s, x, y - 18 * s); c.quadraticCurveTo(x + 9 * s, y - 10 * s, x + 8 * s, y); c.closePath(); c.fill();
  c.fillStyle = '#f1c40f'; c.beginPath(); c.moveTo(x - 4 * s, y);
  c.quadraticCurveTo(x - 4 * s, y - 6 * s, x, y - 10 * s); c.quadraticCurveTo(x + 4 * s, y - 6 * s, x + 4 * s, y); c.closePath(); c.fill();
};
const icPerson = (c, body, scale) => {
  icCircle(c, '#1e272e', 16, 17, 12 * scale + 1.5);
  icCircle(c, body, 16, 17, 12 * scale);
};
const icZone = (c, fill, edge) => { icRound(c, fill, 4, 4, 24, 24, 3); c.strokeStyle = edge; c.lineWidth = 2.5; c.beginPath(); c.roundRect(4, 4, 24, 24, 3); c.stroke(); };
const icArrow = (c, x) => {
  icLine(c, '#8e5a2b', 2, [[x, 27], [x, 9]]);
  icFill(c, '#bdc3c7', [[x - 3.5, 10], [x, 3], [x + 3.5, 10]]);
  icFill(c, '#ecf0f1', [[x, 22], [x - 3.5, 29], [x - 3.5, 24], [x, 18]]);
  icFill(c, '#d5dbdb', [[x, 22], [x + 3.5, 29], [x + 3.5, 24], [x, 18]]);
};

const ICONS = {
  // ---- Messages and controls
  no: c => { icLine(c, '#e74c3c', 5.5, [[8, 8], [24, 24]]); icLine(c, '#e74c3c', 5.5, [[24, 8], [8, 24]]); },
  close: c => { icLine(c, '#bdc3c7', 4.5, [[9, 9], [23, 23]]); icLine(c, '#bdc3c7', 4.5, [[23, 9], [9, 23]]); },
  ok: c => { icRound(c, '#27ae60', 3, 3, 26, 26, 6); icLine(c, '#fff', 4, [[9, 16.5], [14, 21.5], [23, 11]]); },
  warn: c => {
    c.fillStyle = '#f1c40f'; c.beginPath(); c.moveTo(16, 3); c.lineTo(30, 28); c.lineTo(2, 28); c.closePath(); c.fill();
    icRound(c, '#2d3436', 14.3, 10, 3.4, 10, 1.5); icCircle(c, '#2d3436', 16, 24, 2);
  },
  hint: c => {
    icCircle(c, '#f9e79f', 16, 13, 10); icCircle(c, '#f1c40f', 16, 13, 8);
    icRect(c, '#95a5a6', 12, 22, 8, 3); icRect(c, '#7f8c8d', 12.5, 25.5, 7, 3);
    icLine(c, '#fff', 1.8, [[12, 11], [14, 8]]);
  },
  menu: c => { for (const y of [8, 15, 22]) icRound(c, '#ecf0f1', 5, y, 22, 3.5, 1.7); },
  pause: c => { icRound(c, '#ecf0f1', 8, 6, 6, 20, 1.5); icRound(c, '#ecf0f1', 18, 6, 6, 20, 1.5); },
  play: c => icFill(c, '#ecf0f1', [[9, 5], [26, 16], [9, 27]]),
  eye: c => {
    c.fillStyle = '#ecf0f1'; c.beginPath(); c.moveTo(2, 16); c.quadraticCurveTo(16, 2, 30, 16); c.quadraticCurveTo(16, 30, 2, 16); c.fill();
    icCircle(c, '#2980b9', 16, 16, 6); icCircle(c, '#1e272e', 16, 16, 3); icCircle(c, '#fff', 14, 14, 1.3);
  },
  plus: c => { icRound(c, '#2c3e50', 13.5, 5, 5, 22, 2); icRound(c, '#2c3e50', 5, 13.5, 22, 5, 2); },
  minus: c => icRound(c, '#2c3e50', 5, 13.5, 22, 5, 2),
  point: c => {
    icRound(c, '#f5cba7', 13, 3, 6, 16, 3);
    icRound(c, '#f5cba7', 8, 13, 18, 15, 5);
    icLine(c, '#d4a373', 1.2, [[19, 15], [19, 19]]); icLine(c, '#d4a373', 1.2, [[23, 15], [23, 19]]);
  },
  reroll: c => {
    icRing(c, '#5dade2', 3, 16, 16, 10, Math.PI * 1.1, Math.PI * 1.9);
    icFill(c, '#5dade2', [[22, 4], [27, 11], [19, 11]]);
    icRing(c, '#5dade2', 3, 16, 16, 10, Math.PI * 0.1, Math.PI * 0.9);
    icFill(c, '#5dade2', [[10, 28], [5, 21], [13, 21]]);
  },
  gear: c => {
    c.fillStyle = '#95a5a6';
    for (let i = 0; i < 8; i++) {
      c.save(); c.translate(16, 16); c.rotate(i * Math.PI / 4); c.fillRect(-2.5, -14, 5, 6); c.restore();
    }
    icCircle(c, '#95a5a6', 16, 16, 10); icCircle(c, '#2c3e50', 16, 16, 4);
  },
  save: c => {
    icRound(c, '#2e86c1', 4, 4, 24, 24, 3);
    icRect(c, '#ecf0f1', 9, 4, 14, 9); icRect(c, '#2e86c1', 18, 5.5, 3, 6);
    icRect(c, '#1b4f72', 8, 17, 16, 9);
  },
  broom: c => {
    icLine(c, '#8e5a2b', 2.6, [[26, 4], [14, 18]]);
    icFill(c, '#f4d03f', [[12, 16], [18, 22], [10, 30], [3, 25]]);
    icLine(c, '#b7950b', 1, [[7, 24], [13, 19]]); icLine(c, '#b7950b', 1, [[9, 27], [15, 21]]);
  },
  swords: c => {
    c.save(); icSword(c, '#dfe6e9', '#fff'); c.restore();
    c.save(); c.translate(32, 0); c.scale(-1, 1); icSword(c, '#dfe6e9', '#fff'); c.restore();
  },
  hammer: c => {
    icLine(c, '#8e5a2b', 3.5, [[7, 27], [19, 13]]);
    c.save(); c.translate(20, 11); c.rotate(Math.PI / 4.4); icRound(c, '#7f8c8d', -9, -4.5, 18, 9, 2); c.restore();
  },
  tools: c => {
    // a wrench and a hammer, crossed
    icLine(c, '#95a5a6', 3.5, [[7, 25], [21, 11]]);
    icRing(c, '#95a5a6', 3.5, 23, 9, 4, Math.PI * 0.75, Math.PI * 2.25);
    icLine(c, '#8e5a2b', 3.5, [[25, 27], [12, 13]]);
    c.save(); c.translate(11, 11); c.rotate(-Math.PI / 4); icRound(c, '#7f8c8d', -8, -4, 16, 8, 2); c.restore();
  },
  build: c => {
    icRect(c, '#f39c12', 8, 6, 4, 22); icRect(c, '#f39c12', 4, 6, 24, 3.5);
    icLine(c, '#2c3e50', 1.2, [[24, 9], [24, 17]]); icRect(c, '#2c3e50', 22, 17, 4, 3);
    icRect(c, '#7f8c8d', 5, 27, 10, 3); icRect(c, '#a04000', 18, 22, 9, 7);
  },
  zone_wheat: c => icZone(c, 'rgba(241, 196, 15, 0.45)', '#f1c40f'),
  zone_sapling: c => icZone(c, 'rgba(46, 204, 113, 0.45)', '#2ecc71'),
  zone_apple: c => icZone(c, 'rgba(231, 76, 60, 0.45)', '#e74c3c'),

  // ---- The map
  hall: c => {
    icFill(c, '#c0392b', [[16, 3], [30, 12], [2, 12]]);
    icRect(c, '#d2b48c', 4, 12, 24, 14);
    for (const x of [6, 12, 18, 24]) icRect(c, '#f5e6c8', x, 13, 2.5, 12);
    icRect(c, '#8d6e63', 2, 26, 28, 4);
  },
  water: c => {
    icTile(c, '#2c83bd', '#1f618d');
    for (const y of [11, 19]) icLine(c, '#85c1e9', 2, [[8, y], [12, y - 3], [16, y], [20, y - 3], [24, y]]);
  },
  rock: c => {
    icTile(c, '#34495e', '#22313f');
    icFill(c, '#4a6278', [[8, 22], [12, 10], [18, 8], [24, 16], [22, 23]]);
  },
  sand: c => {
    icTile(c, '#c9a66b', '#a5844e');
    for (const [x, y] of [[9, 10], [20, 9], [14, 17], [23, 21], [9, 23]]) icCircle(c, '#a5844e', x, y, 1.3);
  },
  eraser: c => {
    c.save(); c.translate(16, 16); c.rotate(-Math.PI / 4);
    icRound(c, '#f1948a', -12, -6, 24, 12, 3); icRect(c, '#5dade2', -12, -6, 9, 12);
    c.restore();
  },
  tree: c => icCrown(c, '#2e7d32', '#1b5e20'),
  apple_tree: c => {
    icCrown(c, '#2e7d32', '#1b5e20');
    for (const [x, y] of [[10, 10], [18, 8], [20, 16], [12, 17]]) icCircle(c, '#e74c3c', x, y, 2.2);
  },
  cactus: c => {
    icRound(c, '#27ae60', 12.5, 4, 7, 25, 3.5);
    icRound(c, '#27ae60', 4, 11, 5, 10, 2.5); icRound(c, '#27ae60', 6, 17, 8, 4, 2);
    icRound(c, '#27ae60', 23, 8, 5, 10, 2.5); icRound(c, '#27ae60', 18, 14, 8, 4, 2);
    icLine(c, '#1e8449', 1, [[16, 7], [16, 26]]);
  },
  boulder: c => icRockLump(c, 16, 18, 1.6, '#95a5a6', '#707b7c'),
  grass: c => {
    for (const [x, h, col] of [[10, 18, '#27ae60'], [16, 22, '#2ecc71'], [22, 17, '#27ae60'], [13, 14, '#58d68d'], [19, 15, '#58d68d']]) {
      icLine(c, col, 2.5, [[x, 28], [x + (x < 16 ? -2 : 2), 28 - h]]);
    }
  },
  berry_bush: c => {
    icCircle(c, '#1e8449', 16, 17, 12); icCircle(c, '#27ae60', 14, 15, 9);
    for (const [x, y] of [[10, 14], [17, 11], [21, 18], [13, 21], [19, 24]]) icCircle(c, '#5b6ee1', x, y, 2.4);
  },
  stick: c => { icLine(c, '#8e5a2b', 3.5, [[5, 25], [27, 8]]); icLine(c, '#8e5a2b', 2, [[17, 16], [20, 22]]); },
  pebble: c => {
    icEllipse(c, '#95a5a6', 11, 20, 6, 4.5); icEllipse(c, '#bdc3c7', 21, 15, 5, 4); icEllipse(c, '#7f8c8d', 22, 24, 4, 3);
  },
  iron_ore: c => { icTile(c, '#34495e', '#22313f'); for (const [x, y, s] of [[8, 8, 7], [17, 12, 8], [10, 20, 6]]) icRect(c, '#aab7c3', x, y, s, s); },
  coal_ore: c => { icTile(c, '#34495e', '#22313f'); for (const [x, y, s] of [[8, 8, 7], [17, 12, 8], [10, 20, 6]]) icRect(c, '#050608', x, y, s, s); },
  iron_spawner: c => {
    icTile(c, '#34495e', '#aab7c3');
    icFill(c, '#aab7c3', [[16, 7], [22, 16], [16, 25], [10, 16]]); icRect(c, '#dfe6ed', 15, 11, 2, 5);
  },
  coal_spawner: c => {
    icTile(c, '#34495e', '#050608');
    icFill(c, '#050608', [[16, 7], [22, 16], [16, 25], [10, 16]]); icRect(c, '#6b7785', 15, 11, 2, 5);
  },
  boar: c => {
    icEllipse(c, '#6e3b1f', 15, 18, 12, 8);
    icEllipse(c, '#8d5a3b', 24, 15, 6, 5);
    icEllipse(c, '#d7a17e', 29, 16, 2.5, 2.5);
    icFill(c, '#5d2f15', [[20, 10], [23, 5], [24, 11]]);
    icCircle(c, '#1e272e', 25, 13.5, 1.2);
    icLine(c, '#f5f5f5', 1.5, [[27, 19], [28, 22]]);
    for (const x of [8, 13, 18, 21]) icRect(c, '#4e2a14', x, 24, 2.5, 5);
  },
  tent: c => {
    icFill(c, '#d35400', [[16, 4], [30, 27], [2, 27]]);
    icFill(c, '#a04000', [[16, 4], [16, 27], [2, 27]]);
    icFill(c, '#4a2511', [[16, 14], [21, 27], [11, 27]]);
  },
  enemyTent: c => {
    icFill(c, '#641e16', [[16, 4], [30, 27], [2, 27]]);
    icLine(c, '#c0392b', 2, [[16, 4], [30, 27], [2, 27], [16, 4]]);
    icFill(c, '#1e272e', [[16, 14], [21, 27], [11, 27]]);
  },
  bundle: c => {
    icRect(c, '#b9770e', 5, 9, 22, 18); icFill(c, '#d68910', [[5, 9], [10, 4], [27, 4], [27, 9]]);
    icRect(c, '#f5cba7', 14, 4, 4, 23);
  },

  // ---- Resources
  food: c => {
    c.fillStyle = '#d68910'; c.beginPath(); c.moveTo(3, 24); c.quadraticCurveTo(3, 8, 16, 8); c.quadraticCurveTo(29, 8, 29, 24); c.closePath(); c.fill();
    icRect(c, '#b9770e', 3, 22, 26, 4);
    for (const x of [10, 16, 22]) icLine(c, '#f5cba7', 1.8, [[x - 2, 17], [x + 2, 12]]);
  },
  rawMeat: c => {
    icEllipse(c, '#c0392b', 15, 17, 12, 9, -0.3); icEllipse(c, '#e6b0aa', 15, 17, 8, 5.5, -0.3);
    icEllipse(c, '#c0392b', 14, 17, 5, 3, -0.3); icCircle(c, '#fdfefe', 24, 12, 3);
  },
  rawFish: c => icFish(c, '#7fb3d5', '#5499c7'),
  wheat: c => {
    icLine(c, '#b7950b', 2, [[16, 30], [16, 8]]);
    for (let i = 0; i < 4; i++) {
      icEllipse(c, '#f4d03f', 12, 9 + i * 5, 3.5, 2.2, -0.6);
      icEllipse(c, '#f4d03f', 20, 9 + i * 5, 3.5, 2.2, 0.6);
    }
    icEllipse(c, '#f4d03f', 16, 5, 2.2, 3.5);
  },
  wood: c => {
    icRound(c, '#8e5a2b', 4, 9, 22, 14, 3);
    icEllipse(c, '#d4a373', 25, 16, 4.5, 7); icRing(c, '#a0522d', 1.2, 25, 16, 3, 0, Math.PI * 2);
    icLine(c, '#6d4520', 1.2, [[8, 13], [18, 13]]); icLine(c, '#6d4520', 1.2, [[10, 19], [20, 19]]);
  },
  stone: c => { icRockLump(c, 12, 20, 1.1, '#95a5a6', '#707b7c'); icRockLump(c, 21, 14, 0.9, '#bdc3c7', '#95a5a6'); },
  coal: c => {
    for (const [x, y, r] of [[10, 21, 6.5], [22, 21, 6.5], [16, 12, 6.5]]) { icCircle(c, '#1e272e', x, y, r); icCircle(c, '#566573', x - 2, y - 2, 1.6); }
  },
  ironOre: c => {
    icRockLump(c, 16, 18, 1.5, '#6c5f57', '#4d433d');
    for (const [x, y] of [[11, 15], [18, 12], [20, 19], [13, 20]]) icRect(c, '#d35400', x, y, 3, 3);
  },
  iron: c => {
    icFill(c, '#95a5a6', [[3, 24], [8, 13], [24, 13], [29, 24]]);
    icFill(c, '#d5dbdb', [[8, 13], [24, 13], [22, 16], [10, 16]]);
  },
  leather: c => {
    icFill(c, '#a0522d', [[6, 6], [12, 9], [20, 9], [26, 6], [24, 15], [27, 26], [20, 23], [12, 23], [5, 26], [8, 15]]);
    icLine(c, '#d4a373', 1, [[11, 12], [21, 12]]);
  },
  arrows: c => { icArrow(c, 10); icArrow(c, 22); },
  wheatSeeds: c => {
    for (const [x, y, r] of [[10, 12, 0.5], [18, 9, -0.4], [22, 18, 0.3], [13, 21, -0.6], [17, 15, 0.1]]) icEllipse(c, '#d4ac0d', x, y, 3.5, 2.2, r);
  },
  saplings: icSprout,
  herbs: c => {
    icEllipse(c, '#27ae60', 15, 15, 7, 12, 0.6);
    icLine(c, '#1e8449', 1.6, [[7, 26], [22, 6]]);
    for (const t of [0.35, 0.55, 0.75]) icLine(c, '#1e8449', 1, [[7 + 15 * t, 26 - 20 * t], [7 + 15 * t - 4, 26 - 20 * t - 2]]);
  },
  worms: c => {
    c.strokeStyle = '#e8a0a0'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath();
    c.moveTo(5, 20); c.bezierCurveTo(10, 8, 14, 28, 19, 16); c.bezierCurveTo(22, 10, 26, 14, 27, 18); c.stroke();
    icCircle(c, '#1e272e', 26.5, 17, 0.9);
  },
  appleSaplings: c => { icSprout(c); icCircle(c, '#e74c3c', 23, 21, 3.5); },

  // ---- Food kinds
  provisions: c => {
    icRound(c, '#95a5a6', 7, 6, 18, 22, 3); icRect(c, '#c0392b', 7, 11, 18, 12);
    icRect(c, '#f5b7b1', 11, 15, 10, 4); icEllipse(c, '#bdc3c7', 16, 6, 9, 2);
  },
  berries: c => {
    for (const [x, y] of [[11, 18], [19, 19], [15, 12], [22, 12], [15, 24]]) { icCircle(c, '#3f51b5', x, y, 4.2); icCircle(c, '#7986cb', x - 1.3, y - 1.3, 1.2); }
    icLine(c, '#27ae60', 1.5, [[15, 8], [18, 3]]);
  },
  apples: c => {
    icCircle(c, '#e74c3c', 12, 18, 8); icCircle(c, '#e74c3c', 20, 18, 8);
    icLine(c, '#6d4c2f', 2, [[16, 11], [17, 5]]); icEllipse(c, '#27ae60', 21, 7, 4, 2, -0.4);
    icCircle(c, '#f5b7b1', 10, 15, 2);
  },
  bread: c => {
    c.save(); c.translate(16, 16); c.rotate(-0.5);
    icRound(c, '#d68910', -14, -5.5, 28, 11, 5.5);
    for (const x of [-7, 0, 7]) icLine(c, '#f5cba7', 1.8, [[x - 2, 3], [x + 2, -3]]);
    c.restore();
  },
  cookedFish: c => { icFish(c, '#ca6f1e', '#a04000'); icLine(c, '#6e2c00', 1.2, [[12, 12], [12, 20]]); icLine(c, '#6e2c00', 1.2, [[17, 11], [17, 21]]); },
  cookedMeat: c => {
    icEllipse(c, '#a04000', 13, 13, 10, 8, -0.7); icEllipse(c, '#ca6f1e', 12, 12, 7, 5, -0.7);
    icLine(c, '#fdfefe', 3.5, [[19, 19], [26, 26]]); icCircle(c, '#fdfefe', 27, 25, 2.5); icCircle(c, '#fdfefe', 25, 28, 2.5);
  },

  // ---- Settlers and gear
  worker: c => {
    icPerson(c, '#2ecc71', 0.75);
    icEllipse(c, '#f4d03f', 16, 10, 12, 3.5); icRound(c, '#d4ac0d', 10, 4, 12, 7, 3);
  },
  giant: c => { icPerson(c, '#27ae60', 1.05); icRect(c, '#1e272e', 10, 13, 4, 2.5); icRect(c, '#1e272e', 18, 13, 4, 2.5); },
  backpack: c => {
    icRound(c, '#a0522d', 6, 6, 20, 23, 5); icRound(c, '#8e5a2b', 9, 15, 14, 10, 3);
    icRing(c, '#6d4520', 2.5, 16, 7, 5, Math.PI, 0); icRect(c, '#f39c12', 15, 18, 2.5, 3);
  },
  shield: c => {
    icCircle(c, '#5d4037', 16, 16, 13); icCircle(c, '#8d6e63', 16, 16, 11);
    icLine(c, '#5d4037', 1.2, [[16, 5], [16, 27]]); icLine(c, '#5d4037', 1.2, [[5, 16], [27, 16]]);
    icCircle(c, '#b0bec5', 16, 16, 4);
  },
  armor: c => {
    icFill(c, '#95a5a6', [[9, 4], [13, 6], [19, 6], [23, 4], [29, 9], [25, 14], [25, 28], [7, 28], [7, 14], [3, 9]]);
    icFill(c, '#bdc3c7', [[13, 6], [19, 6], [16, 13]]);
    icLine(c, '#707b7c', 1.2, [[16, 13], [16, 27]]);
  },
  wateringCan: c => {
    icRound(c, '#7fa7c9', 5, 13, 16, 13, 2);
    icRing(c, '#4f7a9e', 2.5, 13, 13, 5, Math.PI, 0);
    icLine(c, '#4f7a9e', 2.5, [[21, 19], [27, 11]]); icRect(c, '#4f7a9e', 25, 8, 5, 4);
  },

  // ---- The undead (#43)
  bones: c => {
    c.save(); c.translate(16, 16); c.rotate(-0.6);
    icRound(c, '#ecf0f1', -10, -2.5, 20, 5, 2.5);
    for (const x of [-11, 11]) { icCircle(c, '#ecf0f1', x, -3, 3.2); icCircle(c, '#ecf0f1', x, 3, 3.2); }
    c.restore();
  },
  zombie: c => {
    icPerson(c, '#7dcea0', 0.75);
    icRect(c, '#1e272e', 11, 14, 3.5, 3.5); icRect(c, '#1e272e', 18, 15, 3.5, 2.5);
    icLine(c, '#1e272e', 1.5, [[12, 22], [16, 21], [20, 23]]);
  },
  big_zombie: c => {
    icPerson(c, '#58a77a', 1.05);
    icRect(c, '#1e272e', 9, 12, 4.5, 4.5); icRect(c, '#1e272e', 19, 13, 4.5, 3);
    icLine(c, '#1e272e', 2, [[10, 23], [16, 21], [22, 24]]);
  },
  skeleton: c => {
    icCircle(c, '#ecf0f1', 16, 13, 10); icRect(c, '#ecf0f1', 11, 20, 10, 7);
    icCircle(c, '#1e272e', 12, 13, 2.8); icCircle(c, '#1e272e', 20, 13, 2.8);
    icFill(c, '#1e272e', [[16, 16], [14.5, 19], [17.5, 19]]);
    for (const x of [13, 16, 19]) icLine(c, '#1e272e', 1, [[x, 21], [x, 26]]);
  },
  necromancer: c => {
    icFill(c, '#4a235a', [[16, 3], [27, 29], [5, 29]]);
    icCircle(c, '#1e272e', 16, 14, 4.5); icCircle(c, '#a569bd', 14.5, 14, 1); icCircle(c, '#a569bd', 17.5, 14, 1);
    icLine(c, '#8e5a2b', 2, [[27, 29], [27, 6]]); icCircle(c, '#bb8fce', 27, 6, 3.2);
  },
  grave: c => {
    icEllipse(c, '#5d4037', 16, 25, 13, 5);
    c.fillStyle = '#95a5a6'; c.beginPath(); c.moveTo(9, 25); c.lineTo(9, 11); c.arc(16, 11, 7, Math.PI, 0); c.lineTo(23, 25); c.closePath(); c.fill();
    icLine(c, '#5d6d7e', 1.8, [[16, 10], [16, 19]]); icLine(c, '#5d6d7e', 1.8, [[12.5, 13], [19.5, 13]]);
  },
  graveyard: c => {
    icRect(c, '#2c2c34', 3, 6, 26, 22);
    for (const x of [8, 16, 24]) {
      c.fillStyle = '#95a5a6'; c.beginPath(); c.moveTo(x - 3.5, 22); c.lineTo(x - 3.5, 13); c.arc(x, 13, 3.5, Math.PI, 0); c.lineTo(x + 3.5, 22); c.closePath(); c.fill();
    }
    c.strokeStyle = '#7f8c8d'; c.lineWidth = 1.5; c.strokeRect(3, 6, 26, 22);
  },
  staff: c => { icLine(c, '#8e5a2b', 3, [[8, 28], [22, 8]]); icCircle(c, '#bb8fce', 23, 7, 4.5); icCircle(c, '#e8daef', 22, 6, 1.5); },

  // ---- Tools and weapons (the same colours as in settlers' hands)
  axe: c => icAxe(c, '#95a5a6', '#dfe6e9'),
  iron_axe: c => icAxe(c, '#b0bec5', '#ffffff'),
  pickaxe: c => icPickaxe(c, '#95a5a6'),
  iron_pickaxe: c => { icPickaxe(c, '#b0bec5'); icLine(c, '#fff', 1, [[10, 7], [15, 4.5]]); },
  rod: c => {
    icLine(c, '#8e5a2b', 2.5, [[5, 28], [24, 4]]);
    icLine(c, '#ecf0f1', 1, [[24, 4], [27, 20]]);
    icRing(c, '#bdc3c7', 1.5, 25.5, 21.5, 2, 0, Math.PI);
    icCircle(c, '#e74c3c', 27, 15, 1.8);
  },
  medbag: c => {
    icRound(c, '#ecf0f1', 4, 9, 24, 19, 3); icRing(c, '#95a5a6', 2.5, 16, 9, 5, Math.PI, 0);
    icRect(c, '#e74c3c', 14, 12, 4, 13); icRect(c, '#e74c3c', 9.5, 16.5, 13, 4);
  },
  hoe: c => { icLine(c, '#8e5a2b', 3, [[6, 28], [22, 6]]); icFill(c, '#95a5a6', [[18, 4], [28, 6], [27, 12], [21, 9]]); },
  fist: c => {
    icRound(c, '#f5cba7', 7, 9, 18, 16, 5);
    for (const x of [9, 13.5, 18]) icLine(c, '#d4a373', 1.2, [[x + 2, 10], [x + 2, 16]]);
    icRound(c, '#f0b27a', 5, 17, 9, 6, 3);
  },
  club: c => {
    icLine(c, '#6d4520', 3.5, [[6, 27], [16, 15]]);
    c.save(); c.translate(21, 10); c.rotate(-Math.PI / 4); icRound(c, '#7a4b21', -5.5, -9, 11, 18, 5); c.restore();
  },
  sword: c => icSword(c, '#e0e0e0', '#fff'),
  iron_sword: c => icSword(c, '#b0bec5', '#eceff1'),
  spear: c => icSpear(c, '#8e5a2b'),
  iron_spear: c => icSpear(c, '#7f8c8d'),
  bow: c => {
    c.strokeStyle = '#8e5a2b'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(7, 4); c.quadraticCurveTo(30, 16, 7, 28); c.stroke();
    icLine(c, '#ecf0f1', 1, [[7, 4], [7, 28]]);
  },

  // ---- Buildings
  wall_wood: c => {
    icRect(c, '#8e5a2b', 4, 6, 24, 21);
    for (const x of [10, 16, 22]) icLine(c, '#5c3a17', 1.3, [[x, 6], [x, 27]]);
    icRect(c, '#5c3a17', 4, 4, 24, 3);
  },
  wall_stone: c => {
    icRect(c, '#7f8c8d', 4, 6, 24, 21);
    c.strokeStyle = '#2c3e50'; c.lineWidth = 1.3;
    for (const y of [13, 20]) { c.beginPath(); c.moveTo(4, y); c.lineTo(28, y); c.stroke(); }
    for (const [x, y] of [[12, 6], [22, 6], [8, 13], [17, 13], [12, 20], [22, 20]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 7); c.stroke(); }
  },
  spikes: c => {
    icRect(c, '#6d4c2f', 3, 22, 26, 6);
    for (const x of [8, 16, 24]) icFill(c, '#b0bec5', [[x - 4, 22], [x, 6], [x + 4, 22]]);
  },
  door: c => {
    icRound(c, '#a0522d', 7, 4, 18, 25, 2);
    icLine(c, '#6d4520', 1.2, [[13, 5], [13, 28]]); icLine(c, '#6d4520', 1.2, [[19, 5], [19, 28]]);
    icCircle(c, '#f39c12', 21.5, 17, 1.8);
  },
  campfire: c => {
    icLine(c, '#6d4520', 3.5, [[5, 28], [27, 20]]); icLine(c, '#6d4520', 3.5, [[27, 28], [5, 20]]);
    icFlame(c, 16, 23, 1);
  },
  fire: c => icFlame(c, 16, 29, 1.45),
  smelter: c => {
    icRound(c, '#7f2d22', 5, 6, 22, 23, 3); icRect(c, '#5d4037', 12, 2, 8, 6);
    icRound(c, '#1e272e', 10, 15, 12, 10, 5); icFlame(c, 16, 25, 0.5);
  },
  warehouse: c => {
    icFill(c, '#7b4a22', [[2, 13], [16, 4], [30, 13]]);
    icRect(c, '#a47148', 4, 13, 24, 16);
    icRect(c, '#5d3a1a', 11, 18, 10, 11);
    icLine(c, '#a47148', 1.2, [[11, 18], [21, 29]]); icLine(c, '#a47148', 1.2, [[21, 18], [11, 29]]);
  },
  watchtower: c => {
    icLine(c, '#5d3a1a', 2.5, [[9, 29], [11, 12]]); icLine(c, '#5d3a1a', 2.5, [[23, 29], [21, 12]]);
    icLine(c, '#6d4520', 1.5, [[10, 27], [22, 15]]); icLine(c, '#6d4520', 1.5, [[22, 27], [10, 15]]);
    icRect(c, '#a47148', 6, 8, 20, 5); icFill(c, '#8b5a2b', [[5, 8], [16, 2], [27, 8]]);
  }
};

// ---- Rendering icons

const iconCanvases = {};
function getIconCanvas(name) {
  if (iconCanvases[name]) return iconCanvases[name];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PIXELS;
  const c = canvas.getContext('2d');
  c.scale(ICON_PIXELS / 32, ICON_PIXELS / 32);
  (ICONS[name] || ICONS.warn)(c);
  iconCanvases[name] = canvas;
  return canvas;
}

function drawIcon(context, name, x, y, size) {
  context.drawImage(getIconCanvas(name), x - size / 2, y - size / 2, size, size);
}

const ICON_TOKEN = /\[\[([\w]+)\]\]/g;
const escapeHtml = text => String(text).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

function iconHtml(name) {
  return `<i class="ic ic-${name}"></i>`;
}

// Text with [[icon]] marks as HTML: the text escaped, the marks as icons
function richText(text) {
  return escapeHtml(text).replace(ICON_TOKEN, (_, name) => iconHtml(name));
}

// The text without its icons, for where only plain text goes (tooltips, placeholders)
function plainText(text) {
  return String(text).replace(ICON_TOKEN, '').replace(/\s{2,}/g, ' ').trim();
}

function setRichText(element, text) {
  element.innerHTML = richText(text);
}

// Text with [[icon]] marks on the canvas, in the current font, fillStyle and textAlign (left/center)
function fillRichText(context, text, x, y) {
  const parts = String(text).split(ICON_TOKEN); // text, icon name, text, icon name...
  const size = parseFloat(/(\d+(\.\d+)?)px/.exec(context.font)?.[1] || 12) * 1.15;
  const width = parts.reduce((sum, part, i) => sum + (i % 2 ? size : context.measureText(part).width), 0);
  const align = context.textAlign;
  let left = align === 'center' ? x - width / 2 : align === 'right' || align === 'end' ? x - width : x;
  context.textAlign = 'left';
  parts.forEach((part, i) => {
    if (i % 2) { drawIcon(context, part, left + size / 2, y - size * 0.35, size); left += size; }
    else if (part) { context.fillText(part, left, y); left += context.measureText(part).width; }
  });
  context.textAlign = align;
}

// The icons as CSS classes (.ic-name), so HTML anywhere can show one with <i class="ic ic-name">
(function makeIconStyles() {
  const rules = Object.keys(ICONS).map(name => `.ic-${name}{background-image:url(${getIconCanvas(name).toDataURL()})}`);
  const style = document.createElement('style');
  style.textContent = `.ic{display:inline-block;width:1.15em;height:1.15em;vertical-align:-0.2em;background-size:contain;background-repeat:no-repeat;background-position:center}${rules.join('')}`;
  document.head.appendChild(style);
})();
