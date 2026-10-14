// Who a blow hits (#144)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // Two enemies within reach of a swordsman: one blow at the first. Returns which of them got hurt.
  function oneBlow({ seed = 'one-blow', type = 'normal' } = {}) {
    start(seed);
    const hx = townHall.x + 120, hy = townHall.y;
    const s = makeSettler(1, hx, hy, { weapon: 'sword', role: 'soldier', type });
    settlers = [s];
    enemies = [createConfiguredEnemy({ x: hx + 25, y: hy }, 'raider'), createConfiguredEnemy({ x: hx, y: hy + 25 }, 'raider')];
    performAttack(s, enemies[0].x, enemies[0].y);
    return enemies.map(en => en.hp < en.maxHp);
  }

  // An enemy healer by a hurt raider, no settler near: it walks up and heals it (#203)
  function enemyHealer({ seed = 'enemy-healer' } = {}) {
    start(seed);
    clearResources();
    settlers = [];
    const g = getGridPos(townHall.x, townHall.y);
    const at = (dx, dy) => ({ x: (g.gx + dx) * TILE_SIZE + 15, y: (g.gy + dy) * TILE_SIZE + 15 });
    const hurt = createConfiguredEnemy(at(-12, -10), 'raider');
    hurt.hp = 20; hurt.speed = 0;
    const medic = createConfiguredEnemy(at(-9, -10), 'raider_medic');
    enemies = [hurt, medic];
    run(4);
    return { healed: hurt.hp > 40, holdsBag: getEnemyDef(medic).tool === 'medbag' };
  }

  return { enemyHealer, oneBlow };
})());
