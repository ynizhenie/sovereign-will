// A damaged building looks it

import { GAME_CONFIG, getDefinition } from '../../../content/configs/index.js';
import { drawIcon, fillRichText, getResourceIconName } from '../../../ui/index.js';
import { ctx, getViewRect, mouse, setFont, t } from '../../../engine/platform/index.js';
import { TILE_SIZE, game, isBorderZone, townHall } from '../../../engine/world/index.js';
import { formatCost } from '../../colony/storage/index.js';
import { getHallRepairStep, getSmelterLimits, needsRepair } from './building.rules.js';
import { getBuildingColor, getEnemyColor, getPlayerFaction } from '../../factions/index.js';
import { DUMMY_VARIANTS, LINK, drawCampfireArt, drawDenArt, drawDoorArt, drawDummyArt, drawHallArt, drawSmelterArt, drawSmithyArt, drawSpikesArt, drawStoneWall, drawTentArt, drawTorchPostArt, drawWarehouseArt, drawWatchtowerArt, drawWoodWall, drawWorkshopArt, shadow } from './building.art.js';
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
  if (game.buildMode !== 'interact') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    // (#299: the lines on the screen, in one path)
    const v = getViewRect(TILE_SIZE);
    const x0 = Math.max(0, Math.floor(v.x0 / TILE_SIZE) * TILE_SIZE), x1 = Math.min(game.WORLD_WIDTH, v.x1), y0 = Math.max(0, Math.floor(v.y0 / TILE_SIZE) * TILE_SIZE), y1 = Math.min(game.WORLD_HEIGHT, v.y1);
    ctx.beginPath();
    for (let x = x0; x < x1; x += TILE_SIZE) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = y0; y < y1; y += TILE_SIZE) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
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

// (#279) the menu's warehouse: as one in the game, hurt as one is when the zombies get at it, and broken, a heap
// of planks
function drawMenuWarehouse() {
  const x = townHall.x, y = townHall.y, share = Math.max(0, townHall.hp) / townHall.maxHp;
  if (share <= 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
    for (const [dx, dy, a, w] of [[-8, 2, 0.4, 16], [4, -3, -0.7, 14], [0, 6, 0.1, 18], [-3, -6, 1.2, 12], [8, 5, 0.9, 10]]) {
      ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(a); ctx.fillStyle = '#6d4520'; ctx.fillRect(-w / 2, -1.5, w, 3); ctx.restore();
    }
    ctx.fillStyle = '#7b241c'; ctx.fillRect(x - 6, y - 3, 9, 4);
    return;
  }
  drawWarehouseArt(x, y);
  if (share < 1) {
    drawDamage(x, y, 13, share);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 15, y - 22, 30, 4);
    ctx.fillStyle = share > 0.4 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(x - 15, y - 22, share * 30, 4);
  }
}

// The town hall (the demons' Hell Gate, the undead's graveyard), its health and repair. Behind the main
// menu it's drawn as a warehouse, the storage it is there (#200)
export function drawTownHall() {
  if (game.gameMode === 'menu') { drawMenuWarehouse(); return; } // (as a warehouse in the game, #256)
 // each faction's own, not round (building.art.js, #251)
  drawHallArt(townHall.x, townHall.y);

  drawDamage(townHall.x, townHall.y, townHall.radius - 4, townHall.hp / townHall.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(townHall.x - 30, townHall.y - 45, 60, 8);
  ctx.fillStyle = townHall.hp > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(townHall.x - 30, townHall.y - 45, (Math.max(0, townHall.hp) / townHall.maxHp) * 60, 8);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(townHall.x - 30, townHall.y - 45, 60, 8);

  if (townHall.hp < townHall.maxHp) {
    ctx.fillStyle = townHall.repairRequested ? '#f1c40f' : '#e74c3c';
    setFont('bold 12px sans-serif'); ctx.textAlign = 'center';
    fillRichText(ctx, townHall.repairRequested ? t('repair.hall', { cost: formatCost(getHallRepairStep().left) }) : t('repair.hallNeeded'), townHall.x, townHall.y - 52);
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

// (#326) Walls and doors join: a piece's neighbours (the four tiles round it that hold a wall or a door)
const isWallPiece = b => b.type === 'wall_wood' || b.type === 'wall_stone' || b.type === 'door' || b.type === 'iron_door';
function wallLinks() {
  const at = new Map();
  for (const b of game.buildings) if (isWallPiece(b)) at.set(`${Math.round(b.x / TILE_SIZE)},${Math.round(b.y / TILE_SIZE)}`, b);
  const links = new Map();
  for (const [key, b] of at) {
    const [cx, cy] = key.split(',').map(Number);
    let mask = 0;
    if (at.has(`${cx},${cy - 1}`)) mask |= LINK.n;
    if (at.has(`${cx + 1},${cy}`)) mask |= LINK.e;
    if (at.has(`${cx},${cy + 1}`)) mask |= LINK.s;
    if (at.has(`${cx - 1},${cy}`)) mask |= LINK.w;
    links.set(b, mask);
  }
  return links;
}

// A door opens as someone comes to it and shuts after (the animation is only drawn, nothing waits for it)
let lastDraw = performance.now();
function doorOpening(b, dt) {
  const near = u => u.hp > 0 && Math.abs(u.x - b.x) < 26 && Math.abs(u.y - b.y) < 26;
  const wanted = game.settlers.some(near) || game.enemies.some(near) ? 1 : 0;
  const now = b.openness || 0;
  b.openness = wanted > now ? Math.min(1, now + dt * 5) : Math.max(0, now - dt * 2.5);
  return b.openness;
}

// A door opens away from the hall (or the enemy's outpost; in a battle from its side's end of the field)
function doorSwing(b, mask) {
  let home;
  if (b.side === 'red') {
    const camp = game.enemyTents.find(et => et.outpost);
    home = camp || { x: game.WORLD_WIDTH, y: game.WORLD_HEIGHT / 2 };
  } else home = game.gameMode === 'battle' ? { x: 0, y: game.WORLD_HEIGHT / 2 } : townHall;
  const dx = b.x - home.x, dy = b.y - home.y;
  const horizontalRun = !((mask & (LINK.n | LINK.s)) && !(mask & (LINK.e | LINK.w)));
  return horizontalRun ? { x: 0, y: dy >= 0 ? 1 : -1 } : { x: dx >= 0 ? 1 : -1, y: 0 };
}

// Buildings, each kind its own way, with their damage, health and repair, and demolition marks
export function drawBuildings() {
  const now = performance.now(), dt = Math.min(0.1, (now - lastDraw) / 1000); lastDraw = now;
  const links = wallLinks();
  game.buildings.forEach(b => {
    // (the look: building.art.js, #251)
    if (b.type === 'wall_wood') {
      drawWoodWall(b.x, b.y, links.get(b) || 0);
    } else if (b.type === 'wall_stone') {
      drawStoneWall(b.x, b.y, links.get(b) || 0);
    } else if (b.type === 'door' || b.type === 'iron_door') {
      const open = doorOpening(b, dt);
      drawDoorArt(b.x, b.y, b.type === 'iron_door', links.get(b) || 0, open, doorSwing(b, links.get(b) || 0));
    } else if (b.type === 'iron_trap') {
      // an iron trap (#248): open, with food in it when baited; shut on whoever it holds
      shadow(b.x, b.y, 22, 18, 6); // (#326: a shadow under everything)
      if (b.holding) {
        ctx.strokeStyle = '#7f8c8d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(b.x - 11, b.y); ctx.lineTo(b.x + 11, b.y); ctx.stroke();
      } else {
        drawIcon(ctx, 'iron_trap', b.x, b.y, 24);
        if (b.bait) drawIcon(ctx, 'food', b.x, b.y, 9);
      }
    } else if (b.type === 'grave' || b.type === 'sacrifice_circle' || b.type === 'portal') {
      if (b.type === 'portal') drawPortal(b.x, b.y, getBuildingColor(b)); // in its side's colour (#326: a battle's too)
      else { shadow(b.x, b.y + 3, b.type === 'grave' ? 18 : 26, b.type === 'grave' ? 14 : 20, 6); drawIcon(ctx, b.type, b.x, b.y, 28); } // the undead's and the demons'
    } else if (b.type === 'tent') {
      drawTentArt(b.x, b.y);
    } else if (b.type === 'spikes') {
      // stakes on a plank base (#326); a dot per use left; broken (none left): the stakes bent over, grey
      drawSpikesArt(b.x, b.y, !((b.usesLeft || 0) > 0));
      ctx.fillStyle = '#e74c3c';
      for (let i = 0; i < Math.min(b.usesLeft || 0, 5); i++) ctx.fillRect(b.x - 12 + i * 5, b.y + 13, 3, 2);
    } else if (b.type === 'watchtower') {
      // a wooden lookout, where its archer stands (drawn with the settlers)
      drawWatchtowerArt(b.x, b.y);

    } else if (b.type === 'campfire') {
      // (#326) a ring of stones, logs across, its flames while it burns (#298: while it has fuel)
      drawCampfireArt(b.x, b.y, (b.burning || 0) > 0);
      // fuel left (orange) and the piece cooking now (yellow)
      const perFuel = Math.max(...Object.values(GAME_CONFIG.cooking.fuel));
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 12, b.y - 20, 24, 3); ctx.fillRect(b.x - 12, b.y - 16, 24, 3);
      ctx.fillStyle = '#e67e22'; ctx.fillRect(b.x - 12, b.y - 20, 24 * Math.min(1, (b.fuelLeft || 0) / perFuel), 3);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(b.x - 12, b.y - 16, 24 * Math.min(1, b.cookProgress || 0), 3);
    } else if (b.type === 'workshop') {
      drawWorkshopArt(b.x, b.y); // (#248)
    } else if (b.type === 'smithy') {
      drawSmithyArt(b.x, b.y); // (#211)
    } else if (b.type === 'mine') {
      drawIcon(ctx, 'mine', b.x, b.y, 28); // (#326, 27.10, 26: over the source)
    } else if (b.type === 'fish_trap') {
      // a fish trap (#199): a basket, a fish mark for each fish waiting in it
      drawIcon(ctx, 'fish_trap', b.x, b.y, 26);
      if (!((b.baitLeft || 0) > 0)) drawIcon(ctx, 'worms', b.x + 9, b.y + 9, 10); // (needs bait, #248)
      for (let k = 0; k < (b.fish || 0); k++) { ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.ellipse(b.x - 9 + k * 6, b.y - 13, 2.5, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (b.type === 'dung_heap') {
      // a compost heap (#232): bigger the more dung it holds
      const share = Math.min(1, (b.dung || 0) / (GAME_CONFIG.buildings.dung_heap.dungCapacity || 5));
      shadow(b.x, b.y + 6, 28, 12, 3);
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(b.x - 14, b.y + 4, 28, 8);
      ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(b.x - 14, b.y + 4, 28, 8);
      if (share > 0) {
        ctx.fillStyle = '#5c3d16'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 4, 4 + 9 * share, 3 + 9 * share, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#6e4a1c'; ctx.beginPath(); ctx.ellipse(b.x - 1, b.y + 4 - 6 * share, 2 + 4 * share, 1.5 + 3 * share, 0, Math.PI, 0); ctx.fill();
      }
    } else if (b.type === 'dummy') {
      // a training dummy (#199): one of its looks, picked once (#326: the commoner ones more often)
      if (!b.variant) {
        let n = Math.random() * DUMMY_VARIANTS.reduce((sum, v) => sum + Number(v[1]), 0);
        b.variant = String((DUMMY_VARIANTS.find(v => (n -= Number(v[1])) < 0) || DUMMY_VARIANTS[0])[0]);
      }
      drawDummyArt(b.x, b.y, b.variant);
    } else if (b.type === 'warehouse') {
      drawWarehouseArt(b.x, b.y);
    } else if (b.type === 'torch') {
      drawTorchPostArt(b.x, b.y, !!b.lit); // a torch post (#257): a stake, its head burning when lit
    } else if (b.type === 'demon_den') {
      drawDenArt(b.x, b.y); // the demons' den (#250)
    } else if (b.type === 'corpse_pit') {
      // a dark pit (#250), a grey body in it for each corpse it holds
      ctx.fillStyle = '#3b2a20'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 13, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1b120d'; ctx.beginPath(); ctx.ellipse(b.x, b.y + 1, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
      (b.corpses || []).forEach((c, i) => { ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.ellipse(b.x - 5 + i * 5, b.y + (i % 2 ? 2 : -1), 5, 3, 0.4 * (i - 1), 0, Math.PI * 2); ctx.fill(); });
    } else if (b.type === 'cage') {
      // a cage (#250): who's in it behind the bars, in the enemy's colour
      shadow(b.x, b.y + 2, 26, 22, 3);
      if (b.captive) { ctx.fillStyle = getEnemyColor(); ctx.beginPath(); ctx.arc(b.x, b.y + 2, 8, 0, Math.PI * 2); ctx.fill(); }
      drawIcon(ctx, 'cage', b.x, b.y, 28);
    } else if (b.type === 'smelter') {
	  drawSmelterArt(b.x, b.y);
	  if ((b.oreLoaded || 0) > 0) {
		ctx.fillStyle = '#34495e'; ctx.fillRect(b.x - 13, b.y - 13, 12, 10);
		ctx.fillStyle = '#ffffff'; setFont('bold 9px sans-serif'); ctx.textAlign = 'center';
		ctx.fillText(`${b.oreLoaded}`, b.x - 7, b.y - 5);
	  }
	  if ((b.ironProduced || 0) > 0) {
		ctx.fillStyle = '#bdc3c7'; ctx.fillRect(b.x + 1, b.y - 13, 12, 10);
		ctx.fillStyle = '#2c3e50'; setFont('bold 9px sans-serif'); ctx.textAlign = 'center';
		ctx.fillText(`${b.ironProduced}`, b.x + 7, b.y - 5);
	  }
	  if ((b.coalLoaded || 0) > 0) {
		ctx.fillStyle = '#1e272e'; ctx.fillRect(b.x - 11, b.y + 5, 22, 8);
		ctx.fillStyle = '#ffffff'; setFont('8px sans-serif'); ctx.textAlign = 'center';
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
