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

// ---- Terrain that joins up (#79)
//
// Water joins water, natural rock joins rock and ore: every tile covers its whole square, and gets an
// outline only on sides with no neighbour of its kind, so lakes and rock masses read as shapes instead
// of a grid of separate squares. Shades and details vary per tile (tileVariantHash).
const WATER_SHADES = ['#2c83bd', '#2a80b9', '#2d85be', '#2a7db5'];
const DEEP_WATER_SHADES = ['#1c5276', '#1b5074', '#1d5479', '#1a4e71']; // water no settler can reach
const ROCK_SHADES = ['#34495e', '#33475b', '#364b60', '#32465a', '#354a5f'];
const DESERT_SHADES = ['#c9a66b', '#cba96f', '#c7a468', '#cdab72'];

// Which sides of tile (x, y) have no neighbour in `keys` (a Set of "x,y" tile centres)
function openSides(keys, x, y) {
  return {
    n: !keys.has(`${x},${y - TILE_SIZE}`), s: !keys.has(`${x},${y + TILE_SIZE}`),
    w: !keys.has(`${x - TILE_SIZE},${y}`), e: !keys.has(`${x + TILE_SIZE},${y}`)
  };
}

// The whole tile in its shade, with an outline just inside the sides that have no neighbour of its kind
function drawJoinedTile(x, y, open, edgeColor, fillColor) {
  ctx.fillStyle = fillColor; ctx.fillRect(x - 15, y - 15, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = edgeColor;
  if (open.n) ctx.fillRect(x - 15, y - 15, TILE_SIZE, 2);
  if (open.s) ctx.fillRect(x - 15, y + 13, TILE_SIZE, 2);
  if (open.w) ctx.fillRect(x - 15, y - 15, 2, TILE_SIZE);
  if (open.e) ctx.fillRect(x + 13, y - 15, 2, TILE_SIZE);
}

function drawWaterTile(w, reachable, tiles) {
  const h = tileVariantHash(w.x, w.y);
  const shades = reachable ? WATER_SHADES : DEEP_WATER_SHADES;
  drawJoinedTile(w.x, w.y, openSides(tiles.water, w.x, w.y), reachable ? '#1f618d' : '#154360', shades[h % shades.length]);
  // a short light ripple on some tiles
  if (h % 3 === 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; ctx.lineWidth = 1.5;
    const rx = w.x - 6 + ((h >>> 5) % 10), ry = w.y - 6 + ((h >>> 9) % 12);
    ctx.beginPath(); ctx.arc(rx, ry + 4, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
}

// Natural rock (and the rock under ore): joins every rock and ore tile around it
function drawRockTile(x, y, tiles) {
  const h = tileVariantHash(x, y);
  drawJoinedTile(x, y, openSides(tiles.rockAndOre, x, y), '#1a252f', ROCK_SHADES[h % ROCK_SHADES.length]);
  // a crack or a couple of speckles
  if (h % 4 === 0) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'; ctx.lineWidth = 1;
    const cx = x - 7 + ((h >>> 6) % 12), cy = y - 7 + ((h >>> 11) % 12);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 4, cy + 3); ctx.lineTo(cx + 3, cy + 8); ctx.stroke();
  } else if (h % 4 === 1) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(x - 8 + ((h >>> 6) % 14), y - 8 + ((h >>> 11) % 14), 3, 3);
    ctx.fillRect(x - 4 + ((h >>> 16) % 10), y - 2 + ((h >>> 20) % 10), 2, 2);
  }
}

function drawDesertTile(tile) {
  const h = tileVariantHash(tile.x, tile.y);
  ctx.fillStyle = DESERT_SHADES[h % DESERT_SHADES.length];
  ctx.fillRect(tile.x - 15.5, tile.y - 15.5, TILE_SIZE + 1, TILE_SIZE + 1);
  ctx.fillStyle = 'rgba(255, 236, 179, 0.25)';
  if (h % 3 === 0) {
    // a dune ripple
    ctx.strokeStyle = 'rgba(120, 90, 40, 0.25)'; ctx.lineWidth = 1;
    const ry = tile.y - 6 + ((h >>> 7) % 12);
    ctx.beginPath(); ctx.moveTo(tile.x - 10, ry); ctx.quadraticCurveTo(tile.x, ry - 4, tile.x + 10, ry); ctx.stroke();
  } else {
    ctx.fillRect(tile.x - 10 + ((h >>> 5) % 16), tile.y - 8 + ((h >>> 9) % 14), 3, 2);
    ctx.fillRect(tile.x - 6 + ((h >>> 13) % 14), tile.y - 4 + ((h >>> 17) % 14), 2, 2);
  }
}

function getHarvestMaxHp(resource) {
  if (resource.maxHp) return resource.maxHp;
  const def = getMapResourceDef(getMapResourceKind(resource));
  return (def && def.hp) || 1;
}

function drawHarvestProgress(resource, width = 24) {
  let maxHp = getHarvestMaxHp(resource);
  drawProgressBar(resource.x, resource.y, (maxHp - Math.max(0, resource.hp)) / maxHp, width);
}

// A small yellow bar above a thing being worked on, share 0..1 done
function drawProgressBar(cx, cy, share, width = 24) {
  const progress = Math.max(0, Math.min(1, share));
  if (progress <= 0) return;

  let x = cx - width / 2;
  let y = cy - 20;
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

// How the held weapon or tool is posed right now: a rotation around the body and a push forward.
// A strike (swingT): swords, clubs, fists and tools sweep an arc, spears thrust, bows recoil. Working
// (chopping, mining, planting...): a steady chop in time with the game's ticks, so replays look the same.
function getHeldItemPose(unit) {
  const item = unit.weapon && unit.weapon !== 'fist' ? unit.weapon : (unit.tool && unit.tool !== 'none' ? unit.tool : 'fist');
  if (unit.swingT > 0) {
    const p = 1 - unit.swingT / (unit.swingLen || 0.3);
    const arc = Math.sin(Math.PI * p);
    if (isBowWeapon(item)) return { angle: 0, push: -3 * arc };
    if (isSpearWeapon(item)) return { angle: 0, push: 8 * arc };
    return { angle: -0.9 + 1.8 * p, push: 0 };
  }
  if (unit.working > 0) {
    const beat = Math.sin(pathTick * 0.3);
    if (item === 'rod') return { angle: 0.12 * beat, push: 0 };
    if (item === 'fist' || item === 'medbag') return { angle: 0, push: 2 * beat };
    return { angle: 0.7 * beat - 0.2, push: 0 };
  }
  return { angle: 0, push: 0 };
}

// The held item points where the unit faces (faceTowards), posed on top of that
function applyHeldItemPose(unit) {
  const pose = getHeldItemPose(unit);
  ctx.rotate((unit.facing || 0) + pose.angle);
  ctx.translate(pose.push, 0);
}

// Blood on the blade of the held item, fading (see bleed)
function drawWeaponBlood(unit) {
  const alpha = bloodAlpha(unit.weaponBloodAge);
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(120, 0, 0, ${0.85 * alpha})`;
  ctx.fillRect(14, -2, 7, 4);
}

// Blood on a hurt unit's body: a few blotches at spots fixed per unit; stays while badly wounded
function drawBodyBlood(unit, radius) {
  const alpha = bodyBloodAlpha(unit);
  if (alpha <= 0) return;
  ctx.fillStyle = `rgba(110, 0, 0, ${0.8 * alpha})`;
  const h = tileVariantHash(Math.round(unit.id || unit.maxHp || 1), 7);
  for (let i = 0; i < 3; i++) {
    const a = ((h >>> (i * 5)) % 360) * Math.PI / 180, d = radius * 0.45;
    ctx.beginPath(); ctx.arc(unit.x + Math.cos(a) * d, unit.y + Math.sin(a) * d, 2.2 + i * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// A watering can: a tin body, a handle on top and a long spout forward; `scale` for carrying it small
function drawWateringCan(x, y, scale) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#7fa7c9'; ctx.fillRect(-5, -4, 10, 8);
  ctx.strokeStyle = '#4f7a9e'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -4, 3.5, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 1); ctx.lineTo(11, -4); ctx.stroke();
  ctx.fillStyle = '#4f7a9e'; ctx.fillRect(10, -6, 3, 3);
  ctx.restore();
}

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

// A damaged building looks it (#157): cracks spread over it as it loses hp, soot darkens it, and below a
// third of its hp some of it has fallen out. The cracks are fixed per building (by where it stands).
function drawDamage(x, y, half, share) {
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

// An arrow in flight: a shaft along its way, a grey head, pale fletching (enemies' red)
function drawArrow(proj) {
  ctx.save();
  ctx.translate(proj.x, proj.y);
  ctx.rotate(Math.atan2(proj.vy, proj.vx));
  ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-9, -0.75, 13, 1.5);
  ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2.5); ctx.lineTo(3, 2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = proj.fromEnemy ? '#e74c3c' : '#ecf0f1';
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, -2.5); ctx.lineTo(-7, 0); ctx.lineTo(-12, 2.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Flames licking up a burning unit (#165)
function drawBurning(x, y, r) {
  const flicker = Math.sin(pathTick * 0.5) * 2;
  ctx.fillStyle = 'rgba(230, 126, 34, 0.85)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.quadraticCurveTo(x, y - r * 1.6 - flicker, x + r * 0.6, y); ctx.fill();
  ctx.fillStyle = 'rgba(241, 196, 15, 0.9)';
  ctx.beginPath(); ctx.moveTo(x - r * 0.3, y); ctx.quadraticCurveTo(x, y - r - flicker, x + r * 0.3, y); ctx.fill();
}

// A demon portal in its side's colour (#177): a dark rim, the colour, a bright heart
function drawPortal(x, y, color) {
  ctx.fillStyle = shadeColor(color, -0.55); ctx.beginPath(); ctx.ellipse(x, y, 10, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, 7.5, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shadeColor(color, 0.65); ctx.beginPath(); ctx.ellipse(x, y, 3, 5.5, 0, 0, Math.PI * 2); ctx.fill();
}

// A demon's horns (#43): two dark points on top of the body
function drawHorns(x, y, r) {
  ctx.fillStyle = '#2c2c34';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * r * 0.35, y - r * 0.8); ctx.lineTo(x + side * r * 0.75, y - r * 1.45); ctx.lineTo(x + side * r * 0.8, y - r * 0.55);
    ctx.closePath(); ctx.fill();
  }
}

// A necromancer's staff, a pale purple orb at its top (#43)
function drawStaff() {
  ctx.fillStyle = '#6d4520'; ctx.fillRect(4, -1, 20, 3);
  ctx.fillStyle = '#bb8fce'; ctx.beginPath(); ctx.arc(25, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8daef'; ctx.beginPath(); ctx.arc(24, -1, 1.5, 0, Math.PI * 2); ctx.fill();
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
  drawRockTile(x, y, getTileIndex());
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
  const viewScale = getViewScale();
  ctx.translate(canvas.width / 2 - camera.x * viewScale, canvas.height / 2 - camera.y * viewScale);
  ctx.scale(viewScale, viewScale);

  drawGrassGround();

  ctx.fillStyle = '#2d4a22';
  ctx.fillRect(0, 0, WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, WORLD_HEIGHT - BORDER_MARGIN * TILE_SIZE, WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(WORLD_WIDTH - BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);

  ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, WORLD_WIDTH - 2 * BORDER_MARGIN * TILE_SIZE, WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);

  const terrain = getTileIndex();
  if (gameMode === 'battle') drawBattleOverlay();
  desertTiles.forEach(drawDesertTile);
  beachTiles.forEach(drawDesertTile);

  // farm zones: a tint and a frame in the crop's colour
  const ZONE_COLORS = { wheat: '241, 196, 15', sapling: '46, 204, 113', apple: '231, 76, 60' };
  // the undead's blighted ground (#164), and ground marked for it (while the Blight tab is open)
  for (const key of getBlightKeys()) {
    const [bx, by] = key.split(',').map(Number);
    ctx.fillStyle = 'rgba(74, 35, 90, 0.28)';
    ctx.fillRect(bx - 15, by - 15, TILE_SIZE, TILE_SIZE);
  }
  if (activeTab === 'tab-blight') blightZones.forEach(z => {
    if (z.done) return;
    ctx.strokeStyle = 'rgba(187, 143, 206, 0.8)'; ctx.lineWidth = 1;
    ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3);
  });
  if (activeTab === 'tab-farming') farmZones.forEach(z => {
    const rgb = ZONE_COLORS[z.crop] || ZONE_COLORS.sapling;
    ctx.fillStyle = `rgba(${rgb}, 0.14)`;
    ctx.fillRect(z.x - 15, z.y - 15, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = `rgba(${rgb}, 0.55)`;
    ctx.lineWidth = 1; ctx.strokeRect(z.x - 13.5, z.y - 13.5, TILE_SIZE - 3, TILE_SIZE - 3);
  });

  if (buildMode !== 'interact' && buildMode !== 'possess') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_WIDTH; x += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < WORLD_HEIGHT; y += TILE_SIZE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y); ctx.stroke();
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
    drawWaterTile(w, isWaterReachable(w), terrain);
    if (w.isFishing) {
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3;
      ctx.strokeRect(w.x - 14, w.y - 14, 28, 28);
      drawIcon(ctx, 'rod', w.x, w.y, 18);
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
      drawRockTile(r.x, r.y, terrain);
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

  if (getPlayerFaction().hall === 'hellgate') {
    // the demons' Hell Gate (#43): a dark stone gate with fire inside
    ctx.fillStyle = '#3d1f1f'; ctx.beginPath(); ctx.arc(townHall.x, townHall.y, townHall.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4; ctx.stroke();
    drawIcon(ctx, 'hellgate', townHall.x, townHall.y, townHall.radius * 1.4);
  } else if (getPlayerFaction().hall === 'graveyard') {
    // the undead's graveyard (#43): a dark fenced plot with tombstones
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

  trees.forEach(t => {
    if (t.isGrowing) {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(t.x - 2, t.y - 6, 4, 12);
      ctx.beginPath(); ctx.arc(t.x - 4, t.y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(t.x + 4, t.y - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(t.x - 10, t.y + 8, 20, 3);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(t.x - 10, t.y + 8, ((t.growProgress || 0) / 20) * 20, 3);
    } else {
      // apple trees: a lighter, rounder crown; red apples on it when ripe
      ctx.fillStyle = t.apple ? '#27501a' : '#1e3d14'; ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = t.apple ? '#3f7a2a' : '#2e5d20'; ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, 9, 0, Math.PI * 2); ctx.fill();
      if (t.apple && t.applesReady) {
        ctx.fillStyle = '#e74c3c';
        for (const [ax, ay] of [[-6, -5], [5, -7], [6, 4], [-4, 6], [0, -1]]) { ctx.beginPath(); ctx.arc(t.x + ax, t.y + ay, 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
      drawHarvestProgress(t);
      // apples being picked (#176): pickShare is kept up only while someone is at it
      if (t.apple && t.pickShare > 0 && pathTick - t.pickTick < 3) drawProgressBar(t.x, t.y, t.pickShare);
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
    ctx.fillStyle = '#5b6ee1'; // blue, as the Berries icon (#169)
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
    drawIcon(ctx, 'boar', b.x, b.y, 17);
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
      // a square around the tile, the priority in its corner: clear of the progress bar above it
      ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 15, r.y - 15, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(r.x + 5, r.y + 5, 10, 10);
      ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${r.priority}`, r.x + 10, r.y + 13);
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
    else if (bp.type === 'warehouse') ctx.fillStyle = '#a47148';
    ctx.fillRect(bp.x - 14, bp.y - 14, 28, 28);
    ctx.restore();

    // materials still to be brought from storage (#36): an orange bar of what's here
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
      drawIcon(ctx, 'door', b.x, b.y, 16);
    } else if (b.type === 'grave' || b.type === 'sacrifice_circle' || b.type === 'portal') {
      if (b.type === 'portal') drawPortal(b.x, b.y, sides.player.color); // in the side's colour (#177)
      else drawIcon(ctx, b.type, b.x, b.y, 28); // the undead's and the demons' (#43)
    } else if (b.type === 'tent') {
      ctx.fillStyle = '#d35400'; ctx.beginPath();
      ctx.moveTo(b.x, b.y - 14); ctx.lineTo(b.x + 14, b.y + 14); ctx.lineTo(b.x - 14, b.y + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a2511'; ctx.beginPath();
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + 5, b.y + 14); ctx.lineTo(b.x - 5, b.y + 14); ctx.closePath(); ctx.fill();
	  
    } else if (b.type === 'spikes') {
      // wooden base with iron points; a dot per use left
      ctx.fillStyle = '#6d4c2f'; ctx.fillRect(b.x - 13, b.y - 13, 26, 26);
      ctx.fillStyle = '#b0bec5';
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
      ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 9px sans-serif'; fillRichText(ctx, `[[arrows]] ${b.arrows || 0}/${b.tower.arrowCapacity}`, b.x, b.y - 22);
      ctx.fillStyle = '#95a5a6'; ctx.fillRect(b.x - 12, b.y + 16, 24, 3);
      ctx.fillStyle = '#ecf0f1'; ctx.fillRect(b.x - 11, b.y + 17, 22 * Math.min(1, (b.arrows || 0) / b.tower.arrowCapacity), 1);

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
      if (b.burning > 0) {
        ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.moveTo(b.x - 6, b.y + 4); ctx.quadraticCurveTo(b.x, b.y - 16, b.x + 6, b.y + 4); ctx.fill();
        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(b.x - 3, b.y + 4); ctx.quadraticCurveTo(b.x, b.y - 8, b.x + 3, b.y + 4); ctx.fill();
      }
    } else if (b.type === 'warehouse') {
      drawIcon(ctx, 'warehouse', b.x, b.y, 28); // a wooden shed (#36)
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
	  if (b.smeltProgress > 0) {
		ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(b.x - 14, b.y - 19, 28, 4);
		ctx.fillStyle = '#f1c40f'; ctx.fillRect(b.x - 13, b.y - 18, 26 * Math.min(1, b.smeltProgress / getSmelterLimits().seconds), 2);
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

  enemyTents.forEach(et => {
    if (getEnemyFaction().spawner === 'grave' || getEnemyFaction().spawner === 'portal') {
      // the undead's spawners are graves, the demons' portals (#43), ringed in the enemy's colour
      ctx.strokeStyle = getEnemyColor(); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(et.x, et.y, 16, 0, Math.PI * 2); ctx.stroke();
      if (getEnemyFaction().spawner === 'portal') drawPortal(et.x, et.y, getEnemyColor());
      else drawIcon(ctx, getEnemyFaction().spawner, et.x, et.y, 28);
    } else {
      ctx.fillStyle = '#641e16'; ctx.beginPath();
      ctx.moveTo(et.x, et.y - 14); ctx.lineTo(et.x + 14, et.y + 14); ctx.lineTo(et.x - 14, et.y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#1e272e'; ctx.beginPath();
      ctx.moveTo(et.x, et.y); ctx.lineTo(et.x + 5, et.y + 14); ctx.lineTo(et.x - 5, et.y + 14); ctx.closePath(); ctx.fill();
    }

    if (et.hp < et.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(et.x - 14, et.y - 20, 28, 4);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(et.x - 14, et.y - 20, (et.hp / et.maxHp) * 28, 4);
    }
  });

  // blood on the ground, and footprints out of blood or dung
  bloodSplats.forEach(b => {
    const rgb = b.color === 'dung' ? '92, 64, 26' : '100, 0, 0';
    ctx.fillStyle = `rgba(${rgb}, ${0.55 * bloodAlpha(b.age)})`;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 1.3, b.r, 0, 0, Math.PI * 2); ctx.fill();
  });

  // dung: a small brown pile, fading over its last 10 s
  dung.forEach(p => {
    ctx.globalAlpha = Math.max(0, Math.min(1, (GAME_CONFIG.relief.dungSeconds - p.age) / 10));
    ctx.fillStyle = '#5c3d16';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6e4a1c';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x + 0.5, p.y - 3.5, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  // corpses: grey, fading out over their last 10 seconds
  corpses.forEach(c => {
    const left = GAME_CONFIG.corpses.seconds - c.age;
    ctx.globalAlpha = Math.max(0, Math.min(1, left / 10)) * 0.9;
    ctx.fillStyle = c.side === 'enemy' ? '#6e6e6e' : '#8a8a8a';
    ctx.beginPath(); ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 2; ctx.stroke();
    // a cross for the eyes
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.5;
    for (const ex of [-4, 4]) {
      ctx.beginPath(); ctx.moveTo(c.x + ex - 2, c.y - 4); ctx.lineTo(c.x + ex + 2, c.y); ctx.moveTo(c.x + ex + 2, c.y - 4); ctx.lineTo(c.x + ex - 2, c.y); ctx.stroke();
    }
    if (corpseHasWorms(c)) {
      // worms: a few pink squiggles on it
      ctx.strokeStyle = '#e91e63'; ctx.lineWidth = 1.5;
      for (const [wx, wy] of [[-5, 4], [3, 6], [5, -3]]) {
        ctx.beginPath(); ctx.moveTo(c.x + wx - 3, c.y + wy); ctx.quadraticCurveTo(c.x + wx, c.y + wy - 3, c.x + wx + 3, c.y + wy); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
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
    // the whole body in the colony's colour (#43); the possessed one ringed in white
    ctx.fillStyle = getSettlerColor(s);
    if (s.temporary !== undefined) ctx.globalAlpha = 0.7; // a raised zombie, for a while (#164)
    ctx.beginPath(); ctx.arc(s.x, s.y, s.visualRadius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (s.burning > 0) drawBurning(s.x, s.y, s.visualRadius);
    if (s.isPossessed) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke(); }
    if (sides.player.faction === 'demons' && gameMode !== 'battle') drawHorns(s.x, s.y, s.visualRadius);
    drawBodyBlood(s, s.visualRadius);

    // a backpack on the left side, with a bar for how full it is
    if (s.backpack) {
      const bx = s.x - s.visualRadius - 3, by = s.y - 6;
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(bx, by, 6, 12);
      ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, 6, 12);
      const loads = (s.carrying && s.carrying.loads) || 0;
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(bx + 1, by + 11 - 10 * Math.min(1, loads / getCarryCapacity(s)), 4, 10 * Math.min(1, loads / getCarryCapacity(s)));
    }

    if (s.carrying) {
      const type = s.carrying.type;
      const known = GAME_CONFIG.resources[type] || GAME_CONFIG.foodKinds[type];
      const icon = type === 'bundle' ? 'bundle' : (known ? known.icon : 'wheat');
      drawIcon(ctx, icon, s.x, s.y - s.visualRadius - 9, 13);
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.save();
    applyHeldItemPose(s);
    if (getNecromancy(s) && s.weapon === 'fist') {
      drawStaff();
    } else if (!drawHeldWeapon(s.weapon)) {
    if (s.tool === 'axe' || s.tool === 'iron_axe') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 12, 3);
      ctx.fillStyle = s.tool === 'iron_axe' ? '#cfd8dc' : '#7f8c8d'; ctx.fillRect(16, -5, 5, 10);
    } else if (s.tool === 'pickaxe' || s.tool === 'iron_pickaxe') {
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 12, 3);
      ctx.fillStyle = s.tool === 'iron_pickaxe' ? '#cfd8dc' : '#7f8c8d'; ctx.beginPath(); ctx.arc(18, 0, 7, -Math.PI/2, Math.PI/2); ctx.fill();
    } else if (s.tool === 'rod') {
      ctx.strokeStyle = '#d2b48c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(22, -10); ctx.stroke();
    } else if (s.tool === 'medbag') {
      // a leather bag with a small green cross; the green inside rises with the herbs it holds
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(7, -5, 10, 10);
      const full = Math.min(1, (s.bagHerbs || 0) / GAME_CONFIG.medic.bagSize);
      ctx.fillStyle = '#27ae60'; ctx.fillRect(8, 4 - 8 * full, 8, 8 * full);
      ctx.strokeStyle = '#5c3a17'; ctx.lineWidth = 1; ctx.strokeRect(7, -5, 10, 10);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(11, -4, 2, 5); ctx.fillRect(9.5, -2.5, 5, 2);
    } else if (s.tool === 'hoe' && s.wateringCan && s.usingCan > 0) {
      drawWateringCan(12, 0, 1); // watering: the can in hand (the hoe goes on its back, below)
    } else if (s.tool === 'hoe') {
      // a long handle with a flat blade turned down at the end
      ctx.fillStyle = '#8e5a2b'; ctx.fillRect(6, -1, 15, 2);
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(19, -1, 3, 7);
    }
    }
    drawWeaponBlood(s);
    ctx.restore(); // pose only moves the held item
    if (s.armor === 'iron' || s.hasArmor) {
	  ctx.strokeStyle = '#95a5a6';
	  ctx.lineWidth = 3;
	  ctx.beginPath(); 
	  ctx.arc(0, 0, s.visualRadius + 2, 0, Math.PI * 2);
	  ctx.stroke();
	}
    // whichever of the farmer's hoe and watering can isn't in hand is carried on its back
    if (s.tool === 'hoe' && s.wateringCan) {
      if (s.usingCan > 0) {
        ctx.fillStyle = '#8e5a2b'; ctx.fillRect(-s.visualRadius - 2, -8, 2, 15);
        ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-s.visualRadius - 4, -9, 6, 3);
      } else {
        drawWateringCan(-s.visualRadius, 4, 0.7);
      }
    }
    if (s.shield) {
      // a round wooden shield with an iron rim and boss on the left arm
      ctx.fillStyle = '#8e5a2b'; ctx.beginPath(); ctx.arc(-s.visualRadius + 1, 3, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b0bec5'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.arc(-s.visualRadius + 1, 3, 1.8, 0, Math.PI * 2); ctx.fill();
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
    // enemies in the enemy's colour (#43; big ones darker), holding their weapon the way settlers do
    ctx.fillStyle = getEnemyColor(en);
    ctx.beginPath(); ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shadeColor(getEnemyColor(), -0.45); ctx.lineWidth = 2; ctx.stroke();
    if (en.enemyKey.startsWith('demon_')) drawHorns(en.x, en.y, en.radius);
    if (en.burning > 0) drawBurning(en.x, en.y, en.radius);
    drawBodyBlood(en, en.radius);

    ctx.save();
    ctx.translate(en.x, en.y);
    if (en.type === 'big') ctx.translate(en.radius - 11, 0); // hands at the edge of the larger body
    ctx.save();
    applyHeldItemPose(en);
    if (getEnemyDef(en).necromancer) drawStaff();
    else drawHeldWeapon(en.weapon);
    drawWeaponBlood(en);
    ctx.restore();
    if (en.arrows > 0) drawQuiver(-en.radius, en.arrows);
    ctx.restore();

    if (en.markedTarget) drawTargetMark(en);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(en.x - 12, en.y - en.radius - 8, 24, 3);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(en.x - 12, en.y - en.radius - 8, (Math.max(0, en.hp) / en.maxHp) * 24, 3);
  });

  projectiles.forEach(proj => {
    // fireballs (#43) bigger and orange; everything else is an arrow, pointing where it flies (#173)
    if (proj.fire) { ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f1c40f'; }
    else { drawArrow(proj); return; }
    ctx.beginPath(); ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2); ctx.fill();
  });

  ctx.restore();

  if (gameMode === 'battle') drawBattleResult();
  if (gameStarted && gameMode === 'endless' && (townHall.hp <= 0 || settlers.length === 0)) {
    // drawn in CSS pixels, centred on the screen (restart button hit-test: getRestartButton)
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(screenPixelRatio, screenPixelRatio);
    const cx = canvas.width / screenPixelRatio / 2, cy = canvas.height / screenPixelRatio / 2;
    ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t('defeat.title'), cx, cy - 20);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.fillText(t('defeat.survived', { waves: waveNum - 1 }), cx, cy + 15);

    const btn = getRestartButton();
    ctx.fillStyle = '#27ae60'; ctx.fillRect(btn.x, btn.y, btn.width, btn.height);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(t('defeat.restart'), cx, btn.y + 28);
    ctx.restore();
  }
}
