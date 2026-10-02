// Who a blow hits (#144)
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler } } = window.sim;

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

  return { oneBlow };
})());
