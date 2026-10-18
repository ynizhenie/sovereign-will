// Spike traps (#32)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, wallRing, clearResources } } = window.sim;

  // A standing enemy moved on and off a spike tile. Returns its hp after each step and the trap's uses.
  function spikeVisits({ seed = 'spike-test' }) {
    start(seed);
    clearResources();
    settlers = [makeSettler(1, townHall.x - 200, townHall.y, { isPossessed: true })];
    const g = getGridPos(townHall.x, townHall.y);
    const on = tileCenter(g.gx + 5, g.gy), off = tileCenter(g.gx + 7, g.gy);
    const trap = placeBuilding('spikes', on.x, on.y);
    const en = createConfiguredEnemy(off, 'brute');
    en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1000;
    enemies = [en];
    const log = [];
    const at = p => { en.x = p.x; en.y = p.y; window.sim.run(0.1); log.push([Math.round(1000 - en.hp), trap.usesLeft]); };
    at(on); at(on); at(off); at(on); // two visits so far, standing on it a while the first time
    for (let i = 0; i < 3; i++) { at(off); at(on); } // three more: the trap is used up
    const usedUp = { stays: buildings.includes(trap), usesLeft: trap.usesLeft, hp: trap.hp };
    const hpBroken = en.hp;
    at(off); at(on); // broken: harmless
    const harmless = en.hp === hpBroken;
    // repaired (#232): whole again
    trap.repairRequested = true; stock.wood = 50; stock.iron = 50;
    settlers = [makeSettler(2, on.x - 40, on.y + 40)];
    en.x = off.x + 200; en.y = off.y;
    window.sim.run(12, { each: () => { settlers[0].hunger = 999; } });
    return { log, usedUp, harmless, repaired: trap.usesLeft === 5 && trap.hp === 5 };
  }

  // A settler walking past a spike tile on an open map takes the path around it
  function settlerAvoidsSpikes({ seed = 'spike-path-test' }) {
    start(seed);
    clearResources();
    const g = getGridPos(townHall.x, townHall.y);
    const from = tileCenter(g.gx + 3, g.gy + 3), to = tileCenter(g.gx + 9, g.gy + 3), mid = tileCenter(g.gx + 6, g.gy + 3);
    placeBuilding('spikes', mid.x, mid.y);
    resetTileIndex();
    const path = findPathAStar(from.x, from.y, to.x, to.y).path;
    return { found: path.length > 0, overSpikes: path.some(p => p.x === mid.x && p.y === mid.y) };
  }

  // The town hall walled in, one wall tile swapped for spikes: raiders walk in over the spikes
  // instead of breaking walls. Returns walls broken and spike uses spent.
  function spikeGap({ seed = 'spike-gap-test', seconds = 60 }) {
    start(seed);
    clearResources();
    wallRing(3);
    const g = getGridPos(townHall.x, townHall.y);
    const gap = tileCenter(g.gx + 3, g.gy);
    buildings = buildings.filter(b => b.x !== gap.x || b.y !== gap.y);
    const trap = placeBuilding('spikes', gap.x, gap.y);
    trap.usesLeft = 1000; // stays for the whole test
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x - 40, townHall.y, { hp: 1e6, maxHp: 1e6, isPossessed: true })];
    const walls0 = buildings.filter(b => b.type === 'wall_wood').length;
    enemies = [0, 1, 2].map(i => createConfiguredEnemy(tileCenter(g.gx + 8, g.gy - 1 + i), 'raider'));
    for (const en of enemies) { en.hp = en.maxHp = 1e6; }
    run(seconds, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    return { wallsBroken: walls0 - buildings.filter(b => b.type === 'wall_wood').length, spikeSteps: 1000 - trap.usesLeft };
  }

  return { spikeVisits, settlerAvoidsSpikes, spikeGap };
})());
