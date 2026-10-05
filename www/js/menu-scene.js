// Behind the main menu (#145, #168, #193): a little Endless world, run and drawn by the game itself
// (update() and render()), so everything in it behaves exactly as in the game. A soldier with a spear by
// the town hall hunts boars, butchers them and carries the meat to the warehouse, rests with its spear on
// its back; boars wander, back off, run for the grass. No waves come and nobody gets hungry. Tapping the
// soldier changes its faction; tapping a boar marks it, as a tap does in the game, and the soldier goes
// for it. The world is made to fit the screen: its centre is the screen's, with the hall and what's
// around it beside the menu's panel, not behind it.

const MENU_WORLD = {
  cssScale: 1.6,        // CSS pixels per world unit, a size up from the game's usual view
  boars: 3, trees: 7, boulders: 4, grass: 7
};

const menuWorld = {
  faction: 'humans',    // whose the soldier is (see getPlayerFaction)
  size: ''              // the screen it was made for: made again when that changes
};

function isMenuWorld() {
  return gameMode === 'menu';
}

// The menu's panel on the screen (CSS px), or null
function menuPanelRect() {
  const panel = [...document.querySelectorAll('#main-menu .main-menu-content')].find(p => !p.hidden);
  return panel ? panel.getBoundingClientRect() : null;
}

// Make the world and show it behind the menu
function enterMenuWorld() {
  document.body.classList.add('menu-world');
  fitCanvasToScreen();
  const spr = screenPixelRatio;
  const viewW = canvas.width / spr / MENU_WORLD.cssScale, viewH = canvas.height / spr / MENU_WORLD.cssScale;
  // the view and a margin, the border zone well off the screen
  const cols = Math.max(20, Math.ceil(viewW / TILE_SIZE) + 2 * BORDER_MARGIN + 4);
  const rows = Math.max(20, Math.ceil(viewH / TILE_SIZE) + 2 * BORDER_MARGIN + 4);
  const centre = { x: Math.round(cols / 2) * TILE_SIZE, y: Math.round(rows / 2) * TILE_SIZE };
  // screen (CSS px) -> world, with the world's centre in the screen's
  const view = canvas.getBoundingClientRect();
  const toWorld = (cx, cy) => ({
    x: centre.x + (cx - view.left - view.width / 2) / MENU_WORLD.cssScale,
    y: centre.y + (cy - view.top - view.height / 2) / MENU_WORLD.cssScale
  });
  const panel = menuPanelRect();
  const p0 = panel && toWorld(panel.left, panel.top), p1 = panel && toWorld(panel.right, panel.bottom);
  const behindPanel = (x, y) => !!panel && x > p0.x - TILE_SIZE && x < p1.x + TILE_SIZE && y > p0.y - TILE_SIZE && y < p1.y + TILE_SIZE;
  const v0 = toWorld(view.left, view.top), v1 = toWorld(view.right, view.bottom);

  // the hall in the biggest free strip beside the panel (above, below, left or right of it)
  const strips = panel ? [
    { x: centre.x, y: (v0.y + p0.y) / 2, room: p0.y - v0.y },
    { x: centre.x, y: (p1.y + v1.y) / 2, room: v1.y - p1.y },
    { x: (v0.x + p0.x) / 2, y: centre.y, room: p0.x - v0.x },
    { x: (p1.x + v1.x) / 2, y: centre.y, room: v1.x - p1.x }
  ] : [{ x: centre.x, y: centre.y, room: 1 }];
  const strip = strips.reduce((a, b) => (b.room > a.room ? b : a));
  const hall = [Math.round(strip.x / TILE_SIZE) * TILE_SIZE, Math.round(strip.y / TILE_SIZE) * TILE_SIZE];
  const hg = [hall[0] / TILE_SIZE, hall[1] / TILE_SIZE]; // the hall stands on tiles hg-1..hg

  const taken = new Set();
  const tileFree = (gx, gy) => !taken.has(`${gx},${gy}`) && !behindPanel(gx * TILE_SIZE + 15, gy * TILE_SIZE + 15) &&
    gx * TILE_SIZE >= v0.x && (gx + 1) * TILE_SIZE <= v1.x && gy * TILE_SIZE >= v0.y && (gy + 1) * TILE_SIZE <= v1.y;
  // round the hall: nothing within 2 tiles of it
  for (let gy = hg[1] - 3; gy <= hg[1] + 2; gy++) for (let gx = hg[0] - 3; gx <= hg[0] + 2; gx++) taken.add(`${gx},${gy}`);
  // the warehouse two tiles beside the hall, wherever there's room for it on the screen
  const warehouse = [[hg[0] + 3, hg[1]], [hg[0] - 4, hg[1] - 1], [hg[0], hg[1] + 3], [hg[0] - 1, hg[1] - 4]].find(([gx, gy]) => tileFree(gx, gy)) || [hg[0] + 3, hg[1]];
  taken.add(`${warehouse[0]},${warehouse[1]}`);
  // the rest on free tiles of the screen
  const freeTile = () => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const gx = Math.floor((v0.x + Math.random() * (v1.x - v0.x)) / TILE_SIZE);
      const gy = Math.floor((v0.y + Math.random() * (v1.y - v0.y)) / TILE_SIZE);
      if (!tileFree(gx, gy)) continue;
      taken.add(`${gx},${gy}`);
      return [gx, gy];
    }
    return null;
  };
  const some = n => Array.from({ length: n }, freeTile).filter(Boolean);

  const map = {
    cols, rows, hall,
    resources: { tree: some(MENU_WORLD.trees), boulder: some(MENU_WORLD.boulders), grass: some(MENU_WORLD.grass) },
    boars: some(MENU_WORLD.boars),
    buildings: [['warehouse', ...warehouse]]
  };
  gameMode = 'endless';
  resetGame(map);
  gameMode = 'menu';
  // one soldier with a spear, of the menu's faction
  const soldier = createSettler(getPlayerFaction().startUnits, 1, hall[0] + 45, hall[1]);
  Object.assign(soldier, { weapon: 'spear', role: 'soldier' });
  settlers = [soldier];
  waveTimer = Infinity;
  camera.x = centre.x; camera.y = centre.y;
  camera.zoom = MENU_WORLD.cssScale * spr / getBaseScale();
  menuWorld.size = `${canvas.width}x${canvas.height}`;
}

// Back to an ordinary (not running) Endless before a real game, a battle or the editor is set up
function leaveMenuWorld() {
  gameMode = 'endless';
  document.body.classList.remove('menu-world');
}

// A tap on the menu's background: the soldier, a boar, or nothing
function menuWorldTap(clientX, clientY) {
  if (!isMenuWorld()) return;
  updateInputPos(clientX, clientY);
  const soldier = settlers[0];
  if (soldier && Math.hypot(mouse.x - soldier.x, mouse.y - soldier.y) < soldier.visualRadius + 12) {
    // the next ready faction: the soldier becomes one of theirs
    const ready = Object.values(GAME_CONFIG.factions).filter(f => f.ready).map(f => f.id);
    menuWorld.faction = ready[(ready.indexOf(menuWorld.faction) + 1) % ready.length];
    changeSettlerType(soldier, getPlayerFaction().startUnits);
    Object.assign(soldier, { weapon: 'spear', role: 'soldier' });
    return;
  }
  const boar = boars.find(b => !b.isCarcass && Math.hypot(mouse.x - b.x, mouse.y - b.y) < 22);
  if (boar) {
    // marked, as a tap marks it in the game: the one to hunt
    boars.forEach(b => { b.priority = 0; });
    boar.priority = 1;
  }
}

// Each frame (main.js): the world runs while the main menu shows and no game is on; made again for a new
// screen size
function syncMenuWorld() {
  const showing = getComputedStyle(document.getElementById('main-menu')).display !== 'none';
  if (isMenuWorld()) {
    if (!showing || gameStarted) { leaveMenuWorld(); return; }
    fitCanvasToScreen();
    if (menuWorld.size !== `${canvas.width}x${canvas.height}`) enterMenuWorld();
    waveTimer = Infinity;
  } else if (showing && !gameStarted && gameMode === 'endless') {
    enterMenuWorld();
  } else {
    document.body.classList.remove('menu-world');
  }
}

document.getElementById('main-menu').addEventListener('click', e => {
  if (e.target.id === 'main-menu') menuWorldTap(e.clientX, e.clientY);
});
