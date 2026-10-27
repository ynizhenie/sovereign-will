// Behind the main menu: a little Endless world, run and drawn by the game itself
// (update() and render()), so everything in it behaves exactly as in the game. The town hall is drawn as a
// warehouse (no hall in the menu, #200), as big as one in the game (#256). Each time the menu opens, one of
// its scenes (#256), each by itself, as in the game:
//  - the hunt: a soldier with a spear hunts boars, butchers them, carries the meat in; tapping it changes
//    its faction, tapping a boar marks it, as in the game;
//  - fishing: a fisher at the water digs worms for bait and fishes, carries the fish in; a cook at the
//    campfire by it cooks them;
//  - a fight: a small squad (two swords with shields, a medic in armour) against zombies that keep coming
//    in twos from the map's edge (#279), faster and faster, till they fall, and a new squad comes; a tap on a zombie kills it;
//  - the farm: a farmer with a backpack, a hoe and a watering can plants a wheat field, waters it, brings
//    it dung from the compost heap.
// No waves come and nobody gets hungry. The world is made to fit the screen: its centre is the screen's,
// with the hall and what's around it laid out over all of the screen (the panel is over it). The menu can be put away to
// watch, and the scene changed there (#256).

import { GAME_CONFIG } from '../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, townHall } from '../../engine/world/index.js';
import { camera, canvas, fitCanvasToScreen, getBaseScale, mouse, onTap, screenPixelRatio, updateInputPos } from '../../engine/platform/index.js';
import { getPlayerFaction } from '../../domains/factions/index.js';
import { changeSettlerType, createSettler } from '../../domains/colony/settlers/index.js';
import { putOnGear } from '../../domains/colony/equipment/index.js';
import { stock } from '../../domains/colony/storage/index.js';
import { createConfiguredEnemy } from '../../domains/conflict/waves/index.js';
import { resetGame } from '../../app/index.js';

export const MENU_WORLD = {
  cssScale: 1.6,        // CSS pixels per world unit, a size up from the game's usual view
  boars: 3, trees: 7, boulders: 4, grass: 7,
  warehouseHp: 300 // (the fight's: the zombies can break it, #279)
};

export const MENU_SCENES = ['hunt', 'fishing', 'fight', 'farm'];

export const menuWorld = {
  faction: 'humans',    // whose the soldier is (see getPlayerFaction)
  size: '',             // the screen it was made for: made again when that changes
  opened: false,        // the game's opening done: the curtain lifted (style.css)
  scene: '',            // which scene (MENU_SCENES): picked at random each time the menu opens
  fight: { next: 0, gap: 0, down: 0 } // the fight's clock (tickMenuScene)
};

export function isMenuWorld() {
  return game.gameMode === 'menu';
}

// Make the world and show it behind the menu: the scene it had (the screen's size changed), `scene`, or a new
// one at random
export function enterMenuWorld(scene = '') {
  if (scene) menuWorld.scene = scene;
  else if (!menuWorld.scene || !isMenuWorld()) menuWorld.scene = MENU_SCENES[Math.floor(Math.random() * MENU_SCENES.length)];
  if (menuWorld.scene !== 'hunt') menuWorld.faction = 'humans'; // (the others are the humans')
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
  // (#326) laid out over the whole screen, the menu's panel or not: the same at launch as by a hand-changed scene
  const v0 = toWorld(view.left, view.top), v1 = toWorld(view.right, view.bottom);

  // (#326) the hall in the middle of the screen, always (it went beside the panel, but in the middle when the
  // scene was changed by hand, with the panel put away)
  const strip = { x: centre.x, y: centre.y };
  const hall = [Math.round(strip.x / TILE_SIZE) * TILE_SIZE, Math.round(strip.y / TILE_SIZE) * TILE_SIZE];
  const hg = [hall[0] / TILE_SIZE, hall[1] / TILE_SIZE]; // the hall stands on tiles hg-1..hg

  const taken = new Set();
  const tileFree = (gx, gy) => !taken.has(`${gx},${gy}`) &&
    gx * TILE_SIZE >= v0.x && (gx + 1) * TILE_SIZE <= v1.x && gy * TILE_SIZE >= v0.y && (gy + 1) * TILE_SIZE <= v1.y;
  // round the hall: nothing within 2 tiles of it
  for (let gy = hg[1] - 3; gy <= hg[1] + 2; gy++) for (let gx = hg[0] - 3; gx <= hg[0] + 2; gx++) taken.add(`${gx},${gy}`);
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

  const sceneName = menuWorld.scene;
  // a tile beside the hall (it's on hg-1..hg), the scene laid out towards the screen's middle: by a hall low on
  // the screen, its things go up, and so on
  const sx = hall[0] > centre.x ? -1 : 1, sy = hall[1] > centre.y ? -1 : 1;
  const near = (dx, dy) => [hg[0] + (sx > 0 ? dx : -dx - 1), hg[1] + (sy > 0 ? dy : -dy - 1)];
  /** @type {any} */
  const map = {
    cols, rows, hall,
    resources: { tree: some(MENU_WORLD.trees), boulder: some(MENU_WORLD.boulders), grass: some(MENU_WORLD.grass) },
    boars: sceneName === 'hunt' ? some(MENU_WORLD.boars) : [],
    buildings: [], water: []
  };
  // what each scene stands on, round the hall
  if (sceneName === 'fishing') {
    map.water = [near(2, 2), near(3, 2), near(2, 3), near(3, 3)];
    map.buildings.push(['campfire', ...near(-3, 1)]);
  } else if (sceneName === 'farm') {
    map.water = [near(-3, 3)];
    map.buildings.push(['dung_heap', ...near(-3, 1)]);
  }
  game.gameMode = 'endless';
  resetGame(map);
  game.gameMode = 'menu';
  game.settlers = [];
  if (sceneName === 'hunt') {
    // one soldier with a spear, of the menu's faction
    const soldier = createSettler(getPlayerFaction().startUnits, 1, hall[0] + 45, hall[1]);
    Object.assign(soldier, { weapon: 'spear', role: 'soldier' });
    game.settlers = [soldier];
  } else if (sceneName === 'fishing') {
    for (const w of game.waterTiles) w.isFishing = w === game.waterTiles[0];
    game.settlers = [Object.assign(createSettler('normal', 1, hall[0] + 45, hall[1]), { tool: 'rod' }), createSettler('normal', 2, hall[0] - 45, hall[1] + 20)];
    Object.assign(stock, { worms: 0, wheatSeeds: 0, wheat: 0, firewood: 99, food: 999 });
  } else if (sceneName === 'fight') {
    menuWorld.fight = { next: 2, gap: 5, down: 0 };
    fightSquad();
  } else if (sceneName === 'farm') {
    const zone = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [3, 2]].map(([dx, dy]) => near(dx, dy));
    for (const [gx, gy] of zone) game.farmZones.push({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15, crop: 'wheat' });
    game.settlers = [Object.assign(createSettler('normal', 1, hall[0] + 45, hall[1]), { tool: 'hoe', backpack: true, wateringCan: true })];
    stock.wheatSeeds = 20;
  }
  game.waveTimer = Infinity;
  camera.x = centre.x; camera.y = centre.y;
  camera.zoom = MENU_WORLD.cssScale * spr / getBaseScale();
  menuWorld.size = `${canvas.width}x${canvas.height}`;
  if (!menuWorld.opened) {
    // the first time, as the page opens: the curtain lifts once the world has been drawn
    menuWorld.opened = true;
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('main-menu').classList.add('lifted')));
  }
}

// The fight's squad (#256): two swords with shields, a medic in armour, by the hall. (#279) They guard the
// warehouse: the zombies can break it, and then the medic has no herbs to fill its bag with
function fightSquad() {
  const h = { x: townHall.x, y: townHall.y };
  townHall.hp = townHall.maxHp = MENU_WORLD.warehouseHp;
  stock.herbs = 20;
  const sword = (id, dy) => Object.assign(createSettler('normal', id, h.x - 50, h.y + dy), { weapon: 'sword', role: 'soldier', shield: true });
  const medic = Object.assign(createSettler('normal', 3, h.x - 70, h.y), { tool: 'medbag', bagHerbs: 3 });
  putOnGear(medic, 'armor');
  game.settlers = [sword(1, -20), sword(2, 20), medic];
}

// Each frame in the menu: what keeps its scene going (#256). The fight: zombies come one after another,
// each a little sooner than the last; the squad gone, the dead are cleared, and a new squad comes. The farm
// and the fishing: seeds, dung and fuel never run out
export function tickMenuScene(dt) {
  if (!isMenuWorld()) return;
  game.settlers.forEach(s => { s.hunger = 999; });
  if (menuWorld.scene === 'fight') {
    const f = menuWorld.fight;
    if (!game.settlers.length) {
      f.down += dt;
      if (f.down > 3) { game.corpses = []; game.enemies = []; f.gap = 5; f.next = 2; f.down = 0; fightSquad(); }
      return;
    }
    f.next -= dt;
    // (#279) two at a time, coming in from the edge of the map
    if (f.next <= 0 && game.enemies.length < 8) {
      const at = edgeSpot();
      for (const dx of [-12, 12]) {
        const z = createConfiguredEnemy({ x: at.x + (at.side ? dx : 0), y: at.y + (at.side ? 0 : dx) }, 'undead_zombie');
        if (z) game.enemies.push(z);
      }
      f.gap = Math.max(2.4, f.gap * 0.93);
      f.next = f.gap;
    }
    if (game.corpses.length > 12) game.corpses.splice(0, game.corpses.length - 12);
    // herbs in the warehouse while it stands; broken, none (#279)
    stock.herbs = townHall.hp > 0 ? Math.max(stock.herbs || 0, 10) : 0;
  } else if (menuWorld.scene === 'farm') {
    stock.wheatSeeds = Math.max(stock.wheatSeeds || 0, 10);
    for (const b of game.buildings) if (b.type === 'dung_heap') b.dung = Math.max(b.dung || 0, 3);
  } else if (menuWorld.scene === 'fishing') {
    stock.firewood = Math.max(stock.firewood || 0, 50);
  }
}

// A spot at the map's edge, on its middle half (side: along the top or bottom edge)
function edgeSpot() {
  const W = game.WORLD_WIDTH, H = game.WORLD_HEIGHT, k = 0.25 + Math.random() * 0.5, e = 12;
  return [{ x: e, y: H * k, side: false }, { x: W - e, y: H * k, side: false }, { x: W * k, y: e, side: true }, { x: W * k, y: H - e, side: true }][Math.floor(Math.random() * 4)];
}

// Back to an ordinary (not running) Endless before a real game, a battle or the editor is set up
export function leaveMenuWorld() {
  document.getElementById('main-menu').classList.add('lifted'); // never dark again
  document.body.classList.remove('menu-ui-hidden');
  game.gameMode = 'endless';
  document.body.classList.remove('menu-world');
}

// A tap on the menu's background: the soldier, a boar, or nothing
export function menuWorldTap(clientX, clientY) {
  if (!isMenuWorld()) return;
  updateInputPos(clientX, clientY);
  const soldier = menuWorld.scene === 'hunt' ? game.settlers[0] : null;
  if (soldier && Math.hypot(mouse.x - soldier.x, mouse.y - soldier.y) < soldier.visualRadius + 12) {
    // the next ready faction: the soldier becomes one of theirs
    const ready = Object.values(GAME_CONFIG.factions).filter(f => f.ready).map(f => f.id);
    menuWorld.faction = ready[(ready.indexOf(menuWorld.faction) + 1) % ready.length];
    changeSettlerType(soldier, getPlayerFaction().startUnits);
    Object.assign(soldier, { weapon: 'spear', role: 'soldier' });
    return;
  }
  // the fight: a zombie tapped falls (#256)
  const zombie = game.enemies.find(en => Math.hypot(mouse.x - en.x, mouse.y - en.y) < en.radius + 12);
  if (zombie) { zombie.hp = 0; return; }
  // a boar, only in the hunt (#279: a tap in the other scenes marked their boars to no end)
  const boar = menuWorld.scene === 'hunt' ? game.boars.find(b => !b.isCarcass && Math.hypot(mouse.x - b.x, mouse.y - b.y) < 22) : null;
  if (boar) {
    // marked, as a tap marks it in the game: the one to hunt
    game.boars.forEach(b => { b.priority = 0; });
    boar.priority = 1;
  }
}

// Each frame (app/main.js): the world runs while the main menu shows and no game is on; made again for a new
// screen size
export function syncMenuWorld() {
  if (game.loading) return; // (#326) a world being made behind the loading screen: the scene waits as it is
  const showing = getComputedStyle(document.getElementById('main-menu')).display !== 'none';
  if (isMenuWorld()) {
    if (!showing || game.gameStarted) { leaveMenuWorld(); return; }
    fitCanvasToScreen();
    if (menuWorld.size !== `${canvas.width}x${canvas.height}`) enterMenuWorld();
    game.waveTimer = Infinity;
  } else if (showing && !game.gameStarted && game.gameMode === 'endless') {
    enterMenuWorld();
  } else {
    document.body.classList.remove('menu-world');
  }
}

// What this file sets up as the game starts (called by app/boot.js)
export function initMenuWorld() {
  document.getElementById('main-menu').addEventListener('click', e => {
    if (/** @type {Element} */ (e.target).id === 'main-menu') menuWorldTap(e.clientX, e.clientY);
  });
  // the menu put away and back, and the next scene (#256)
  onTap(document.getElementById('menu-hide'), () => document.body.classList.add('menu-ui-hidden'));
  onTap(document.getElementById('menu-show'), () => { document.body.classList.remove('menu-ui-hidden'); });
  onTap(document.getElementById('menu-next-scene'), () => {
    if (!isMenuWorld()) return;
    enterMenuWorld(MENU_SCENES[(MENU_SCENES.indexOf(menuWorld.scene) + 1) % MENU_SCENES.length]);
  });
}
