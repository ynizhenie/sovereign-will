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

  // A worker carrying wood home is hit: it turns on the enemy rather than walk on (#208)
  function struckWhileCarrying({ seed = 'struck-carrying' } = {}) {
    start(seed);
    clearResources();
    const w = makeSettler(1, townHall.x + 220, townHall.y, { tool: 'axe' });
    w.carrying = { type: 'wood', amount: 3 };
    settlers = [w];
    const en = createConfiguredEnemy({ x: w.x + 18, y: w.y }, 'raider');
    en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e4;
    enemies = [en];
    damageSettler(w, 1, en);
    let turned = false;
    run(1, { each: () => { if (w.activity === 'strikeBack') turned = true; } });
    return { turned, hit: en.hp < en.maxHp };
  }

  // Six swordsmen on two raiders a few steps apart: no more than three on one of them at a time, so both get
  // fought (#208)
  function meleeSlots({ seed = 'melee-slots' } = {}) {
    start(seed);
    clearResources();
    settlers = Array.from({ length: 6 }, (_, i) => makeSettler(i + 1, townHall.x - 60 + i * 20, townHall.y + 120, { weapon: 'sword', role: 'soldier', hp: 1e4, maxHp: 1e4 }));
    // the second a little farther from the town hall: everyone's first pick is the nearer one
    const make = (dx, dy) => { const en = createConfiguredEnemy({ x: townHall.x + dx, y: townHall.y + dy }, 'raider'); en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e5; en.fromWave = true; return en; };
    enemies = [make(-50, 200), make(50, 260)];
    let most = 0;
    run(8, { each: () => { waveTimer = 50; for (const en of enemies) most = Math.max(most, settlers.filter(s => Math.hypot(s.x - en.x, s.y - en.y) < 45).length); } });
    return { most, bothFought: enemies.every(en => en.hp < en.maxHp) };
  }

  return { struckWhileCarrying, meleeSlots, enemyHealer, oneBlow };
})());
