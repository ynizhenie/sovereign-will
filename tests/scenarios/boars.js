// Hunting boars (#77): a boar that isn't hit only backs off slowly, so a hunter catches it
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // A swordsman hunts one boar on an empty map. `where`: 'open' (near the town hall) or 'edge' (by the
  // map edge, where boars used to get stuck out of reach). Returns seconds until the boar is down.
  function boarChase({ seed = 'boar-chase-test', where = 'open', seconds = 40 }) {
    start(seed);
    clearResources();
    const at = where === 'edge'
      ? { x: 3 * TILE_SIZE + 15, y: townHall.y }
      : { x: townHall.x + 200, y: townHall.y };
    boars = [{ ...at, hp: 40, maxHp: 40, priority: 0, wanderTimer: 0, wanderInterval: 999, targetX: at.x, targetY: at.y }];
    settlers = [makeSettler(1, at.x + (where === 'edge' ? 160 : -160), at.y, { weapon: 'sword', role: 'soldier' })];
    const boar = boars[0];
    let downAt = null;
    run(seconds, { each: f => { if (downAt === null && (boar.isCarcass || !boars.includes(boar))) downAt = f / 60; } });
    return { downAt };
  }

  function boarFearsEnemy({ seed = 'boar-fears-enemy' } = {}) {
    start(seed);
    clearResources();
    settlers = [];
    const boar = { x: townHall.x + 600, y: townHall.y, hp: 30, maxHp: 30, targetX: townHall.x + 600, targetY: townHall.y };
    boars = [boar];
    enemies = [{ x: boar.x - 60, y: boar.y, hp: 100 }];
    tickBoars(1 / 60);
    const waryOfEnemy = boar.fleeTimer > 0 && !boar.sprinting;
    boar.fleeTimer = 0;
    boar.panic = true;
    boarsPanic();
    return { waryOfEnemy, runsFromEnemyInPanic: boar.fleeTimer > 0 && boar.sprinting };
  }

  return { boarChase, boarFearsEnemy };
})());
