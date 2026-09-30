// Medics (#28)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // A wounded swordsman and a wounded worker near the town hall, a medic, and a harmless enemy standing
  // far off (so it's an attack). Returns hp and herbs after `seconds`.
  function medicUnderAttack({ seed = 'medic-test', herbs = 5, seconds = 6 }) {
    start(seed);
    clearResources();
    const hx = townHall.x, hy = townHall.y;
    const soldier = makeSettler(1, hx + 60, hy, { weapon: 'sword', role: 'soldier', hp: 20, isPossessed: true });
    const worker = makeSettler(2, hx - 60, hy, { hp: 50, isPossessed: true });
    const medic = makeSettler(3, hx, hy + 60, { tool: 'medbag' });
    settlers = [soldier, worker, medic];
    const enemy = createConfiguredEnemy({ x: 3 * TILE_SIZE + 15, y: 3 * TILE_SIZE + 15 }, 'raider');
    enemy.speed = 0; enemy.damage = 0;
    enemies = [enemy];
    stock.herbs = herbs;
    run(seconds, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    return { soldierHp: soldier.hp, workerHp: worker.hp, herbsLeft: stock.herbs + (medic.bagHerbs || 0), inBag: medic.bagHerbs || 0 };
  }

  // No attack: a medic with grass around gathers it and brings herbs home
  function medicGathers({ seed = 'medic-grass-test', seconds = 30 }) {
    start(seed);
    clearResources();
    for (let i = 0; i < 3; i++) grassList.push({ x: townHall.x + (3 + i) * TILE_SIZE, y: townHall.y + 2 * TILE_SIZE, hp: 1 });
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 60, townHall.y, { tool: 'medbag' })];
    stock.herbs = 0;
    run(seconds, { each: () => { pendingRespawns.length = 0; } });
    return { herbs: stock.herbs, grassLeft: grassList.length };
  }

  // The medbag goes to a settler with nothing in hand, not to a soldier or a woodcutter
  function medbagGoesToEmptyHanded({ seed = 'medbag-test' }) {
    start(seed);
    window.showNotification = () => {};
    const hx = townHall.x, hy = townHall.y;
    settlers = [
      makeSettler(1, hx + 50, hy, { weapon: 'sword', role: 'soldier' }),
      makeSettler(2, hx - 50, hy, { tool: 'axe' }),
      makeSettler(3, hx, hy + 50)
    ];
    selectedSettler = null;
    stock.leather = 3; stock.herbs = 2;
    assignTool('medbag');
    run(5);
    return { medic: settlers.find(s => s.tool === 'medbag')?.id ?? null, leather: stock.leather, herbs: stock.herbs };
  }

  return { medicUnderAttack, medicGathers, medbagGoesToEmptyHanded };
})());
