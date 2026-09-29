// A few close shades of the base grass color, plus an occasional darker speckle, so the ground
// isn't one flat repeating fill (#61). Picked per-tile from a coordinate hash, not rand(), so it
// stays put across frames without disturbing the seeded world-gen RNG sequence.
const GRASS_SHADES = ['#2d4a22', '#2f4d25', '#2a4620', '#31501f', '#294419', '#2e4b28'];

function tileVariantHash(gx, gy) {
  let h = Math.imul(gx, 374761393) + Math.imul(gy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function drawGrassGround() {
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) {
      const h = tileVariantHash(gx, gy);
      const x = gx * TILE_SIZE, y = gy * TILE_SIZE;
      ctx.fillStyle = GRASS_SHADES[h % GRASS_SHADES.length];
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      if (h % 7 === 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(x + 4 + ((h >>> 8) % (TILE_SIZE - 10)), y + 4 + ((h >>> 14) % (TILE_SIZE - 10)), 3, 3);
      }
    }
  }
}

function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  let progress = Math.max(0, Math.min(1, (maxHp - Math.max(0, resource.hp)) / maxHp));
  if (progress <= 0) return;

  let x = resource.x - width / 2;
  let y = resource.y - 20;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, width, 4);
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(x + 1, y + 1, (width - 2) * progress, 2);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 4);
}

// Rock with ore veins, shared by ore tiles and ore spawners so they read as the same material.
// half: half the square's size (a full rock tile is 14)
const ORE_COLORS = {
  iron: { body: '#aab7c3', shine: '#dfe6ed' },
  coal: { body: '#050608', shine: '#6b7785' }
};

// Quiver on the back (left edge x), one arrow shown for every 3 left
function drawQuiver(x, arrows) {
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(x - 2, -6, 5, 11);
  ctx.fillStyle = '#ecf0f1';
  for (let i = 0; i < Math.min(4, Math.ceil(arrows / 3)); i++) ctx.fillRect(x - 2 + i * 1.3, -9, 1, 3);
}

// Weapon held in the right hand, drawn around (0, 0) = the unit's centre (translate first).
// Shared by settlers and enemies. Returns false for no weapon (fists).
function drawHeldWeapon(weapon) {
  if (isSwordWeapon(weapon)) {
    ctx.fillStyle = weapon === 'iron_sword' ? '#b0bec5' : '#e0e0e0'; ctx.fillRect(8, -2, 14, 4);
    ctx.fillStyle = '#f39c12'; ctx.fillRect(6, -4, 2, 8);
  } else if (isClubWeapon(weapon)) {
    ctx.fillStyle = '#7a4b21'; ctx.fillRect(6, -2, 8, 4);
    ctx.fillRect(14, -3, 6, 6);
  } else if (isSpearWeapon(weapon)) {
    ctx.fillStyle = weapon === 'iron_spear' ? '#7f8c8d' : '#8e5a2b'; ctx.fillRect(6, -1, 22, 3);
    ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.moveTo(28, -3); ctx.lineTo(35, 0); ctx.lineTo(28, 3); ctx.fill();
  } else if (weapon === 'bow') {
    ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, 0, 10, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  } else {
    return false;
  }
  return true;
}

// Idle settler: a small thought bubble with "zZ" above the head
function drawIdleIcon(x, y) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - 6, y + 7, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#34495e'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('zZ', x, y + 1);
  ctx.textBaseline = 'alphabetic';
}

// Enemy the player marked as a priority target: a red reticle
function drawTargetMark(en) {
  const r = en.radius + 6;
  ctx.strokeStyle = '#ff5c5c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(en.x, en.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(en.x - r - 4, en.y); ctx.lineTo(en.x - r + 3, en.y);
  ctx.moveTo(en.x + r - 3, en.y); ctx.lineTo(en.x + r + 4, en.y);
  ctx.moveTo(en.x, en.y - r - 4); ctx.lineTo(en.x, en.y - r + 3);
  ctx.moveTo(en.x, en.y + r - 3); ctx.lineTo(en.x, en.y + r + 4);
  ctx.stroke();
}

function drawOreVeins(x, y, kind, half) {
  const c = ORE_COLORS[kind];
  const k = half / 14;
  ctx.fillStyle = '#34495e'; ctx.fillRect(x - half, y - half, half * 2, half * 2);
  ctx.strokeStyle = '#1a252f'; ctx.lineWidth = 2; ctx.strokeRect(x - half, y - half, half * 2, half * 2);
  ctx.fillStyle = c.body;
  ctx.fillRect(x - 10 * k, y - 10 * k, 8 * k, 8 * k); ctx.fillRect(x + 1 * k, y - 5 * k, 9 * k, 9 * k); ctx.fillRect(x - 7 * k, y + 3 * k, 7 * k, 7 * k);
  ctx.fillStyle = c.shine;
  ctx.fillRect(x - 8 * k, y - 8 * k, 3 * k, 3 * k); ctx.fillRect(x + 4 * k, y - 2 * k, 3 * k, 3 * k); ctx.fillRect(x - 5 * k, y + 5 * k, 2 * k, 2 * k);
}

// Spawner: the same veined rock on a full tile, framed in the ore colour with a large crystal in the middle
function drawOreSpawner(x, y, kind) {
  const c = ORE_COLORS[kind];
  drawOreVeins(x, y, kind, 14);
  ctx.strokeStyle = c.body; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 11, 22, 22);
  ctx.fillStyle = c.body;
  ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.shine; ctx.fillRect(x - 1, y - 4, 2, 4);
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2 - camera.x * camera.zoom, canvas.height / 2 - camera.y * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);

  drawGrassGround();

  ctx.fillStyle = '#2d4a22';
  ctx.fillRect(0, 0, canvas.width, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, canvas.height - BORDER_MARGIN * TILE_SIZE, canvas.width, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, canvas.height - 2 * BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(canvas.width - BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, canvas.height - 2 * BORDER_MARGIN * TILE_SIZE);

  ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, canvas.width - 2 * BORDER_MARGIN * TILE_SIZE, canvas.height - 2 * BORDER_MARGIN * TILE_SIZE);

  desertTiles.forEach(tile => {
    ctx.fillStyle = '#c9a66b';
    ctx.fillRect(tile.x - 15.5, tile.y - 15.5, TILE_SIZE + 1, TILE_SIZE + 1);
    ctx.fillStyle = 'rgba(255, 236, 179, 0.25)';
    ctx.fillRect(tile.x - 8, tile.y - 5, 3, 2);
    ctx.fillRect(tile.x + 7, tile.y + 8, 2, 2);
  });

  if (buildMode !== 'interact' && buildMode !== 'possess') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    let gxIdx = Math.floor(mouse.x / TILE_SIZE);
    let gyIdx = Math.floor(mouse.y / TILE_SIZE);
    let gx = gxIdx * TILE_SIZE;
    let gy = gyIdx * TILE_SIZE;
    if (isBorderZone(gxIdx, gyIdx) && buildMode !== 'demolish') {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.5)';
    } else {
      ctx.fillStyle = buildMode === 'demolish' ? 'rgba(231, 76, 60, 0.35)' : 'rgba(70, 184, 218, 0.25)';
    }
    ctx.fillRect(gx, gy, TILE_SIZE, TILE_SIZE);
  }

  waterTiles.forEach(w => {
    let reachable = isWaterReachable(w);
    ctx.fillStyle = reachable ? '#2980b9' : '#1c5276'; 
    ctx.fillRect(w.x - 15, w.y - 15, 30, 30);
    ctx.fillStyle = reachable ? '#3498db' : '#2471a3'; 
    ctx.fillRect(w.x - 12, w.y - 12, 24, 24);
    if (w.isFishing) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3;
      ctx.strokeRect(w.x - 14, w.y - 14, 28, 28);
      ctx.fillStyle = '#f1c40f'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🎣', w.x, w.y + 6);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(w.x - 14, w.y - 22, 28, 4);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(w.x - 13, w.y - 21, 26 * Math.min(1, (w.fishTimer || 0) / 3), 2);
      ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 1;
      ctx.strokeRect(w.x - 14, w.y - 22, 28, 4);
    }
  });

  naturalRocks.forEach(r => {
    if (r.oreSpawner) {
      drawOreSpawner(r.x, r.y, r.oreSpawner);
    } else {
      ctx.fillStyle = '#34495e'; ctx.fillRect(r.x - 14, r.y - 14, 28, 28);
      ctx.strokeStyle = '#1a252f'; ctx.lineWidth = 2; ctx.strokeRect(r.x - 14, r.y - 14, 28, 28);
    }
    drawHarvestProgress(r, 36);
  });

  sticks.forEach(st => {
    ctx.strokeStyle = '#8e5a2b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(st.x - 6, st.y - 4); ctx.lineTo(st.x + 6, st.y + 4); ctx.stroke();
  });

  pebbles.forEach(pe => {
    ctx.fillStyle = '#bdc3c7';
    ctx.beginPath(); ctx.arc(pe.x - 2, pe.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(pe.x + 3, pe.y + 2, 2, 0, Math.PI * 2); ctx.fill();
  });

  // minable ore: the spawner's veined rock on a full tile, like natural rock (the spawner adds a frame and crystal)
  ironOres.forEach(ore => {
    drawOreVeins(ore.x, ore.y, 'iron', 14);
    drawHarvestProgress(ore);
  });

  coalOres.forEach(ore => {
    drawOreVeins(ore.x, ore.y, 'coal', 14);
    drawHarvestProgress(ore);
  });

  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath(); ctx.arc(townHall.x, townHall.y, townHall.radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 4; ctx.stroke();
  
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(townHall.x - 30, townHall.y - 45, 60, 8);
  ctx.fillStyle = townHall.hp > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(townHall.x - 30, townHall.y - 45, (Math.max(0, townHall.hp) / townHall.maxHp) * 60, 8);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(townHall.x - 30, townHall.y - 45, 60, 8);

  if (townHall.hp < townHall.maxHp) {
    ctx.fillStyle = townHall.repairRequested ? '#f1c40f' : '#e74c3c';
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(townHall.repairRequested ? '🛠️ Ремонт (15🪵 15🪨)' : '⚠️ Нужен ремонт', townHall.x, townHall.y - 52);
  }

  trees.forEach(t => {
    if (t.isGrowing) {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(t.x - 2, t.y - 6, 4, 12);
      ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(t.x + 4, t.y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(t.x - 10, t.y + 8, 20, 3);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(t.x - 10, t.y + 8, ((t.growProgress || 0) / 20) * 20, 3);
    } else {
      ctx.fillStyle = '#1e3d14'; ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2e5d20'; ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, 9, 0, Math.PI * 2); ctx.fill();
      drawHarvestProgress(t);
    }
  });

  cacti.forEach(c => {
    ctx.fillStyle = '#2f8f46';
    ctx.fillRect(c.x - 4, c.y - 13, 8, 26);
    ctx.fillRect(c.x - 11, c.y - 5, 7, 5);
    ctx.fillRect(c.x + 4, c.y + 2, 7, 5);
    ctx.fillStyle = '#b7e08a';
    ctx.fillRect(c.x - 2, c.y - 10, 2, 20);
    drawHarvestProgress(c);
  });

  boulders.forEach(b => {
    // square like natural rock, but a smaller, lighter grey block so it reads as loose, minable stone
    ctx.fillStyle = '#7f8c8d'; ctx.fillRect(b.x - 11, b.y - 11, 22, 22);
    ctx.fillStyle = '#a4b0b5'; ctx.fillRect(b.x - 11, b.y - 11, 22, 5); ctx.fillRect(b.x - 11, b.y - 11, 5, 22);
    ctx.strokeStyle = '#5d6d7e'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 11, b.y - 11, 22, 22);
    drawHarvestProgress(b);
  });

  grassList.forEach(g => {
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(g.x - 6, g.y - 8, 3, 16); ctx.fillRect(g.x - 1, g.y - 10, 3, 18); ctx.fillRect(g.x + 4, g.y - 6, 3, 14);
    drawHarvestProgress(g, 20);
  });

  berryBushes.forEach(b => {
    ctx.fillStyle = '#1e824c'; ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(b.x - 4, b.y - 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(b.x + 4, b.y - 2, 3, 0, Math.PI * 2); ctx.fill();
    drawHarvestProgress(b, 22);
  });

  boars.forEach(b => {
    ctx.save();
    if (b.isCarcass) {
      ctx.fillStyle = '#633c2b';
      ctx.beginPath(); ctx.ellipse(b.x, b.y + 3, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3e2723';
      ctx.beginPath(); ctx.arc(b.x + 11, b.y + 1, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b85c4a';
      ctx.fillRect(b.x - 4, b.y + 1, 5, 3);
      ctx.strokeStyle = '#2b1b17'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      return;
    }
    if (b.hidden) ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#a0522d'; ctx.beginPath(); ctx.arc(b.x, b.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('🐗', b.x, b.y + 4);
    if (b.hp < b.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(b.x - 12, b.y - 16, 24, 3);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(b.x - 12, b.y - 16, (b.hp / b.maxHp) * 24, 3);
    }
    ctx.restore();
  });

  farmPlots.forEach(f => {
    ctx.fillStyle = '#5c4033'; ctx.fillRect(f.x - 13, f.y - 13, 26, 26);
    if (f.growth < 100) {
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(f.x - 6, f.y - 6, 12, 12);
    } else {
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(f.x - 10, f.y - 10, 20, 20);
      if (f.harvestProgress > 0) {
        ctx.fillStyle = '#e67e22'; ctx.fillRect(f.x - 10, f.y + 11, (f.harvestProgress / 2.5) * 20, 3);
      }
    }
  });

  getHarvestableResources().forEach(r => {
    if (r.priority > 0) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`🎯 x${r.priority}`, r.x, r.y - 18);
    }
  });

  blueprints.forEach(bp => {
    ctx.save(); ctx.globalAlpha = 0.5;
    if (bp.type === 'demolish_building') ctx.fillStyle = '#e74c3c';
    else if (bp.type === 'wall_wood') ctx.fillStyle = '#8e5a2b';
    else if (bp.type === 'wall_stone') ctx.fillStyle = '#7f8c8d';
    else if (bp.type === 'door') ctx.fillStyle = '#a0522d';
    else if (bp.type === 'wheat') ctx.fillStyle = '#f1c40f';
    else if (bp.type === 'tent') ctx.fillStyle = '#e67e22';
    else if (bp.type === 'smelter') ctx.fillStyle = '#c0392b';
    else if (bp.type === 'watchtower') ctx.fillStyle = '#607d8b';
    else if (bp.type === 'sapling') ctx.fillStyle = '#2ecc71';
    ctx.fillRect(bp.x - 14, bp.y - 14, 28, 28);
    ctx.restore();

    if (bp.type === 'demolish_building') {
      ctx.fillStyle = '#e74c3c'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🔨', bp.x, bp.y + 5);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(bp.x - 12, bp.y + 16, (bp.progress / bp.maxProgress) * 24, 3);
    } else {
      ctx.fillStyle = '#fff'; ctx.fillRect(bp.x - 12, bp.y + 16, (bp.progress / bp.maxProgress) * 24, 3);
    }
  });

  buildings.forEach(b => {
    if (b.type === 'wall_wood') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#5c3a17'; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
    } else if (b.type === 'wall_stone') {
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
    } else if (b.type === 'door') {
      ctx.fillStyle = '#a0522d'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
      ctx.fillStyle = '#f39c12'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🚪', b.x, b.y + 4);
    } else if (b.type === 'tent') {
      ctx.fillStyle = '#d35400'; ctx.beginPath();
      ctx.moveTo(b.x, b.y - 14); ctx.lineTo(b.x + 14, b.y + 14); ctx.lineTo(b.x - 14, b.y + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f39c12'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏕️', b.x, b.y + 10);
	  
    } else if (b.type === 'watchtower') {
      ctx.fillStyle = '#607d8b'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.fillStyle = '#90a4ae'; ctx.fillRect(b.x - 10, b.y - 19, 20, 8);
      ctx.strokeStyle = '#263238'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
      ctx.fillStyle = '#eceff1'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🗼', b.x, b.y + 7);
      ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 9px sans-serif'; ctx.fillText(`🏹 ${b.arrows || 0}/${b.tower.arrowCapacity}`, b.x, b.y - 22);
      ctx.fillStyle = '#95a5a6'; ctx.fillRect(b.x - 12, b.y + 16, 24, 3);
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(b.x - 11, b.y + 17, 22 * Math.min(1, (b.arrows || 0) / b.tower.arrowCapacity), 1);

    } else if (b.type === 'smelter') {
	  ctx.fillStyle = '#7f2d22'; ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
	  ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2; ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
	  ctx.fillStyle = '#f1c40f'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
	  ctx.fillText('🔥', b.x, b.y + 3);
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
		ctx.fillText(`⬛${b.coalLoaded}`, b.x, b.y + 11);
	  }
	  if (b.smeltProgress > 0) {
		ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(b.x - 14, b.y - 19, 28, 4);
		ctx.fillStyle = '#f1c40f'; ctx.fillRect(b.x - 13, b.y - 18, 26 * Math.min(1, b.smeltProgress / 4), 2);
	  }
}

    if (b.isDemolishing) {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
      ctx.fillRect(b.x - 14, b.y - 14, 28, 28);
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2;
      ctx.strokeRect(b.x - 14, b.y - 14, 28, 28);
    }
  });

  enemyTents.forEach(et => {
    ctx.fillStyle = '#641e16'; ctx.beginPath();
    ctx.moveTo(et.x, et.y - 14); ctx.lineTo(et.x + 14, et.y + 14); ctx.lineTo(et.x - 14, et.y + 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e74c3c'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛺', et.x, et.y + 8);

    if (et.hp < et.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(et.x - 14, et.y - 20, 28, 4);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(et.x - 14, et.y - 20, (et.hp / et.maxHp) * 28, 4);
    }
  });

  enemyTentBlueprints.forEach(site => {
    ctx.fillStyle = 'rgba(192, 57, 43, 0.35)';
    ctx.beginPath();
    ctx.moveTo(site.x, site.y - 14); ctx.lineTo(site.x + 14, site.y + 14); ctx.lineTo(site.x - 14, site.y + 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(site.x - 14, site.y - 20, 28, 4);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(site.x - 14, site.y - 20, (site.progress / site.maxProgress) * 28, 4);
  });

  settlers.forEach(s => {
    ctx.fillStyle = s.isPossessed ? '#3498db' : (s.role === 'worker' ? '#2ecc71' : '#e67e22');
    ctx.beginPath(); ctx.arc(s.x, s.y, s.visualRadius, 0, Math.PI * 2); ctx.fill();

    if (s.carrying) {
      let icon = s.carrying.type === 'bundle' ? '📦' : (s.carrying.type === 'food' ? '🍖' : (s.carrying.type === 'wood' ? '🪵' : (s.carrying.type === 'stone' ? '🪨' : (s.carrying.type === 'iron' ? '🔩' : (s.carrying.type === 'ironOre' ? '⛏️' : (s.carrying.type === 'coal' ? '⚫' : (s.carrying.type === 'leather' ? '🟫' : '🌾')))))));
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(icon, s.x, s.y - s.visualRadius - 5);
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    if (!drawHeldWeapon(s.weapon)) {
    if (s.tool === 'axe' || s.tool === 'iron_axe') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 12, 3);
      ctx.fillStyle = s.tool === 'iron_axe' ? '#cfd8dc' : '#7f8c8d'; ctx.fillRect(16, -5, 5, 10);
    } else if (s.tool === 'pickaxe' || s.tool === 'iron_pickaxe') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 12, 3);
      ctx.fillStyle = s.tool === 'iron_pickaxe' ? '#cfd8dc' : '#7f8c8d'; ctx.beginPath(); ctx.arc(18, 0, 7, -Math.PI/2, Math.PI/2); ctx.fill();
    } else if (s.tool === 'rod') {
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(22, -10); ctx.stroke();
    }
    }
    if (s.armor === 'iron' || s.hasArmor) {
	  ctx.strokeStyle = '#95a5a6';
	  ctx.lineWidth = 3;
	  ctx.beginPath(); 
	  ctx.arc(0, 0, s.visualRadius + 2, 0, Math.PI * 2);
	  ctx.stroke();
	}
    if (s.quiver) {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-s.visualRadius - 3, -5, 4, 10);
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s.visualRadius - 2, -4); ctx.lineTo(-s.visualRadius - 2, -10); ctx.moveTo(-s.visualRadius, -4); ctx.lineTo(-s.visualRadius, -10); ctx.stroke();
    }
    ctx.restore();

    if (s === selectedSettler) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.visualRadius + 4, 0, Math.PI * 2); ctx.stroke();
    }

    if (s.isIdle && !s.carrying) drawIdleIcon(s.x + s.visualRadius, s.y - s.visualRadius - 16);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x - 15, s.y - s.visualRadius - 10, 30, 4);
    ctx.fillStyle = '#2ecc71'; ctx.fillRect(s.x - 15, s.y - s.visualRadius - 10, (Math.max(0, s.hp) / s.maxHp) * 30, 4);
  });

  enemies.forEach(en => {
    // enemies are red (brutes darker), holding their weapon the same way settlers do
    ctx.fillStyle = en.type === 'big' ? '#a93226' : '#e74c3c';
    ctx.beginPath(); ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7b241c'; ctx.lineWidth = 2; ctx.stroke();

    ctx.save();
    ctx.translate(en.x, en.y);
    if (en.type === 'big') ctx.translate(en.radius - 11, 0); // hands at the edge of the larger body
    drawHeldWeapon(en.weapon);
    if (en.arrows > 0) drawQuiver(-en.radius, en.arrows);
    ctx.restore();

    if (en.markedTarget) drawTargetMark(en);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(en.x - 12, en.y - en.radius - 8, 24, 3);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(en.x - 12, en.y - en.radius - 8, (Math.max(0, en.hp) / en.maxHp) * 24, 3);
  });

  projectiles.forEach(proj => {
    ctx.fillStyle = proj.fromEnemy ? '#e74c3c' : (proj.fromTower ? '#95a5a6' : '#f1c40f');
    ctx.beginPath(); ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2); ctx.fill();
  });

  ctx.restore();

  if (gameStarted && (townHall.hp <= 0 || settlers.length === 0)) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ПОРАЖЕНИЕ!', canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.fillText(`Вы продержались ${waveNum - 1} волн`, canvas.width / 2, canvas.height / 2 + 15);

    let btnX = canvas.width / 2 - 100;
    let btnY = canvas.height / 2 + 50;
    ctx.fillStyle = '#27ae60'; ctx.fillRect(btnX, btnY, 200, 45);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText('Начать заново', canvas.width / 2, btnY + 28);
  }
}
