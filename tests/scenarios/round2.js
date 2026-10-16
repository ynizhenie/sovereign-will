// #232, the friend's second round: free hands first on marks, even knots, archers with no arrows, necromancers
// not twitching, posts by the base's shape, the undead fighting on in a panic
Object.assign(window.sim, (() => {
  const { start, run, helpers: { tileCenter, makeSettler, clearResources, placeBuilding } } = window.sim;
  const nearHall = (dx, dy) => { const g = getGridPos(townHall.x, townHall.y); return tileCenter(g.gx + dx, g.gy + dy); };
  const quiet = () => { settlers.forEach(s => { s.hunger = 999; }); boars = []; boarRespawnTimer = 999; pendingRespawns = []; };
  const asFaction = (player, enemy, seed) => { sides.player.faction = player; sides.enemy.faction = enemy; start(seed); clearResources(); invalidateAllPaths(); };
  const back = () => { sides.player.faction = 'humans'; sides.enemy.faction = 'humans'; };

  // Two marked sticks, two workers with free hands and one with an axe: the axe never goes for a stick
  function freeHandsFirst({ seed = 'r2-hands' } = {}) {
    start(seed); clearResources();
    sticks.push(...[nearHall(3, 2), nearHall(-3, 2)].map(p => ({ x: p.x, y: p.y, hp: 1, maxHp: 1, priority: 1 })));
    invalidateAllPaths();
    settlers = [makeSettler(1, townHall.x + 40, townHall.y + 40, { tool: 'axe' }), makeSettler(2, townHall.x - 20, townHall.y + 40), makeSettler(3, townHall.x, townHall.y + 50)];
    let axeOnStick = false;
    run(15, { each: () => { quiet(); if (settlers[0].markTarget && sticks.includes(settlers[0].markTarget)) axeOnStick = true; } });
    return { axeOnStick, sticksLeft: sticks.filter(s => s.priority > 0).length };
  }

  // Three idle settlers talking in one knot stand apart round it, not in each other
  function knot({ seed = 'r2-knot' } = {}) {
    start(seed); clearResources();
    // (ids 1, 56, 111: by the old ring, by id alone, they stood on one spot)
    settlers = [1, 56, 111].map((id, i) => makeSettler(id, townHall.x - 40 + i * 25, townHall.y + 60));
    run(0.5, { each: quiet });
    const spot = nearHall(-3, 3);
    settlers.forEach(s => { s.idle = { act: 'talk', left: 60, spot: { x: spot.x, y: spot.y }, partnerId: null }; });
    run(8, { each: quiet });
    let closest = Infinity;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) closest = Math.min(closest, Math.hypot(settlers[i].x - settlers[j].x, settlers[i].y - settlers[j].y));
    return { apart: closest >= 20 };
  }

  // A wave on, an archer with no arrows anywhere: it keeps to the town hall, not out at a post
  function archerNoArrows({ seed = 'r2-archer' } = {}) {
    start(seed); clearResources();
    const a = makeSettler(1, townHall.x + 100, townHall.y + 60, { weapon: 'bow', role: 'archer', quiver: true, arrows: 0 });
    settlers = [a, ...[2, 3, 4].map(i => makeSettler(i, townHall.x - 60, townHall.y + 25 * i, { weapon: 'sword', role: 'soldier' }))];
    stock.arrows = 0;
    const en = createConfiguredEnemy(nearHall(-14, -10), 'raider'); en.speed = 0; en.damage = 0; en.fromWave = true;
    enemies = [en];
    run(10, { holdWaves: false, each: () => { quiet(); waveTimer = 5; stock.arrows = 0; } });
    return { atHall: Math.hypot(a.x - townHall.x, a.y - townHall.y) < townHall.radius + 40 };
  }

  // An enemy necromancer and a corpse right by a settler: it doesn't go for it (stepping in and back)
  function necroGuardedCorpse({ seed = 'r2-necro' } = {}) {
    asFaction('humans', 'undead', seed);
    const s = makeSettler(1, townHall.x + 200, townHall.y, { weapon: 'sword', role: 'soldier', speed: 0 });
    settlers = [s];
    corpses = [{ x: s.x + 30, y: s.y, radius: 10, side: 'settler', kind: 'normal', age: 0 }];
    const necro = createConfiguredEnemy({ x: s.x + 200, y: s.y }, 'undead_necromancer'); // (the corpse in its range)
    const zombie = createConfiguredEnemy({ x: s.x + 240, y: s.y + 20 }, 'undead_zombie'); zombie.speed = 0;
    enemies = [necro, zombie];
    let turns = 0, lastDir = 0, lx = necro.x;
    run(8, { holdWaves: false, each: () => { quiet(); s.speed = 0; waveTimer = 999; const dx = necro.x - lx; const dir = Math.abs(dx) > 0.2 ? Math.sign(dx) : lastDir; if (lastDir && dir && dir !== lastDir) turns++; lastDir = dir; lx = necro.x; } });
    const r = { wentForIt: !!corpses[0] && corpses[0].raisedBy === necro, turns };
    back();
    return r;
  }

  // Buildings far out to the east only: the posts out east stand farther from the hall than the west ones
  function postsByShape({ seed = 'r2-posts' } = {}) {
    start(seed); clearResources();
    for (let dx = 4; dx <= 9; dx++) placeBuilding('wall_wood', nearHall(dx, 0).x, nearHall(dx, 0).y);
    invalidateAllPaths(); defensePlan = null;
    settlers = [1, 2, 3, 4].map(i => makeSettler(i, townHall.x, townHall.y + 30 + i * 10, { weapon: 'sword', role: 'soldier' }));
    waveTimer = 5;
    const plan = getDefensePlan();
    const east = plan.posts.filter(p => p.x > townHall.x + 30), west = plan.posts.filter(p => p.x < townHall.x - 30);
    const far = list => Math.max(...list.map(p => Math.hypot(p.x - townHall.x, p.y - townHall.y)));
    return { eastFarther: east.length > 0 && west.length > 0 && far(east) > far(west) + 2 * TILE_SIZE };
  }

  // A zombie of the colony in a panic doesn't run for the town hall: it fights on, weaker
  function undeadFightOn({ seed = 'r2-undead' } = {}) {
    asFaction('undead', 'humans', seed);
    const z = createSettler('zombie', 1, townHall.x + 150, townHall.y);
    Object.assign(z, { weapon: 'sword', role: 'soldier', hunger: 999 });
    settlers = [z];
    const en = createConfiguredEnemy({ x: z.x + 30, y: z.y }, 'raider'); en.speed = 0; en.damage = 0; en.hp = en.maxHp = 1000;
    enemies = [en];
    const calm = getWeaponStats(z, 'combat').multiplier;
    z.panic = true; z.morale = 5;
    const shaken = getWeaponStats(z, 'combat').multiplier;
    run(2, { holdWaves: false, each: () => { z.panic = true; z.morale = 5; waveTimer = 999; } });
    const r = { ranToHall: Math.hypot(z.x - townHall.x, z.y - townHall.y) < 100, fought: en.hp < 1000, weaker: shaken < calm };
    back();
    return r;
  }

  // An undead wave, one ahead nearest the hall and four well behind: its necromancer keeps amid them (before,
  // by the one in front, it was off on its own), most of them within its reach
  function necroAmid({ seed = 'r2-amid' } = {}) {
    asFaction('humans', 'undead', seed);
    settlers = [];
    const at = nearHall(-14, -8);
    enemies = [0, 1, 2, 3, 4].map(i => { const z = createConfiguredEnemy(i === 0 ? at : { x: at.x - 260 + (i % 2) * 40, y: at.y - 200 + i * 15 }, 'undead_zombie'); z.speed = 0; z.fromWave = true; return z; });
    const necro = createConfiguredEnemy({ x: at.x + 260, y: at.y - 120 }, 'undead_necromancer');
    enemies.push(necro);
    run(6, { holdWaves: false, each: () => { waveTimer = 999; } });
    const inReach = enemies.filter(z => z !== necro && Math.hypot(z.x - necro.x, z.y - necro.y) <= GAME_CONFIG.morale.necroRange).length;
    back();
    return { inReach };
  }

  return { r2NecroAmid: necroAmid, r2FreeHandsFirst: freeHandsFirst, r2Knot: knot, r2ArcherNoArrows: archerNoArrows, r2NecroGuardedCorpse: necroGuardedCorpse, r2PostsByShape: postsByShape, r2UndeadFightOn: undeadFightOn };
})());
