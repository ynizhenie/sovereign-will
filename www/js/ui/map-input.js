// A tap on the map, by the mode the panel set: select a settler, mark a resource, order, build, mark zones

import { GAME_CONFIG, getDefinition } from '../content/configs/index.js';
import { canvas, isTap, isTouchScreen, mouse, shiftDown, t, updateInputPos } from '../engine/platform/index.js';
import { TILE_SIZE, game, isBorderZone, townHall } from '../engine/world/index.js';
import { addResources, canAfford, formatCost, getFreeStock, getMissingCost, showCostError } from '../domains/colony/storage/index.js';
import { canBuild, createBuildingBlueprint, isBuildLocationAllowed, toggleBuildingRepair } from '../domains/economy/building/index.js';
import { isWaterReachable } from '../domains/world/index.js';
import { showNotification } from './toasts.js';
import { closeOverlays, closeSheet, hidePlacing, showPlacing } from './sheets.js';
import { getPossessed, getSelectedSettler, orderPossessed } from '../domains/colony/settlers/index.js';
import { getHarvestableResources } from '../domains/economy/gathering/index.js';
import { toggleFarmZone } from '../domains/economy/farming/index.js';
import { toggleBlightZone } from '../domains/factions/undead/index.js';
import { isDefeated } from '../modes/endless/index.js';
import { battle, battleTap } from '../modes/battle/index.js';
import { editorTap } from '../modes/editor/index.js';

export function handleCanvasClick() {
  // battle mode: placing while setting up; in a fight, orders for a possessed unit
  if (game.gameMode === 'battle') {
    if (battle.phase === 'setup') battleTap(mouse.x, mouse.y);
    else if (battle.phase === 'fight' && getPossessed()) orderPossessed(getPossessed(), mouse.x, mouse.y);
    return;
  }
  if (game.gameMode === 'editor') { editorTap(mouse.x, mouse.y); return; }
  if (isDefeated()) return; // the defeat screen's own buttons
  if (game.buildMode === 'possess') { possessTapped(); return; }

  const p = getPossessed();
  if (p && orderPossessed(p, mouse.x, mouse.y)) return;
  if (game.buildMode === 'interact' && enemyTapped()) return;
  if (game.buildMode === 'interact' && selectTapped()) return;

  const tile = tapTile();
  if (Math.hypot(mouse.x - townHall.x, mouse.y - townHall.y) < townHall.radius + 10 && townHall.hp < townHall.maxHp) {
    townHall.repairRequested = !townHall.repairRequested;
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
    if (!isBorderZone(tile.gxIdx, tile.gyIdx)) toggleFarmZone(tile.gx, tile.gy, game.buildMode.slice('zone_'.length));
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

// Point mode on a building: order its repair, or send the selected settler into the demons' sacrificial
// circle. True when the tap was used.
function buildingTapped({ gx, gy }) {
  const damaged = game.buildings.find(b => b.x === gx && b.y === gy && b.hp < b.maxHp);
  if (damaged && toggleBuildingRepair(damaged)) return true;
  // the demons' sacrificial circle: the selected settler goes into it
  const circle = game.buildings.find(b => b.x === gx && b.y === gy && (getDefinition('buildings', b.type) || {}).sacrifice);
  if (circle) {
    const victim = getSelectedSettler();
    if (!victim) { showNotification(t('sacrifice.pick'), true); return true; }
    victim.sacrificeAt = circle;
    game.selectedSettler = null;
    showNotification(t('sacrifice.going', { name: GAME_CONFIG.settlerTypes[victim.type].label }), false);
    return true;
  }
  return false;
}

// Can the build mode's thing go on this tile? (not the border, a farm zone, the hall or an occupied tile;
// says why not)
function canPlaceHere({ gxIdx, gyIdx, gx, gy }) {
  if (isBorderZone(gxIdx, gyIdx)) {
    return false;
  }
  if (game.farmZones.some(z => z.x === gx && z.y === gy)) {
    showNotification(t('build.zoneHere'), true);
    return false;
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
  const enemy = game.enemies.filter(en => away(en) < en.radius + 12).sort((a, b) => away(a) - away(b))[0];
  if (!enemy) return false;
  if (game.settlers.some(s => away(s) < s.visualRadius + 8 && away(s) < away(enemy))) return false;
  enemy.markedTarget = !enemy.markedTarget;
  return true;
}

// Point mode on the map: a fishing spot, or a resource's priority (again: unmark)
function markTapped() {
  let clickedWater = game.waterTiles.find(w => Math.hypot(mouse.x - w.x, mouse.y - w.y) < 18);
  if (clickedWater) {
    if (isWaterReachable(clickedWater)) {
      clickedWater.isFishing = !clickedWater.isFishing;
    }
    return;
  }

  let allResources = getHarvestableResources();
  let clickedRes = allResources.find(r => Math.hypot(mouse.x - r.x, mouse.y - r.y) < 22);

  if (clickedRes) {
    clickedRes.priority = ((clickedRes.priority || 0) + 1) % 4;
    // an apple tree marked while it has apples gets its apples picked, not felled (see pickApples)
    if (clickedRes.apple) clickedRes.markIntent = clickedRes.applesReady ? 'apples' : 'chop';
    return;
  }
}

// A building mode: a blueprint on the tile, if the stock can pay (its cost stays in storage until builders
// bring it)
function placeBlueprint({ gx, gy }) {
  const building = getDefinition('buildings', game.buildMode);
  if (!canBuild(game.buildMode)) {
    showCostError(building.cost || {}, t('cost.needs', { name: building.label }), getFreeStock);
  } else if (isBuildLocationAllowed(gx, gy)) {
    // its cost stays in storage until builders bring it
    const bp = createBuildingBlueprint(game.buildMode, gx, gy);
    bp.needs = { ...(building.cost || {}) };
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

    closeOverlays(); // a tap on the map closes the open sheet (a drag to look around doesn't)
    processInteraction(e.clientX, e.clientY);
  });
}
