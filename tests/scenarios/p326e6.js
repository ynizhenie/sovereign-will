// (#326) Firewood for every faction, a quick club, a wave's tents at the border of the player's land
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const evening = () => GAME_CONFIG.daytime.morning + GAME_CONFIG.daytime.day + 1;

  // The undead: firewood is theirs too, ordered in Craft (1 wood into 2); their torch posts burn it again (no firewood, a
  // post stays dark); a club is quick to make
  function firewoodForAll({ seed = 'e6-firewood' } = {}) {
    sides.player.faction = 'undead'; sides.player.color = '#9b59b6'; sides.enemy.color = '#e8572a';
    start(seed); clearResources();
    const r = { forUndead: isForPlayerFaction(GAME_CONFIG.resources.firewood), recipeListed: isForPlayerFaction(GAME_CONFIG.recipes.firewood) };
    // ordered in Craft: made by hand at the hall (#326, 27.10: by one with an axe)
    stock.wood = 5; stock.firewood = 0;
    settlers = [makeSettler(1, townHall.x + 40, townHall.y, { tool: 'axe' })];
    boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999;
    craftRecipe('firewood');
    run(15, { each: () => { waveTimer = 999; } });
    r.made = { firewood: stock.firewood, wood: stock.wood };
    // a torch post at night: dark with no firewood, lit with some
    const post = placeBuilding('torch', nearHall(4, 0).x, nearHall(4, 0).y);
    settlers = [makeSettler(2, townHall.x + 40, townHall.y)];
    stock.firewood = 0; dayTime = evening();
    run(10, { each: () => { waveTimer = 999; dayTime = evening(); } });
    r.darkWithout = !post.lit;
    stock.firewood = 3;
    run(20, { each: () => { waveTimer = 999; dayTime = evening(); } });
    r.litWith = !!post.lit;
    r.club = { seconds: GAME_CONFIG.weapons.club.craftSeconds, quickerThanOthers: GAME_CONFIG.weapons.club.craftSeconds < GAME_CONFIG.crafting.seconds.weapons };
    return r;
  }

  // A wave's tent is put up outside the player's land, one to three tiles from it
  function wavesTentsAtTheBorder({ seed = 'e6-tents' } = {}) {
    mapSettings = { cols: 120, rows: 120 }; // (a map bigger than the base's start land, so there is a border)
    start(seed); clearResources();
    boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999;
    waveNum = 12; // (tents come with the waves)
    enemyTents = []; enemyTentBlueprints = [];
    startNextWave();
    const gap = site => {
      let best = Infinity;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (inTerritory(site.x + dx * TILE_SIZE, site.y + dy * TILE_SIZE)) best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
      return best;
    };
    return { sites: enemyTentBlueprints.length > 0, allOutside: enemyTentBlueprints.every(s => !inTerritory(s.x, s.y)), gaps: [...new Set(enemyTentBlueprints.map(gap))].sort() };
  }

  return { firewoodForAll, wavesTentsAtTheBorder };
})());
