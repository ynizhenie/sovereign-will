// The friend's batch of fixes (#279), part A1: the bugs
Object.assign(window.sim, (() => {
  const { start, helpers: { makeSettler, clearResources } } = window.sim;
  const step = seconds => { for (let f = 0; f < seconds * 60; f++) { update(1 / 60); waveTimer = 999; } };

  // Soldiers on their posts against archers shooting from off past the post: how long till they're down,
  // and how often a soldier turned back to its post on the way (point 10)
  function archersOffPost({ seed = 'archer-post' } = {}) {
    start(seed); clearResources(); defensePlan = null;
    for (let i = 0; i < 6; i++) settlers.push(makeSettler(700 + i, townHall.x - 40 + i * 15, townHall.y + 50, { weapon: 'sword', role: 'soldier' }));
    for (let i = 0; i < 3; i++) { const en = createConfiguredEnemy({ x: townHall.x + 400 + i * 30, y: townHall.y - 60 + i * 50 }, 'raider_archer'); en.fromWave = true; enemies.push(en); }
    let clearedAt = -1, backToPost = 0;
    const was = new Map();
    for (let f = 0; f < 60 * 20 && clearedAt < 0; f++) {
      update(1 / 60); waveTimer = 999;
      for (const s of settlers) { if (was.get(s) === 'fightEnemies' && s.activity === 'holdPost' && enemies.length) backToPost++; was.set(s, s.activity); }
      if (!enemies.length) clearedAt = f / 60;
    }
    return { clearedAt, backToPost };
  }

  // A settler walking past ones asleep round a tent: not pushed off by them (point 11)
  function pastSleepers({ seed = 'sleepers' } = {}) {
    start(seed); clearResources();
    const walker = makeSettler(900, townHall.x + 100, townHall.y, {});
    const sleepers = [0, 1, 2].map(i => makeSettler(901 + i, walker.x + 15, walker.y - 15 + i * 15, { asleep: true }));
    settlers.push(walker, ...sleepers);
    const push = getSettlerAvoidance(walker);
    sleepers.forEach(o => { o.asleep = false; });
    const awake = getSettlerAvoidance(walker);
    return { asleep: Math.hypot(push.x, push.y), awake: Math.hypot(awake.x, awake.y) };
  }

  // Possessing one asleep wakes it (point 18)
  function possessSleeper({ seed = 'possess-sleep' } = {}) {
    start(seed);
    const s = settlers[0];
    s.asleep = true;
    selectedSettler = s; switchPossession();
    step(0.1);
    const out = { possessed: s.isPossessed, asleep: !!s.asleep };
    unpossess();
    return out;
  }

  // The undead's necromancer with an enemy close by and one of its own hurt: it heals it where it stands,
  // and doesn't step back and forth (point 22); hurt itself, nobody else, it heals itself (point 21)
  function calmNecromancer({ seed = 'calm-necro' } = {}) {
    setSideFaction('player', 'undead');
    start(seed); clearResources();
    settlers.length = 0;
    const n = makeSettler(800, townHall.x + 80, townHall.y, { type: 'zombie', tool: 'necro_staff' });
    const hurt = makeSettler(801, n.x + 25, n.y, { type: 'zombie', weapon: 'sword', role: 'soldier', hp: 40, speed: 0 }); // (it stays put)
    settlers.push(n, hurt);
    const en = createConfiguredEnemy({ x: n.x + 100, y: n.y }, 'raider'); en.fromWave = true; en.speed = 0; enemies.push(en);
    const from = { x: n.x, y: n.y }, hpBefore = hurt.hp;
    step(1);
    const moved = Math.hypot(n.x - from.x, n.y - from.y);
    const healed = hurt.hp > hpBefore;
    hurt.hp = hurt.maxHp; n.hp = 50;
    step(1);
    const selfHealed = n.hp > 50;
    setSideFaction('player', 'humans');
    return { moved, healed, selfHealed };
  }

  // Given a new tool, the old one goes into the store whole (point 24)
  function oldToolStored({ seed = 'old-tool' } = {}) {
    start(seed);
    const s = settlers[0];
    s.tool = 'axe'; s.role = 'worker';
    armory = {};
    s.targetEquipment = { tool: 'pickaxe' };
    s.x = townHall.x + townHall.radius; s.y = townHall.y;
    step(0.5);
    return { tool: s.tool, stored: armory['tools:axe'] || 0 };
  }

  // A worker with a build to do: the build before a corpse (point 39)
  function orderBeforeCorpse({ seed = 'order-corpse' } = {}) {
    start(seed); clearResources();
    const s = settlers[0];
    settlers.length = 1;
    addCorpse({ x: townHall.x + 60, y: townHall.y + 40, radius: 10 }, 'enemy', 'raider');
    const bp = createBuildingBlueprint('wall_wood', townHall.x + 150, townHall.y - 90); bp.needs = {}; blueprints.push(bp);
    stock.wood = 50;
    const seen = new Set();
    for (let f = 0; f < 60 * 2; f++) { update(1 / 60); waveTimer = 999; seen.add(s.activity); }
    return { carryingCorpse: !!(s.carrying && s.carrying.type === 'corpse'), hauled: seen.has('haulCorpses'), built: seen.has('build') || seen.has('deliverMaterials') };
  }

  return { archersOffPost, pastSleepers, possessSleeper, calmNecromancer, oldToolStored, orderBeforeCorpse };
})());
