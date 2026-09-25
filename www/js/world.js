function isBorderZone(gx, gy) {
  return gx < BORDER_MARGIN || gx >= COLS - BORDER_MARGIN || gy < BORDER_MARGIN || gy >= ROWS - BORDER_MARGIN;
}

function getMaxPop() {
  let tentsCount = buildings.filter(b => b.type === 'tent').length;
  return 5 + tentsCount * 3;
}

function getCurrentPop() {
  return settlers.reduce((sum, s) => sum + (s.type === 'big' ? 2 : 1), 0);
}

function isBuildingSingle(building) {
  if (!building) return true;
  for (let other of buildings) {
    if (other !== building) {
      let dx = Math.abs(other.x - building.x);
      let dy = Math.abs(other.y - building.y);
      if (dx <= TILE_SIZE + 5 && dy <= TILE_SIZE + 5) {
        return false;
      }
    }
  }
  return true;
}

function isTileOccupied(x, y) {
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return true;
  return trees.some(t => Math.hypot(t.x - x, t.y - y) < 20) ||
         cacti.some(c => Math.hypot(c.x - x, c.y - y) < 20) ||
         boulders.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         grassList.some(g => Math.hypot(g.x - x, g.y - y) < 20) ||
         sticks.some(s => Math.hypot(s.x - x, s.y - y) < 20) ||
         pebbles.some(p => Math.hypot(p.x - x, p.y - y) < 20) ||
         ironOres.some(i => Math.hypot(i.x - x, i.y - y) < 22) ||
         coalOres.some(c => Math.hypot(c.x - x, c.y - y) < 22) ||
         buildings.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         blueprints.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         naturalRocks.some(r => Math.hypot(r.x - x, r.y - y) < 24) ||
         waterTiles.some(w => Math.hypot(w.x - x, w.y - y) < 20) ||
         farmPlots.some(f => Math.hypot(f.x - x, f.y - y) < 20) ||
         berryBushes.some(b => Math.hypot(b.x - x, b.y - y) < 20) ||
         boars.some(b => Math.hypot(b.x - x, b.y - y) < 20);
}

function isBuildLocationAllowed(x, y) {
  return !isTileOccupied(x, y);
}

function isDesertTile(x, y) {
  if (desertTiles.some(tile => tile.x === x && tile.y === y)) return true;
  if (!desertRegion) return false;
  return Math.hypot((x - desertRegion.x) / (TILE_SIZE * desertRegion.rx), (y - desertRegion.y) / (TILE_SIZE * desertRegion.ry)) <= 1;
}

function getPlacedResources(includeGrowingTrees = true) {
  return [
    ...(includeGrowingTrees ? trees : trees.filter(tree => !tree.isGrowing)),
    ...cacti, ...boulders, ...grassList, ...berryBushes,
    ...sticks, ...pebbles, ...ironOres, ...coalOres, ...naturalRocks
  ];
}

function getHarvestableResources() {
  return [...getPlacedResources(false), ...farmPlots.filter(plot => plot.growth >= 100), ...boars];
}

function spawnResource(type, nearX = null, nearY = null) {
  let tx, ty, isValid = false, attempts = 0;
  while (!isValid && attempts < 100) {
    attempts++;
    let gx, gy;
    if (nearX !== null && nearY !== null) {
      tx = nearX + (rand() - 0.5) * 180;
      ty = nearY + (rand() - 0.5) * 180;
      gx = Math.max(BORDER_MARGIN, Math.min(COLS - BORDER_MARGIN - 1, Math.floor(tx / TILE_SIZE)));
      gy = Math.max(BORDER_MARGIN, Math.min(ROWS - BORDER_MARGIN - 1, Math.floor(ty / TILE_SIZE)));
    } else {
      gx = Math.floor(rand() * (COLS - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
      gy = Math.floor(rand() * (ROWS - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
    }
    tx = gx * TILE_SIZE + 15;
    ty = gy * TILE_SIZE + 15;
    let inDesert = isDesertTile(tx, ty);
    let desertResource = type === 'cactus' || type === 'pebble';
    let cactusOutsideDesert = type === 'cactus' && !inDesert;
    if (Math.hypot(tx - townHall.x, ty - townHall.y) > 140 && !isTileOccupied(tx, ty) &&
        (!inDesert || desertResource) && !cactusOutsideDesert) {
      isValid = true;
    }
  }
  if (isValid) {
    if (type === 'tree') trees.push({ x: tx, y: ty, hp: 3, priority: 0, isGrowing: false, growProgress: 0 });
    if (type === 'cactus') cacti.push({ x: tx, y: ty, hp: 2, maxHp: 2, priority: 0 });
    if (type === 'boulder') boulders.push({ x: tx, y: ty, hp: 4, priority: 0 });
    if (type === 'grass') grassList.push({ x: tx, y: ty, hp: 1, priority: 0 });
    if (type === 'berry_bush') berryBushes.push({ x: tx, y: ty, hp: 1, priority: 0 });
    if (type === 'stick') sticks.push({ x: tx, y: ty, hp: 1, priority: 0 });
    if (type === 'pebble') pebbles.push({ x: tx, y: ty, hp: 1, priority: 0 });
    if (type === 'iron_ore') ironOres.push({ x: tx, y: ty, hp: 5, maxHp: 5, priority: 0 });
    if (type === 'coal_ore') coalOres.push({ x: tx, y: ty, hp: 5, maxHp: 5, priority: 0 });
    if (type === 'boar') boars.push({ x: tx, y: ty, hp: 40, maxHp: 40, priority: 0, wanderTimer: rand() * 4, wanderInterval: 3 + rand() * 3, targetX: tx, targetY: ty });
  }
}

function spawnResourceCluster(type, count, centerX, centerY) {
  for (let i = 0; i < count; i++) {
    spawnResource(type, centerX, centerY);
  }
}

function findSeparateVeinCenter() {
  for (let attempt = 0; attempt < 80; attempt++) {
    let gx = Math.floor(rand() * (COLS - 2 * BORDER_MARGIN - 6)) + BORDER_MARGIN + 3;
    let gy = Math.floor(rand() * (ROWS - 2 * BORDER_MARGIN - 6)) + BORDER_MARGIN + 3;
    let x = gx * TILE_SIZE + 15;
    let y = gy * TILE_SIZE + 15;
    let allPlacedResources = getPlacedResources();
    let isFarFromResources = !allPlacedResources.some(resource => Math.hypot(resource.x - x, resource.y - y) < 90);
    if (Math.hypot(x - townHall.x, y - townHall.y) > 220 &&
      !waterTiles.some(w => Math.hypot(w.x - x, w.y - y) < 80) &&
        !isDesertTile(x, y) && isFarFromResources) {
      return { x, y };
    }
  }
  return null;
}

function isWaterReachable(w) {
  let gx = Math.floor(w.x / TILE_SIZE);
  let gy = Math.floor(w.y / TILE_SIZE);
  let dirs = [
    {gx: gx + 1, gy: gy}, {gx: gx - 1, gy: gy},
    {gx: gx, gy: gy + 1}, {gx: gx, gy: gy - 1}
  ];
  for (let d of dirs) {
    if (d.gx >= 0 && d.gx < COLS && d.gy >= 0 && d.gy < ROWS) {
      let tx = d.gx * TILE_SIZE + 15;
      let ty = d.gy * TILE_SIZE + 15;
      let isWater = waterTiles.some(wt => wt.x === tx && wt.y === ty);
      if (!isWater) return true;
    }
  }
  return false;
}

function generateMap() {
  naturalRocks = []; waterTiles = []; desertTiles = []; desertRegion = null; trees = []; cacti = []; boulders = [];
  grassList = []; berryBushes = []; sticks = []; pebbles = []; ironOres = []; coalOres = []; boars = [];

  const lakeRange = getMapRange('lakes', 1, 4);
  const lakeWidthRange = getMapRange('lakeWidth', 3, 8);
  const lakeHeightRange = getMapRange('lakeHeight', 3, 8);
  const lakeDistRange = getMapRange('lakeMinDistance', 1, 3);

  let numLakes = lakeRange.min + Math.floor(rand() * (lakeRange.max - lakeRange.min + 1));
  const lakeCenters = [];

  for (let l = 0; l < numLakes; l++) {
    let lw = lakeWidthRange.min + Math.floor(rand() * (lakeWidthRange.max - lakeWidthRange.min + 1));
    let lh = lakeHeightRange.min + Math.floor(rand() * (lakeHeightRange.max - lakeHeightRange.min + 1));
    let lx = BORDER_MARGIN;
    let ly = BORDER_MARGIN;
    let placed = false;

    let minDistance = lakeDistRange.min + rand() * (lakeDistRange.max - lakeDistRange.min);

    for (let attempt = 0; attempt < 60; attempt++) {
      const candidateX = Math.floor(rand() * (COLS - lw - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
      const candidateY = Math.floor(rand() * (ROWS - lh - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
      const candidateCenter = { x: candidateX + (lw - 1) / 2, y: candidateY + (lh - 1) / 2 };

      const isSeparated = lakeCenters.every(center => 
        Math.hypot(center.x - candidateCenter.x, center.y - candidateCenter.y) >= minDistance
      );

      if (isSeparated) {
        lx = candidateX;
        ly = candidateY;
        placed = true;
        break;
      }
    }

    if (!placed) continue;

    let lakeCenterX = lx + (lw - 1) / 2;
    let lakeCenterY = ly + (lh - 1) / 2;

    let waves = 2 + Math.floor(rand() * 2);
    let phase = rand() * Math.PI * 2;
    let amp = (lw <= 3 || lh <= 3) ? 0.05 : (0.08 + rand() * 0.1); 

    const tempTiles = [];

    for (let wx = lx; wx < lx + lw; wx++) {
      for (let wy = ly; wy < ly + lh; wy++) {
        let tx = wx * TILE_SIZE + 15;
        let ty = wy * TILE_SIZE + 15;

        let dx = (wx - lakeCenterX) / (lw / 2);
        let dy = (wy - lakeCenterY) / (lh / 2);
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        let dynamicThreshold = Math.max(0.75, 0.9 + Math.sin(angle * waves + phase) * amp);

        if (dist <= dynamicThreshold && Math.hypot(tx - townHall.x, ty - townHall.y) > 160) {
          if (!waterTiles.some(w => w.x === tx && w.y === ty)) {
            tempTiles.push({ x: tx, y: ty, isFishing: false, fishTimer: 0 });
          }
        }
      }
    }

    if (tempTiles.length >= 3) {
      lakeCenters.push({ x: lakeCenterX, y: lakeCenterY });
      waterTiles.push(...tempTiles);
    }
  }

  const desertRange = getMapRange('deserts', 1, 1);
  const desertRxRange = getMapRange('desertRadiusX', 3, 5);
  const desertRyRange = getMapRange('desertRadiusY', 2, 4);

  let numDeserts = desertRange.min + Math.floor(rand() * (desertRange.max - desertRange.min + 1));
  const desertCenters = [];

  for (let d = 0; d < numDeserts; d++) {
    let rx = desertRxRange.min + Math.floor(rand() * (desertRxRange.max - desertRxRange.min + 1));
    let ry = desertRyRange.min + Math.floor(rand() * (desertRyRange.max - desertRyRange.min + 1));

    let desertCenterX = 0, desertCenterY = 0, desertPlaced = false;

    for (let attempt = 0; attempt < 100 && !desertPlaced; attempt++) {
      let centerGx = Math.floor(rand() * (COLS - 2 * rx - 2 * BORDER_MARGIN)) + BORDER_MARGIN + rx;
      let centerGy = Math.floor(rand() * (ROWS - 2 * ry - 2 * BORDER_MARGIN)) + BORDER_MARGIN + ry;

      centerGx = Math.max(BORDER_MARGIN + rx, Math.min(COLS - BORDER_MARGIN - rx, centerGx));
      centerGy = Math.max(BORDER_MARGIN + ry, Math.min(ROWS - BORDER_MARGIN - ry, centerGy));

      desertCenterX = centerGx * TILE_SIZE + 15;
      desertCenterY = centerGy * TILE_SIZE + 15;

      desertPlaced = Math.hypot(desertCenterX - townHall.x, desertCenterY - townHall.y) > 200 &&
        !waterTiles.some(w => Math.hypot(w.x - desertCenterX, w.y - desertCenterY) < 110) &&
        desertCenters.every(dc => Math.hypot(dc.x - desertCenterX, dc.y - desertCenterY) > 150);
    }

    if (desertPlaced) {
      desertCenters.push({ x: desertCenterX, y: desertCenterY });
      if (!desertRegion) desertRegion = { x: desertCenterX, y: desertCenterY, rx, ry };

      const subBlobs = [];
      let numBlobs = 2 + Math.floor(rand() * 2);
      for (let b = 0; b < numBlobs; b++) {
        subBlobs.push({
          offsetX: (rand() - 0.5) * rx * 0.8,
          offsetY: (rand() - 0.5) * ry * 0.8,
          rX: rx * (0.7 + rand() * 0.4),
          rY: ry * (0.7 + rand() * 0.4),
          threshold: 0.9 + rand() * 0.2
        });
      }

      for (let dx = -rx * 2; dx <= rx * 2; dx++) {
        for (let dy = -ry * 2; dy <= ry * 2; dy++) {
          let tileX = desertCenterX + dx * TILE_SIZE;
          let tileY = desertCenterY + dy * TILE_SIZE;

          let isInside = subBlobs.some(b => {
            let distX = (dx - b.offsetX) / b.rX;
            let distY = (dy - b.offsetY) / b.rY;
            return Math.hypot(distX, distY) <= b.threshold;
          });

          if (isInside &&
              tileX >= BORDER_MARGIN * TILE_SIZE + 15 && tileX < (COLS - BORDER_MARGIN) * TILE_SIZE - 15 &&
              tileY >= BORDER_MARGIN * TILE_SIZE + 15 && tileY < (ROWS - BORDER_MARGIN) * TILE_SIZE - 15 &&
              !waterTiles.some(w => w.x === tileX && w.y === tileY) &&
              !desertTiles.some(d => d.x === tileX && d.y === tileY)) {
            desertTiles.push({ x: tileX, y: tileY });
          }
        }
      }

      spawnResourceCluster('cactus', getMapCount('desertCactus', 6), desertCenterX, desertCenterY);
      spawnResourceCluster('pebble', getMapCount('desertPebbles', 5), desertCenterX, desertCenterY);
    }
  }

  const cfg = GAME_CONFIG.map;
  let numRockClusters = cfg.rockClusters.min + Math.floor(rand() * (cfg.rockClusters.max - cfg.rockClusters.min + 1));

  for (let c = 0; c < numRockClusters; c++) {
    let rw = cfg.rockClusterWidth.min + Math.floor(rand() * (cfg.rockClusterWidth.max - cfg.rockClusterWidth.min + 1));
    let rh = cfg.rockClusterHeight.min + Math.floor(rand() * (cfg.rockClusterHeight.max - cfg.rockClusterHeight.min + 1));
    let rx = Math.floor(rand() * (COLS - rw - 2 * BORDER_MARGIN)) + BORDER_MARGIN;
    let ry = Math.floor(rand() * (ROWS - rh - 2 * BORDER_MARGIN)) + BORDER_MARGIN;

    let rockCenterX = rx + (rw - 1) / 2;
    let rockCenterY = ry + (rh - 1) / 2;

    let waves = 2 + Math.floor(rand() * 2);
    let phase = rand() * Math.PI * 2;
    let amp = (rw <= 2 || rh <= 2) ? 0 : (0.1 + rand() * 0.15);

    for (let x = rx; x < rx + rw; x++) {
      for (let y = ry; y < ry + rh; y++) {
        let tx = x * TILE_SIZE + 15;
        let ty = y * TILE_SIZE + 15;

        let dx = (x - rockCenterX) / (rw / 2);
        let dy = (y - rockCenterY) / (rh / 2);
        let dist = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);

        let dynamicThreshold = 0.85 + Math.sin(angle * waves + phase) * amp;

        if (dist <= dynamicThreshold && Math.hypot(tx - townHall.x, ty - townHall.y) > 150 && !isDesertTile(tx, ty) && !isTileOccupied(tx, ty)) {
          naturalRocks.push({ x: tx, y: ty, hp: 100, maxHp: 100, priority: 0 });
        }
      }
    }
  }

  for (let i = 0; i < getMapCount('trees', 22); i++) spawnResource('tree');
  for (let i = 0; i < getMapCount('boulders', 15); i++) spawnResource('boulder');
  for (let i = 0; i < getMapCount('grass', 16); i++) spawnResource('grass');
  for (let i = 0; i < getMapCount('berryBushes', 8); i++) spawnResource('berry_bush');
  for (let i = 0; i < getMapCount('sticks', 15); i++) spawnResource('stick');
  for (let i = 0; i < getMapCount('pebbles', 14); i++) spawnResource('pebble');

  for (let c = 0; c < getMapCount('resourceClusters', 4); c++) {
    let centerX = 0, centerY = 0, validCenter = false;
    for (let attempt = 0; attempt < 40 && !validCenter; attempt++) {
      centerX = (BORDER_MARGIN + 2 + rand() * (COLS - 2 * BORDER_MARGIN - 4)) * TILE_SIZE + 15;
      centerY = (BORDER_MARGIN + 2 + rand() * (ROWS - 2 * BORDER_MARGIN - 4)) * TILE_SIZE + 15;
      validCenter = Math.hypot(centerX - townHall.x, centerY - townHall.y) > 180 &&
        !waterTiles.some(w => Math.hypot(w.x - centerX, w.y - centerY) < 120);
    }
    if (validCenter) {
      spawnResourceCluster('tree', getMapCount('clusterTrees', 5), centerX, centerY);
      spawnResourceCluster('grass', getMapCount('clusterGrass', 4), centerX, centerY);
      spawnResourceCluster('berry_bush', getMapCount('clusterBerryBushes', 2), centerX, centerY);
      spawnResourceCluster('pebble', getMapCount('clusterPebbles', 2), centerX, centerY);
    }
  }

  for (let vein = 0; vein < getMapCount('ironVeins', 2); vein++) {
    let center = findSeparateVeinCenter();
    if (center) spawnResourceCluster('iron_ore', 4 + Math.floor(rand() * 3), center.x, center.y);
  }
  for (let vein = 0; vein < getMapCount('coalVeins', 2); vein++) {
    let center = findSeparateVeinCenter();
    if (center) spawnResourceCluster('coal_ore', 4 + Math.floor(rand() * 3), center.x, center.y);
  }

  for (let i = 0; i < getMapCount('boars', 4); i++) spawnResource('boar');
}

function resetGame() {
  wood = 30; stone = 20; coal = 0; ironOreStock = 0; iron = 0; leather = 0; arrowsStock = 0; food = 25; wheatSeeds = 3; saplings = 0;
  waveTimer = waveInterval; foodTimer = 25; boarRespawnTimer = 25; waveNum = 1;
  townHall.hp = townHall.maxHp;
  townHall.repairRequested = false;
  settlers = []; blueprints = []; buildings = []; armorOrder = null; enemies = []; enemyTents = []; enemyTentBlueprints = [];
  projectiles = []; farmPlots = []; boars = []; selectedSettler = null;
  
  generateMap();
  updateSeedHud();

  settlers.push(
    { id: 101, x: townHall.x - 45, y: townHall.y, hp: 100, maxHp: 100, isPossessed: false, speed: 1.0, radius: 11, visualRadius: 11, weapon: 'fist', tool: 'none', role: 'worker', type: 'normal', carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false },
    { id: 102, x: townHall.x + 45, y: townHall.y, hp: 100, maxHp: 100, isPossessed: false, speed: 1.0, radius: 11, visualRadius: 11, weapon: 'fist', tool: 'none', role: 'worker', type: 'normal', carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false }
  );

  updateUnitCounts();
}
