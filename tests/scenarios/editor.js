// Map editor (#37)
Object.assign(window.sim, (() => {
  const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
  const use = (tool, gx, gy, brush = 1) => { editor.tool = tool; editor.brush = brush; const p = at(gx, gy); editorTap(p.x, p.y); };
  const onTile = (list, gx, gy) => list.find(o => o.x === at(gx, gy).x && o.y === at(gx, gy).y);

  // Make a small map by hand, save it, then play it in Endless. Returns what the played world has.
  async function handMadeMap() {
    localStorage.removeItem('sovereign-will-maps');
    await startEditor({ cols: 30, rows: 30, generate: false });
    const empty = trees.length + waterTiles.length + naturalRocks.length + buildings.length;
    use('water', 6, 6, 3);       // a 3×3 pond...
    use('erase', 7, 7);          // ...with a hole in the middle
    use('tree', 20, 6);
    use('apple_tree', 21, 6);
    use('iron_spawner', 22, 20);
    use('coal_ore', 23, 20);
    use('wall_stone', 10, 20);
    use('boar', 5, 20);
    use('sand', 12, 12);
    use('cactus', 12, 12);       // a cactus on the sand: both stay
    use('rock', 1, 1);           // the border: nothing goes there
    editor.tool = 'town_hall'; editorTap(18 * TILE_SIZE + 5, 14 * TILE_SIZE - 4); // snaps to the corner (540, 420)
    document.getElementById('editor-name').value = 'Пруд';
    saveEditorMap();
    leaveEditor();
    const saved = loadSavedMaps()['Пруд'];

    // Endless, Custom map: the first saved map is chosen
    gameMode = 'endless';
    showMenuScreen('endless');
    setMapSource('custom');
    const chosen = customMap && customMap.name;
    resetGame();
    const result = {
      empty, saved: !!saved, chosen, size: [COLS, ROWS], hall: [townHall.x, townHall.y],
      water: waterTiles.length, pondHole: !onTile(waterTiles, 7, 7),
      tree: !!onTile(trees, 20, 6) && !onTile(trees, 20, 6).apple, apple: !!(onTile(trees, 21, 6) || {}).apple,
      spawner: (onTile(naturalRocks, 22, 20) || {}).oreSpawner, coal: !!onTile(coalOres, 23, 20),
      wall: (onTile(buildings, 10, 20) || {}).type, boar: !!onTile(boars, 5, 20),
      sand: !!onTile(desertTiles, 12, 12), cactus: !!onTile(cacti, 12, 12), border: !onTile(naturalRocks, 1, 1),
      settlers: settlers.length
    };
    setMapSource('random');
    return result;
  }

  // A generated map opened in the editor, saved and loaded again is the same map
  async function generatedRoundTrip({ seed = 'editor-round-trip' } = {}) {
    document.getElementById('seed-input').value = seed;
    await startEditor({ cols: 40, rows: 40, generate: true });
    const before = serializeMap('x');
    const beachesBefore = beachTiles.length;
    resetGame(before);
    const beachesAfter = beachTiles.length;
    const after = serializeMap('x');
    const beachRunsPreserved = JSON.stringify(before.beachRuns) === JSON.stringify(after.beachRuns);
    leaveEditor();
    const count = m => Object.values(m.resources).reduce((n, list) => n + list.length, 0) + m.waterRuns.reduce((n, run) => n + run[2], 0);
    return {
      same: JSON.stringify(before) === JSON.stringify(after), things: count(before),
      beachesBefore, beachesAfter, beachRunsPreserved
    };
  }

  async function generatedSavedMapWithoutCameraMove({ seed = 'editor-beaches-no-pan' } = {}) {
    game.mapSettings = { cols: 40, rows: 40 };
    document.getElementById('seed-input').value = seed;
    await startEditor({ cols: 40, rows: 40, generate: true });
    document.getElementById('editor-name').value = 'No camera beach test';
    const saved = saveEditorMap();
    const maps = loadSavedMaps();
    const map = maps['No camera beach test'];
    const savedBeaches = map?.beachRuns?.reduce((sum, run) => sum + run[2], 0) || 0;
    game.gameMode = 'endless';
    game.customMap = map;
    resetGame();
    const loadedBeaches = beachTiles.length;
    map.beachRuns = [];
    resetGame();
    const regeneratedBeaches = beachTiles.length;
    delete maps['No camera beach test'];
    storeSavedMaps(maps);
    return { saved, savedBeaches, loadedBeaches, regeneratedBeaches };
  }

  // The same tool on a tile that has its thing clears it; another thing replaces it (#143)
  async function toggleClear() {
    await startEditor({ cols: 30, rows: 30, generate: false });
    use('tree', 6, 6); use('tree', 6, 6);
    const treeCleared = trees.length === 0;
    use('tree', 6, 6); use('apple_tree', 6, 6);
    const replaced = trees.length === 1 && !!trees[0].apple;
    use('sand', 8, 8); use('sand', 8, 8);
    const sandCleared = desertTiles.length === 0;
    use('water', 10, 10, 3); use('water', 10, 10, 3);
    const pondCleared = waterTiles.length === 0;
    leaveEditor();
    return { treeCleared, replaced, sandCleared, pondCleared };
  }

  async function outpostCamps() {
    await startEditor({ cols: 128, rows: 128, generate: false });
    use('outpost', 36, 64); use('outpost', 92, 64);
    const map = serializeMap('outposts');
    leaveEditor();
    gameMode = 'endless';
    game.customMap = map;
    resetGame();
    createEnemyCamps(0);
    const placed = enemyCamps.map(camp => [Math.floor(camp.x / TILE_SIZE), Math.floor(camp.y / TILE_SIZE)]);
    game.customMap = { ...map, outposts: [] };
    resetGame();
    createEnemyCamps(3);
    const none = enemyCamps.length === 0;
    game.customMap = null;
    return { markersSaved: map.outposts.length, placed, none };
  }

  return { handMadeMap, generatedRoundTrip, generatedSavedMapWithoutCameraMove, toggleClear, outpostCamps };
})());
