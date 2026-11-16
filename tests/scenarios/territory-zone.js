// The patrol and night-work zone stays narrow around distant buildings and within the player's land.
Object.assign(window.sim, (() => {
  const { start } = window.sim;

  function baseZoneReach({ seed = 'base-zone-reach' } = {}) {
    game.mapSettings = { cols: 128, rows: 128 };
    start(seed);
    game.gameMode = 'endless';
    game.enemyCamp = null;
    game.enemyCamps = [];
    buildings.length = 0;
    buildings.push({
      x: townHall.x + 18 * TILE_SIZE, y: townHall.y, side: 'blue', type: 'warehouse'
    });

    const alongBuilding = baseRadiusToward(0, TILE_SIZE);
    const offAxis = baseRadiusToward(Math.PI / 12, TILE_SIZE);
    const camp = { x: townHall.x + 16 * TILE_SIZE, y: townHall.y, radius: 2 };
    game.enemyCamp = camp;
    game.enemyCamps = [camp];
    const capped = baseRadiusToward(0, TILE_SIZE);
    const boundary = { x: townHall.x + capped + TILE_SIZE, y: townHall.y };

    return {
      farBuildingInfluencesNarrowSector: alongBuilding > 15 * TILE_SIZE && offAxis <= 5 * TILE_SIZE,
      radiusCappedAtTerritory: capped < alongBuilding,
      boundaryInsideTerritory: inTerritory(boundary.x, boundary.y),
      beyondBoundaryOutsideTerritory: !inTerritory(boundary.x + TILE_SIZE, boundary.y)
    };
  }

  return { baseZoneReach };
})());
