// Behind the main menu (#145, #153, #168): a little scene of its own instead of the game, working the way
// Endless does, on a small field drawn a size up. A settler with a spear hunts boars: a boar it gets close
// to backs off, a wounded one sprints for a tuft of grass and hides there for a while; one it kills it
// butchers beside it and carries the meat to a warehouse. Everything stands on the tile grid as in the
// game (the warehouse, grass, trees and stones), and nothing goes behind the menu's panel. Tapping the
// settler changes its faction (and colour); tapping a boar makes it the one to hunt. Runs only while
// the menu shows.

const MENU_SCENE = {
  scale: 1.6,           // the field is drawn this much bigger than the game's
  hunterSpeed: 70, boarSpeed: 25, waryFleeSpeed: 35, sprintSpeed: 110, // px per second (field px)
  wary: 80,             // a calm boar backs off from the hunter this close
  hideSeconds: 4,       // a wounded boar stays hidden in the grass this long
  boarHits: 3,          // blows to kill one
  strikeReach: 26, strikeSeconds: 0.6,
  butcherSeconds: 2,    // as the boar's butcherSeconds in Endless
  boars: 2, maxGrass: 7, trees: 6, stones: 4
};

const menuScene = {
  canvas: document.getElementById('menu-scene'),
  width: 0, height: 0,  // field px (CSS px / scale)
  hunter: { x: 100, y: 100, facing: 0, swing: 0, cooldown: 0, carrying: null, work: 0, faction: 'humans' },
  boars: [],
  grass: [],
  trees: [],
  stones: [],
  warehouse: null,
  target: null,         // the boar the player tapped
  panel: null, panelKey: '', // the menu panel's rect this frame (field px)
  grassTimer: 0,
  last: 0
};

const randomIn = (min, max) => min + Math.random() * (max - min);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Where the menu's panel is, in field px (with a margin): nothing goes there
function measureMenuPanel() {
  const panel = [...document.querySelectorAll('#main-menu .main-menu-content')].find(p => !p.hidden);
  if (!panel) return null;
  const r = panel.getBoundingClientRect(), k = MENU_SCENE.scale, m = 14;
  return { left: r.left / k - m, top: r.top / k - m, right: r.right / k + m, bottom: r.bottom / k + m };
}
const menuPanelRect = () => menuScene.panel;

function inPanel(p, rect = menuPanelRect(), pad = 0) {
  return !!rect && p.x > rect.left - pad && p.x < rect.right + pad && p.y > rect.top - pad && p.y < rect.bottom + pad;
}

// A free tile centre on the field, a tile clear of the panel (so the hunter can stand by it) and off
// everything standing
function menuSceneTile(margin = 1) {
  const cols = Math.floor(menuScene.width / TILE_SIZE), rows = Math.floor(menuScene.height / TILE_SIZE);
  const taken = [...menuScene.grass, ...menuScene.trees, ...menuScene.stones, menuScene.warehouse].filter(Boolean);
  const rect = menuPanelRect();
  for (let attempt = 0; attempt < 80; attempt++) {
    const p = {
      x: (margin + Math.floor(Math.random() * Math.max(1, cols - 2 * margin))) * TILE_SIZE + 15,
      y: (margin + Math.floor(Math.random() * Math.max(1, rows - 2 * margin))) * TILE_SIZE + 15
    };
    if (!inPanel(p, rect, TILE_SIZE) && !taken.some(o => o.x === p.x && o.y === p.y)) return p;
  }
  return { x: 15 + TILE_SIZE, y: 15 + TILE_SIZE };
}

// Out of the panel's way: a unit inside it is put back over its nearest edge
function keepOutOfPanel(unit) {
  const rect = menuPanelRect();
  if (!inPanel(unit, rect)) return;
  const out = [[rect.left - unit.x, 0], [rect.right - unit.x, 0], [0, rect.top - unit.y], [0, rect.bottom - unit.y]]
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
  unit.x += out[0]; unit.y += out[1];
}

function newMenuBoar() {
  // in from a random edge
  const side = Math.floor(Math.random() * 4), w = menuScene.width, h = menuScene.height;
  const x = side === 0 ? -20 : side === 1 ? w + 20 : randomIn(0, w);
  const y = side === 2 ? -20 : side === 3 ? h + 20 : randomIn(0, h);
  return { x, y, hp: MENU_SCENE.boarHits, target: menuSceneTile(), state: 'wander', timer: randomIn(2, 5), hiddenIn: null };
}

function resizeMenuScene() {
  const ratio = window.devicePixelRatio || 1;
  menuScene.canvas.width = Math.round(window.innerWidth * ratio);
  menuScene.canvas.height = Math.round(window.innerHeight * ratio);
  menuScene.width = window.innerWidth / MENU_SCENE.scale;
  menuScene.height = window.innerHeight / MENU_SCENE.scale;
  menuScene.panel = measureMenuPanel();
  menuScene.panelKey = JSON.stringify(menuScene.panel);
  menuScene.grass = []; menuScene.trees = []; menuScene.stones = []; menuScene.warehouse = null;
  menuScene.warehouse = menuSceneTile(2);
  for (let i = 0; i < MENU_SCENE.trees; i++) menuScene.trees.push(menuSceneTile());
  for (let i = 0; i < MENU_SCENE.stones; i++) menuScene.stones.push(menuSceneTile());
}

// Whether the straight way from a to b goes over the panel (sampled along it)
function crossesPanel(a, b, rect) {
  for (let i = 1; i < 20; i++) {
    if (inPanel({ x: a.x + (b.x - a.x) * i / 20, y: a.y + (b.y - a.y) * i / 20 }, rect)) return true;
  }
  return false;
}

// Where to head for `target`: straight there, or the first corner of the shortest way round the panel
function aroundPanel(unit, target) {
  const rect = menuPanelRect();
  if (!rect || !crossesPanel(unit, target, rect)) return target;
  const pad = 6;
  const nodes = [unit, target, ...[[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]]
    .map(([x, y]) => ({ x: x + (x === rect.left ? -pad : pad), y: y + (y === rect.top ? -pad : pad) }))];
  // Dijkstra over the six points, from the unit
  const cost = nodes.map((n, i) => (i === 0 ? 0 : Infinity)), first = [], done = new Set();
  while (done.size < nodes.length) {
    let i = -1;
    nodes.forEach((n, j) => { if (!done.has(j) && (i < 0 || cost[j] < cost[i])) i = j; });
    if (cost[i] === Infinity) break;
    done.add(i);
    nodes.forEach((n, j) => {
      if (done.has(j) || crossesPanel(nodes[i], n, rect)) return;
      const c = cost[i] + distance(nodes[i], n);
      if (c < cost[j]) { cost[j] = c; first[j] = i === 0 ? n : first[i]; }
    });
  }
  return first[1] || target;
}

function moveToward(unit, target, speed, dt) {
  const way = aroundPanel(unit, target);
  if (way !== target) { stepToward(unit, way, speed, dt); return distance(unit, target); }
  return stepToward(unit, target, speed, dt);
}

function stepToward(unit, target, speed, dt) {
  const dx = target.x - unit.x, dy = target.y - unit.y, d = Math.hypot(dx, dy);
  if (d < 1) return 0;
  const step = Math.min(d, speed * dt);
  unit.x += dx / d * step;
  unit.y += dy / d * step;
  return d;
}

function nearestGrass(from) {
  const free = menuScene.grass.filter(g => !menuScene.boars.some(b => b.hiddenIn === g));
  return free.length ? free.reduce((a, b) => (distance(a, from) < distance(b, from) ? a : b)) : null;
}

function updateMenuBoars(dt) {
  const { hunter, boars, grass } = menuScene;
  while (boars.length < MENU_SCENE.boars) boars.push(newMenuBoar());
  for (const boar of boars) {
    if (boar.state === 'hide') {
      boar.timer -= dt;
      if (boar.timer <= 0 || !grass.includes(boar.hiddenIn)) Object.assign(boar, { state: 'wander', hiddenIn: null, target: menuSceneTile(), timer: 3 });
    } else if (boar.state === 'sprint') {
      // wounded: to the grass, and hide there
      if (!grass.includes(boar.target)) boar.target = nearestGrass(boar) || menuSceneTile();
      if (moveToward(boar, boar.target, MENU_SCENE.sprintSpeed, dt) < 4) {
        if (grass.includes(boar.target)) Object.assign(boar, { state: 'hide', hiddenIn: boar.target, timer: MENU_SCENE.hideSeconds });
        else Object.assign(boar, { state: 'wander', timer: 2 });
      }
    } else if (boar.state === 'wander') {
      const fromHunter = distance(boar, hunter);
      if (fromHunter < MENU_SCENE.wary && fromHunter > 1) {
        // wary: backs off, slower than the hunter, so it can be caught
        boar.x += (boar.x - hunter.x) / fromHunter * MENU_SCENE.waryFleeSpeed * dt;
        boar.y += (boar.y - hunter.y) / fromHunter * MENU_SCENE.waryFleeSpeed * dt;
        boar.x = Math.max(10, Math.min(menuScene.width - 10, boar.x));
        boar.y = Math.max(10, Math.min(menuScene.height - 10, boar.y));
      } else {
        boar.timer -= dt;
        if (boar.timer <= 0 || moveToward(boar, boar.target, MENU_SCENE.boarSpeed, dt) < 4) { boar.target = menuSceneTile(); boar.timer = randomIn(3, 6); }
      }
    }
    if (boar.state !== 'carcass') keepOutOfPanel(boar);
  }
}

function updateMenuHunter(dt) {
  const { hunter, boars, warehouse } = menuScene;
  hunter.swing = Math.max(0, hunter.swing - dt);
  hunter.cooldown = Math.max(0, hunter.cooldown - dt);
  const go = (target, speed = MENU_SCENE.hunterSpeed, stopAt = 0) => {
    hunter.facing = Math.atan2(target.y - hunter.y, target.x - hunter.x);
    const d = distance(target, hunter);
    if (d > stopAt) moveToward(hunter, { x: target.x - Math.cos(hunter.facing) * stopAt, y: target.y - Math.sin(hunter.facing) * stopAt }, speed, dt);
    return d;
  };

  // carrying meat: up to the warehouse, beside it
  if (hunter.carrying) {
    if (go(warehouse, MENU_SCENE.hunterSpeed, 20) < 24) hunter.carrying = null;
  } else {
    const carcass = boars.find(b => b.state === 'carcass');
    if (carcass) {
      // as in Endless: beside the carcass, butchering it for a while with the blade going
      if (go(carcass, MENU_SCENE.hunterSpeed, 16) > 20) {
        hunter.work = 0;
      } else {
        hunter.work += dt;
        if (hunter.swing <= 0) hunter.swing = 0.3;
        if (hunter.work >= MENU_SCENE.butcherSeconds) {
          hunter.work = 0;
          hunter.carrying = 'rawMeat';
          boars.splice(boars.indexOf(carcass), 1);
          if (menuScene.target === carcass) menuScene.target = null;
        }
      }
    } else {
      // the boar the player picked, or the nearest it can see: up to it, and a blow
      const visible = b => b.state === 'wander' || b.state === 'sprint';
      if (menuScene.target && !boars.includes(menuScene.target)) menuScene.target = null;
      const prey = (menuScene.target && visible(menuScene.target) ? menuScene.target : null) ||
        boars.filter(visible).sort((a, b) => distance(a, hunter) - distance(b, hunter))[0];
      if (prey) {
        if (go(prey) < MENU_SCENE.strikeReach && hunter.cooldown <= 0) {
          hunter.swing = 0.3;
          hunter.cooldown = MENU_SCENE.strikeSeconds;
          prey.hp--;
          if (prey.hp <= 0) Object.assign(prey, { state: 'carcass' });
          else Object.assign(prey, { state: 'sprint', target: nearestGrass(prey) || menuSceneTile() });
        }
      } else {
        // everything hiding: stroll
        if (!hunter.stroll || distance(hunter.stroll, hunter) < 5) hunter.stroll = menuSceneTile();
        go(hunter.stroll, MENU_SCENE.hunterSpeed * 0.4);
      }
    }
  }
  keepOutOfPanel(hunter);
}

function updateMenuScene(dt) {
  const { boars, grass } = menuScene;
  // grass comes and goes, on tiles (never the tuft a boar is hiding in or running to)
  menuScene.grassTimer -= dt;
  if (menuScene.grassTimer <= 0) {
    menuScene.grassTimer = randomIn(2, 4);
    if (grass.length >= MENU_SCENE.maxGrass || (grass.length > 3 && Math.random() < 0.3)) {
      const free = grass.filter(g => !boars.some(b => b.hiddenIn === g || b.target === g));
      if (free.length) grass.splice(grass.indexOf(free[0]), 1);
    }
    if (grass.length < MENU_SCENE.maxGrass) grass.push(menuSceneTile());
  }
  updateMenuBoars(dt);
  updateMenuHunter(dt);
}

// The hunter as a settler of its faction: a soldier's shade of the faction's colour, and a demon's horns
function menuHunterColor() {
  return shadeColor(GAME_CONFIG.factions[menuScene.hunter.faction].color, -0.28);
}

function drawMenuScene() {
  const c = menuScene.canvas.getContext('2d');
  const ratio = menuScene.canvas.width / Math.max(1, window.innerWidth);
  c.setTransform(ratio * MENU_SCENE.scale, 0, 0, ratio * MENU_SCENE.scale, 0, 0);
  // grass ground in the map's shades
  for (let gy = 0; gy * TILE_SIZE < menuScene.height; gy++) {
    for (let gx = 0; gx * TILE_SIZE < menuScene.width; gx++) {
      c.fillStyle = GRASS_SHADES[tileVariantHash(gx, gy) % GRASS_SHADES.length];
      c.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  // stones and trees as the game draws them
  for (const b of menuScene.stones) {
    c.fillStyle = '#7f8c8d'; c.fillRect(b.x - 11, b.y - 11, 22, 22);
    c.fillStyle = '#a4b0b5'; c.fillRect(b.x - 11, b.y - 11, 22, 5); c.fillRect(b.x - 11, b.y - 11, 5, 22);
    c.strokeStyle = '#5d6d7e'; c.lineWidth = 2; c.strokeRect(b.x - 11, b.y - 11, 22, 22);
  }
  for (const t of menuScene.trees) {
    c.fillStyle = '#1e3d14'; c.beginPath(); c.arc(t.x, t.y, 14, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2e5d20'; c.beginPath(); c.arc(t.x - 3, t.y - 3, 9, 0, Math.PI * 2); c.fill();
  }
  const w = menuScene.warehouse;
  drawIcon(c, 'warehouse', w.x, w.y, 28);
  // grass tufts as the game draws them
  c.fillStyle = '#2ecc71';
  for (const g of menuScene.grass) {
    c.fillRect(g.x - 6, g.y - 8, 3, 16); c.fillRect(g.x - 1, g.y - 10, 3, 18); c.fillRect(g.x + 4, g.y - 6, 3, 14);
  }
  // boars as the game draws them: hidden ones faint, a dead one darker; the one picked ringed
  for (const boar of menuScene.boars) {
    c.globalAlpha = boar.state === 'hide' ? 0.4 : 1;
    c.fillStyle = boar.state === 'carcass' ? '#6d3a1f' : '#a0522d';
    c.beginPath(); c.arc(boar.x, boar.y, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3e2723'; c.lineWidth = 2; c.stroke();
    drawIcon(c, 'boar', boar.x, boar.y, 17);
    if (boar === menuScene.target) { c.strokeStyle = '#ff5c5c'; c.lineWidth = 2; c.beginPath(); c.arc(boar.x, boar.y, 16, 0, Math.PI * 2); c.stroke(); }
    if (boar.hp < MENU_SCENE.boarHits && boar.state !== 'carcass') {
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(boar.x - 12, boar.y - 16, 24, 3);
      c.fillStyle = '#e74c3c'; c.fillRect(boar.x - 12, boar.y - 16, 24 * boar.hp / MENU_SCENE.boarHits, 3);
    }
    c.globalAlpha = 1;
  }
  // the hunter: a soldier of its faction with a spear, thrusting when it strikes
  const h = menuScene.hunter;
  c.save();
  c.translate(h.x, h.y); c.rotate(h.facing); c.translate(h.swing > 0 ? 8 * Math.sin(Math.PI * h.swing / 0.3) : 0, 0);
  c.fillStyle = '#8e5a2b'; c.fillRect(6, -1, 22, 3);
  c.fillStyle = '#ecf0f1'; c.beginPath(); c.moveTo(28, -3); c.lineTo(35, 0); c.lineTo(28, 3); c.fill();
  c.restore();
  c.fillStyle = menuHunterColor(); c.beginPath(); c.arc(h.x, h.y, 11, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1e272e'; c.lineWidth = 2; c.stroke();
  if (h.faction === 'demons') {
    c.fillStyle = '#2c2c34';
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(h.x + side * 4, h.y - 9); c.lineTo(h.x + side * 8, h.y - 16); c.lineTo(h.x + side * 9, h.y - 6); c.closePath(); c.fill(); }
  }
  if (h.carrying) drawIcon(c, h.carrying, h.x, h.y - 20, 13);
}

// A tap on the field (not on the panel): the hunter changes faction; a boar becomes the one to hunt
function menuSceneTap(clientX, clientY) {
  const p = { x: clientX / MENU_SCENE.scale, y: clientY / MENU_SCENE.scale };
  if (distance(p, menuScene.hunter) < 20) {
    const factions = Object.values(GAME_CONFIG.factions).filter(f => f.ready).map(f => f.id);
    menuScene.hunter.faction = factions[(factions.indexOf(menuScene.hunter.faction) + 1) % factions.length];
    return;
  }
  const boar = menuScene.boars.find(b => b.state !== 'carcass' && distance(p, b) < 20);
  if (boar) menuScene.target = boar;
}

function menuSceneFrame(now) {
  requestAnimationFrame(menuSceneFrame);
  const showing = getComputedStyle(document.getElementById('main-menu')).display !== 'none';
  const dt = Math.min(0.05, (now - (menuScene.last || now)) / 1000);
  menuScene.last = now;
  if (!showing) return;
  // re-laid when the window or the panel (another menu screen) changes, so nothing stands behind it
  menuScene.panel = measureMenuPanel();
  if (menuScene.canvas.width !== Math.round(window.innerWidth * (window.devicePixelRatio || 1)) ||
    JSON.stringify(menuScene.panel) !== menuScene.panelKey) resizeMenuScene();
  updateMenuScene(dt);
  drawMenuScene();
}

// taps reach the scene through the menu's background (the panel keeps its own)
document.getElementById('main-menu').addEventListener('click', e => {
  if (e.target.id === 'main-menu' || e.target.id === 'menu-scene') menuSceneTap(e.clientX, e.clientY);
});

resizeMenuScene();
requestAnimationFrame(menuSceneFrame);
