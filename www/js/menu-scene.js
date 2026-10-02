// Behind the main menu (#145): a little scene of its own instead of the game. A settler with a spear
// hunts boars round a grass field forever; a boar it gets close to runs for a tuft of grass and hides
// there for a while, and grass comes and goes. Runs only while the menu shows. Coordinates are CSS pixels.

const menuScene = {
  canvas: document.getElementById('menu-scene'),
  width: 0, height: 0,
  hunter: { x: 120, y: 120, facing: 0, swing: 0 },
  boars: [],
  grass: [],
  grassTimer: 0,
  last: 0
};

const MENU_SCENE = {
  hunterSpeed: 95, boarSpeed: 45, fleeSpeed: 80, // px per second
  wary: 110,        // a boar closer than this to the hunter runs for grass
  hideSeconds: 4,   // how long it stays hidden
  catchReach: 24,
  respawnSeconds: 2,
  boars: 3, maxGrass: 9
};

const randomIn = (min, max) => min + Math.random() * (max - min);

function menuScenePoint(margin = 30) {
  return { x: randomIn(margin, menuScene.width - margin), y: randomIn(margin, menuScene.height - margin) };
}

function newMenuBoar() {
  // in from a random edge
  const side = Math.floor(Math.random() * 4), w = menuScene.width, h = menuScene.height;
  const x = side === 0 ? -20 : side === 1 ? w + 20 : randomIn(0, w);
  const y = side === 2 ? -20 : side === 3 ? h + 20 : randomIn(0, h);
  return { x, y, target: menuScenePoint(), state: 'wander', timer: randomIn(2, 5), hiddenIn: null, alpha: 1 };
}

function resizeMenuScene() {
  const ratio = window.devicePixelRatio || 1;
  menuScene.width = window.innerWidth;
  menuScene.height = window.innerHeight;
  menuScene.canvas.width = Math.round(menuScene.width * ratio);
  menuScene.canvas.height = Math.round(menuScene.height * ratio);
}

function moveToward(unit, target, speed, dt) {
  const dx = target.x - unit.x, dy = target.y - unit.y, d = Math.hypot(dx, dy);
  if (d < 1) return 0;
  const step = Math.min(d, speed * dt);
  unit.x += dx / d * step;
  unit.y += dy / d * step;
  return d;
}

function updateMenuScene(dt) {
  const { hunter, boars, grass } = menuScene;
  // grass comes and goes
  menuScene.grassTimer -= dt;
  if (menuScene.grassTimer <= 0) {
    menuScene.grassTimer = randomIn(2, 4);
    if (grass.length >= MENU_SCENE.maxGrass || (grass.length > 4 && Math.random() < 0.3)) {
      const free = grass.filter(g => !boars.some(b => b.hiddenIn === g));
      if (free.length) grass.splice(grass.indexOf(free[0]), 1);
    }
    if (grass.length < MENU_SCENE.maxGrass) grass.push(menuScenePoint(50));
  }
  while (boars.length < MENU_SCENE.boars) boars.push(newMenuBoar());

  for (const boar of boars) {
    const fromHunter = Math.hypot(boar.x - hunter.x, boar.y - hunter.y);
    if (boar.state === 'caught') {
      boar.alpha = Math.max(0, boar.alpha - dt * 1.5);
      boar.timer -= dt;
      if (boar.timer <= 0) Object.assign(boar, newMenuBoar());
    } else if (boar.state === 'hide') {
      boar.timer -= dt;
      if (boar.timer <= 0 || !grass.includes(boar.hiddenIn)) Object.assign(boar, { state: 'wander', hiddenIn: null, alpha: 1, target: menuScenePoint(), timer: 3 });
    } else if (boar.state === 'flee') {
      if (!grass.includes(boar.target)) boar.state = 'wander';
      else if (moveToward(boar, boar.target, MENU_SCENE.fleeSpeed, dt) < 4) {
        Object.assign(boar, { state: 'hide', hiddenIn: boar.target, alpha: 0.35, timer: MENU_SCENE.hideSeconds });
      }
    } else {
      // wandering; the hunter close by: off to the nearest grass
      if (fromHunter < MENU_SCENE.wary && grass.length) {
        boar.state = 'flee';
        boar.target = grass.reduce((a, b) => (Math.hypot(a.x - boar.x, a.y - boar.y) < Math.hypot(b.x - boar.x, b.y - boar.y) ? a : b));
      } else {
        boar.timer -= dt;
        if (boar.timer <= 0 || moveToward(boar, boar.target, MENU_SCENE.boarSpeed, dt) < 4) { boar.target = menuScenePoint(); boar.timer = randomIn(3, 6); }
      }
    }
  }

  // the hunter goes for the nearest boar it can see, and spears it once in reach
  hunter.swing = Math.max(0, hunter.swing - dt);
  const prey = boars.filter(b => b.state === 'wander' || b.state === 'flee')
    .sort((a, b) => Math.hypot(a.x - hunter.x, a.y - hunter.y) - Math.hypot(b.x - hunter.x, b.y - hunter.y))[0];
  if (prey) {
    hunter.facing = Math.atan2(prey.y - hunter.y, prey.x - hunter.x);
    if (moveToward(hunter, prey, MENU_SCENE.hunterSpeed, dt) < MENU_SCENE.catchReach) {
      hunter.swing = 0.3;
      Object.assign(prey, { state: 'caught', timer: MENU_SCENE.respawnSeconds });
    }
  } else {
    if (!hunter.stroll || Math.hypot(hunter.stroll.x - hunter.x, hunter.stroll.y - hunter.y) < 5) hunter.stroll = menuScenePoint(60);
    hunter.facing = Math.atan2(hunter.stroll.y - hunter.y, hunter.stroll.x - hunter.x);
    moveToward(hunter, hunter.stroll, MENU_SCENE.hunterSpeed * 0.4, dt);
  }
}

function drawMenuScene() {
  const c = menuScene.canvas.getContext('2d');
  const ratio = menuScene.canvas.width / Math.max(1, menuScene.width);
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  // grass ground in the map's shades
  for (let gy = 0; gy * TILE_SIZE < menuScene.height; gy++) {
    for (let gx = 0; gx * TILE_SIZE < menuScene.width; gx++) {
      c.fillStyle = GRASS_SHADES[tileVariantHash(gx, gy) % GRASS_SHADES.length];
      c.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  for (const g of menuScene.grass) drawIcon(c, 'grass', g.x, g.y, 26);
  for (const boar of menuScene.boars) {
    c.globalAlpha = boar.alpha;
    c.fillStyle = '#a0522d'; c.beginPath(); c.arc(boar.x, boar.y, 11, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#3e2723'; c.lineWidth = 2; c.stroke();
    drawIcon(c, 'boar', boar.x, boar.y, 17);
    c.globalAlpha = 1;
  }
  // the hunter: a settler with a spear, thrusting when it strikes
  const h = menuScene.hunter;
  c.save();
  c.translate(h.x, h.y); c.rotate(h.facing); c.translate(h.swing > 0 ? 8 * Math.sin(Math.PI * h.swing / 0.3) : 0, 0);
  c.fillStyle = '#8e5a2b'; c.fillRect(6, -1, 22, 3);
  c.fillStyle = '#ecf0f1'; c.beginPath(); c.moveTo(28, -3); c.lineTo(35, 0); c.lineTo(28, 3); c.fill();
  c.restore();
  c.fillStyle = sides.player.color; c.beginPath(); c.arc(h.x, h.y, 11, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1e272e'; c.lineWidth = 2; c.stroke();
}

function menuSceneFrame(now) {
  requestAnimationFrame(menuSceneFrame);
  const showing = getComputedStyle(document.getElementById('main-menu')).display !== 'none';
  const dt = Math.min(0.05, (now - (menuScene.last || now)) / 1000);
  menuScene.last = now;
  if (!showing) return;
  if (menuScene.width !== window.innerWidth || menuScene.height !== window.innerHeight) resizeMenuScene();
  updateMenuScene(dt);
  drawMenuScene();
}

resizeMenuScene();
requestAnimationFrame(menuSceneFrame);
