// Melee against bigger bodies (#107)
Object.assign(window.sim, (() => {
  const { start, run, helpers: { makeSettler, clearResources } } = window.sim;

  // A settler with `weapon` next to a standing, harmless enemy of kind `enemy`; `big`: a big settler.
  // Returns the damage it dealt in `seconds`.
  function meleeReach({ seed = 'reach-test', weapon, enemy = 'brute', big = false, seconds = 6 }) {
    start(seed);
    clearResources();
    const extra = big ? { type: 'big', radius: 13, visualRadius: 18, speed: 0.7 } : {};
    const bow = weapon === 'bow' ? { role: 'archer', quiver: true, quiverCapacity: 12, arrows: 12 } : { role: 'soldier' };
    const s = makeSettler(1, townHall.x + 60, townHall.y + 60, { weapon, hp: 1e6, maxHp: 1e6, ...bow, ...extra });
    settlers = [s];
    const en = createConfiguredEnemy({ x: townHall.x + 120, y: townHall.y + 60 }, enemy);
    en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1e6;
    enemies = [en];
    run(seconds);
    return Math.round(1e6 - en.hp);
  }

  // A big settler standing still next to a raider: does the raider reach it?
  function enemyReachesBig({ seed = 'reach-big-test', seconds = 4 }) {
    start(seed);
    clearResources();
    const s = makeSettler(1, townHall.x + 60, townHall.y + 60, { type: 'big', radius: 13, visualRadius: 18, hp: 1e6, maxHp: 1e6, isPossessed: true });
    settlers = [s];
    enemies = [createConfiguredEnemy({ x: townHall.x + 110, y: townHall.y + 60 }, 'raider')];
    run(seconds, { each: () => { keys.w = keys.a = keys.s = keys.d = false; } });
    return Math.round(1e6 - s.hp);
  }

  return { meleeReach, enemyReachesBig };
})());
