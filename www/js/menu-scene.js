// Behind the main menu (#145, #153): a little scene of its own instead of the game, working the way
// Endless does. A settler with a spear hunts boars: a boar it gets close to backs off, a wounded one
// sprints for a tuft of grass and hides there for a while; one it kills it butchers and carries the meat
// to a warehouse that stands somewhere on the field. Grass comes and goes. Runs only while the menu
// shows, drawn a size up (a small field seen close).

const MENU_SCENE = {
  scale: 1.6,           // the field is drawn this much bigger than the game's
  hunterSpeed: 70, boarSpeed: 25, waryFleeSpeed: 35, sprintSpeed: 110, // px per second (field px)
  wary: 80,             // a calm boar backs off from the hunter this close
  hideSeconds: 4,       // a wounded boar stays hidden in the grass this long
  boarHits: 3,          // blows to kill one
  strikeReach: 26, strikeSeconds: 0.6,
  butcherSeconds: 1.2,
  boars: 2, maxGrass: 7
};

const menuScene = {
  canvas: document.getElementById('menu-scene'),
  width: 0, height: 0,  // field px (CSS px / scale)
  hunter: { x: 100, y: 100, facing: 0, swing: 0, cooldown: 0, carrying: null, work: 0 },
  boars: [],
  grass: [],
  warehouse: null,
  grassTimer: 0,
  last: 0
};

const randomIn = (min, max) => min + Math.random() * (max - min);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function menuScenePoint(margin = 30) {
  return { x: randomIn(margin, menuScene.width - margin), y: randomIn(margin, menuScene.height - margin) };
}

function newMenuBoar() {
  // in from a random edge
  const side = Math.floor(Math.random() * 4), w = menuScene.width, h = menuScene.height;
  const x = side === 0 ? -20 : side === 1 ? w + 20 : randomIn(0, w);
  const y = side === 2 ? -20 : side === 3 ? h + 20 : randomIn(0, h);
  return { x, y, hp: MENU_SCENE.boarHits, target: menuScenePoint(), state: 'wander', timer: randomIn(2, 5), hiddenIn: null };
}

function resizeMenuScene() {
  const ratio = window.devicePixelRatio || 1;
  menuScene.canvas.width = Math.round(window.innerWidth * ratio);
  menuScene.canvas.height = Math.round(window.innerHeight * ratio);
  menuScene.width = window.innerWidth / MENU_SCENE.scale;
  menuScene.height = window.innerHeight / MENU_SCENE.scale;
  menuScene.warehouse = menuScenePoint(50);
}

function moveToward(unit, target, speed, dt) {
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
      if (boar.timer <= 0 || !grass.includes(boar.hiddenIn)) Object.assign(boar, { state: 'wander', hiddenIn: null, target: menuScenePoint(), timer: 3 });
    } else if (boar.state === 'sprint') {
      // wounded: to the grass, and hide there
      if (!grass.includes(boar.target)) boar.target = nearestGrass(boar) || menuScenePoint();
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
        if (boar.timer <= 0 || moveToward(boar, boar.target, MENU_SCENE.boarSpeed, dt) < 4) { boar.target = menuScenePoint(); boar.timer = randomIn(3, 6); }
      }
    }
  }
}

function updateMenuHunter(dt) {
  const { hunter, boars, warehouse } = menuScene;
  hunter.swing = Math.max(0, hunter.swing - dt);
  hunter.cooldown = Math.max(0, hunter.cooldown - dt);
  const go = (target, speed = MENU_SCENE.hunterSpeed) => {
    hunter.facing = Math.atan2(target.y - hunter.y, target.x - hunter.x);
    return moveToward(hunter, target, speed, dt);
  };

  // carrying meat: to the warehouse
  if (hunter.carrying) {
    if (go(warehouse) < 18) hunter.carrying = null;
    return;
  }
  // a dead boar: butcher it
  const carcass = boars.find(b => b.state === 'carcass');
  if (carcass) {
    if (go(carcass) > 16) { hunter.work = 0; return; }
    hunter.work += dt;
    hunter.swing = hunter.swing || 0.2;
    if (hunter.work >= MENU_SCENE.butcherSeconds) {
      hunter.work = 0;
      hunter.carrying = 'rawMeat';
      boars.splice(boars.indexOf(carcass), 1);
    }
    return;
  }
  // the nearest boar it can see: up to it, and a blow
  const prey = boars.filter(b => b.state === 'wander' || b.state === 'sprint')
    .sort((a, b) => distance(a, hunter) - distance(b, hunter))[0];
  if (prey) {
    if (go(prey) < MENU_SCENE.strikeReach && hunter.cooldown <= 0) {
      hunter.swing = 0.3;
      hunter.cooldown = MENU_SCENE.strikeSeconds;
      prey.hp--;
      if (prey.hp <= 0) Object.assign(prey, { state: 'carcass' });
      else Object.assign(prey, { state: 'sprint', target: nearestGrass(prey) || menuScenePoint() });
    }
    return;
  }
  // everything hiding: stroll
  if (!hunter.stroll || distance(hunter.stroll, hunter) < 5) hunter.stroll = menuScenePoint(40);
  go(hunter.stroll, MENU_SCENE.hunterSpeed * 0.4);
}

function updateMenuScene(dt) {
  const { boars, grass } = menuScene;
  // grass comes and goes (never the tuft a boar is hiding in)
  menuScene.grassTimer -= dt;
  if (menuScene.grassTimer <= 0) {
    menuScene.grassTimer = randomIn(2, 4);
    if (grass.length >= MENU_SCENE.maxGrass || (grass.length > 3 && Math.random() < 0.3)) {
      const free = grass.filter(g => !boars.some(b => b.hiddenIn === g || b.target === g));
      if (free.length) grass.splice(grass.indexOf(free[0]), 1);
    }
    if (grass.length < MENU_SCENE.maxGrass) grass.push(menuScenePoint(40));
  }
  updateMenuBoars(dt);
  updateMenuHunter(dt);
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
  const w = menuScene.warehouse;
  drawIcon(c, 'warehouse', w.x, w.y, 28);
  // grass tufts as the game draws them
  c.fillStyle = '#2ecc71';
  for (const g of menuScene.grass) {
    c.fillRect(g.x - 6, g.y - 8, 3, 16); c.fillRect(g.x - 1, g.y - 10, 3, 18); c.fillRect(g.x + 4, g.y - 6, 3, 14);
  }
  // boars as the game draws them: hidden ones faint, a dead one on its side
  for (const boar of menuScene.boars) {
    c.globalAlpha = boar.state === 'hide' ? 0.4 : 1;
    c.fillStyle = boar.state === 'carcass' ? '#6d3a1f' : '#a0522d';
    c.beginPath(); c.arc(boar.x, boar.y, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3e2723'; c.lineWidth = 2; c.stroke();
    drawIcon(c, 'boar', boar.x, boar.y, 17);
    if (boar.hp < MENU_SCENE.boarHits && boar.state !== 'carcass') {
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(boar.x - 12, boar.y - 16, 24, 3);
      c.fillStyle = '#e74c3c'; c.fillRect(boar.x - 12, boar.y - 16, 24 * boar.hp / MENU_SCENE.boarHits, 3);
    }
    c.globalAlpha = 1;
  }
  // the hunter: a settler in the colony's colour with a spear, thrusting when it strikes
  const h = menuScene.hunter;
  c.save();
  c.translate(h.x, h.y); c.rotate(h.facing); c.translate(h.swing > 0 ? 8 * Math.sin(Math.PI * h.swing / 0.3) : 0, 0);
  c.fillStyle = '#8e5a2b'; c.fillRect(6, -1, 22, 3);
  c.fillStyle = '#ecf0f1'; c.beginPath(); c.moveTo(28, -3); c.lineTo(35, 0); c.lineTo(28, 3); c.fill();
  c.restore();
  c.fillStyle = sides.player.color; c.beginPath(); c.arc(h.x, h.y, 11, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1e272e'; c.lineWidth = 2; c.stroke();
  if (h.carrying) drawIcon(c, h.carrying, h.x, h.y - 20, 13);
}

function menuSceneFrame(now) {
  requestAnimationFrame(menuSceneFrame);
  const showing = getComputedStyle(document.getElementById('main-menu')).display !== 'none';
  const dt = Math.min(0.05, (now - (menuScene.last || now)) / 1000);
  menuScene.last = now;
  if (!showing) return;
  if (menuScene.canvas.width !== Math.round(window.innerWidth * (window.devicePixelRatio || 1))) resizeMenuScene();
  updateMenuScene(dt);
  drawMenuScene();
}

resizeMenuScene();
requestAnimationFrame(menuSceneFrame);
