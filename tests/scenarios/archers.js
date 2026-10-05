// Archers (#173)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, placeBuilding, clearResources } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };

  // An archer hunting a boar behind a row of boulders: every arrow it lets go has a clear line
  function huntClearShots({ seed = 'archer-hunt' } = {}) {
    start(seed);
    clearResources();
    const b = nearHall(8, 0);
    boars.push({ ...b, hp: 999, maxHp: 999, priority: 0, wanderTimer: 99, wanderInterval: 99, targetX: b.x, targetY: b.y });
    for (let dy = -2; dy <= 2; dy++) boulders.push({ ...nearHall(6, dy), hp: 4, maxHp: 4, priority: 0 });
    invalidateAllPaths();
    const archer = makeSettler(1, nearHall(3, 0).x, nearHall(3, 0).y, { weapon: 'bow', role: 'soldier', quiver: true, arrows: 30 });
    settlers = [archer];
    let shots = 0, blind = 0;
    const original = performAttack;
    window.performAttack = function (attacker, x, y) {
      if (attacker === archer && attacker.attackCooldown <= 0 && attacker.arrows > 0) {
        shots++;
        if (!hasLineOfFire(attacker.x, attacker.y, x, y)) blind++;
      }
      return original.apply(this, arguments);
    };
    try { run(8, { each: () => { const boar = boars[0]; if (boar) { boar.fleeTimer = 0; boar.x = b.x; boar.y = b.y; } } }); }
    finally { window.performAttack = original; }
    return { shots: shots > 0, blind };
  }

  // A tower walled in on three sides; the archer comes from a walled side: it goes round and climbs
  function climbWalledTower({ seed = 'archer-climb' } = {}) {
    start(seed);
    clearResources();
    const t = nearHall(5, 0);
    const tower = placeBuilding('watchtower', t.x, t.y);
    for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [1, 1], [1, -1]]) placeBuilding('wall_stone', nearHall(5 + dx, dy).x, nearHall(5 + dx, dy).y);
    invalidateAllPaths();
    const archer = makeSettler(1, nearHall(7, 0).x, nearHall(7, 2).y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers = [archer];
    let up = false;
    run(12, { holdWaves: false, each: () => { if (waveTimer > 8 || waveTimer < 1) waveTimer = 8; if (archer.towerAssignment === tower && archer.x === tower.x && archer.y === tower.y) up = true; } });
    return { up };
  }

  // A tower walled right round, in a walled-off pocket the town hall can't reach: the guard comes down
  // onto a free tile
  function climbDownInPocket({ seed = 'archer-down' } = {}) {
    start(seed);
    clearResources();
    // walls right round the tower, and a ring further out shutting the space between off from the hall
    const t = nearHall(8, 0);
    const tower = placeBuilding('watchtower', t.x, t.y);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (ring === 1 || ring === 5) placeBuilding('wall_stone', nearHall(8 + dx, dy).x, nearHall(8 + dx, dy).y);
    }
    invalidateAllPaths();
    const archer = makeSettler(1, t.x, t.y, { weapon: 'bow', role: 'archer', quiver: true, arrows: 12 });
    settlers = [archer];
    tower.guards = [archer]; archer.towerAssignment = tower;
    releaseTowerGuard(archer);
    const g = getGridPos(archer.x, archer.y);
    return { onFreeTile: !isTileBlockedForSettler(g.gx, g.gy), offTower: archer.x !== tower.x || archer.y !== tower.y };
  }

  return { huntClearShots, climbWalledTower, climbDownInPocket };
})());
