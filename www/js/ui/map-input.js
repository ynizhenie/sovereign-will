// A tap on the map, by the mode the panel set: select a settler, mark a resource, order, build, mark zones

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { canvas, isTap, isTouchScreen, mouse, painted, shiftDown, t, updateInputPos } from '../engine/platform/index.js';
import { TILE_SIZE, game, isBorderZone, thingAt, townHall } from '../engine/world/index.js';
import { addResources, canAfford, formatCost, getFreeStock, getMissingCost, showCostError } from '../domains/colony/storage/index.js';
import { canBuild, createBuildingBlueprint, isBuildLocationAllowed } from '../domains/economy/building/index.js';
import { inTerritory, isWaterReachable, toggleZone } from '../domains/world/index.js';
import { showNotification } from './toasts.js';
import { escapeHtml, iconHtml } from './icons.js';
import { closeOverlays, closeSheet, hidePlacing, showPlacing } from './sheets.js';
import { openBuildingCard } from './building-card.js';
import { getPossessed, orderPossessed } from '../domains/colony/settlers/index.js';
import { getHarvestableResources, getMapResourceKind } from '../domains/economy/gathering/index.js';
import { toggleFarmZone } from '../domains/economy/farming/index.js';
import { toggleBlightZone } from '../domains/factions/undead/index.js';
import { isDefeated, isLocked, raidTap } from '../modes/endless/index.js';
import { battle, battleTap } from '../modes/battle/index.js';
import { editorTap } from '../modes/editor/index.js';
import { orderTap } from '../domains/conflict/combat/index.js';
import { scoutTapped } from '../domains/conflict/waves/index.js';

export function handleCanvasClick() {
  // battle mode: placing while setting up; in a fight, orders for a possessed unit
  if (game.gameMode === 'battle') {
    if (battle.phase === 'setup') battleTap(mouse.x, mouse.y);
    else if (battle.phase === 'fight' && getPossessed()) orderPossessed(getPossessed(), mouse.x, mouse.y);
    else if (battle.phase === 'fight') orderTap(mouse.x, mouse.y); // (orders, #255)
    return;
  }
  if (game.gameMode === 'editor') { editorTap(mouse.x, mouse.y); return; }
  if (isDefeated()) return; // the defeat screen's own buttons
  if (!getPossessed() && raidTap(mouse.x, mouse.y)) return; // (orders in a raid's camp, #255)
  if (game.buildMode === 'possess') { possessTapped(); return; }

  const p = getPossessed();
  if (p && orderPossessed(p, mouse.x, mouse.y)) return;
  if (game.buildMode === 'interact' && scoutTapped(mouse.x, mouse.y)) return; // (a scout pointed at: hunted, #279)
  if (game.buildMode === 'interact' && enemyTapped()) return;
  if (game.buildMode === 'interact' && selectTapped()) return;

  const tile = tapTile();
  // a building or the town hall: its card (#211), with its repair, hiring, the circle...
  if (game.buildMode === 'interact' && Math.hypot(mouse.x - townHall.x, mouse.y - townHall.y) < townHall.radius + 10) {
    openBuildingCard(townHall);
    return;
  }
  if (game.buildMode === 'interact' && buildingTapped(tile)) return;
  // Blight tab (the undead): mark ground for a necromancer to blight; the same tile again takes the
  // mark away, as farm zones
  if (game.buildMode === 'blight' || game.buildMode === 'blight_clear') {
    toggleBlightZone(tile.gx, tile.gy, tile.gxIdx, tile.gyIdx, game.buildMode === 'blight_clear');
    return;
  }
  // Farming tab: paint (or clear) farm zone tiles
  if (game.buildMode.startsWith('zone_')) {
    const kind = game.buildMode.slice('zone_'.length);
    if (isBorderZone(tile.gxIdx, tile.gyIdx)) return;
    // (#299) only on the base's land (taking one off: anywhere)
    if (kind !== 'clear' && !inTerritory(tile.gx, tile.gy)) { showNotification(t('build.outside'), true); return; }
    // (#279) relief and post zones; Remove zone takes any off
    if (kind === 'relief' || kind === 'post') toggleZone(tile.gx, tile.gy, kind);
    else { if (kind === 'clear') toggleZone(tile.gx, tile.gy, 'clear'); toggleFarmZone(tile.gx, tile.gy, kind); }
    return;
  }
  if (game.buildMode !== 'interact' && game.buildMode !== 'possess' && game.buildMode !== 'demolish' && !canPlaceHere(tile)) return;

  if (game.buildMode === 'interact') markTapped();
  else if (getDefinition('buildings', game.buildMode)) placeBlueprint(tile);
  else if (game.buildMode === 'demolish') demolishTapped(tile);
}

// The tapped tile: its grid position and its centre
/** @returns {{ gxIdx: number, gyIdx: number, gx: number, gy: number }} */
function tapTile() {
  const gxIdx = Math.floor(mouse.x / TILE_SIZE);
  const gyIdx = Math.floor(mouse.y / TILE_SIZE);
  return { gxIdx, gyIdx, gx: gxIdx * TILE_SIZE + TILE_SIZE / 2, gy: gyIdx * TILE_SIZE + TILE_SIZE / 2 };
}

// In possession mode: the tapped settler becomes the possessed one
function possessTapped() {
  for (let s of game.settlers) {
    if (Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.visualRadius + 10) {
      game.settlers.forEach(s2 => s2.isPossessed = false);
      s.isPossessed = true;
      return;
    }
  }
}

// Point mode on a settler: select it, or unselect it with a second tap. True when a settler was tapped.
function selectTapped() {
  let clickedSettler = game.settlers.find(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.visualRadius + 8);
  if (clickedSettler) {
    game.selectedSettler = (game.selectedSettler === clickedSettler) ? null : clickedSettler;
    return true;
  }
  return false;
}

// Point mode on a building: its card (#211; its repair, the circle taking the selected settler in...).
// True when the tap was used.
function buildingTapped({ gx, gy }) {
  const building = game.buildings.find(b => b.x === gx && b.y === gy);
  if (!building) return false;
  openBuildingCard(building);
  return true;
}

// Can the build mode's thing go on this tile? (not the border, a farm zone, the hall or an occupied tile;
// says why not)
function canPlaceHere({ gxIdx, gyIdx, gx, gy }) {
  if (isBorderZone(gxIdx, gyIdx)) {
    return false;
  }
  if (game.buildMode !== 'demolish' && !inTerritory(gx, gy)) { // (#299: built only on the base's land)
    showNotification(t('build.outside'), true);
    return false;
  }
  if (game.farmZones.some(z => z.x === gx && z.y === gy)) {
    showNotification(t('build.zoneHere'), true);
    return false;
  }
  const item = getDefinition('buildings', game.buildMode);
  // a door on a wall, an iron door on a door: built over it (#248)
  if (item && upgradeTarget(item, gx, gy)) return true;
  // a fish trap on water a fisher could fish from (#248)
  if (item && item.onWater) {
    const water = game.waterTiles.find(w => w.x === gx && w.y === gy);
    if (!water || !isWaterReachable(water) || [...game.buildings, ...game.blueprints].some(b => b.x === gx && b.y === gy)) {
      showNotification(t('build.onWater'), true);
      return false;
    }
    return true;
  }
  if (!isBuildLocationAllowed(gx, gy)) {
    if (Math.hypot(gx - townHall.x, gy - townHall.y) < townHall.radius + 15) {
      showNotification(t('build.onHall'), true);
    } else {
      showNotification(t('build.occupied'), true);
    }
    return false;
  }
  return true;
}

// Point mode on an enemy: marked as a priority target for armed settlers (again: unmarked). Before the
// settlers and buildings: an enemy is mostly tapped while it fights at a wall or next to a soldier, and that
// tap selected the soldier or ordered the wall's repair instead (#202). A settler nearer the tap than the
// enemy still gets it. True when the tap was used.
function enemyTapped() {
  const away = p => Math.hypot(mouse.x - p.x, mouse.y - p.y);
  // an enemy tent (a grave, a portal) too: armed settlers go and destroy it (#203)
  const tentRadius = 20;
  const enemy = [...game.enemies.filter(en => away(en) < en.radius + 12), ...game.enemyTents.filter(et => away(et) < tentRadius)]
    .sort((a, b) => away(a) - away(b))[0];
  if (!enemy) return false;
  if (game.settlers.some(s => away(s) < s.visualRadius + 8 && away(s) < away(enemy))) return false;
  enemy.markedTarget = !enemy.markedTarget;
  return true;
}

// Point mode on the map: a fishing spot, or a resource marked "work here" (again: unmark). One kind of
// mark, no levels (the 1-2-3 levels were confusing, #232)
function markTapped() {
  // (#299) settlers don't go beyond the base's land
  if (!inTerritory(mouse.x, mouse.y)) {
    if (getHarvestableResources().some(r => Math.hypot(mouse.x - r.x, mouse.y - r.y) < 22) || thingAt(game.waterTiles, Math.floor(mouse.x / TILE_SIZE) * TILE_SIZE + 15, Math.floor(mouse.y / TILE_SIZE) * TILE_SIZE + 15)) showNotification(t('mark.outside'), true);
    return;
  }
  let clickedWater = game.waterTiles.find(w => Math.hypot(mouse.x - w.x, mouse.y - w.y) < 18);
  if (clickedWater) {
    if (isWaterReachable(clickedWater)) {
      clickedWater.isFishing = !clickedWater.isFishing;
    }
    return;
  }

  // several things there (a stick, a pebble and loot on one tile): a menu picks which (#261)
  const here = getHarvestableResources().filter(r => Math.hypot(mouse.x - r.x, mouse.y - r.y) < 22)
    .sort((a, b) => Math.hypot(mouse.x - a.x, mouse.y - a.y) - Math.hypot(mouse.x - b.x, mouse.y - b.y));
  if (here.length > 1) showPickMenu(here, tapClient);
  else if (here.length) markResource(here[0]);
}

function markResource(r) {
  r.priority = r.priority ? 0 : 1;
  // an apple tree marked while it has apples gets its apples picked, not felled (see pickApples)
  if (r.apple) r.markIntent = r.applesReady ? 'apples' : 'chop';
}

// What a thing on the map is called and drawn as, for the menu: loot by what's in it
function resourceLook(r) {
  const kind = r.apple ? 'apple_tree' : r.oreSpawner ? `${r.oreSpawner}_spawner` : getMapResourceKind(r) || '';
  const [category, id] = ((r.items || [])[0] || '').split(':');
  const item = category && GAME_CONFIG[category] && GAME_CONFIG[category][id];
  if (item) return { icon: item.icon, name: item.label };
  if (kind === 'loot') return { icon: 'bundle', name: t('pick.loot') };
  const name = t(`editor.tool.${kind === 'natural_rock' ? 'rock' : kind}`);
  return { icon: kind === 'natural_rock' ? 'rock' : kind === 'farm' ? 'wheat' : kind, name: name.startsWith('editor.') ? kind : name };
}

// The menu by the finger: a row for each thing, marked (or unmarked) by a tap on it; a tap anywhere
// else puts it away
/** @type {{ x: number, y: number }} */
let tapClient = { x: 0, y: 0 };
export function showPickMenu(resources, at) {
  hidePickMenu();
  const menu = document.createElement('div');
  menu.id = 'pick-menu';
  for (const r of resources) {
    const { icon, name } = resourceLook(r);
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `${iconHtml(icon)} ${escapeHtml(name)}${r.priority ? ` ${iconHtml('ok')}` : ''}`;
    b.addEventListener('click', () => { markResource(r); hidePickMenu(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, at.x - w / 2))}px`;
  menu.style.top = `${Math.max(4, Math.min(window.innerHeight - h - 4, at.y - h - 12))}px`;
  setTimeout(() => document.addEventListener('pointerdown', awayFromMenu, true), 0);
}

function awayFromMenu(e) {
  const menu = document.getElementById('pick-menu');
  if (menu && menu.contains(/** @type {Node} */ (e.target))) return;
  hidePickMenu();
}

export function hidePickMenu() {
  document.removeEventListener('pointerdown', awayFromMenu, true);
  const menu = document.getElementById('pick-menu');
  if (menu) menu.remove();
}

// A building mode: a blueprint on the tile, if the stock can pay (its cost stays in storage until builders
// bring it)
// What a building that upgrades (a door, #248) would be built over on this tile: a building of a kind it
// upgrades, with no blueprint on it already
function upgradeTarget(item, gx, gy) {
  if (!item.upgrades) return null;
  const old = game.buildings.find(b => b.x === gx && b.y === gy && item.upgrades.includes(b.type));
  return old && !game.blueprints.some(bp => bp.x === gx && bp.y === gy) ? old : null;
}

function placeBlueprint({ gx, gy }) {
  const building = getDefinition('buildings', game.buildMode);
  const replaces = upgradeTarget(building, gx, gy);
  if (isLocked('buildings', game.buildMode)) {
    showNotification(t('cards.locked', { name: building.label }), true);
  } else if (!canBuild(game.buildMode)) {
    showCostError(building.cost || {}, t('cost.needs', { name: building.label }), getFreeStock);
  } else if (replaces || building.onWater || isBuildLocationAllowed(gx, gy)) {
    // its cost stays in storage until builders bring it
    const bp = createBuildingBlueprint(game.buildMode, gx, gy);
    bp.needs = { ...(building.cost || {}) };
    if (replaces) bp.replaces = replaces; // (it stands till the new one is built)
    game.blueprints.push(bp);
    // placed: back to Point, unless Shift is held to place another; on a touch screen the mode stays
    // (its chip's × puts it down)
    if (!shiftDown && !isTouchScreen()) setMode('interact');
  }
}

// Demolish mode: mark a building for demolition, or take a blueprint back (with what was brought for it)
function demolishTapped({ gx, gy }) {
  let targetBuilding = game.buildings.find(b => Math.abs(b.x - gx) < 15 && Math.abs(b.y - gy) < 15);
  if (targetBuilding) {
    if (!targetBuilding.isDemolishing) {
      targetBuilding.isDemolishing = true;
      game.blueprints.push({ type: 'demolish_building', targetBuilding: targetBuilding, x: targetBuilding.x, y: targetBuilding.y, progress: 0, maxProgress: 50 });
    }
    return;
  }
  let targetBp = game.blueprints.find(b => Math.abs(b.x - gx) < 15 && Math.abs(b.y - gy) < 15);
  if (targetBp) {
    if (targetBp.type === 'demolish_building' && targetBp.targetBuilding) {
      targetBp.targetBuilding.isDemolishing = false;
    }
    // materials already brought go back to storage
    const building = getDefinition('buildings', targetBp.type);
    const needs = targetBp.needs;
    if (building && needs) {
      addResources(Object.fromEntries(Object.entries(building.cost || {}).map(([id, amount]) => [id, amount - (needs[id] || 0)])));
    }
    game.blueprints.splice(game.blueprints.indexOf(targetBp), 1);
    return;
  }
}

export function processInteraction(clientX, clientY) {
  tapClient = { x: clientX, y: clientY };
  updateInputPos(clientX, clientY);
  handleCanvasClick();
}

export function setMode(mode) {
  game.buildMode = mode;
  document.querySelectorAll('.btn, #btn-interact').forEach(b => b.classList.remove('active'));
  const button = document.getElementById('btn-' + mode);
  if (button) button.classList.add('active');
  // a tool picked: its sheet steps aside for the map, its chip shows what's being placed
  if (mode === 'interact' || !button) hidePlacing();
  else { closeSheet(); showPlacing(button.innerHTML, () => setMode('interact')); }

  const item = getDefinition('buildings', mode);
  if (!item) return;
  if (isLocked('buildings', mode)) { // (a card opens it, #255)
    showNotification(t('cards.locked', { name: item.label }), true);
    setMode('interact');
    return;
  }

  if (!canAfford(item.cost || {})) {
    const missing = getMissingCost(item.cost || {});
    showNotification(t('build.costs', { name: item.label, cost: formatCost(item.cost || {}), missing }), true);
  }
}

// What this file sets up as the game starts (called by app/boot.js)
export function initMapInput() {
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (e.pointerType === 'touch' && !isTap) return;
    if (painted) return; // (a stroke of the editor's brush, not a tap, #255)

    closeOverlays(); // a tap on the map closes the open sheet (a drag to look around doesn't)
    processInteraction(e.clientX, e.clientY);
  });
}
