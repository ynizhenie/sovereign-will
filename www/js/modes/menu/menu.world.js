// Behind the main menu: a little Endless world, run and drawn by the game itself
// (update() and render()), so everything in it behaves exactly as in the game. The town hall is drawn as a
// warehouse, or as an outpost in fight scenes (no hall in the menu, #200), as big as one in the game (#256). Each time the menu opens, one of
// its scenes (#256), each by itself, as in the game:
//  - the hunt: a soldier with a spear hunts boars, butchers them, carries the meat in; tapping it changes
//    its faction, tapping a boar marks it, as in the game;
//  - fishing: a fisher at the water digs worms for bait and fishes, carries the fish in; a cook at the
//    campfire by it cooks them;
//  - a fight: a small squad (two swords with shields, a medic in armour) against zombies that keep coming
//    in growing groups from the map's edge (#279), faster and faster, till they fall, and a new squad comes; a tap on a zombie kills it;
//  - the demon: a big, armoured demon fights humans and eats a corpse to heal before the next group arrives;
//  - the graveyard: a necromancer works the graves while ghosts hover around them;
//  - the farm: a farmer with a backpack, a hoe and a watering can plants a wheat or rice field, waters it,
//    brings it dung from the compost heap.
// No waves come and nobody gets hungry. The world is made to fit the screen: its centre is the screen's,
// with the hall and what's around it laid out over all of the screen (the panel is over it). The menu can be put away to
// watch, and the scene changed there (#256).

import { GAME_CONFIG } from '../../content/configs/index.js';
import { BORDER_MARGIN, TILE_SIZE, game, townHall } from '../../engine/world/index.js';
import { camera, canvas, fitCanvasToScreen, getBaseScale, mouse, onTap, screenPixelRatio, updateInputPos } from '../../engine/platform/index.js';
import { isTileBlockedForEnemyStrict, moveEntityTowards } from '../../engine/movement/index.js';
import { applyFactionCosts, getPlayerFaction } from '../../domains/factions/index.js';
import { changeSettlerType, createSettler, getUnitLevel } from '../../domains/colony/settlers/index.js';
import { putOnGear } from '../../domains/colony/equipment/index.js';
import { stock } from '../../domains/colony/storage/index.js';
import { createConfiguredEnemy } from '../../domains/conflict/waves/index.js';
import { prewarmMenuScene, resetGame } from '../../app/index.js';

const MENU_STOCK_START_DELAY = 2;
const MENU_OUTPOST_HP = 300; // same as the menu fight's warehouse base

export const MENU_WORLD = {
  cssScale: 1.6,        // CSS pixels per world unit, a size up from the game's usual view
  boars: 3, trees: 7, boulders: 4, grass: 7,
};

const DEMON_PATROL_OFFSETS = [[-140, 0], [-100, -100], [0, -140], [100, -100], [140, 0], [100, 100], [0, 140], [-100, 100]];

export const MENU_SCENES = ['hunt', 'fishing', 'fight', 'farm', 'demon', 'graveyard'];

export const menuWorld = {
  faction: 'humans',    // whose the soldier is (see getPlayerFaction)
  huntFaction: 'humans',
  playerColor: GAME_CONFIG.factionColors[0],
  enemyColor: GAME_CONFIG.factionColors[1],
  size: '',             // the screen it was made for: made again when that changes
  opened: false,        // the game's opening done: the curtain lifted (style.css)
  scene: '',            // which scene (MENU_SCENES): picked at random each time the menu opens
  terrain: 'grassland',
  farmCrop: 'wheat',
  stockAge: 0,
  fight: { next: 0, gap: 0, down: 0 }, // the fight's clock (tickMenuScene)
  demonFight: { next: 0, gap: 6, down: 0, groups: 0, awaitingMeal: false, patrolIndex: 0 }
};

export function isMenuWorld() {
  return game.gameMode === 'menu';
}

// Make the world and show it behind the menu: the scene it had (the screen's size changed), `scene`, or a new
// one at random
export function enterMenuWorld(scene = '') {
  const wasMenuWorld = isMenuWorld();
  const previousScene = menuWorld.scene;
  if (scene) menuWorld.scene = scene;
  else if (!menuWorld.scene || !isMenuWorld()) menuWorld.scene = MENU_SCENES[Math.floor(Math.random() * MENU_SCENES.length)];
  const sceneChanged = !wasMenuWorld || previousScene !== menuWorld.scene;
  if (sceneChanged || scene) {
    menuWorld.terrain = Math.random() < 0.5 ? 'grassland' : 'savanna';
  }
  if (sceneChanged) pickMenuSideColors();
  if (menuWorld.scene === 'farm' && (sceneChanged || scene === 'farm')) menuWorld.farmCrop = Math.random() < 0.5 ? 'wheat' : 'rice';
  if (menuWorld.scene === 'demon') menuWorld.faction = 'demons';
  else if (menuWorld.scene === 'hunt') menuWorld.faction = menuWorld.huntFaction;
  else if (menuWorld.scene === 'graveyard') {
    menuWorld.faction = 'undead';
  } else menuWorld.faction = 'humans'; // (the others are the humans')
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
  const farmZone = sceneName === 'farm'
    ? [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [3, 2]].map(([dx, dy]) => near(dx, dy))
    : [];
  for (const [gx, gy] of farmZone) taken.add(`${gx},${gy}`);
  if (sceneName === 'farm') {
    const [waterX, waterY] = near(-3, 3);
    taken.add(`${waterX},${waterY}`);
  }
  const graveSites = [];
  if (sceneName === 'graveyard') {
    const candidates = [];
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) if (tileFree(gx, gy)) candidates.push([gx, gy]);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const [gx, gy] of candidates) {
      if (graveSites.every(([x, y]) => Math.max(Math.abs(gx - x), Math.abs(gy - y)) > 1)) {
        graveSites.push([gx, gy]);
        taken.add(`${gx},${gy}`);
        if (graveSites.length === 8) break;
      }
    }
    // (a small screen with no free tile left: one grave beside the hall all the same, the scene stands on it)
    if (!graveSites.length) graveSites.push(near(3, 1));
  }
  const terrainTiles = [];
  if (menuWorld.terrain === 'savanna') {
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) terrainTiles.push([gx, gy]);
  }
  /** @type {any} */
  const map = {
    menuScene: true, cols, rows, hall,
    ...(menuWorld.terrain === 'savanna' ? { savanna: terrainTiles } : {}),
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
  } else if (sceneName === 'graveyard') {
    map.buildings.push(...graveSites.map(([gx, gy]) => ['grave', gx, gy]));
  }
  game.gameMode = 'endless';
  resetGame(map);
  clearShoreResources();
  for (const id of Object.keys(stock)) stock[id] = 0;
  game.foodMix = {};
  game.gameMode = 'menu';
  game.menuScene = sceneName;
  const outpostScene = sceneName === 'fight' || sceneName === 'demon';
  townHall.hp = townHall.maxHp = outpostScene ? MENU_OUTPOST_HP : Infinity;
  applyFactionCosts(); // (#326) use the scene's faction, not the Endless settings used to build the map
  menuWorld.stockAge = 0;
  game.settlers = [];
  if (sceneName === 'hunt') {
    // one soldier with a spear, of the menu's faction
    const soldier = createSettler(getPlayerFaction().startUnits, 1, hall[0] + 45, hall[1]);
    Object.assign(soldier, { weapon: 'spear', role: 'soldier' });
    game.settlers = [soldier];
  } else if (sceneName === 'fishing') {
    for (const w of game.waterTiles) w.isFishing = w === game.waterTiles[0];
    game.settlers = [Object.assign(createSettler('normal', 1, hall[0] + 45, hall[1]), { tool: 'rod' }), createSettler('normal', 2, hall[0] - 45, hall[1] + 20)];
  } else if (sceneName === 'fight') {
    menuWorld.fight = { next: 2, gap: 5, down: 0 };
    fightSquad();
  } else if (sceneName === 'demon') {
    menuWorld.demonFight = { next: 2, gap: 6, down: 0, groups: 0, awaitingMeal: false, patrolIndex: 0 };
    demonSquad();
  } else if (sceneName === 'graveyard') {
    const graves = game.buildings.filter(building => building.type === 'grave');
    const necromancer = Object.assign(createSettler('zombie', 1, graves[0].x + 24, graves[0].y + 8), { tool: 'necro_staff' });
    putOnGear(necromancer, 'soul_lantern');
    game.settlers = [necromancer, createSettler('ghost', 101, graves[0].x - 18, graves[0].y + 12)];
    for (const grave of graves) grave.rest = 0;
  } else if (sceneName === 'farm') {
    for (const [gx, gy] of farmZone) game.farmZones.push({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15, crop: menuWorld.farmCrop });
    game.settlers = [Object.assign(createSettler('normal', 1, hall[0] + 45, hall[1]), { tool: 'hoe', backpack: true, wateringCan: true })];
    if (menuWorld.farmCrop === 'rice') stock.riceSeeds = Infinity;
    else stock.wheatSeeds = Infinity;
  }
  game.waveTimer = Infinity;
  camera.x = centre.x; camera.y = centre.y;
  camera.zoom = MENU_WORLD.cssScale * spr / getBaseScale();
  if (menuWorld.opened) prewarmMenuScene();
  menuWorld.size = `${canvas.width}x${canvas.height}`;
  if (!menuWorld.opened) {
    // the first time, as the page opens: the curtain lifts once the world has been drawn
    menuWorld.opened = true;
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('main-menu').classList.add('lifted')));
  }
}

function pickMenuSideColors() {
  const colors = [...GAME_CONFIG.factionColors];
  const playerIndex = Math.floor(Math.random() * colors.length);
  menuWorld.playerColor = colors.splice(playerIndex, 1)[0];
  menuWorld.enemyColor = colors[Math.floor(Math.random() * colors.length)];
}

function clearShoreResources() {
  const water = new Set(game.waterTiles.map(tile => `${tile.x},${tile.y}`));
  const sand = new Set([...game.desertTiles, ...game.beachTiles].map(tile => `${tile.x},${tile.y}`));
  const allowedOnSand = new Set(['natural_rock', 'cactus', 'boulder', 'pebble']);
  for (const [kind, definition] of Object.entries(GAME_CONFIG.mapResources)) {
    const resources = game[definition.list];
    if (!Array.isArray(resources)) continue;
    game[definition.list] = resources.filter(resource => {
      const key = `${resource.x},${resource.y}`;
      return !water.has(key) && (!sand.has(key) || allowedOnSand.has(kind));
    });
  }
}

// The fight's squad (#256): two swords with shields, a medic in armour, by the hall. (#279) They guard the
// outpost: the zombies can break it, and then the medic has no herbs to fill its bag with
function fightSquad() {
  const h = { x: townHall.x, y: townHall.y };
  const sword = (id, dy) => Object.assign(createSettler('normal', id, h.x - 50, h.y + dy), { weapon: 'sword', role: 'soldier', shield: true });
  const medic = Object.assign(createSettler('normal', 3, h.x - 70, h.y), { tool: 'medbag', bagHerbs: 3 });
  putOnGear(medic, 'armor');
  game.settlers = [sword(1, -20), sword(2, 20), medic];
}

function demonSquad() {
  const demon = Object.assign(createSettler('demon', 1, townHall.x - 50, townHall.y), { weapon: 'iron_sword', role: 'soldier' });
  putOnGear(demon, 'armor');
  putOnGear(demon, 'horned_helmet');
  game.settlers = [demon];
}

function menuSquadLevelBonus() {
  const squadLevel = game.settlers.reduce((highest, settler) => Math.max(highest, getUnitLevel(settler)), 1);
  return squadLevel >= 3 ? 1 : 0;
}

function spawnDemonHumans(demon) {
  const at = demonEdgeSpot();
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const levelBonus = Math.min(2, Math.max(0, getUnitLevel(demon) - 1));
  const count = 3 + Math.floor(Math.random() * 3) + 2 * levelBonus;
  const melee = ['raider_club', 'raider'];
  const medic = 'raider_medic_club';
  /** @type {{ key: string, armor?: boolean }[]} */
  const group = [{ key: medic }, { key: pick(melee) }];
  let medicCount = 1;
  const archerCount = Math.floor(Math.random() * (Math.min(2, count - group.length) + 1));
  for (let i = 0; i < archerCount; i++) group.push({ key: 'raider_archer' });
  while (group.length < count) {
    const key = pick(medicCount < 3 ? [...melee, medic] : melee);
    group.push({ key });
    if (key === medic) medicCount++;
  }

  const leather = group.filter(member => member.key !== 'raider_medic_club');
  leather[Math.floor(Math.random() * leather.length)].armor = true;
  for (let i = group.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [group[i], group[j]] = [group[j], group[i]];
  }
  for (const [index, member] of group.entries()) {
    const offset = (index - 1) * 20;
    const pos = at.side ? { x: at.x + offset, y: at.y } : { x: at.x, y: at.y + offset };
    const enemy = createConfiguredEnemy(pos, member.key);
    if (!enemy) continue;
    enemy.attackTarget = demon;
    enemy.menuThreat = false;
    enemy.menuStaged = true;
    enemy.menuEntryTarget = demonEntryTarget(at, pos);
    if (member.armor) putEnemyInLeatherArmor(enemy);
    game.enemies.push(enemy);
  }
}

function putEnemyInLeatherArmor(enemy) {
  const armor = GAME_CONFIG.gear.leather_armor;
  enemy.armor = armor.armorKind;
  enemy.maxHp += armor.hpBonus;
  enemy.hp = enemy.maxHp;
}

// Each frame in the menu: what keeps its scene going (#256). The fight: zombies come one after another,
// each a little sooner than the last; the squad gone, the dead are cleared, and a new squad comes. The farm
// and the fishing: seeds, dung and fuel never run out
export function tickMenuScene(dt) {
  if (!isMenuWorld()) return;
  menuWorld.stockAge += dt;
  const canRestock = menuWorld.stockAge >= MENU_STOCK_START_DELAY;
  game.settlers.forEach(s => { s.hunger = 999; });
  if (menuWorld.scene === 'demon') {
    tickDemonMenuFight(dt);
    clampDemonSceneUnits();
    return;
  }
  if (menuWorld.scene === 'fight') {
    const f = menuWorld.fight;
    if (!game.settlers.length || townHall.hp <= 0) {
      if (townHall.hp <= 0) stock.herbs = 0; // (broken: no herbs for the medic, #279)
      f.down += dt;
      if (f.down > 3) {
        game.corpses = []; game.enemies = []; game.projectiles = [];
        townHall.hp = townHall.maxHp;
        f.gap = 5; f.next = 2; f.down = 0; fightSquad();
      }
      return;
    }
    f.down = 0;
    f.next -= dt;
    // (#279) reinforcements grow with the player squad's levels
    const levelBonus = menuSquadLevelBonus();
    const groupSize = 2 + levelBonus;
    if (f.next <= 0 && game.enemies.length < 8 + levelBonus) {
      const at = edgeSpot();
      for (let i = 0; i < groupSize; i++) {
        const dx = (i - (groupSize - 1) / 2) * 24;
        const z = createConfiguredEnemy({ x: at.x + (at.side ? dx : 0), y: at.y + (at.side ? 0 : dx) }, 'undead_zombie');
        if (z) game.enemies.push(z);
      }
      f.gap = Math.max(2.4, f.gap * 0.93);
      f.next = f.gap;
    }
    if (game.corpses.length > 12) game.corpses.splice(0, game.corpses.length - 12);
    // herbs in the outpost while it stands; broken, none (#279)
    stock.herbs = townHall.hp > 0 && canRestock ? Math.max(stock.herbs || 0, 10) : 0;
  } else if (menuWorld.scene === 'farm') {
    if (menuWorld.farmCrop === 'rice') stock.riceSeeds = Infinity;
    else stock.wheatSeeds = Infinity;
    for (const b of game.buildings) if (b.type === 'dung_heap') b.dung = Math.max(b.dung || 0, 3);
  } else if (menuWorld.scene === 'fishing') {
    if (canRestock) stock.firewood = Math.max(stock.firewood || 0, 50);
  }
}

function tickDemonMenuFight(dt) {
  const fight = menuWorld.demonFight;
  const demon = game.settlers.find(s => s.type === 'demon');
  if (!demon || townHall.hp <= 0) {
    fight.down += dt;
    if (fight.down > 3) {
      game.corpses = []; game.enemies = []; game.projectiles = [];
      townHall.hp = townHall.maxHp;
      demonSquad();
      fight.next = 2; fight.down = 0; fight.awaitingMeal = false;
    }
    return;
  }
  fight.down = 0;
  const livingEnemies = game.enemies.filter(enemy => enemy.hp > 0);
  if (livingEnemies.length) {
    fight.awaitingMeal = true;
    if (livingEnemies.some(enemy => !enemy.menuStaged)) {
      demon.patrolTarget = null;
      return;
    }
    setDemonPatrolTarget(demon, fight);
    if (livingEnemies.every(isMenuSceneVisible)) {
      livingEnemies.forEach(enemy => {
        enemy.menuStaged = false;
        enemy.menuThreat = true;
        delete enemy.menuEntryTarget;
      });
      demon.patrolTarget = null;
    }
    return;
  }
  if (fight.awaitingMeal) {
    if (demon.hp < demon.maxHp) return;
    fight.awaitingMeal = false;
    fight.next = fight.gap;
  }
  setDemonPatrolTarget(demon, fight);
  fight.next -= dt;
  if (fight.next > 0) return;
  spawnDemonHumans(demon);
  fight.groups++;
  fight.awaitingMeal = true;
  fight.next = fight.gap;
}

function setDemonPatrolTarget(demon, fight) {
  let [dx, dy] = DEMON_PATROL_OFFSETS[fight.patrolIndex];
  let target = clampDemonScenePoint({ x: townHall.x + dx, y: townHall.y + dy }, demon.radius + 24);
  if (Math.hypot(target.x - demon.x, target.y - demon.y) < 18) {
    fight.patrolIndex = (fight.patrolIndex + 1) % DEMON_PATROL_OFFSETS.length;
    [dx, dy] = DEMON_PATROL_OFFSETS[fight.patrolIndex];
    target = clampDemonScenePoint({ x: townHall.x + dx, y: townHall.y + dy }, demon.radius + 24);
  }
  demon.patrolTarget = target;
}

function demonEdgeSpot() {
  const width = game.WORLD_WIDTH, height = game.WORLD_HEIGHT, k = 0.25 + Math.random() * 0.5, inset = 80;
  return [
    { x: inset, y: height * k, side: false },
    { x: width - inset, y: height * k, side: false },
    { x: width * k, y: inset, side: true },
    { x: width * k, y: height - inset, side: true }
  ][Math.floor(Math.random() * 4)];
}

// A spot at the map's edge, on its middle half (side: along the top or bottom edge)
function edgeSpot() {
  const W = game.WORLD_WIDTH, H = game.WORLD_HEIGHT, k = 0.25 + Math.random() * 0.5, e = 12;
  return [{ x: e, y: H * k, side: false }, { x: W - e, y: H * k, side: false }, { x: W * k, y: e, side: true }, { x: W * k, y: H - e, side: true }][Math.floor(Math.random() * 4)];
}

function menuViewBounds() {
  const width = canvas.width / screenPixelRatio / MENU_WORLD.cssScale;
  const height = canvas.height / screenPixelRatio / MENU_WORLD.cssScale;
  return {
    left: camera.x - width / 2,
    right: camera.x + width / 2,
    top: camera.y - height / 2,
    bottom: camera.y + height / 2
  };
}

function isMenuSceneVisible(unit) {
  const bounds = menuViewBounds();
  const xInset = fitMenuInset(unit.radius + 24, bounds.right - bounds.left);
  const yInset = fitMenuInset(unit.radius + 24, bounds.bottom - bounds.top);
  return unit.x >= bounds.left + xInset && unit.x <= bounds.right - xInset &&
    unit.y >= bounds.top + yInset && unit.y <= bounds.bottom - yInset;
}

function demonEntryTarget(at, pos) {
  const bounds = menuViewBounds();
  const xInset = fitMenuInset(64, bounds.right - bounds.left);
  const yInset = fitMenuInset(64, bounds.bottom - bounds.top);
  const left = bounds.left + xInset, right = bounds.right - xInset;
  const top = bounds.top + yInset, bottom = bounds.bottom - yInset;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const target = at.side
    ? { x: clamp(pos.x, left, right), y: at.y < game.WORLD_HEIGHT / 2 ? top : bottom }
    : { x: at.x < game.WORLD_WIDTH / 2 ? left : right, y: clamp(pos.y, top, bottom) };
  const gx0 = Math.floor(target.x / TILE_SIZE), gy0 = Math.floor(target.y / TILE_SIZE);
  const rings = Math.ceil(Math.max(right - left, bottom - top) / TILE_SIZE);
  for (let radius = 0; radius <= rings; radius++) {
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const gx = gx0 + dx, gy = gy0 + dy;
      const x = gx * TILE_SIZE + TILE_SIZE / 2, y = gy * TILE_SIZE + TILE_SIZE / 2;
      if (x < left || x > right || y < top || y > bottom || isTileBlockedForEnemyStrict(gx, gy)) continue;
      return { x, y };
    }
  }
  throw new Error('No clear entry point for demon scene enemies');
}

function clampDemonScenePoint(point, margin) {
  const bounds = menuViewBounds();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const xInset = fitMenuInset(margin, bounds.right - bounds.left);
  const yInset = fitMenuInset(margin, bounds.bottom - bounds.top);
  return {
    x: clamp(point.x, bounds.left + xInset, bounds.right - xInset),
    y: clamp(point.y, bounds.top + yInset, bounds.bottom - yInset)
  };
}

function fitMenuInset(margin, span) {
  return Math.max(0, Math.min(margin, span / 2 - 1));
}

function clampDemonSceneUnits() {
  for (const unit of [...game.settlers, ...game.enemies]) {
    if (unit.hp <= 0 || ('menuStaged' in unit && unit.menuStaged)) continue;
    const point = clampDemonScenePoint(unit, unit.radius + 24);
    unit.x = point.x;
    unit.y = point.y;
  }
}

// Back to an ordinary (not running) Endless before a real game, a battle or the editor is set up
export function leaveMenuWorld() {
  document.getElementById('main-menu').classList.add('lifted'); // never dark again
  document.body.classList.remove('menu-ui-hidden');
  game.gameMode = 'endless';
  game.menuScene = '';
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
    menuWorld.huntFaction = menuWorld.faction;
    changeSettlerType(soldier, getPlayerFaction().startUnits);
    Object.assign(soldier, { weapon: 'spear', role: 'soldier' });
    return;
  }
  // Tapping an enemy defeats it only in the two scenes built around that interaction.
  const enemy = ['fight', 'demon'].includes(menuWorld.scene)
    ? game.enemies.find(en => Math.hypot(mouse.x - en.x, mouse.y - en.y) < en.radius + 12)
    : null;
  if (enemy) { enemy.hp = 0; return; }
  // a boar, only in the hunt (#279: a tap in the other scenes marked their boars to no end)
  const boar = menuWorld.scene === 'hunt' ? game.boars.find(b => !b.isCarcass && Math.hypot(mouse.x - b.x, mouse.y - b.y) < 22) : null;
  if (boar) {
    const wasMarked = boar.priority > 0;
    game.boars.forEach(b => { b.priority = 0; });
    if (!wasMarked) boar.priority = 1;
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
