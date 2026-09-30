function isBorderZone(gx, gy) {
  return gx < BORDER_MARGIN || gx >= COLS - BORDER_MARGIN || gy < BORDER_MARGIN || gy >= ROWS - BORDER_MARGIN;
}

function getMaxPop() {
  let tentsCount = buildings.filter(b => b.type === 'tent').length;
  return GAME_CONFIG.start.population + tentsCount * GAME_CONFIG.buildings.tent.population;
}

function getCurrentPop() {
  return settlers.reduce((sum, s) => sum + GAME_CONFIG.settlerTypes[s.type].population, 0);
}

// A new settler of a GAME_CONFIG.settlerTypes kind, unarmed, as a worker
function createSettler(typeKey, id, x, y, extra = {}) {
  const t = GAME_CONFIG.settlerTypes[typeKey];
  return {
    id, x, y, hp: t.hp, maxHp: t.hp, ...extra,
    isPossessed: false, speed: t.speed, radius: t.radius, visualRadius: t.visualRadius, weapon: 'fist', tool: 'none', role: 'worker', type: typeKey,
    carrying: null, targetEquipment: null, attackCooldown: 0, path: [], pathTarget: null, patrolTemplate: null, deadProcessed: false
  };
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
  // ore spawners are natural rock that can't be mined
  return [...getPlacedResources(false).filter(r => !r.oreSpawner), ...farmPlots.filter(plot => plot.growth >= 100), ...boars];
}

// ---- Ore spawners
// A spawner is a natural rock tile marked oreSpawner: 'iron' | 'coal'. It blocks and draws like rock but
// can't be mined, and ores of its kind appear within a few tiles of it: on free ground, or inside the
// rock itself (the ore replaces that rock tile, so mining it cuts into the rock).

const ORE_KINDS = {
  iron: { resource: 'iron_ore', spawnerKey: 'ironSpawners' },
  coal: { resource: 'coal_ore', spawnerKey: 'coalSpawners' }
};

function getOreSpawnerRadius() {
  return getMapCount('oreSpawnerRadius', 3);
}

function getOreSpawners(kind) {
  return naturalRocks.filter(r => r.oreSpawner === kind);
}

// Tiles around a spawner where an ore can appear; rock is set when the ore would replace natural rock
function getOreSpotsAround(spawner, radius) {
  const spots = [];
  const center = getGridPos(spawner.x, spawner.y);
  for (let gy = center.gy - radius; gy <= center.gy + radius; gy++) {
    for (let gx = center.gx - radius; gx <= center.gx + radius; gx++) {
      if (gx === center.gx && gy === center.gy) continue;
      if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS || isBorderZone(gx, gy)) continue;
      const x = gx * TILE_SIZE + 15, y = gy * TILE_SIZE + 15;
      if (Math.hypot(x - townHall.x, y - townHall.y) < 150) continue;
      // free ground only: ore never replaces natural rock
      if (!isDesertTile(x, y) && !isTileOccupied(x, y)) spots.push({ x, y });
    }
  }
  return spots;
}

function placeOre(kind, spot) {
  addMapResource(ORE_KINDS[kind].resource, spot.x, spot.y);
}

// A mined ore grows back around a random spawner of its kind
function respawnOre(kind) {
  const spawners = getOreSpawners(kind);
  if (spawners.length === 0) return;
  const spawner = spawners[Math.floor(rand() * spawners.length)];
  const spots = getOreSpotsAround(spawner, getOreSpawnerRadius());
  if (spots.length === 0) return;
  placeOre(kind, spots[Math.floor(rand() * spots.length)]);
  invalidateAllPaths();
}

// A spot is exposed when a settler starting at the town hall can stand next to it
function isOreSpotExposed(spot, reach) {
  const g = getGridPos(spot.x, spot.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => getReachSteps(reach, g.gx + dx, g.gy + dy) >= 0);
}

// Put a small rock outcrop on free ground far from the hall, for maps with no usable rock
function placeRockOutcrop() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const gx = BORDER_MARGIN + 1 + Math.floor(rand() * (COLS - 2 * BORDER_MARGIN - 3));
    const gy = BORDER_MARGIN + 1 + Math.floor(rand() * (ROWS - 2 * BORDER_MARGIN - 3));
    const tiles = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: (gx + dx) * TILE_SIZE + 15, y: (gy + dy) * TILE_SIZE + 15 }));
    if (tiles.some(t => Math.hypot(t.x - townHall.x, t.y - townHall.y) < 220 || isTileOccupied(t.x, t.y) || isDesertTile(t.x, t.y))) continue;
    for (const t of tiles) addMapResource('natural_rock', t.x, t.y);
    return true;
  }
  return false;
}

function placeOreSpawners(kind, count) {
  const radius = getOreSpawnerRadius();
  for (let n = 0; n < count; n++) {
    resetTileIndex();
    const reach = getSettlerReach({ x: townHall.x, y: townHall.y });
    const others = naturalRocks.filter(r => r.oreSpawner);
    // rock far from the hall and from other spawners, with room for ores and at least one reachable spot
    const candidates = naturalRocks.filter(r => !r.oreSpawner &&
      Math.hypot(r.x - townHall.x, r.y - townHall.y) > 220 &&
      others.every(o => Math.hypot(o.x - r.x, o.y - r.y) > 6 * TILE_SIZE) &&
      getOreSpotsAround(r, radius).filter(s => isOreSpotExposed(s, reach)).length >= 2);
    let spawner = candidates.length ? candidates[Math.floor(rand() * candidates.length)] : null;
    if (!spawner) {
      if (n > 0 || !placeRockOutcrop()) continue;
      spawner = naturalRocks[naturalRocks.length - 1];
    }
    spawner.oreSpawner = kind;

    const spots = getOreSpotsAround(spawner, radius);
    const exposed = spots.filter(s => isOreSpotExposed(s, reach));
    const ores = getMapCount('orePerSpawner', 5);
    // one ore is always reachable from the start; the rest land anywhere around the spawner
    const first = exposed[Math.floor(rand() * exposed.length)];
    if (first) placeOre(kind, first);
    for (let i = 1; i < ores; i++) {
      const free = getOreSpotsAround(spawner, radius);
      if (free.length === 0) break;
      placeOre(kind, free[Math.floor(rand() * free.length)]);
    }
  }
  resetTileIndex();
}

// spread: side of the square (px) around nearX/nearY to pick a spot in
// pickPoint: optional () => { x, y } to try instead of a square around (nearX, nearY) (forest shapes)
function spawnResource(type, nearX = null, nearY = null, spread = 180, pickPoint = null) {
  let tx, ty, isValid = false, attempts = 0;
  while (!isValid && attempts < 100) {
    attempts++;
    let gx, gy;
    if (pickPoint || (nearX !== null && nearY !== null)) {
      const point = pickPoint ? pickPoint() : { x: nearX + (rand() - 0.5) * spread, y: nearY + (rand() - 0.5) * spread };
      tx = point.x;
      ty = point.y;
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
    if (type === 'boar') {
      const hp = GAME_CONFIG.mapResources.boar.hp;
      boars.push({ x: tx, y: ty, hp, maxHp: hp, priority: 0, wanderTimer: rand() * 4, wanderInterval: 3 + rand() * 3, targetX: tx, targetY: ty });
    } else {
      addMapResource(type, tx, ty);
    }
  }
}

// ---- Map resources (GAME_CONFIG.mapResources)

function getMapResourceDef(kind) {
  return GAME_CONFIG.mapResources[kind] || null;
}

// Which GAME_CONFIG.mapResources entry an object on the map is, by the list it's in
function getMapResourceKind(resource) {
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (WORLD[def.list].includes(resource)) return kind;
  }
  return null;
}

function addMapResource(kind, x, y) {
  const def = GAME_CONFIG.mapResources[kind];
  const resource = { x, y, hp: def.hp, maxHp: def.hp, priority: 0 };
  if (def.list === 'trees') Object.assign(resource, { isGrowing: false, growProgress: 0 });
  WORLD[def.list].push(resource);
  return resource;
}

// Whether the tool belongs to that family (GAME_CONFIG.tools.*.family: axe, pickaxe, rod, hoe)
function hasToolFamily(tool, family) {
  return getToolFamily(tool) === family;
}

// A resource is done: the settler gets what it yields, it's removed, and queued to grow back if it does
function finishHarvest(settler, resource, kind) {
  const def = GAME_CONFIG.mapResources[kind];
  for (const [item, amount] of Object.entries(def.yield || {})) giveResourceToSettler(settler, item, amount);
  addCarryLoad(settler);
  const bonus = resource.apple ? GAME_CONFIG.appleTrees.fellBonusChance : def.bonusChance;
  for (const [item, chance] of Object.entries(bonus || {})) {
    if (rand() < chance) addResources({ [item]: 1 });
  }
  const list = WORLD[def.list];
  const index = list.indexOf(resource);
  if (index !== -1) list.splice(index, 1);
  if (def.regrow) scheduleRespawn(kind, resource.x, resource.y);
  if (def.clearsPath) invalidateAllPaths();
}

function spawnResourceCluster(type, count, centerX, centerY, spread = 180) {
  for (let i = 0; i < count; i++) {
    spawnResource(type, centerX, centerY, spread);
  }
}

// ---- Forests
// Trees grow in forests; grass, berry bushes and sticks favour them too (forestUndergrowthShare), both at
// map generation and when they grow back. Forest centres are kept in `forests`.

function getForestSpread() {
  return (getMapCount('forestRadius', 3) * 2 + 1) * TILE_SIZE;
}

function spawnForestAware(type) {
  // trees (forestShare 1) always grow back in a forest, so forests don't thin out into a scatter
  const share = getMapResourceDef(type).forestShare ?? GAME_CONFIG.map.forestUndergrowthShare ?? 0.7;
  if (forests.length > 0 && rand() < share) {
    const forest = forests[Math.floor(rand() * forests.length)];
    spawnResource(type, forest.x, forest.y, getForestSpread(), () => pickForestPoint(forest));
  } else {
    spawnResource(type);
  }
}

// A forest is a few overlapping round lobes around its centre, so it grows into an uneven blob rather
// than a square
function makeForestLobes(x, y) {
  const reach = getForestSpread() / 2;
  const lobes = [{ x, y, r: reach * 0.8 }];
  const extra = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < extra; i++) {
    const angle = rand() * Math.PI * 2, dist = reach * (0.5 + rand() * 0.6);
    lobes.push({ x: x + Math.cos(angle) * dist, y: y + Math.sin(angle) * dist, r: reach * (0.45 + rand() * 0.35) });
  }
  return lobes;
}

// A random point in one of the forest's lobes
function pickForestPoint(forest) {
  const lobe = forest.lobes[Math.floor(rand() * forest.lobes.length)];
  const angle = rand() * Math.PI * 2, dist = lobe.r * Math.sqrt(rand());
  return { x: lobe.x + Math.cos(angle) * dist, y: lobe.y + Math.sin(angle) * dist };
}

function placeForests() {
  forests = [];
  for (let n = 0; n < getMapCount('forests', 4); n++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = (BORDER_MARGIN + 3 + Math.floor(rand() * (COLS - 2 * BORDER_MARGIN - 6))) * TILE_SIZE + 15;
      const y = (BORDER_MARGIN + 3 + Math.floor(rand() * (ROWS - 2 * BORDER_MARGIN - 6))) * TILE_SIZE + 15;
      const valid = Math.hypot(x - townHall.x, y - townHall.y) > 180 &&
        !isDesertTile(x, y) &&
        !waterTiles.some(wt => Math.hypot(wt.x - x, wt.y - y) < 90) &&
        forests.every(f => Math.hypot(f.x - x, f.y - y) > 6 * TILE_SIZE);
      if (!valid) continue;
      const forest = { x, y, lobes: makeForestLobes(x, y) };
      forests.push(forest);
      for (let i = 0; i < getMapCount('forestTrees', 9); i++) spawnResource('tree', x, y, getForestSpread(), () => pickForestPoint(forest));
      break;
    }
  }
}

// ---- Boulder piles: a few boulders on touching tiles

function placeBoulderPiles() {
  for (let n = 0; n < getMapCount('boulderPiles', 2); n++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const gx = BORDER_MARGIN + 1 + Math.floor(rand() * (COLS - 2 * BORDER_MARGIN - 2));
      const gy = BORDER_MARGIN + 1 + Math.floor(rand() * (ROWS - 2 * BORDER_MARGIN - 2));
      const free = (tx, ty) => tx >= BORDER_MARGIN && ty >= BORDER_MARGIN && tx < COLS - BORDER_MARGIN && ty < ROWS - BORDER_MARGIN &&
        Math.hypot(tx * TILE_SIZE + 15 - townHall.x, ty * TILE_SIZE + 15 - townHall.y) > 180 &&
        !isDesertTile(tx * TILE_SIZE + 15, ty * TILE_SIZE + 15) && !isTileOccupied(tx * TILE_SIZE + 15, ty * TILE_SIZE + 15);
      if (!free(gx, gy)) continue;
      const pile = [{ gx, gy }];
      const size = getMapCount('boulderPileSize', 4);
      for (let grow = 0; grow < size * 8 && pile.length < size; grow++) {
        const from = pile[Math.floor(rand() * pile.length)];
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
        const next = { gx: from.gx + dx, gy: from.gy + dy };
        if (pile.some(t => t.gx === next.gx && t.gy === next.gy) || !free(next.gx, next.gy)) continue;
        pile.push(next);
      }
      for (const t of pile) addMapResource('boulder', t.gx * TILE_SIZE + 15, t.gy * TILE_SIZE + 15);
      break;
    }
  }
}

// ---- Delayed regrowth
// A harvested (or destroyed) resource doesn't reappear at once: it's queued and grows back after
// respawnDelay seconds (oreRespawnDelay for ore). nearX/nearY keep it near where it was (cacti).

function scheduleRespawn(type, nearX = null, nearY = null) {
  const isOre = getMapResourceDef(type).regrow === 'spawner';
  const delay = getMapCount(isOre ? 'oreRespawnDelay' : 'respawnDelay', isOre ? 90 : 45);
  pendingRespawns.push({ type, nearX, nearY, timer: delay });
}

function updatePendingRespawns(dt) {
  for (let i = pendingRespawns.length - 1; i >= 0; i--) {
    const pending = pendingRespawns[i];
    pending.timer -= dt;
    if (pending.timer > 0) continue;
    pendingRespawns.splice(i, 1);
    const def = getMapResourceDef(pending.type);
    if (def.regrow === 'spawner') respawnOre(Object.keys(ORE_KINDS).find(ore => ORE_KINDS[ore].resource === pending.type));
    else if (def.regrow === 'nearby') spawnResource(pending.type, pending.nearX, pending.nearY);
    else if (def.regrow === 'forest') spawnForestAware(pending.type);
    else spawnResource(pending.type);
    // things that need a tool to remove (trees, boulders, cacti, ore) block paths
    if (def.tool) invalidateAllPaths();
  }
}

function isWaterReachable(w) {
  let gx = Math.floor(w.x / TILE_SIZE);
  let gy = Math.floor(w.y / TILE_SIZE);
  let dirs = [
    {gx: gx + 1, gy: gy}, {gx: gx - 1, gy: gy},
    {gx: gx, gy: gy + 1}, {gx: gx, gy: gy - 1}
  ];
  // a fisher needs a tile to stand on next to the water; rock or trees on the shore don't count
  return dirs.some(d => !isTileBlockedForSettler(d.gx, d.gy));
}

function generateMap() {
  naturalRocks = []; waterTiles = []; desertTiles = []; desertRegion = null; trees = []; cacti = []; boulders = [];
  grassList = []; berryBushes = []; sticks = []; pebbles = []; ironOres = []; coalOres = []; boars = [];

  const lakeRange = getMapRange('lakes', 1, 4);
  const lakeWidthRange = getMapRange('lakeWidth', 3, 8);
  const lakeHeightRange = getMapRange('lakeHeight', 3, 8);
  const lakeDistRange = getMapRange('lakeMinDistance', 1, 3);

  let numLakes = Math.round((lakeRange.min + Math.floor(rand() * (lakeRange.max - lakeRange.min + 1))) * getMapAreaScale());
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

  let numDeserts = Math.round((desertRange.min + Math.floor(rand() * (desertRange.max - desertRange.min + 1))) * getMapAreaScale());
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
  let numRockClusters = Math.round((cfg.rockClusters.min + Math.floor(rand() * (cfg.rockClusters.max - cfg.rockClusters.min + 1))) * getMapAreaScale());

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
          addMapResource('natural_rock', tx, ty);
        }
      }
    }
  }

  placeForests();
  for (let i = 0; i < getMapCount('trees', 8); i++) spawnResource('tree');  // lone trees outside forests
  placeBoulderPiles();
  for (let i = 0; i < getMapCount('boulders', 15); i++) spawnResource('boulder');
  for (let i = 0; i < getMapCount('grass', 16); i++) spawnForestAware('grass');
  for (let i = 0; i < getMapCount('berryBushes', 8); i++) spawnForestAware('berry_bush');
  for (let i = 0; i < getMapCount('sticks', 15); i++) spawnForestAware('stick');
  for (let i = 0; i < getMapCount('pebbles', 14); i++) spawnResource('pebble');

  // at least one spawner of each kind, even if the config says 0
  for (const kind of Object.keys(ORE_KINDS)) {
    placeOreSpawners(kind, Math.max(1, getMapCount(ORE_KINDS[kind].spawnerKey, 1)));
  }

  for (let i = 0; i < getMapCount('boars', 4); i++) spawnResource('boar');
  placeBeaches();
  placeAppleTrees();
}

// A share of the map's grown trees are apple trees (GAME_CONFIG.appleTrees). Picked by a hash of the
// tile, not rand(), so the rest of the seeded game stays the same.
function placeAppleTrees() {
  const share = GAME_CONFIG.appleTrees.share;
  for (const t of trees) {
    if (!t.isGrowing && tileVariantHash(t.x + 7, t.y + 13) % 1000 < share * 1000) makeAppleTree(t);
  }
}

function makeAppleTree(tree) {
  tree.apple = true;
  tree.appleGrowth = 0;
  tree.applesReady = false;
  return tree;
}

// Sand on one stretch of each lake's shore (#79): the tiles touching the water on one side of the lake.
// The side comes from the lake's own shape, not rand(), so the rest of the seeded map doesn't change.
// Only drawn: for everything else (building, regrowth, cacti) a beach is ordinary ground.
const BEACH_SPREAD = Math.PI * 0.4; // how far around the lake from the chosen side the sand reaches
function placeBeaches() {
  beachTiles = [];
  const key = (x, y) => `${x},${y}`;
  const water = new Set(waterTiles.map(w => key(w.x, w.y)));
  const rock = new Set(naturalRocks.map(r => key(r.x, r.y)));
  const beach = new Set();
  const seen = new Set();
  for (const first of waterTiles) {
    if (seen.has(key(first.x, first.y))) continue;
    // one lake: the water tiles joined to this one
    const lake = [first];
    seen.add(key(first.x, first.y));
    for (let i = 0; i < lake.length; i++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = lake[i].x + dx * TILE_SIZE, y = lake[i].y + dy * TILE_SIZE;
        if (water.has(key(x, y)) && !seen.has(key(x, y))) { seen.add(key(x, y)); lake.push({ x, y }); }
      }
    }
    const cx = lake.reduce((sum, w) => sum + w.x, 0) / lake.length;
    const cy = lake.reduce((sum, w) => sum + w.y, 0) / lake.length;
    const minX = Math.min(...lake.map(w => w.x)), minY = Math.min(...lake.map(w => w.y));
    const side = (tileVariantHash(minX + lake.length, minY) % 360) * Math.PI / 180;
    for (const w of lake) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = w.x + dx * TILE_SIZE, y = w.y + dy * TILE_SIZE;
          const g = getGridPos(x, y);
          if (water.has(key(x, y)) || rock.has(key(x, y)) || beach.has(key(x, y)) || isBorderZone(g.gx, g.gy)) continue;
          let off = Math.abs(Math.atan2(y - cy, x - cx) - side) % (Math.PI * 2);
          if (off > Math.PI) off = Math.PI * 2 - off;
          if (off <= BEACH_SPREAD) { beach.add(key(x, y)); beachTiles.push({ x, y }); }
        }
      }
    }
  }
}

function resetGame() {
  // every stock starts at 0 unless GAME_CONFIG.start.resources says otherwise
  for (const id of Object.keys(GAME_CONFIG.resources)) stock[id] = 0;
  addResources(GAME_CONFIG.start.resources);
  waveTimer = waveInterval; foodTimer = 25; boarRespawnTimer = 25; waveNum = 1;
  setWorldSize(mapSettings.cols, mapSettings.rows);
  townHall.hp = townHall.maxHp;
  townHall.repairRequested = false;
  settlers = []; blueprints = []; buildings = []; armorOrder = null; enemies = []; enemyTents = []; enemyTentBlueprints = []; enemyArrowStock = 0;
  projectiles = []; foodMix = {}; corpses = []; bloodSplats = []; farmPlots = []; farmZones = []; boars = []; selectedSettler = null; pendingRespawns = [];
  
  generateMap();
  resetTileIndex();
  updateSeedHud();

  settlers.push(
    createSettler('normal', 101, townHall.x - 45, townHall.y),
    createSettler('normal', 102, townHall.x + 45, townHall.y)
  );

  updateUnitCounts();
}
