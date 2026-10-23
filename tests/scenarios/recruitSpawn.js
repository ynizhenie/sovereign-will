Object.assign(window.sim, (() => {
  const { start, helpers: { clearResources } } = window.sim;

  function recruitSpawn({ seed = 'recruit-spawn' } = {}) {
    start(seed);
    clearResources();
    settlers = [];
    stock.food = 999;
    stock.stone = 999;
    stock.bones = 999;
    stock.rot = 999;

    spawnSettler('normal');
    const worker = settlers[0];
    spawnSettler('dog');
    const pet = settlers[1];
    const spawnDetails = [worker, pet].map(unit => {
      const tile = getGridPos(unit.x, unit.y);
      return {
        reserved: isTownHallSpawnTile(tile.gx, tile.gy),
        outsideHall: Math.max(Math.abs(unit.x - townHall.x), Math.abs(unit.y - townHall.y)) > STRUCTURE_COLLISION_HALF_SIZE + unit.radius,
        buildBlocked: !isBuildLocationAllowed(unit.x, unit.y),
        farmBlocked: !canBeFarmZone(unit.x, unit.y)
      };
    });
    const spawnTiles = [];
    const hall = getGridPos(townHall.x, townHall.y);
    for (let gy = hall.gy - 3; gy <= hall.gy + 3; gy++) {
      for (let gx = hall.gx - 3; gx <= hall.gx + 3; gx++) {
        if (isTownHallSpawnTile(gx, gy)) spawnTiles.push({ gx, gy });
      }
    }
    for (const tile of spawnTiles) {
      const x = tile.gx * TILE_SIZE + TILE_SIZE / 2, y = tile.gy * TILE_SIZE + TILE_SIZE / 2;
      toggleZone(x, y, 'relief');
      toggleZone(x, y, 'post');
      toggleFarmZone(x, y, 'wheat');
      toggleBlightZone(x, y, tile.gx, tile.gy, false);
    }
    return {
      unitCount: settlers.length,
      spawnDetails,
      distinctSpawns: worker.x !== pet.x || worker.y !== pet.y,
      reservedCells: spawnTiles.length,
      allBuildBlocked: spawnTiles.every(tile => !isBuildLocationAllowed(tile.gx * TILE_SIZE + TILE_SIZE / 2, tile.gy * TILE_SIZE + TILE_SIZE / 2)),
      zoneCellsAdded: reliefZones.length + postZones.length + farmZones.length + blightZones.length
    };
  }

  return { recruitSpawn };
})());
