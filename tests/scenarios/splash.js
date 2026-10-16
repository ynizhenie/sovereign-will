// A big one's blow hits at most three at once (#209)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // A big settler swings at five enemies round it: three are hit, the one aimed at among them
  function bigSettler({ seed = 'splash-settler' } = {}) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x + 150, townHall.y, { type: 'big', weapon: 'sword', role: 'soldier', visualRadius: 18 });
    settlers = [s];
    enemies = [0, 1, 2, 3, 4].map(i => {
      const a = i * 1.2;
      const en = createConfiguredEnemy({ x: s.x + Math.cos(a) * 25, y: s.y + Math.sin(a) * 25 }, 'raider');
      en.hp = en.maxHp = 1000; en.speed = 0; en.damage = 0;
      return en;
    });
    const aimed = enemies[2];
    s.attackCooldown = 0;
    performAttack(s, aimed.x, aimed.y);
    return { hit: enemies.filter(en => en.hp < 1000).length, aimedHit: aimed.hp < 1000 };
  }

  // A brute strikes among five settlers: its target and two more take damage, not all five
  function bigEnemy({ seed = 'splash-enemy' } = {}) {
    start(seed);
    clearResources();
    const at = { x: townHall.x + 250, y: townHall.y };
    settlers = [0, 1, 2, 3, 4].map(i => makeSettler(i + 1, at.x + Math.cos(i * 1.2) * 30, at.y + Math.sin(i * 1.2) * 30, { hp: 1000, maxHp: 1000, speed: 0 }));
    const brute = createConfiguredEnemy(at, 'brute');
    brute.speed = 0;
    enemies = [brute];
    run(1, { each: () => settlers.forEach(s => { s.hunger = 999; s.speed = 0; }) });
    return { hurt: settlers.filter(s => s.hp < 1000).length };
  }

  return { splashBigSettler: bigSettler, splashBigEnemy: bigEnemy };
})());
