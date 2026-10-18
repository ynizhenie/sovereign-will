// A damaged building looks it

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { drawIcon, fillRichText, getResourceIconName } from '../../../ui/index.js';
import { ctx, mouse, t } from '../../../engine/platform/index.js';
import { TILE_SIZE, game, isBorderZone, townHall } from '../../../engine/world/index.js';
import { formatCost } from '../../colony/storage/index.js';
import { getSmelterLimits, needsRepair } from './building.rules.js';
import { getPlayerFaction, sides } from '../../factions/index.js';
import { drawPortal } from '../../factions/demons/index.js';
import { tileVariantHash } from '../../world/index.js';

// A damaged building looks it: cracks spread over it as it loses hp, soot darkens it, and below a
// third of its hp some of it has fallen out. The cracks are fixed per building (by where it stands).
export function drawDamage(x, y, half, share) {
  if (!(share < 0.9)) return;
  const harm = 1 - Math.max(0, share);
  const h = tileVariantHash(Math.round(x), Math.round(y));
  ctx.fillStyle = `rgba(20, 12, 8, ${0.45 * harm})`;
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  ctx.strokeStyle = 'rgba(15, 10, 6, 0.85)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const cracks = Math.min(4, 1 + Math.floor(harm * 4));
  for (let i = 0; i < cracks; i++) {
    const seed = (h >>> (i * 7)) & 127;
    // from an edge towards the middle, with a bend and a short branch
    const side = (seed + i) % 4;
    const along = ((seed % 13) / 12 - 0.5) * half * 1.6;
    const sx = x + (side === 0 ? -half : side === 1 ? half : along);
    const sy = y + (side === 2 ? -half : side === 3 ? half : along);
    const mx = sx + (x - sx) * 0.5 + ((seed % 5) - 2) * 2, my = sy + (y - sy) * 0.5 + ((seed % 7) - 3) * 1.5;
    const ex = sx + (x - sx) * (0.6 + harm * 0.5), ey = sy + (y - sy) * (0.6 + harm * 0.5);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.lineTo(ex, ey);
    ctx.moveTo(mx, my); ctx.lineTo(mx + ((seed % 3) - 1) * 5, my + 4);
    ctx.stroke();
  }
  if (share < 0.34) {
    // chunks broken off at two corners
    ctx.fillStyle = 'rgba(10, 8, 6, 0.75)';
    for (const [cx, cy] of [[1, -1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(x + cx * half, y + cy * half); ctx.lineTo(x + cx * half * 0.45, y + cy * half); ctx.lineTo(x + cx * half, y + cy * half * 0.45);
      ctx.closePath(); ctx.fill();
    }
  }
}

// In a build mode: the tile grid, and the tile under the pointer (red where it can't go)
export function drawBuildGrid() {
  if (game.buildMode !== 'interact' && game.buildMode !== 'possess') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < game.WORLD_WIDTH; x += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, game.WORLD_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < game.WORLD_HEIGHT; y += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(game.WORLD_WIDTH, y); ctx.stroke();
    }
    let gxIdx = Math.floor(mouse.x / TILE_SIZE);
    let gyIdx = Math.floor(mouse.y / TILE_SIZE);
    let gx = gxIdx * TILE_SIZE;
    let gy = gyIdx * TILE_SIZE;
    if (isBorderZone(gxIdx, gyIdx) && game.buildMode !== 'demolish') {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.5)';
    } else {
      ctx.fillStyle = game.buildMode === 'demolish' ? 'rgba(231, 76, 60, 0.35)' : 'rgba(70, 184, 218, 0.25)';
    }
    ctx.fillRect(gx, gy, TILE_SIZE, TILE_SIZE);
  }
}

// The town hall (the demons' Hell Gate, the undead's graveyard), its health and repair. Behind the main
// menu it's drawn as a warehouse, the storage it is there (#200)
export function drawTownHall() {
  if (game.gameMode === 'menu') { drawIcon(ctx, 'warehouse', townHall.x, townHall.y, townHall.radius * 1.7); return; }
  if (getPlayerFaction().hall === 'hellgate') {
    // the demons' Hell Gate: a dark stone gate with fire inside
    ctx.fillStyle = '#3d1f1f'; ctx.beginPath(); ctx.arc(townHall.x, townHall.y, townHall.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4; ctx.stroke();
    drawIcon(ctx, 'hellgate', townHall.x, townHall.y, townHall.radius * 1.4);
  } else if (getPlayerFaction().hall === 'graveyard') {
    // the undead's graveyard: a dark fenced plot with tombstones
    ctx.fillStyle = '#2c2c34'; ctx.beginPath(); ctx.arc(townHall.x, townHall.y, townHall.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 4; ctx.stroke();
    drawIcon(ctx, 'graveyard', townHall.x, townHall.y, townHall.radius * 1.4);
  } else {
    ctx.fillStyle = '#8b5a2b';
    ctx.beginPath(); ctx.arc(townHall.x, townHall.y, townHall.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 4; ctx.stroke();
  }
  
  drawDamage(townHall.x, townHall.y, townHall.radius - 4, townHall.hp / townHall.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(townHall.x - 30, townHall.y - 45, 60, 8);
  ctx.fillStyle = townHall.hp > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(townHall.x - 30, townHall.y - 45, (Math.max(0, townHall.hp) / townHall.maxHp) * 60, 8);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(townHall.x - 30, townHall.y - 45, 60, 8);

  if (townHall.hp < townHall.maxHp) {
    ctx.fillStyle = townHall.repairRequested ? '#f1c40f' : '#e74c3c';
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    fillRichText(ctx, townHall.repairRequested ? t('repair.hall', { cost: formatCost(GAME_CONFIG.repairs.townHall.cost) }) : t('repair.hallNeeded'), townHall.x, townHall.y - 52);
  }
}

// Blueprints: their shape, the materials still to come, the work done
export function drawBlueprints() {
  game.blueprints.forEach(bp => {
    if (bp.replaces) return; // (an upgrade: over the building, drawUpgrades)
    ctx.save(); ctx.globalAlpha = 0.5;
    if (bp.type === 'demolish_building') ctx.fillStyle = '#e74c3c';
    else if (bp.type === 'wall_wood') ctx.fillStyle = '#8e5a2b';
    else if (bp.type === 'wall_stone') ctx.fillStyle = '#7f8c8d';
    else if (bp.type === 'door' || bp.type === 'iron_door') ctx.fillStyle = '#a0522d';
    else if (bp.type === 'wheat') ctx.fillStyle = '#f1c40f';
    else if (bp.type === 'tent') ctx.fillStyle = '#e67e22';
    else if (bp.type === 'smelter') ctx.fillStyle = '#c0392b';
    else if (bp.type === 'watchtower') ctx.fillStyle = '#607d8b';
    else if (bp.type === 'sapling') ctx.fillStyle = '#2ecc71';
    else if (bp.type === 'warehouse') ctx.fillStyle = '#a47148';
    ctx.fillRect(bp.x - 14, bp.y - 14, 28, 28);
    ctx.restore();

    // materials still to be brought from storage: an orange bar of what's here
    const cost = (getDefinition('buildings', bp.type) || {}).cost;
    if (bp.needs && cost) {
      const total = Object.values(cost).reduce((a, b) => a + b, 0);
      const missing = Object.values(bp.needs).reduce((a, b) => a + b, 0);
      if (missing > 0 && total > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bp.x - 12, bp.y + 11, 24, 3);
        ctx.fillStyle = '#e67e22'; ctx.fillRect(bp.x - 12, bp.y + 11, 24 * (1 - missing / total), 3);
        drawIcon(ctx, getResourceIconName(Object.keys(bp.needs)[0]), bp.x, bp.y, 14);
      }
    }

    if (bp.type === 'demolish_building') {
      drawIcon(ctx, 'hammer', bp.x, bp.y, 16);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(bp.x - 12, bp.y + 16, (bp.progress / bp.maxProgress) * 24, 3);
    } else {
      ctx.fillStyle = '#fff'; ctx.fillRect(bp.x - 12, bp.y + 16, (bp.progress / bp.maxProgress) * 24, 3);
    }
  });
}

// An upgrade under way (a door on a wall, an iron door on a door, #248, #261): over the building it'll
// replace, the new one faint, an up arrow in its corner, how far along in a bar under it, and what's still
// to be brought
export function drawUpgrades() {
  for (const bp of game.blueprints) {
    if (!bp.replaces) continue;
    const def = getDefinition('buildings', bp.type) || {};
    ctx.save();
    ctx.globalAlpha = 0.55; drawIcon(ctx, def.icon || bp.type, bp.x, bp.y, 18);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(bp.x - 14, bp.y - 14, 28, 28);
    ctx.setLineDash([]);
    // the up arrow, on a dark disc
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.beginPath(); ctx.arc(bp.x + 10, bp.y - 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.moveTo(bp.x + 10, bp.y - 15); ctx.lineTo(bp.x + 14.5, bp.y - 9); ctx.lineTo(bp.x + 5.5, bp.y - 9); ctx.closePath(); ctx.fill();
    ctx.fillRect(bp.x + 8.5, bp.y - 9.5, 3, 4);
    // how far along, and the materials still to come
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(bp.x - 13, bp.y + 15, 26, 5);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(bp.x - 12, bp.y + 16, 24 * Math.min(1, bp.progress / bp.maxProgress), 3);
    const missing = Object.values(bp.needs || {}).reduce((a, b) => a + b, 0);
    if (missing > 0) drawIcon(ctx, getResourceIconName(Object.keys(bp.needs || {})[0]), bp.x - 9, bp.y - 9, 11);
    ctx.restore();
  }
}

// Buildings, each kind its own way, with their damage, health and repair, and demolition marks
export function drawBuildings() {
  game.buildings.forEach(b => {
    if (b.type === 'wall_wood') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#5c3a17'; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
    } else if (b.type === 'wall_stone') {
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
    } else if (b.type === 'door' || b.type === 'iron_door') {
      ctx.fillStyle = b.type === 'door' ? '#a0522d' : '#6e4a2e'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = b.type === 'door' ? '#3e2723' : '#5d6d7e'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
      drawIcon(ctx, b.type, b.x, b.y, 16);
    } else if (b.type === 'iron_trap') {
      // an iron trap (#248): open, with food in it when baited; shut on whoever it holds
      if (b.holding) {
        ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(b.x - 11, b.y); ctx.lineTo(b.x + 11, b.y); ctx.stroke();
      } else {
        drawIcon(ctx, 'iron_trap', b.x, b.y, 24);
        if (b.bait) drawIcon(ctx, 'food', b.x, b.y, 9);
      }
    } else if (b.type === 'grave' || b.type === 'sacrifice_circle' || b.type === 'portal') {
      if (b.type === 'portal') drawPortal(b.x, b.y, sides.player.color); // in the side's colour
      else drawIcon(ctx, b.type, b.x, b.y, 28); // the undead's and the demons'
    } else if (b.type === 'tent') {
      ctx.fillStyle = '#d35400'; ctx.beginPath();
      ctx.moveTo(b.x, b.y - 14); ctx.lineTo(b.x + 14, b.y + 14); ctx.lineTo(b.x - 14, b.y + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a2511'; ctx.beginPath();
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 5, b.y + 14); ctx.lineTo(b.x - 5, b.y + 14); ctx.closePath(); ctx.fill();
	  
    } else if (b.type === 'spikes') {
      // wooden base with iron points; a dot per use left; broken (none left): the points bent down, grey
      const broken = !((b.usesLeft || 0) > 0);
      ctx.fillStyle = '#6d4c2f'; ctx.fillRect(b.x - 13, b.y - 13, 26, 26);
      ctx.fillStyle = broken ? '#5f6a6a' : '#b0bec5';
      for (const [px, py] of [[-7, -7], [5, -7], [-7, 5], [5, 5], [-1, -1]]) {
        ctx.beginPath(); ctx.moveTo(b.x + px - 3, b.y + py + 3); ctx.lineTo(b.x + px, b.y + py - 4); ctx.lineTo(b.x + px + 3, b.y + py + 3); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#e74c3c';
      for (let i = 0; i < Math.min(b.usesLeft || 0, 5); i++) ctx.fillRect(b.x - 12 + i * 5, b.y + 10, 3, 2);
    } else if (b.type === 'watchtower') {
      // a wooden lookout seen from above: four posts with cross braces, and a plank platform with a
      // railing, where its archer stands (drawn with the settlers)
      ctx.fillStyle = '#5d3a1a';
      for (const [px, py] of [[-13, -13], [9, -13], [-13, 9], [9, 9]]) ctx.fillRect(b.x + px, b.y + py, 4, 4);
      ctx.strokeStyle = '#6d4520'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x - 11, b.y - 11); ctx.lineTo(b.x + 11, b.y + 11); ctx.moveTo(b.x + 11, b.y - 11); ctx.lineTo(b.x - 11, b.y + 11); ctx.stroke();
      ctx.fillStyle = '#a47148'; ctx.fillRect(b.x - 10, b.y - 10, 20, 20);
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 1;
      for (let i = -5; i <= 5; i += 5) { ctx.beginPath(); ctx.moveTo(b.x - 10, b.y + i); ctx.lineTo(b.x + 10, b.y + i); ctx.stroke(); }
      ctx.strokeStyle = '#4e2f14'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 10, b.y - 10, 20, 20);
      ctx.textAlign = 'center';
      // no count in battles: arrows don't run out there
      if (game.gameMode !== 'battle') { ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 9px sans-serif'; fillRichText(ctx, `[[arrows]] ${b.arrows || 0}/${/** @type {import('../../../engine/world/types.js').Watchtower} */ (b).tower.arrowCapacity}`, b.x, b.y - 22); }
      if (game.gameMode !== 'battle') {
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(b.x - 12, b.y + 16, 24, 3);
        ctx.fillStyle = '#ecf0f1'; ctx.fillRect(b.x - 11, b.y + 17, 22 * Math.min(1, (b.arrows || 0) / /** @type {import('../../../engine/world/types.js').Watchtower} */ (b).tower.arrowCapacity), 1);
      }

    } else if (b.type === 'campfire') {
      // crossed logs, a flame while someone cooks
      ctx.strokeStyle = '#6d4520'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(b.x - 10, b.y + 8); ctx.lineTo(b.x + 10, b.y - 2); ctx.moveTo(b.x + 10, b.y + 8); ctx.lineTo(b.x - 10, b.y - 2); ctx.stroke();
      ctx.fillStyle = '#7f8c8d';
      for (const [sx, sy] of [[-12, 10], [-5, 12], [3, 12], [11, 10]]) { ctx.beginPath(); ctx.arc(b.x + sx, b.y + sy, 2.5, 0, Math.PI * 2); ctx.fill(); }
      // fuel left (orange) and the piece cooking now (yellow)
      const perFuel = Math.max(...Object.values(GAME_CONFIG.cooking.fuel));
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 12, b.y - 20, 24, 3); ctx.fillRect(b.x - 12, b.y - 16, 24, 3);
      ctx.fillStyle = '#e67e22'; ctx.fillRect(b.x - 12, b.y - 20, 24 * Math.min(1, (b.fuelLeft || 0) / perFuel), 3);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(b.x - 12, b.y - 16, 24 * Math.min(1, b.cookProgress || 0), 3);
      if ((b.burning || 0) > 0) {
        ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.moveTo(b.x - 6, b.y + 4); ctx.quadraticCurveTo(b.x, b.y - 16, b.x + 6, b.y + 4); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(b.x - 3, b.y + 4); ctx.quadraticCurveTo(b.x, b.y - 8, b.x + 3, b.y + 4); ctx.fill();
      }
    } else if (b.type === 'workshop') {
      // a timber workshop with a bench and saw (#248)
      ctx.fillStyle = '#7a5230'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#d4a373'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
      drawIcon(ctx, 'workshop', b.x, b.y, 20);
    } else if (b.type === 'smithy') {
      // a dark stone forge with an anvil (#211)
      ctx.fillStyle = '#3d3d44'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
      drawIcon(ctx, 'hammer', b.x, b.y, 18);
    } else if (b.type === 'fish_trap') {
      // a fish trap (#199): a basket, a fish mark for each fish waiting in it
      drawIcon(ctx, 'fish_trap', b.x, b.y, 26);
      if (!((b.baitLeft || 0) > 0)) drawIcon(ctx, 'worms', b.x + 9, b.y + 9, 10); // (needs bait, #248)
      for (let k = 0; k < (b.fish || 0); k++) { ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.ellipse(b.x - 9 + k * 6, b.y - 13, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (b.type === 'dung_heap') {
      // a compost heap (#232): bigger the more dung it holds
      const share = Math.min(1, (b.dung || 0) / (GAME_CONFIG.buildings.dung_heap.dungCapacity || 5));
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(b.x - 14, b.y + 4, 28, 8);
      ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(b.x - 14, b.y + 4, 28, 8);
      if (share > 0) {
        ctx.fillStyle = '#5c3d16'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, 4 + 9 * share, 3 + 9 * share, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#6e4a1c'; ctx.beginPath(); ctx.ellipse(b.x - 1, b.y + 4 - 6 * share, 2 + 4 * share, 1.5 + 3 * share, 0, Math.PI, 0); ctx.fill();
      }
    } else if (b.type === 'dummy') {
      drawIcon(ctx, 'dummy', b.x, b.y, 28); // a training dummy (#199)
    } else if (b.type === 'warehouse') {
      drawIcon(ctx, 'warehouse', b.x, b.y, 28); // a wooden shed
    } else if (b.type === 'smelter') {
	  ctx.fillStyle = '#7f2d22'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
	  ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
	  drawIcon(ctx, 'fire', b.x, b.y, 13);
	  if ((b.oreLoaded || 0) > 0) {
		ctx.fillStyle = '#34495e'; ctx.fillRect(b.x - 13, b.y - 13, 12, 10);
		ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
		ctx.fillText(`${b.oreLoaded}`, b.x - 7, b.y - 5);
	  }
	  if ((b.ironProduced || 0) > 0) {
		ctx.fillStyle = '#bdc3c7'; ctx.fillRect(b.x + 1, b.y - 13, 12, 10);
		ctx.fillStyle = '#2c3e50'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
		ctx.fillText(`${b.ironProduced}`, b.x + 7, b.y - 5);
	  }
	  if ((b.coalLoaded || 0) > 0) {
		ctx.fillStyle = '#1e272e'; ctx.fillRect(b.x - 11, b.y + 5, 22, 8);
		ctx.fillStyle = '#ffffff'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
		fillRichText(ctx, `[[coal]]${b.coalLoaded}`, b.x, b.y + 11);
	  }
	  if ((b.smeltProgress || 0) > 0) {
		ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(b.x - 14, b.y - 19, 28, 4);
		ctx.fillStyle = '#f1c40f'; ctx.fillRect(b.x - 13, b.y - 18, 26 * Math.min(1, (b.smeltProgress || 0) / getSmelterLimits().seconds), 2);
	  }
}

    drawDamage(b.x, b.y, 14, b.hp / b.maxHp);

    // hp of a damaged building, and a wrench while its repair is ordered
    if (b.hp < b.maxHp) {
      const barY = b.type === 'watchtower' ? b.y - 32 : b.y - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 12, barY, 24, 3);
      ctx.fillStyle = b.hp / b.maxHp > 0.5 ? '#f1c40f' : '#e74c3c';
      ctx.fillRect(b.x - 12, barY, Math.max(0, b.hp / b.maxHp) * 24, 3);
      if (needsRepair(b)) {
        drawIcon(ctx, 'tools', b.x + 16, barY + 1, 10);
      }
    }

    if (b.isDemolishing) {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
      ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
    }
  });
}
