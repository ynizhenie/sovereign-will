// Map editor (#37)
Object.assign(window.sim, (() => {
  const at = (gx, gy) => ({ x: gx * TILE_SIZE + 15, y: gy * TILE_SIZE + 15 });
  const use = (tool, gx, gy, brush = 1) => { editor.tool = tool; editor.brush = brush; const p = at(gx, gy); editorTap(p.x, p.y); };
  const onTile = (list, gx, gy) => list.find(o => o.x === at(gx, gy).x && o.y === at(gx, gy).y);

  // Make a small map by hand, save it, then play it in Endless. Returns what the played world has.
  function handMadeMap() {
    localStorage.removeItem(MAP_STORAGE_KEY);
    startEditor({ cols: 30, rows: 30, generate: false });
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
  function generatedRoundTrip({ seed = 'editor-round-trip' } = {}) {
    document.getElementById('seed-input').value = seed;
    startEditor({ cols: 40, rows: 40, generate: true });
    const before = serializeMap('x');
    resetGame(before);
    const after = serializeMap('x');
    leaveEditor();
    const count = m => Object.values(m.resources).reduce((n, list) => n + list.length, 0) + m.water.length;
    return { same: JSON.stringify(before) === JSON.stringify(after), things: count(before) };
  }

  // The same tool on a tile that has its thing clears it; another thing replaces it (#143)
  function toggleClear() {
    startEditor({ cols: 30, rows: 30, generate: false });
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

  // Rows and columns added and taken away at the edges; what's on the map moves with it (#143)
  function resize() {
    const notes = [];
    window.showNotification = text => notes.push(text);
    startEditor({ cols: 30, rows: 30, generate: false });
    use('tree', 5, 5);
    const hall0 = [townHall.x, townHall.y];
    resizeEditorMap('left', 1);
    resizeEditorMap('top', -1);
    resizeEditorMap('bottom', 1);
    const tree = getGridPos(trees[0].x, trees[0].y);
    const after = { size: [COLS, ROWS], tree: [tree.gx, tree.gy], hallMoved: [townHall.x - hall0[0], townHall.y - hall0[1]] };
    // the tree's column goes into the border when enough is taken off the left: it goes
    for (let i = 0; i < 5; i++) resizeEditorMap('left', -1);
    const treeGone = trees.length === 0;
    // never below 20 tiles
    for (let i = 0; i < 20; i++) resizeEditorMap('right', -1);
    const minCols = COLS;
    // the hall near the top edge, and a row taken off there would put it on the border: refused
    editor.tool = 'town_hall'; editorTap(townHall.x, 3 * TILE_SIZE);
    const rows = ROWS;
    resizeEditorMap('top', -1);
    const unchanged = ROWS === rows;
    const refused = notes.includes(t('editor.hallInTheWay')) && unchanged;
    leaveEditor();
    return { after, treeGone, minCols, refused };
  }

  return { handMadeMap, generatedRoundTrip, toggleClear, resize };
})());
