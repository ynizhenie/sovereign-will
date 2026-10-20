// The friend's batch of fixes (#279), comment 1, part G4: piles carried in, talk
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, placeBuilding, clearResources, tileCenter } } = window.sim;
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; waveTimer = 999; };
  const piled = () => piles.reduce((a, p) => a + p.amount, 0);

  // The hall full, packs lying by it; a warehouse with room built; the workers busy chopping: one of them
  // carries the packs in all the same (18)
  function pilesIn({ seed = 'piles-in' } = {}) {
    start(seed); clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    for (let i = 0; i < 30; i++) { const at = tileCenter(g.gx - 8 + (i % 10), g.gy + 5 + Math.floor(i / 10)); trees.push({ x: at.x, y: at.y, hp: 3, isGrowing: false }); }
    settlers = [1, 2].map(i => makeSettler(i, townHall.x - 40 * i, townHall.y + 60, { tool: 'axe' }));
    keepStoresInStep();
    stock.stone += GAME_CONFIG.storage.capacity.hall + 40;
    keepStoresInStep();
    const before = piled();
    const w = tileCenter(g.gx + 5, g.gy);
    const warehouse = placeBuilding('warehouse', w.x, w.y);
    invalidateAllPaths();
    run(40, { each: () => { quiet(); pendingRespawns.length = 0; } });
    return { before: before > 30, after: Math.round(piled()), inWarehouse: Math.round(Object.values(warehouse.store || {}).reduce((a, n) => a + n, 0)), chopped: trees.length < 30, busy: trees.length > 0 };
  }

  // Two talking in a knot: one tells of its day, the other answers; no dots (19)
  function talkSays({ seed = 'talk-says' } = {}) {
    start(seed); clearResources();
    const a = makeSettler(1, townHall.x + 60, townHall.y + 60), b = makeSettler(2, townHall.x + 80, townHall.y + 60);
    settlers = [a, b];
    a.today = { gathered: 3 };
    const said = new Set();
    run(40, { each: () => {
      quiet();
      for (const s of [a, b]) {
        if (s.isIdle && (!s.idle || s.idle.act !== 'talk')) { s.idle = { act: 'talk', left: 99, spot: { x: townHall.x + 70, y: townHall.y + 60 }, partnerId: null }; }
        if (s.say && s.say.until > pathTick) said.add(`${s.id}:${s.say.text}`);
      }
    } });
    const lines = [...said];
    return { a: lines.some(l => l.startsWith('1:')), b: lines.some(l => l.startsWith('2:')), story: lines.some(l => l.includes(t('voice.story.gathered', { n: 3 }))) };
  }

  return { pilesIn, talkSays };
})());
