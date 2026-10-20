// The friend's batch of fixes (#279), part B: the raid, the cards, the enemies
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources } } = window.sim;
  const step = (seconds, each) => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); if (each && each(f)) return true; } return false; };

  // A wave gathers before it attacks (44), and a big one has a commander giving orders (45)
  function waveMusters({ seed = 'muster' } = {}) {
    start(seed);
    waveNum = 12; startNextWave(); waveTimer = 999;
    const wave = enemies.filter(en => en.fromWave);
    const from = wave.map(en => ({ x: en.x, y: en.y }));
    step(3, () => { waveTimer = 999; });
    // gathering: by the edge they came in at (not one told to go by its commander, nor a tent builder)
    const fromEdge = en => Math.min(en.x, en.y, WORLD_WIDTH - en.x, WORLD_HEIGHT - en.y);
    const early = Math.max(...wave.filter(en => en.musterUntil && !en.buildTarget).map(fromEdge));
    const captain = wave.find(en => en.captain);
    let ordered = 0;
    step(6, () => { waveTimer = 999; ordered = Math.max(ordered, enemies.filter(en => en.orderBubble && en.orderBubble.until > pathTick && !en.captain).length); });
    const later = Math.max(...wave.filter(en => enemies.includes(en)).map(en => Math.hypot(en.x - from[wave.indexOf(en)].x, en.y - from[wave.indexOf(en)].y)));
    return { size: wave.length, early, later, captain: !!captain, ordered };
  }

  // Scouts between waves: they walk the red band, settlers leave them be, they run when one comes near;
  // pointed at, one is hunted and runs off (23)
  function scoutsBetweenWaves({ seed = 'scouts' } = {}) {
    start(seed);
    waveNum = 4; scoutClock = 0; GAME_CONFIG.scouts.chance = 1;
    const seen = [];
    step(42, () => { waveTimer = 999; if (scouts.length) seen.push(...scouts.map(s => ({ x: s.x, y: s.y }))); });
    const band = (BORDER_MARGIN + 0.6) * TILE_SIZE;
    const inBand = seen.every(p => p.x < band || p.y < band || p.x > WORLD_WIDTH - band || p.y > WORLD_HEIGHT - band);
    const count = scouts.length;
    const scout = scouts[0];
    const notEnemy = !enemies.includes(scout);
    // pointed at: an enemy now, marked, running off
    scoutTapped(scout.x, scout.y);
    const hunted = enemies.includes(scout) && scout.markedTarget;
    // (#279, c1.11) not off at once: only once one of them comes near it
    settlers.forEach(s => { s.speed = 0; });
    step(3, () => { waveTimer = 999; });
    const stays = enemies.includes(scout) && !scout.fleeing;
    settlers[0].x = scout.x + (scout.x < WORLD_WIDTH / 2 ? 60 : -60); settlers[0].y = scout.y;
    step(12, () => { waveTimer = 999; });
    GAME_CONFIG.scouts.chance = 0.5;
    return { count, inBand, notEnemy, hunted, stays, goneOff: !enemies.includes(scout) };
  }

  // Each camp layout builds, the same camp every time for a seed; the party starts past the camp's red line (34, 37)
  function campLayouts({ seed = 'layouts' } = {}) {
    const out = {};
    for (const layout of ['square', 'round', 'scattered', 'fort']) {
      window.sim.campOpens({ seed });
      raidCamp.layout = layout; raidCamp.seed = 42;
      const sig = () => buildings.map(b => `${b.type}@${b.x},${b.y}`).sort().join('|') + '#' + enemyTents.length;
      openRaidPicker(); document.querySelector('#raid-picker [data-raid="go"]').click();
      step(60, () => { waveTimer = 999; return !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'); });
      enterCamp();
      const first = sig(), walls = buildings.filter(b => b.type.startsWith('wall')).length;
      const band = BORDER_MARGIN * TILE_SIZE;
      const pastLine = settlers.every(s => s.x < band || s.y < band || s.x > WORLD_WIDTH - band || s.y > WORLD_HEIGHT - band);
      resetRaid();
      // again: the same camp
      window.sim.campOpens({ seed }); raidCamp.layout = layout; raidCamp.seed = 42;
      openRaidPicker(); document.querySelector('#raid-picker [data-raid="go"]').click();
      step(60, () => { waveTimer = 999; return !!document.querySelector('#raid-bar [data-raid-act="attack"]:not([disabled])'); });
      enterCamp();
      out[layout] = { walls, same: sig() === first, pastLine, outpost: enemyTents.some(et => et.outpost) };
      resetRaid();
    }
    return out;
  }

  // A scout sent to the camp: it walks there, looks, is spotted, comes home; the camp is still there (33)
  function scoutTheCamp({ seed = 'scout-camp' } = {}) {
    window.sim.campOpens({ seed });
    const camp = { ...raidCamp };
    const sent = sendScout();
    let looked = false, cols = 0;
    step(150, () => { waveTimer = 999; if (raid.phase === 'fight') { looked = true; cols = COLS; } return looked && raid.phase === null; });
    return { sent, looked, cols, campStays: !!raidCamp && raidCamp.seed === camp.seed, phase: raid.phase, home: settlers.length };
  }

  return { waveMusters, scoutsBetweenWaves, campLayouts, scoutTheCamp };
})());
