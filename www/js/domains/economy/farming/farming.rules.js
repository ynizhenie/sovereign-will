// Farm zones and apple trees

// A farm zone goes only on grass ground (not sand, water, rock, a building or a blueprint) with nothing
// on it that needs a tool (a grown tree, boulder, ore, cactus). What's gathered by hand (grass, sticks,
// pebbles, bushes) is fine: workers clear it (see findZoneBlockers).
function canBeFarmZone(x, y) {
  if (Math.hypot(x - townHall.x, y - townHall.y) < townHall.radius + 15) return false;
  const at = o => o.x === x && o.y === y;
  if (isDesertTile(x, y) || game.beachTiles.some(at)) return false;
  if (game.waterTiles.some(at) || game.buildings.some(at) || game.blueprints.some(at)) return false;
  for (const [kind, def] of Object.entries(GAME_CONFIG.mapResources)) {
    if (def.tool && game[def.list].some(o => at(o) && !(kind === 'tree' && o.isGrowing))) return false;
  }
  return true;
}

function toggleFarmZone(x, y, crop) {
  const existing = game.farmZones.find(z => z.x === x && z.y === y);
  if (crop === 'clear' || (existing && existing.crop === crop)) {
    if (existing) game.farmZones.splice(game.farmZones.indexOf(existing), 1);
    return;
  }
  if (!existing && !canBeFarmZone(x, y)) {
    showNotification(t('zone.badTile'), true);
    return;
  }
  if (existing) existing.crop = crop;
  else game.farmZones.push({ x, y, crop });
}

// A share of the map's grown trees are apple trees (GAME_CONFIG.appleTrees). Picked by a hash of the
// tile, not rand(), so the rest of the seeded game stays the same.
function placeAppleTrees() {
  const share = GAME_CONFIG.appleTrees.share;
  for (const t of game.trees) {
    if (!t.isGrowing && tileVariantHash(t.x + 7, t.y + 13) % 1000 < share * 1000) makeAppleTree(t);
  }
}

function makeAppleTree(tree) {
  tree.apple = true;
  tree.appleGrowth = 0;
  tree.applesReady = false;
  return tree;
}

// Wheat grows; saplings grow into trees; apple trees grow apples (faster watered)
function growCrops(dt) {
  game.farmPlots.forEach(f => {
    if (f.growth < 100) f.growth += dt * 5 * (f.watered ? GAME_CONFIG.gear.wateringCan.growthFactor : 1);
  });

  game.trees.forEach(t => {
    if (t.isGrowing) {
      t.growProgress = (t.growProgress || 0) + dt * (t.watered ? GAME_CONFIG.gear.wateringCan.growthFactor : 1);
      if (t.growProgress >= 20) {
        t.isGrowing = false;
        t.hp = 3;
      }
    } else if (t.apple && !t.applesReady) {
      t.appleGrowth += dt / GAME_CONFIG.appleTrees.growSeconds;
      if (t.appleGrowth >= 1) t.applesReady = true;
    }
  });
}
