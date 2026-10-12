// The ground: grass, water, rock, desert and ore, each joining its own kind

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

// Rock with ore veins, shared by ore tiles and ore spawners so they read as the same material.
// half: half the square's size (a full rock tile is 14)
const ORE_COLORS = {
  iron: { body: '#aab7c3', shine: '#dfe6ed' },
  coal: { body: '#050608', shine: '#6b7785' }
};

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

// The border zone round the map, and the line where it starts
function drawMapBorder() {
  ctx.fillStyle = '#2d4a22';
  ctx.fillRect(0, 0, WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, WORLD_HEIGHT - BORDER_MARGIN * TILE_SIZE, WORLD_WIDTH, BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(0, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
  ctx.fillRect(WORLD_WIDTH - BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);

  ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(BORDER_MARGIN * TILE_SIZE, BORDER_MARGIN * TILE_SIZE, WORLD_WIDTH - 2 * BORDER_MARGIN * TILE_SIZE, WORLD_HEIGHT - 2 * BORDER_MARGIN * TILE_SIZE);
}

// Desert and beach sand
function drawSand() {
  desertTiles.forEach(drawDesertTile);
  beachTiles.forEach(drawDesertTile);
}

// Water, and the fishing spots marked on it
function drawWater(terrain) {
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
}

// Natural rock and ore spawners
function drawRocks(terrain) {
  naturalRocks.forEach(r => {
    if (r.oreSpawner) {
      drawOreSpawner(r.x, r.y, r.oreSpawner);
    } else {
      drawRockTile(r.x, r.y, terrain);
    }
    drawHarvestProgress(r, 36);
  });
}
